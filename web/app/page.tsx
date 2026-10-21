import Atlas from "@/components/Atlas";
import { readProvinces } from "@/lib/serverData";
import styles from "./page.module.css";

export default async function Home() {
  // Read at build time from the pipeline's output, so the page ships with the periods it has data for.
  const { donemler } = await readProvinces();
  return (
    <main className={styles.main}>
      <Atlas periods={donemler} />
    </main>
  );
}
