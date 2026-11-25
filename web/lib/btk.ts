import type { BtkValues } from "./data";

/** BTK's fixed subscriptions by connection type, in the order the panel's bar stacks them. "Diğer" is
 *  BTK's own category: Frame Relay, Metro Ethernet, ATM and BPL. */
export const CONNECTION_TYPES = [
  { key: "fiber", label: "Fiber" },
  { key: "xdsl", label: "Telefon hattı (ADSL/VDSL)" },
  { key: "kablo", label: "Kablo TV" },
  { key: "diger", label: "Diğer" },
] as const;
export type ConnectionType = (typeof CONNECTION_TYPES)[number]["key"];

/** The 12th Development Plan's (2024–2028) target for fiber subscriptions per 100 people, "fiber genişbant abone
 *  yaygınlığı", whose footnote defines it as subscriptions over population: Tablo 28 "Bilgi ve İletişim Teknolojileri
 *  Hedefleri", page 133 of the plan, gives 6,7 for 2022, an estimated 7,42 for 2023 and 11,0 for 2028. A target for
 *  Türkiye as a whole, not for each province. */
export const FIBER_TARGET = {
  year: 2028,
  value: 11,
  url: "https://www.sbb.gov.tr/wp-content/uploads/2023/12/On-Ikinci-Kalkinma-Plani_2024-2028_11122023.pdf",
};

/** Fiber subscriptions per 100 people, the plan's measure. */
export const fiberPer100 = (btk: Pick<BtkValues, "fiber" | "nufus">) => (btk.fiber / btk.nufus) * 100;

/** Since which year fiber has had more subscriptions than xDSL in every year up to the last one, and
 *  whether that is BTK's first year, so fiber may have been ahead earlier. Null while xDSL still leads. */
export function fiberLead(btk: Record<string, BtkValues>): { since: string; fromStart: boolean } | null {
  const years = Object.keys(btk).sort();
  let since: string | null = null;
  for (let i = years.length - 1; i >= 0 && btk[years[i]].fiber > btk[years[i]].xdsl; i--) since = years[i];
  return since === null ? null : { since, fromStart: since === years[0] };
}
