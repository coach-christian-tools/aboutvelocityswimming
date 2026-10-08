"use client";

import dynamic from "next/dynamic";
import { Component, type ReactNode } from "react";
import { hasWorkshareConfiguration } from "./lib/config";

const App = dynamic(() => import("./App"), {
  ssr: false,
  loading: () => <div role="status" className="p-12 text-center text-slate-500">Loading portal...</div>,
});
function Unavailable() {
  return <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-8 text-center">
    <h1 className="text-2xl font-semibold">Workshare is temporarily unavailable</h1>
    <p>Please try again shortly.</p>
    <a href="/tools" className="underline">Back to Tools</a>
  </main>;
}
class WorkshareBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <Unavailable /> : this.props.children; }
}
export default function WorkshareClient() {
  if (!hasWorkshareConfiguration) return <Unavailable />;
  return <WorkshareBoundary><App /></WorkshareBoundary>;
}
