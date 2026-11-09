import { Suspense } from "react";
import DataObservatory from "@/components/observatory/DataObservatory";

export const metadata = {
  title: "Data Observatory | Velocity Swimming",
  description:
    "Explore the swimming archive through meets, athletes, and years of competition.",
};

export default function OverviewPage() {
  return (
    <Suspense
      fallback={
        <main className="p-12" role="status">
          Opening the observatory…
        </main>
      }
    >
      <DataObservatory />
    </Suspense>
  );
}
