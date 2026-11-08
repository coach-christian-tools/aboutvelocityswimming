"use client";

import { ArrowDown } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import styles from "./AtlasSectionGuide.module.css";

export const atlasTopSection = { id: "atlas-heading", label: "Top" };

type Section = { id: string; label: string };

export default function AtlasSectionGuide({
  sections,
  nextSectionId,
  children,
}: {
  sections: readonly Section[];
  nextSectionId?: string;
  children: ReactNode;
}) {
  const layout = useRef<HTMLDivElement>(null);
  const [currentId, setCurrentId] = useState(atlasTopSection.id);

  useEffect(() => {
    const headings = sections
      .map(({ id }) => document.getElementById(id))
      .filter((heading) => heading !== null);
    let frame = 0;

    function updateCurrentSection() {
      frame = 0;
      const atBottom =
        window.scrollY > 0 &&
        window.scrollY + window.innerHeight >=
          document.documentElement.scrollHeight - 2;
      const current = atBottom
        ? headings.at(-1)
        : headings.findLast((heading) => {
            const scrollMargin = parseFloat(
              getComputedStyle(heading).scrollMarginTop,
            );
            const readingLine = Math.min(
              window.innerHeight - 1,
              scrollMargin + 2,
            );
            return heading.getBoundingClientRect().top <= readingLine;
          });
      setCurrentId(current?.id ?? atlasTopSection.id);
    }

    function scheduleUpdate() {
      if (!frame) frame = window.requestAnimationFrame(updateCurrentSection);
    }

    const resize = new ResizeObserver(scheduleUpdate);
    if (layout.current) resize.observe(layout.current);
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    scheduleUpdate();
    return () => {
      resize.disconnect();
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      window.cancelAnimationFrame(frame);
    };
  }, [sections]);

  const currentIndex = Math.max(
    0,
    sections.findIndex(({ id }) => id === currentId),
  );
  const nextSection = sections.find(({ id }) => id === nextSectionId);

  return (
    <div ref={layout} className={styles.layout}>
      <nav className={styles.guide} aria-label="On this page">
        <p className={styles.caption} aria-hidden="true">
          On this page
        </p>
        <p className="sr-only" role="status">
          {nextSection && `${nextSection.label} section available.`}
        </p>
        <ol className={styles.links}>
          {sections.map(({ id, label }, index) => {
            const upcoming = id === nextSectionId && index > currentIndex;
            return (
              <li key={id} className={styles.item}>
                <a
                  className={styles.link}
                  href={`#${id}`}
                  aria-current={index === currentIndex ? "location" : undefined}
                  data-upcoming={upcoming || undefined}
                >
                  <span className={styles.marker} aria-hidden="true" />
                  <span className={styles.label}>{label}</span>
                  {upcoming && (
                    <ArrowDown className={styles.arrow} aria-hidden="true" />
                  )}
                </a>
              </li>
            );
          })}
        </ol>
      </nav>
      <div className={styles.content}>{children}</div>
    </div>
  );
}
