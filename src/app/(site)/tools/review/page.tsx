import ReviewQueue from "@/components/collection/ReviewQueue";
export const metadata = { title: "Collection review | Velocity Swimming" };
export default function Page() {
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-12">
      <h1 className="text-3xl font-semibold">Collection review</h1>
      <ReviewQueue />
    </main>
  );
}
