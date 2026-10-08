import type { ReactNode } from "react";
import Footer from "./Footer";
import styles from "./SectionPage.module.css";

export default function SectionPage({ eyebrow, title, description, children }: {
  eyebrow?: string;
  title?: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <>
      <main className={styles.page}>
        <div className={styles.container}>
          {title ? <header className={styles.intro}>
            <p className={styles.eyebrow}>{eyebrow}</p>
            <h1>{title}<span aria-hidden="true">.</span></h1>
            <p className={styles.description}>{description}</p>
          </header> : null}
          {children}
        </div>
      </main>
      <Footer />
    </>
  );
}

export function SectionIcon({ kind }: { kind: "calendar" | "flag" | "people" | "attendance" | "book" }) {
  const paths = {
    calendar: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M7 3v4m10-4v4M3 11h18m-13 5h2m4 0h2" /></>,
    flag: <><path d="M5 21V3m0 1c5-4 9 4 14 0v10c-5 4-9-4-14 0" /></>,
    people: <><circle cx="9" cy="8" r="3" /><path d="M3 21v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 4v2" /></>,
    attendance: <><rect x="5" y="5" width="14" height="16" rx="2" /><rect x="9" y="3" width="6" height="4" rx="1" /><path d="m9 14 2 2 4-4" /></>,
    book: <><path d="M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1Zm0 0v15" /></>,
  };
  return <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[kind]}</svg>;
}
