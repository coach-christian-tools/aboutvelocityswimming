import ReviewQueue from "@/components/collection/ReviewQueue";
import { toolDirectory } from "@/lib/tool-directory";
import styles from "./review.module.css";

export const metadata = { title: `${toolDirectory.imports.title} | Velocity Swimming` };

export default function Page() {
  return (
    <main className={styles.page}>
      <header className={styles.intro}>
        <h1>Review queue</h1>
      </header>
      <ReviewQueue />
    </main>
  );
}
