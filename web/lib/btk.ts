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

/** Since which year fiber has had more subscriptions than xDSL in every year up to the last one, and
 *  whether that is BTK's first year, so fiber may have been ahead earlier. Null while xDSL still leads. */
export function fiberLead(btk: Record<string, BtkValues>): { since: string; fromStart: boolean } | null {
  const years = Object.keys(btk).sort();
  let since: string | null = null;
  for (let i = years.length - 1; i >= 0 && btk[years[i]].fiber > btk[years[i]].xdsl; i--) since = years[i];
  return since === null ? null : { since, fromStart: since === years[0] };
}
