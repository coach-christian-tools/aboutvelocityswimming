"use client";

import { useState, useEffect } from "react";
import ImageWithLightbox from "./ImageWithLightbox";
import styles from "./Carousel.module.css";

interface CarouselProps {
  images: string[];
  autoPlayInterval?: number;
  altPrefix?: string;
  className?: string;
}

export default function Carousel({
  images,
  autoPlayInterval = 4000,
  altPrefix = "Velocity Image",
  className = "",
}: CarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (!images || images.length === 0) return;

    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % images.length);
    }, autoPlayInterval);
    return () => clearInterval(timer);
  }, [images, autoPlayInterval]);

  if (!images || images.length === 0) {
    return null;
  }

  const nextSlide = () => setCurrentIndex((prev) => (prev + 1) % images.length);
  const prevSlide = () =>
    setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);

  return (
    <div className={`${styles["carousel-container"]} ${className}`}>
      <ImageWithLightbox
        src={images[currentIndex]}
        alt={`${altPrefix} ${currentIndex + 1}`}
        className={styles["carousel-img"]}
      />

      {images.length > 1 && (
        <div className={styles["carousel-controls"]}>
          <button
            onClick={prevSlide}
            className={styles["carousel-btn"]}
            aria-label="Previous image"
          >
            &larr;
          </button>
          <div className={styles["carousel-dots"]}>
            {images.map((_, idx) => (
              <button
                key={idx}
                className={`${styles["carousel-dot"]} ${idx === currentIndex ? styles.active : ""}`}
                aria-current={idx === currentIndex ? "true" : undefined}
                onClick={() => setCurrentIndex(idx)}
                aria-label={`Go to slide ${idx + 1}`}
              />
            ))}
          </div>
          <button
            onClick={nextSlide}
            className={styles["carousel-btn"]}
            aria-label="Next image"
          >
            &rarr;
          </button>
        </div>
      )}
      <div className={styles["accent-blob"]}></div>
    </div>
  );
}
