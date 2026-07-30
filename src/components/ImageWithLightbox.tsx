"use client";

import { useState } from "react";
import "./ImageWithLightbox.css";

interface Props extends React.ImgHTMLAttributes<HTMLImageElement> {
  containerClassName?: string;
}

export default function ImageWithLightbox({ className, containerClassName = "", src, alt, ...props }: Props) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <img
        src={src}
        alt={alt}
        className={`${className} lightbox-trigger`}
        onClick={() => setIsOpen(true)}
        {...props}
      />
      
      {isOpen && (
        <div className="lightbox-overlay" onClick={() => setIsOpen(false)}>
          <div className="lightbox-content">
            <button className="lightbox-close" onClick={() => setIsOpen(false)}>&times;</button>
            <img src={src} alt={alt} className="lightbox-img" onClick={(e) => e.stopPropagation()} />
          </div>
        </div>
      )}
    </>
  );
}
