"use client";

import { useState } from "react";

interface Variant {
  id: number;
  external_id: string;
  name: string;
  retail_price: string;
  files: any[];
}

interface ProductFormProps {
  productName: string;
  variants: Variant[];
}

export default function ProductForm({ productName, variants }: ProductFormProps) {
  const [selectedVariantId, setSelectedVariantId] = useState(variants[0]?.id);
  
  const selectedVariant = variants.find((v) => v.id === selectedVariantId) || variants[0];
  
  let image = "";
  if (selectedVariant && selectedVariant.files) {
    const mockupFile = selectedVariant.files.find((f: any) => f.type === "mockup" && f.preview_url);
    const anyPreview = selectedVariant.files.find((f: any) => f.preview_url);
    image = mockupFile?.preview_url || anyPreview?.preview_url || "";
  }

  const currentSizeLabel = selectedVariant?.name
    ? selectedVariant.name.replace(`${productName} - `, "").replace(`${productName} / `, "").trim()
    : "";

  return (
    <div className="product-form-container">
      <div className="price">
        ${selectedVariant?.retail_price}
      </div>
      
      <form action="/api/checkout" method="POST">
        <input type="hidden" name="sync_variant_id" value={selectedVariant?.id} />
        <input type="hidden" name="product_name" value={selectedVariant?.name || productName} />
        <input type="hidden" name="price" value={selectedVariant?.retail_price} />
        <input type="hidden" name="image" value={image} />
        
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
        
        <button type="submit" className="btn btn-primary buy-button-large">
          Checkout with Stripe
        </button>
      </form>
    </div>
  );
}
