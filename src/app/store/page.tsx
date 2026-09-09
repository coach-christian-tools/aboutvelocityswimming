import Footer from "@/components/Footer";
import StoreProductGallery from "@/components/StoreProductGallery";
import Link from "next/link";
import { getProductMockupImages } from "@/lib/mockups";
import "./Store.css";

async function getProducts() {
  if (!process.env.PRINTFUL_API_KEY) {
    return [];
  }
  
  const res = await fetch("https://api.printful.com/store/products", {
    headers: {
      Authorization: `Bearer ${process.env.PRINTFUL_API_KEY}`,
    },
    next: { revalidate: 3600 }
  });
  
  const data = await res.json();
  if (data.code !== 200) {
    console.error("Printful API Error:", data);
    return [];
  }
  
  const productsWithDetails = await Promise.all(
    data.result.map(async (p: any) => {
      const detailRes = await fetch(`https://api.printful.com/store/products/${p.id}`, {
        headers: { Authorization: `Bearer ${process.env.PRINTFUL_API_KEY}` },
        next: { revalidate: 3600 }
      });
      const detailData = await detailRes.json();
      return detailData.result;
    })
  );
  
  return productsWithDetails;
}

export default async function StorePage() {
  const products = await getProducts();
  
  return (
    <main className="store-page-root">
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
      
      <div className="luxury-scroll-container">
        {/* Intro Section - Streetwear Hero with Photos */}
        <section className="luxury-section hero-section">
          <div className="luxury-hero animate-fade-in">
            <span className="hero-drop-badge">Drop 01 // 2026-2027</span>
            
            <h1 className="collection-title">
              Velocity 26/27<br />Caden Ankrom Collection
            </h1>
            
            <p className="collection-subtitle">
              Limited Edition Streetwear Designed by Caden Ankrom
            </p>

            {/* Streetwear Lookbook Photo Teaser (Desktop only, click scrolls to shirt) */}
            <div className="hero-lookbook-strip" aria-label="Collection preview photos">
              <a
                href="#product-liquid-script"
                className="hero-lookbook-card tilt-left"
                aria-label="Scroll to Liquid Script shirt"
              >
                <img
                  src="/mockups/Liquid%20Script/mens-box-tee-black-back-6aa096b58e80c.png"
                  alt="Liquid Script Box Tee"
                  loading="eager"
                />
                <span>Liquid Script</span>
              </a>
              <a
                href="#product-high-tide-horizon"
                className="hero-lookbook-card tilt-center"
                aria-label="Scroll to High Tide Horizon shirt"
              >
                <img
                  src="/mockups/High%20Tide%20Horizon/mens-box-tee-white-front-6aa096fc885de.png"
                  alt="High Tide Horizon Box Tee"
                  loading="eager"
                />
                <span>High Tide</span>
              </a>
              <a
                href="#product-apex-glitch"
                className="hero-lookbook-card tilt-right"
                aria-label="Scroll to Apex Glitch shirt"
              >
                <img
                  src="/mockups/Apex%20Glitch/mens-box-tee-white-back-6aa097db68e1d.png"
                  alt="Apex Glitch Box Tee"
                  loading="eager"
                />
                <span>Apex Glitch</span>
              </a>
            </div>

            <a href="#artist-bio" className="artist-link-top">
              Meet the Artist &darr;
            </a>
          </div>
        </section>

        {/* Product Sections */}
        {products.length === 0 ? (
          <section className="luxury-section">
            <p style={{ color: "var(--text-muted)" }}>Collection arriving soon...</p>
          </section>
        ) : (
          products.map((p) => {
            const product = p.sync_product;
            const variants = p.sync_variants;
            const firstVariant = variants[0];
            const rawSlug = product.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
            const productSlug = rawSlug.includes("liquid-script")
              ? "liquid-script"
              : rawSlug.includes("high-tide")
              ? "high-tide-horizon"
              : rawSlug.includes("apex-glitch")
              ? "apex-glitch"
              : rawSlug;
            
            // Only mockup photos, no design/artwork files
            const localMockups = getProductMockupImages(product.name);
            const images = localMockups.length > 0 ? localMockups : [product.thumbnail_url];

            return (
              <section
                key={product.id}
                id={`product-${productSlug}`}
                className="luxury-section"
              >
                <div className="product-showcase">
                  <div className="luxury-images">
                    <StoreProductGallery images={images} productName={product.name} />
                  </div>
                  <div className="product-details">
                    <h2 className="product-name">{product.name}</h2>
                    <p className="product-price">${firstVariant.retail_price}</p>
                    <Link href={`/store/${product.id}`} className="btn btn-primary">
                      View Product
                    </Link>
                  </div>
                </div>
              </section>
            );
          })
        )}

        {/* Artist Section */}
        <section id="artist-bio" className="luxury-section">
          <div className="artist-section container">
            <h2 className="artist-title">About Caden Ankrom</h2>
            <div className="artist-bio">
              <p>
                Caden Ankrom is the designer behind Velocity's 2026-2027 collection. 
                By purchasing from this collection, you are directly supporting both Caden's 
                continued work as an independent designer and Velocity Swimming's programs.
              </p>
            </div>
            <div className="artist-links">
              <a href="https://www.plu.edu/news/archive/2026/02/23/caden-ankrom-path-to-success/" target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
                His Story
              </a>
              <a href="https://www.linkedin.com/in/caden-ankrom" target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
                LinkedIn
              </a>
              <a href="https://www.instagram.com/cadenisadesigner/" target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
                Instagram
              </a>
            </div>
          </div>
        </section>

        {/* Footer in its own snap container */}
        <section className="footer-section">
          <Footer />
        </section>
      </div>
    </main>
  );
}
