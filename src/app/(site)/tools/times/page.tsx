import TimesDatabase from "@/components/collection/TimesDatabase";
export const metadata = {
  title: "Inland Empire Times Database | Velocity Swimming",
};
export default function Page() {
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-12">
      <h1 className="text-3xl font-semibold">Inland Empire Times Database</h1>
      <TimesDatabase />
    </main>
  );
}
