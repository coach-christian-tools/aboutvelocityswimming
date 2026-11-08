import FlaggedResults from "@/components/collection/FlaggedResults";
import styles from "../review.module.css";

export const metadata = { title: "Flagged results | Velocity Swimming" };
export default function Page() {
  return (
    <main className={styles.page}>
      <header className={styles.intro}>
        <h1>Flagged results</h1>
        <p>Review questionable uploads and restore results after checking their source.</p>
      </header>
      <FlaggedResults />
    </main>
  );
}
