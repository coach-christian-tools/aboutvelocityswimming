"use client";
import NextLink from "next/link";
import {
  usePathname,
  useRouter,
  useParams as useNextParams,
} from "next/navigation";
import { useEffect, useSyncExternalStore, type ComponentProps } from "react";
import { WORKSHARE_PATH, worksharePath } from "./routes";
export function Link({
  to,
  ...props
}: Omit<ComponentProps<typeof NextLink>, "href"> & { to: string }) {
  return <NextLink href={worksharePath(to)} {...props} />;
}
export function useNavigate() {
  const router = useRouter();
  return (path: string) => router.push(worksharePath(path));
}
export function useParams<T>() {
  return useNextParams() as T;
}
function subscribe(callback: () => void) {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
}
export function useLocation() {
  const pathname = usePathname().slice(WORKSHARE_PATH.length) || "/";
  const suffix = useSyncExternalStore(
    subscribe,
    () => window.location.search + "|" + window.location.hash,
    () => "|",
  );
  const [search, hash] = suffix.split("|");
  return { pathname, search, hash };
}
export function Navigate({ to }: { to: string }) {
  const router = useRouter();
  const href = worksharePath(to);
  const pathname = usePathname();
  useEffect(() => {
    if (pathname !== href) router.replace(href);
  }, [pathname, href, router]);
  return (
    <p role="status" className="p-8">
      Opening your account…
    </p>
  );
}
