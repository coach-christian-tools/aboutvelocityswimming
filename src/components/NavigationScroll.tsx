"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export default function NavigationScroll() {
  const pathname = usePathname();

  useEffect(() => {
    // Next.js can retain scroll when the next page is already in the viewport.
    // Hash destinations keep the framework's native section scrolling.
    const frame = requestAnimationFrame(() => {
      if (!window.location.hash) window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    });
    return () => cancelAnimationFrame(frame);
  }, [pathname]);

  useEffect(() => {
    let frame = 0;
    function handleClick(event: MouseEvent) {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest("a") : null;
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
      const destination = new URL(link.href);
      if (destination.origin !== window.location.origin || destination.hash || destination.pathname !== window.location.pathname) return;
      // A link to the current page does not change usePathname.
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: "instant" }));
    }
    document.addEventListener("click", handleClick);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("click", handleClick);
    };
  }, []);

  return null;
}
