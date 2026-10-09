"use client";

import { useState } from "react";
import styles from "./ImageWithLightbox.module.css";
import { scopedClasses } from "@/lib/styles";

interface Props extends React.ImgHTMLAttributes<HTMLImageElement> {
  containerClassName?: string;
}

export default function ImageWithLightbox({ className, containerClassName = "", src, alt, ...props }: Props) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className={containerClassName}>
      <img
        src={src}
        alt={alt}
        className={scopedClasses(styles, `${className} lightbox-trigger`)}
        tabIndex={0}
        role="button"
        aria-label={"Enlarge " + alt}
        onKeyDown={event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();setIsOpen(true);}}}
        onClick={() => setIsOpen(true)}
        {...props}
      />
      
      {isOpen && (
        <div className={scopedClasses(styles, 'lightbox-overlay')} onClick={() => setIsOpen(false)}>
          <div className={scopedClasses(styles, 'lightbox-content')}>
            <button className={scopedClasses(styles, 'lightbox-close')} onClick={() => setIsOpen(false)}>&times;</button>
            <img src={src} alt={alt} className={scopedClasses(styles, 'lightbox-img')} onClick={(e) => e.stopPropagation()} />
          </div>
        </div>
      )}
    </div>
  );
}
