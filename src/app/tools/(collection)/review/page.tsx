import Link from "next/link";
import ImportsReview from "@/components/collection/ImportsReview";
import { InventoryPage } from "@/components/collection/ImportsInventory";
import styles from "@/components/collection/ImportsInventory.module.css";
import { toolDirectory } from "@/lib/tool-directory";

export const metadata = { title: `${toolDirectory.imports.title} | Velocity Swimming` };

export default function Page() {
  return (
    <InventoryPage title="Review queue" description="Review newly collected meets and swims before publishing them.">
      <p className={styles.notice}>
        <Link href="/tools/review/batches">Batch review and history</Link>
        {" · "}
        <Link href="/tools/review/overview">Imports overview</Link>
      </p>
      <ImportsReview />
    </InventoryPage>
  );
}
