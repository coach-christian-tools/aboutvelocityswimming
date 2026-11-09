import { notFound } from "next/navigation";
import PrivateRaceBaseline from "@/components/collection/PrivateRaceBaseline";
import { serverClient } from "@/lib/supabase/server";
import styles from "../review.module.css";

export const metadata = { title: "Exports | Velocity Swimming" };

export default async function Page() {
  const client = await serverClient();
  const { data: staff } = await client.rpc("is_staff");
  if (staff !== true) notFound();

  return (
    <main className={styles.page}>
      <header className={styles.intro}>
        <h1>Exports</h1>
      </header>
      <section className={styles.exportPanel} aria-labelledby="private-race-baseline">
        <h2 id="private-race-baseline">Private race baseline</h2>
        <p>Download a snapshot of race data, identity mappings, and the full meet catalog to prepare race imports.</p>
        <PrivateRaceBaseline />
      </section>
    </main>
  );
}
