import type { ReactNode } from "react";
import styles from "../../marketing.module.css";

export default function CollectionLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`${styles["marketing-site"]} ${styles["tools-content"]}`}>
      {children}
    </div>
  );
}
