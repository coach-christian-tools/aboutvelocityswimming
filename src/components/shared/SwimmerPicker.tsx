"use client";
import { useEffect, useState } from "react";
import { collection, db, onSnapshot } from "@/lib/data";
import type { Child } from "@/features/workshare/types";
interface Swimmer {
  id: string;
  name: { first: string; last: string };
  currentGroup: { name: string };
}
export default function SwimmerPicker({
  child,
  onChange,
}: {
  child: Child;
  onChange: (value: Child) => void;
}) {
  const [roster, setRoster] = useState<Swimmer[]>([]);
  useEffect(
    () =>
      onSnapshot(collection(db, "athletes"), (rows) =>
        setRoster(rows.docs.map((d) => ({ ...d.data(), id: d.id }) as Swimmer)),
      ),
    [],
  );
  return (
    <label className="block text-xs">
      Swimmer
      <select
        aria-label="Select swimmer"
        className="mt-1 w-full rounded-md border border-border p-2 bg-surface"
        value={child.id ?? ""}
        onChange={(e) => {
          const swimmer = roster.find((s) => s.id === e.target.value);
          onChange(
            swimmer
              ? {
                  id: swimmer.id,
                  name: swimmer.name.first + " " + swimmer.name.last,
                  group: swimmer.currentGroup.name as Child["group"],
                }
              : { name: "", group: "No Assignment" },
          );
        }}
      >
        <option value="">Create a new swimmer</option>
        {roster.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name.first} {s.name.last} · {s.currentGroup.name}
          </option>
        ))}
      </select>
      {child.id ? (
        <span className="block mt-2 text-text-secondary">
          Name and group are managed in the shared roster.
        </span>
      ) : (
        <input
          aria-label="New swimmer name"
          placeholder="New swimmer’s full name"
          className="mt-2 w-full rounded-md border border-border p-2 bg-surface"
          required
          value={child.name}
          onChange={(e) => onChange({ ...child, name: e.target.value })}
        />
      )}
    </label>
  );
}
