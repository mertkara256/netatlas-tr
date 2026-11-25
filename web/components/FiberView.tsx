"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { Fragment } from "react";
import { fiberLeadColors } from "@/lib/colors";
import { useColorScheme } from "@/lib/useColorScheme";
import styles from "./Fiber.module.css";

// MapLibre runs in the browser only; the box keeps its place until the map is drawn.
const FiberMap = dynamic(() => import("./FiberMap"), { ssr: false });

export type FiberProvince = {
  code: string;
  name: string;
  path: string;
  /** The year since which fiber has had more subscriptions than xDSL, null while xDSL leads (lib/btk.ts). */
  since: string | null;
  /** Shares of fixed subscriptions in BTK's last year. */
  fiber: number;
  xdsl: number;
};

/** The provinces by the year fiber went ahead of xDSL: on a map, and listed by year under it. The list is
 *  the map's legend and holds everything the map shows, with links to the province pages. */
export default function FiberView({ provinces, years }: { provinces: FiberProvince[]; years: string[] }) {
  const theme = useColorScheme();
  const colors = fiberLeadColors(years, theme);
  const fill = Object.fromEntries(provinces.map((p) => [p.code, p.since ? colors.years[p.since] : colors.behind]));
  const groups = [
    ...years.map((year, i) => ({
      key: year,
      // Fiber already ahead in BTK's first year may have gone ahead before it.
      label: i === 0 ? `${year} ya da önce` : year,
      color: colors.years[year],
      members: provinces.filter((p) => p.since === year),
    })),
    { key: "geride", label: "Henüz geçmedi", color: colors.behind, members: provinces.filter((p) => p.since === null) },
  ];

  return (
    <>
      <div className={styles.map} aria-hidden="true">
        <FiberMap provinces={provinces} fill={fill} theme={theme} firstYear={years[0]} lastYear={years[years.length - 1]} />
      </div>
      <p className={styles.hint}>Bir ile tıklayınca o ilin sayfası açılır.</p>

      <h2>Yıllara göre iller</h2>
      <ul className={styles.groups}>
        {groups.map((g) => (
          <li key={g.key}>
            <span className={styles.swatch} style={{ background: g.color }} />
            <div>
              <p className={styles.groupTitle}>
                {g.label} <span className={styles.count}>{g.members.length} il</span>
              </p>
              <p className={styles.names}>
                {g.members.length === 0
                  ? "Fiberin bu yıl öne geçtiği il yok."
                  : g.members.map((p, i) => (
                    <Fragment key={p.code}>
                      {i > 0 && ", "}
                      <Link href={p.path}>{p.name}</Link>
                    </Fragment>
                  ))}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
