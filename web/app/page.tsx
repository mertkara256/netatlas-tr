import { readFile } from "node:fs/promises";
import path from "node:path";
import Link from "next/link";
import Atlas from "@/components/Atlas";
import type { PeriodInfo } from "@/lib/data";
import styles from "./page.module.css";

// Read at build time from the pipeline's output, so the page ships with the periods it has data for.
async function loadPeriods(): Promise<PeriodInfo[]> {
  const file = path.join(process.cwd(), "public", "data", "iller.json");
  return JSON.parse(await readFile(file, "utf8")).donemler;
}

export default async function Home() {
  const periods = await loadPeriods();
  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>NetAtlas TR</h1>
          <p className={styles.subtitle}>Türkiye&apos;de ölçülen sabit internet hızları, 475 m&apos;lik karelere kadar</p>
        </div>
        <nav aria-label="Sayfalar">
          <Link className={styles.navLink} href="/il/">İller</Link>
        </nav>
      </header>
      <Atlas periods={periods} />
    </main>
  );
}
