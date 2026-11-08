export const CHECK_INTERVAL_MS = 5 * 60 * 1000;
export const REMIND_AFTER_MS = 30 * 60 * 1000;
export const CHECK_THROTTLE_MS = 10 * 1000;
export const UPDATE_QUERY_PARAM = "_velocity_update";
export type UpdateNoticeState = { version: string | null; visible: boolean };

export function validVersion(version: unknown): version is string {
  return (
    typeof version === "string" &&
    /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(version)
  );
}

export async function fetchDeploymentVersion() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(
      `/api/app-version?check=${crypto.randomUUID()}`,
      {
        cache: "no-store",
        credentials: "same-origin",
        redirect: "error",
        signal: controller.signal,
      },
    );
    if (
      !response.ok ||
      !response.headers.get("content-type")?.includes("application/json")
    )
      throw new Error("Version metadata unavailable");
    const { version } = await response.json();
    if (!validVersion(version)) throw new Error("Invalid version metadata");
    return version;
  } finally {
    clearTimeout(timeout);
  }
}

export function createVersionMonitor({
  currentVersion,
  onChange,
  fetchVersion = fetchDeploymentVersion,
  now = Date.now,
}: {
  currentVersion: string;
  onChange: (notice: UpdateNoticeState) => void;
  fetchVersion?: () => Promise<string>;
  now?: () => number;
}) {
  let latestVersion: string | null = null;
  let remindAt = 0;
  let lastCheck = -Infinity;
  let pending: Promise<string | null> | null = null;
  let disposed = false;
  const publish = () => {
    if (!disposed)
      onChange({
        version: latestVersion,
        visible: Boolean(latestVersion && now() >= remindAt),
      });
  };
  return {
    check({ force = false } = {}): Promise<string | null> {
      if (disposed) return Promise.resolve(null);
      if (pending) return pending;
      if (!force && now() - lastCheck < CHECK_THROTTLE_MS)
        return Promise.resolve(null);
      lastCheck = now();
      pending = Promise.resolve()
        .then(fetchVersion)
        .then((version) => {
          if (disposed) return null;
          if (!validVersion(version))
            throw new Error("Invalid version metadata");
          // Compare with this running bundle, including when the site is rolled back.
          latestVersion = version === currentVersion ? null : version;
          publish();
          return version;
        })
        .catch(() => {
          // Offline and failed/invalid checks must leave the current page usable.
          publish();
          return null;
        })
        .finally(() => {
          pending = null;
        });
      return pending;
    },
    later() {
      remindAt = now() + REMIND_AFTER_MS;
      publish();
    },
    dispose() {
      disposed = true;
    },
  };
}

export function watchForUpdates(
  monitor: ReturnType<typeof createVersionMonitor>,
  win = window,
  doc = document,
) {
  const check = () => {
    if (doc.visibilityState !== "hidden" && win.navigator.onLine !== false)
      void monitor.check();
  };
  const events = ["focus", "pageshow", "online"];
  events.forEach((event) => win.addEventListener(event, check));
  doc.addEventListener("visibilitychange", check);
  const interval = win.setInterval(check, CHECK_INTERVAL_MS);
  check();
  return () => {
    events.forEach((event) => win.removeEventListener(event, check));
    doc.removeEventListener("visibilitychange", check);
    win.clearInterval(interval);
    monitor.dispose();
  };
}

export function updateUrl(href: string, version: string) {
  if (!validVersion(version)) throw new Error("Invalid version metadata");
  const url = new URL(href);
  url.searchParams.set(UPDATE_QUERY_PARAM, `${version}:${crypto.randomUUID()}`);
  return url.href;
}

export function cleanUpdateUrl(win = window): string | null {
  const url = new URL(win.location.href);
  const marker = url.searchParams.get(UPDATE_QUERY_PARAM);
  if (marker === null) return null;
  url.searchParams.delete(UPDATE_QUERY_PARAM);
  // Preserve Next's history state, the route, other search filters, and the hash.
  win.history.replaceState(win.history.state, "", url.href);
  const target = marker.split(":")[0];
  return validVersion(target) ? target : null;
}
