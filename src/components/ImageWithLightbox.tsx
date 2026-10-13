"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./ImageWithLightbox.module.css";
import { scopedClasses } from "@/lib/styles";

interface Props extends React.ImgHTMLAttributes<HTMLImageElement> {
  containerClassName?: string;
}

export default function ImageWithLightbox({
  className,
  containerClassName = "",
  src,
  alt,
  ...props
}: Props) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [isOpen]);

  return (
    <div className={`${styles["image-container"]} ${containerClassName}`}>
      <img
        src={src}
        alt={alt}
        className={scopedClasses(styles, `${className} lightbox-trigger`)}
        tabIndex={0}
        role="button"
        aria-label={"Enlarge " + alt}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setIsOpen(true);
          }
        }}
        onClick={() => setIsOpen(true)}
        {...props}
      />

      {isOpen &&
        createPortal(
          <div
            className={scopedClasses(styles, "lightbox-overlay")}
            role="dialog"
            aria-modal="true"
            aria-label={"Enlarged " + alt}
            onClick={() => setIsOpen(false)}
          >
            <div className={scopedClasses(styles, "lightbox-content")}>
              <button
                className={scopedClasses(styles, "lightbox-close")}
                aria-label="Close enlarged image"
                onClick={() => setIsOpen(false)}
              >
                &times;
              </button>
              <img
                src={src}
                alt={alt}
                className={scopedClasses(styles, "lightbox-img")}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
