"use client";
import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import type { StandardSet } from "@/features/swim-resources/types/schema";
import { formatSwimTime } from "@/features/swim-resources/lib/domain/swim-time";
import type { Race } from "./times-data";
import { resultCuts, type ResultCut } from "./result-cuts";
import s from "./CutChips.module.css";

function description(cut: ResultCut, race: Race) {
  return `${cut.name} · ${cut.season} · ${cut.age} · ${race.course} · ${cut.tier}: ${formatSwimTime(cut.time)}. Time benchmark met using age and standards at the swim date. Meet entry rules still apply.`;
}
export default function CutChips({
  race,
  sets,
}: {
  race: Race;
  sets: StandardSet[];
}) {
  const id = useId();
  const [active, setActive] = useState<{
    index: number;
    left: number;
    top: number;
  } | null>(null);
  useEffect(() => {
    if (!active) return;
    const close = () => setActive(null);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [active]);
  const cuts = resultCuts(race, sets);
  if (!cuts.length) return null;
  const show = (index: number, target: HTMLElement) => {
    const rect = target.getBoundingClientRect();
    setActive({
      index,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - 240)),
      top: rect.bottom + 6,
    });
  };
  return (
    <span className={s.chips} aria-label="Time standards achieved">
      {cuts.map((cut, index) => (
        <span key={cut.id} className={s.item}>
          <button
            type="button"
            className={`${s.chip} ${cut.motivational ? s.motivational : s.national}`}
            aria-describedby={`${id}-${index}`}
            onMouseEnter={(event) => show(index, event.currentTarget)}
            onMouseLeave={() => setActive(null)}
            onFocus={(event) => show(index, event.currentTarget)}
            onBlur={() => setActive(null)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setActive(null);
            }}
            onClick={(event) => {
              event.stopPropagation();
              show(index, event.currentTarget);
            }}
          >
            {cut.label}
            {!cut.motivational && /bonus/i.test(cut.tier) ? " · Bonus" : ""}
          </button>
          <span id={`${id}-${index}`} className="sr-only">
            {description(cut, race)}
          </span>
        </span>
      ))}
      {active &&
        cuts[active.index] &&
        createPortal(
          <span
            className={s.tooltip}
            aria-hidden="true"
            style={{
              left: active.left,
              top: active.top,
              transform:
                active.top > window.innerHeight - 170
                  ? "translateY(calc(-100% - 28px))"
                  : undefined,
            }}
          >
            {description(cuts[active.index], race)}
          </span>,
          document.body,
        )}
    </span>
  );
}
