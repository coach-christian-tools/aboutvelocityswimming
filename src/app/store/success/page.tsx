import type { Metadata } from "next";
import Footer from "@/components/Footer";
import Link from "next/link";
import { getStripe } from "@/lib/stripe";

export const metadata: Metadata = {
  title: "Payment Confirmation | Velocity Swimming",
  description: "Check the status of your Velocity Swimming store payment.",
  robots: { index: false, follow: false },
};

export default async function SuccessPage({ searchParams }: {
  searchParams: Promise<{ session_id?: string | string[] }>;
}) {
  const { session_id: sessionId } = await searchParams;
  let paid = false;
  let testPayment = false;
  if (typeof sessionId === "string" && /^cs_(test_|live_)?[a-zA-Z0-9]+$/.test(sessionId)) {
    try {
      const session = await getStripe().checkout.sessions.retrieve(sessionId);
      paid = session.payment_status === "paid" && session.status === "complete" && session.mode === "payment";
      testPayment = !session.livemode;
    } catch {
      // Keep this page usable when verification is unavailable.
    }
  }
  return (
    <main className="store-page" style={{ background: "var(--background)" }}>

      <div className="section" style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="container" style={{ textAlign: 'center' }}>
          <h1 className="store-title animate-fade-in">{paid ? "Thank You!" : "Payment Confirmation"}</h1>
          <p className="store-subtitle animate-fade-in" style={{ marginBottom: '2rem' }}>
            {paid
              ? testPayment
                ? "Your test payment succeeded. No physical order will be fulfilled."
                : "Your payment was received. Your order is being processed for fulfillment."
              : "We could not verify a completed payment. If you were charged, please contact Velocity Swimming before placing another order."}
          </p>
          <Link href="/store" className="btn btn-primary animate-fade-in">
            Continue Shopping
          </Link>
        </div>
      </div>
      <Footer />
    </main>
  );
}
