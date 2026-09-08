import Footer from "@/components/Footer";
import ProductForm from "./ProductForm";
import ProductDetailGallery from "@/components/ProductDetailGallery";
import Link from "next/link";
import { getProductMockupImages } from "@/lib/mockups";
import "../Store.css";

async function getProduct(id: string) {
  if (!process.env.PRINTFUL_API_KEY) {
    return null;
  }
  
  const res = await fetch(`https://api.printful.com/store/products/${id}`, {
    headers: {
      Authorization: `Bearer ${process.env.PRINTFUL_API_KEY}`,
    },
    next: { revalidate: 3600 }
  });
  
  const data = await res.json();
  if (data.code !== 200) {
    console.error("Printful API Error:", data);
    return null;
  }
  
  return data.result;
}

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  const productData = await getProduct(resolvedParams.id);

  if (!productData) {
    return (
      <main className="product-detail-page" style={{ position: "relative" }}>
        <Link href="/" className="floating-home-btn" aria-label="Back to Home Page">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          <span>Back to Home Page</span>
        </Link>
        <div className="section container text-center" style={{ paddingTop: "140px" }}>
          <h1 style={{ color: "var(--primary)" }}>Product Not Found</h1>
          <Link href="/store" className="btn btn-secondary" style={{ marginTop: "2rem" }}>
            Back to Store
          </Link>
        </div>
        <Footer />
      </main>
    );
  }

  const { sync_product, sync_variants } = productData;

  // Only mockup photos, no design/artwork files
  const localMockups = getProductMockupImages(sync_product.name);
  const imagesArray = localMockups.length > 0 ? localMockups : [sync_product.thumbnail_url];

  return (
    <main className="product-detail-page" style={{ position: "relative" }}>
      {/* Floating Back to Home Page Button in Bottom Left */}
      <Link href="/" className="floating-home-btn" aria-label="Back to Home Page">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="19" y1="12" x2="5" y2="12" />
          <polyline points="12 19 5 12 12 5" />
        </svg>
        <span>Back to Home Page</span>
      </Link>
      
      <div className="section" style={{ padding: "0 1.5rem" }}>
        <div className="product-detail-grid">
          
          <div className="product-detail-images">
            <ProductDetailGallery images={imagesArray} productName={sync_product.name} />
          </div>
          
          <div className="product-detail-info">
            <Link
              href="/store"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                marginBottom: "1.25rem",
                color: "var(--text-muted)",
                fontSize: "0.85rem",
                fontWeight: 600,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
              }}
            >
              &larr; Back to Collection
            </Link>
            
            <h1>{sync_product.name}</h1>
            
            <ProductForm productName={sync_product.name} variants={sync_variants} />
            
            <div className="product-description" style={{ marginTop: "2.25rem", color: "var(--text-muted)" }}>
              <p>Part of Velocity's 2026-2027 Caden Ankrom Collection. Each purchase supports Velocity Swimming and the artist.</p>
            </div>
          </div>
          
        </div>
      </div>
      
      <Footer />
    </main>
  );
}
