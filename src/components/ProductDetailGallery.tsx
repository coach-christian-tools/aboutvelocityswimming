"use client";

import { useState } from "react";
import styles from "./ProductDetailGallery.module.css";
import { scopedClasses } from "@/lib/styles";

interface ProductDetailGalleryProps {
  images: string[];
  productName: string;
}

export default function ProductDetailGallery({ images, productName }: ProductDetailGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const validImages = images && images.length > 0 ? images : ["/assets/logo-variations/contrast/Full%20Contrast.svg"];
  const currentImage = validImages[selectedIndex] || validImages[0];

  return (
    <div className={scopedClasses(styles, 'product-detail-gallery')}>
      {/* Main Showcase Image */}
      <div className={scopedClasses(styles, 'detail-main-image-container')}>
        <img
          src={currentImage}
          alt={`${productName} - View ${selectedIndex + 1}`}
          className={scopedClasses(styles, 'detail-main-image')}
        />
      </div>

      {/* Thumbnails of all views */}
      {validImages.length > 1 && (
        <div className={scopedClasses(styles, 'detail-thumbnails-row')} role="tablist" aria-label="Product image thumbnails">
          {validImages.map((url, idx) => (
            <button
              key={url + idx}
              type="button"
              className={scopedClasses(styles, `detail-thumbnail-btn ${idx === selectedIndex ? "active" : ""}`)}
              onClick={() => setSelectedIndex(idx)}
              role="tab"
              aria-selected={idx === selectedIndex}
              aria-label={`Show ${productName} image ${idx + 1}`}
            >
              <img
                src={url}
                alt={`${productName} thumbnail ${idx + 1}`}
                className={scopedClasses(styles, 'detail-thumbnail-img')}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
