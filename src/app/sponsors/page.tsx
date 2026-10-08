import type { Metadata } from "next";
import InvestmentPitch from "@/components/InvestmentPitch";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "Sponsors | Velocity Swimming",
  description: "Partner with Velocity Swimming. Explore sponsorship opportunities that support youth swimming and the Wenatchee Valley community.",
};

export default function SponsorsPage() {
  return (
    <>
      <main><InvestmentPitch /></main>
      <Footer />
    </>
  );
}
