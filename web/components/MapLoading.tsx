import styles from "./Atlas.module.css";

/** Shown over the map until the speed colours are drawn: first while the map code loads, then the tiles. */
export default function MapLoading() {
  return (
    <div className={styles.mapLoading} role="status">
      <span className={styles.spinner} aria-hidden="true" />
      Hız verisi yükleniyor…
    </div>
  );
}
