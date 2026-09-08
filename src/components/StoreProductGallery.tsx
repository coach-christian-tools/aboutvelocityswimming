"use client";

import { useState, useEffect, useRef } from "react";
import "./StoreProductGallery.css";

interface StoreProductGalleryProps {
  images: string[];
  productName: string;
}

export default function StoreProductGallery({ images, productName }: StoreProductGalleryProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const validImages = images && images.length > 0 ? images : ["/assets/logo-variations/contrast/Full%20Contrast.svg"];
  const total = validImages.length;

  // Auto-cycle every 3.8s if not hovered and there are multiple images
  useEffect(() => {
    if (total <= 1 || isHovered) return;

    timerRef.current = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % total);
    }, 3800);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [total, isHovered]);

  const handlePrev = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCurrentIndex((prev) => (prev - 1 + total) % total);
  };

  const handleNext = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCurrentIndex((prev) => (prev + 1) % total);
  };

  const handleDotClick = (idx: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCurrentIndex(idx);
  };

  return (
    <div
      className="store-gallery"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      role="region"
      aria-label={`${productName} image gallery`}
    >
      <div className="store-gallery-stage">
        {validImages.map((src, idx) => (
          <img
            key={src + idx}
            src={src}
            alt={`${productName} - View ${idx + 1}`}
            className={`store-gallery-image ${idx === currentIndex ? "active" : ""}`}
            loading={idx === 0 ? "eager" : "lazy"}
          />
        ))}

        {total > 1 && (
          <>
            <button
              type="button"
              className="gallery-nav-btn prev"
              onClick={handlePrev}
              aria-label="Previous image"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <button
              type="button"
              className="gallery-nav-btn next"
              onClick={handleNext}
              aria-label="Next image"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </>
        )}
      </div>

      {total > 1 && (
        <div className="store-gallery-dots" role="tablist">
          {validImages.map((_, idx) => (
            <button
              key={idx}
              type="button"
              className={`gallery-dot ${idx === currentIndex ? "active" : ""}`}
              onClick={(e) => handleDotClick(idx, e)}
              role="tab"
              aria-selected={idx === currentIndex}
              aria-label={`View image ${idx + 1} of ${total}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
