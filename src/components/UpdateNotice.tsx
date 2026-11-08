"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { RefreshCw, X } from "lucide-react";
import { APP_VERSION } from "@/lib/app-version";
import {
  cleanUpdateUrl,
  createVersionMonitor,
  updateUrl,
  watchForUpdates,
  type UpdateNoticeState,
} from "@/lib/app-updates";
import { subscribeUpdateSafety, updatesBlocked } from "@/lib/update-safety";
import styles from "./UpdateNotice.module.css";

function RefreshConfirmation({
  busy,
  updating,
  error,
  onCancel,
  onRefresh,
}: {
  busy: boolean;
  updating: boolean;
  error: string;
  onCancel: () => void;
  onRefresh: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby="velocity-update-title"
      aria-describedby="velocity-update-description"
      onCancel={(event) => {
        event.preventDefault();
        if (!updating) onCancel();
      }}
    >
      <h2 id="velocity-update-title">Update Velocity Swimming?</h2>
      <p id="velocity-update-description">
        This refreshes the page to load the latest website. Save your work
        first. Any unsaved changes on this page will be lost.
      </p>
      <p className={styles.detail}>
        Your sign-in and saved settings will be kept.
      </p>
      {(busy || error) && (
        <p role="status" className={styles.detail}>
          {busy
            ? "Finish or cancel your current changes or action before updating."
            : error}
        </p>
      )}
      {updating && (
        <p role="status" className={styles.detail}>
          Checking and loading the update. If loading is interrupted, use your
          browser’s reload button to retry.
        </p>
      )}
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.secondary}
          onClick={onCancel}
          disabled={updating}
          autoFocus
        >
          Keep working
        </button>
        <button
          type="button"
          className={styles.primary}
          onClick={onRefresh}
          disabled={busy || updating}
        >
          {updating ? "Checking…" : "Refresh now"}
        </button>
      </div>
    </dialog>
  );
}

export default function UpdateNotice() {
  const [notice, setNotice] = useState<UpdateNoticeState>({
    version: null,
    visible: false,
  });
  const [confirming, setConfirming] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState("");
  const [updated, setUpdated] = useState(false);
  const monitor = useRef<ReturnType<typeof createVersionMonitor> | null>(null);
  const navigating = useRef(false);
  const blocked = useSyncExternalStore(
    subscribeUpdateSafety,
    updatesBlocked,
    () => false,
  );

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || APP_VERSION === "development")
      return;
    const target = cleanUpdateUrl();
    // The query marker confirms the requested build actually loaded, not just a click.
    let initialCheck = true;
    const instance = createVersionMonitor({
      currentVersion: APP_VERSION,
      onChange: (nextNotice) => {
        setNotice(nextNotice);
        if (!nextNotice.visible) setConfirming(false);
        if (initialCheck) {
          initialCheck = false;
          if (target === APP_VERSION) setUpdated(true);
          else if (target)
            setError(
              "The latest version has not loaded yet. Please try again.",
            );
        }
      },
    });
    monitor.current = instance;
    const restore = () => {
      navigating.current = false;
      setUpdating(false);
    };
    window.addEventListener("pageshow", restore);
    const stopWatching = watchForUpdates(instance);
    return () => {
      window.removeEventListener("pageshow", restore);
      stopWatching();
    };
  }, []);

  async function refresh() {
    if (navigating.current || updatesBlocked()) return;
    navigating.current = true;
    setUpdating(true);
    setError("");
    let navigationStarted = false;
    try {
      if (navigator.onLine === false) {
        setError("Reconnect to the internet to update.");
        return;
      }
      const version = await monitor.current?.check({ force: true });
      if (!version) {
        setError("Could not check for updates. Please try again.");
        return;
      }
      // A save or upload could have started while the check was in flight.
      if (updatesBlocked()) return;
      if (version !== APP_VERSION) {
        window.location.replace(updateUrl(window.location.href, version));
        navigationStarted = true;
        return;
      }
      setConfirming(false);
    } catch {
      setError("Could not open the new version. Please try again.");
    } finally {
      if (!navigationStarted) {
        navigating.current = false;
        setUpdating(false);
      }
    }
  }

  if (!notice.visible && !updated) return null;
  return (
    <>
      <aside className={styles.notice} aria-label="Website update">
        <RefreshCw size={22} aria-hidden="true" className={styles.icon} />
        <div className={styles.content}>
          <p role="status" className={styles.title}>
            {notice.visible
              ? "A new version is available."
              : "Website updated."}
          </p>
          {notice.visible ? (
            <>
              <p className={styles.detail}>
                {blocked
                  ? "Finish or cancel your current changes or action before updating."
                  : "Refresh when you’re ready to get the latest improvements."}
              </p>
              {!confirming && error && (
                <p role="status" className={styles.detail}>
                  {error}
                </p>
              )}
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.primary}
                  disabled={blocked || updating}
                  onClick={() => {
                    setError("");
                    setConfirming(true);
                  }}
                >
                  Update now
                </button>
                <button
                  type="button"
                  className={styles.secondary}
                  disabled={updating}
                  onClick={() => {
                    setConfirming(false);
                    setUpdated(false);
                    setError("");
                    monitor.current?.later();
                  }}
                >
                  Later
                </button>
              </div>
            </>
          ) : (
            <p className={styles.detail}>The new version is ready.</p>
          )}
        </div>
        {!notice.visible && (
          <button
            type="button"
            className={styles.close}
            aria-label="Dismiss update confirmation"
            onClick={() => setUpdated(false)}
          >
            <X size={20} aria-hidden="true" />
          </button>
        )}
      </aside>
      {confirming && notice.visible && (
        <RefreshConfirmation
          busy={blocked}
          updating={updating}
          error={error}
          onCancel={() => {
            setConfirming(false);
            setError("");
          }}
          onRefresh={() => void refresh()}
        />
      )}
    </>
  );
}
