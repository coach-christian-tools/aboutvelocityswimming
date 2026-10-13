import SectionPage from "@/components/SectionPage";
import FlaggedResults from "@/components/collection/FlaggedResults";

export const metadata = { title: "Flagged results | Velocity Swimming" };
export default function Page() {
  return (
    <SectionPage
      eyebrow="Staff tools"
      title="Flagged results"
      description="Review questionable uploads and restore results after checking their source."
    >
      <FlaggedResults />
    </SectionPage>
  );
}
