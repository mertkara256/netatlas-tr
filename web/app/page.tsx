import SpeedMap from "@/components/SpeedMap";
import styles from "./page.module.css";

export default function Home() {
  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1 className={styles.title}>NetAtlas TR</h1>
        <p className={styles.subtitle}>Ortalama sabit internet indirme hızı, son dört çeyrek</p>
      </header>
      <div className={styles.map}>
        <SpeedMap period="guncel" />
      </div>
    </main>
  );
}
