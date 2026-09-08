import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Link from "next/link";

export default function SuccessPage() {
  return (
    <main className="store-page" style={{ background: "#FFFFFF" }}>
      <Header minimal={true} />
      <div className="section" style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="container" style={{ textAlign: 'center' }}>
          <h1 className="store-title animate-fade-in">Thank You!</h1>
          <p className="store-subtitle animate-fade-in" style={{ marginBottom: '2rem' }}>
            Your order has been placed successfully. We'll send you an email confirmation shortly.
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
