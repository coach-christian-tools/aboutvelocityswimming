"use client";

import { useEffect, useRef, useState } from "react";
import { holdUpdates } from "@/lib/update-safety";

interface Variant {
  id: number;
  external_id: string;
  name: string;
  retail_price: string;
}

interface ProductFormProps {
  productId: number;
  productName: string;
  variants: Variant[];
}

export default function ProductForm({ productId, productName, variants }: ProductFormProps) {
  const [selectedVariantId, setSelectedVariantId] = useState(variants[0]?.id);
  const [checkoutPending, setCheckoutPending] = useState(false);
  const checkoutRelease = useRef<(() => void) | null>(null);
  useEffect(() => {
    const release = () => {
      checkoutRelease.current?.();
      checkoutRelease.current = null;
    };
    const restore = () => {
      release();
      setCheckoutPending(false);
    };
    window.addEventListener("pageshow", restore);
    return () => {
      window.removeEventListener("pageshow", restore);
      release();
    };
  }, []);
  
  const selectedVariant = variants.find((v) => v.id === selectedVariantId) || variants[0];
  
  const currentSizeLabel = selectedVariant?.name
    ? selectedVariant.name.replace(`${productName} - `, "").replace(`${productName} / `, "").trim()
    : "";

  return (
    <div className="product-form-container">
      <div className="price">
        ${selectedVariant?.retail_price}
      </div>
      
      <form action="/api/checkout" method="POST" onSubmit={(event) => {
        if (checkoutRelease.current) {
          event.preventDefault();
          return;
        }
        checkoutRelease.current = holdUpdates();
        setCheckoutPending(true);
      }}>
        <input type="hidden" name="sync_variant_id" value={selectedVariant?.id} />
        <input type="hidden" name="product_id" value={productId} />
        
        {variants.length > 1 && (
          <div className="size-selector-container">
            <div className="size-selector-label">
              <span>Size</span>
              {currentSizeLabel && (
                <span className="selected-size-badge">{currentSizeLabel}</span>
              )}
            </div>
            
            <div className="size-chips-grid" role="radiogroup" aria-label="Available sizes">
              {variants.map((v) => {
                const isSelected = v.id === selectedVariantId;
                const sizeLabel = v.name
                  .replace(`${productName} - `, "")
                  .replace(`${productName} / `, "")
                  .trim();

                return (
                  <button
                    key={v.id}
                    type="button"
                    className={`size-chip ${isSelected ? "active" : ""}`}
                    onClick={() => setSelectedVariantId(v.id)}
                    role="radio"
                    aria-checked={isSelected}
                    aria-label={`Select size ${sizeLabel}`}
                  >
                    {sizeLabel}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        
        <button type="submit" disabled={!selectedVariant || checkoutPending} className="btn btn-primary buy-button-large">
          {checkoutPending ? "Opening checkout…" : "Checkout with Stripe"}
        </button>
        {checkoutPending && (
          <div role="status">
            <p>Opening secure checkout. If navigation was stopped or nothing opens, reload this page before trying again. Reloading will not submit another checkout.</p>
            <button type="button" className="btn" onClick={() => window.location.reload()}>
              Reload page
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
