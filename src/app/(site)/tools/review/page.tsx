import ReviewQueue from "@/components/collection/ReviewQueue";
import SectionPage from "@/components/SectionPage";
export const metadata = { title: "Collection review | Velocity Swimming" };
export default function Page() {
  return (
    <SectionPage
      eyebrow="Staff tools"
      title="Collection review"
      description="Review collected additions and corrections before they appear across Velocity tools."
    >
      <ReviewQueue />
    </SectionPage>
  );
}
