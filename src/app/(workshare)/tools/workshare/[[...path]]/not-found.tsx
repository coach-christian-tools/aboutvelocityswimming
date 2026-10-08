import { WORKSHARE_PATH } from "@/features/workshare/lib/routes";
export default function WorkshareNotFound() {
  return <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-8 text-center">
    <h1 className="text-2xl font-semibold">Workshare page not found</h1>
    <a href={WORKSHARE_PATH} className="underline">Go to Workshare</a>
    <a href="/tools" className="underline">Back to Tools</a>
  </main>;
}
