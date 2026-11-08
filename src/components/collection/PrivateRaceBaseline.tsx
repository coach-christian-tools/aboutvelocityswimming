"use client";
import { useState } from "react";
import { collectPrivateRaceBaseline } from "@/lib/collection/race-baseline";

export default function PrivateRaceBaseline() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function download() {
    setBusy(true);
    setMessage("");
    try {
      const baseline = await collectPrivateRaceBaseline(async query => {
        const response = await fetch(`/api/collection/race-baseline?${query}`, { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Private export failed. Start again.");
        return data;
      });
      const url = URL.createObjectURL(new Blob([JSON.stringify(baseline)], { type: "application/json" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `private-race-baseline-${baseline.capturedAt.slice(0, 10)}.json`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setMessage(`Downloaded a consistent private baseline with all ${baseline.catalogCount} catalog meets.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Private export failed. No complete file was created.");
    } finally { setBusy(false); }
  }
  return (
    <>
      <button type="button" className="btn btn-secondary" onClick={download} disabled={busy}>
        {busy ? "Preparing private baseline…" : "Download private race baseline"}
      </button>
      {message && <p role="status">{message}</p>}
    </>
  );
}
