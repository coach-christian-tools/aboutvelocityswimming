import type { Metadata } from "next";
import Footer from "@/components/Footer";
import ProductForm from "./ProductForm";
import ProductDetailGallery from "@/components/ProductDetailGallery";
import Link from "next/link";
import { getProductMockupImages } from "@/lib/mockups";
import "../Store.css";

export const metadata: Metadata = {
  title: "Shop the Collection | Velocity Swimming",
  description: "Explore the Velocity Swimming collection and select your size.",
};

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
        <div className="section container text-center" style={{ paddingTop: "3rem" }}>
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
            
            <ProductForm productId={sync_product.id} productName={sync_product.name} variants={sync_variants} />
            
            <div className="product-description" style={{ marginTop: "2.25rem", color: "var(--text-muted)" }}>
              <p>Part of Velocity&apos;s 2026-2027 Caden Ankrom Collection. Each purchase supports Velocity Swimming and the artist.</p>
            </div>
          </div>
          
        </div>
      </div>
      
      <Footer />
    </main>
  );
}
