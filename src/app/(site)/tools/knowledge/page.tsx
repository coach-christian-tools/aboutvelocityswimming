import KnowledgeBase from "@/components/collection/KnowledgeBase";
export const metadata = {
  title: "USA Swimming Knowledge Base | Velocity Swimming",
};
export default function Page() {
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-6 py-12">
      <h1 className="text-3xl font-semibold">USA Swimming Knowledge Base</h1>
      <KnowledgeBase />
    </main>
  );
}
