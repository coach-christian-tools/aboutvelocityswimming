import Link from "next/link";
import ReviewQueue from "@/components/collection/ReviewQueue";
import styles from "../review.module.css";

export const metadata = { title: "Batch review and history | Velocity Imports" };

export default function Page() {
  return (
    <main className={styles.page}>
      <header className={styles.intro}>
        <h1>Batch review and history</h1>
        <p><Link href="/tools/review">Review queue</Link></p>
      </header>
      <ReviewQueue />
    </main>
  );
}
