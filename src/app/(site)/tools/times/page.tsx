import TimesDatabase from "@/components/collection/TimesDatabase";
export const metadata = {
  title: "IES Times | Velocity Swimming",
};
export default function Page() {
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-12">
      <h1 className="text-3xl font-semibold">IES Times</h1>
      <TimesDatabase />
    </main>
  );
}
