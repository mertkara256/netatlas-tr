import { DATA_DIR } from "./data";

/** One entry of the pipeline's arama.json: a province or district with its bounding box. */
export type Place = {
  tur: "il" | "ilce";
  kod: string;
  ad: string;
  /** A district's province. */
  il?: string;
  /** The name folded like normalize() below (pipeline.common.normalize_name). */
  ara: string;
  bbox: [number, number, number, number];
};

const ASCII: Record<string, string> = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" };

/** "Kadıköy", "KADIKÖY" and "kadikoy" all become "kadikoy"; spaces and punctuation are dropped. */
export function normalize(text: string): string {
  return text
    .toLocaleLowerCase("tr-TR")
    .replace(/[çğıöşü]/g, (c) => ASCII[c])
    .normalize("NFKD")
    .replace(/[^a-z]/g, "");
}

let loading: Promise<Place[]> | null = null;

export function loadPlaces(): Promise<Place[]> {
  loading ??= fetch(`${DATA_DIR}/arama.json`).then((response) => response.json());
  return loading;
}

/** Names starting with the query first, then names containing it; provinces before districts. */
export function searchPlaces(places: Place[], query: string, limit = 8): Place[] {
  const q = normalize(query);
  if (q.length < 2) return [];
  return places
    .map((place) => ({ place, at: place.ara.indexOf(q) }))
    .filter(({ at }) => at >= 0)
    .sort((a, b) =>
      Number(a.at > 0) - Number(b.at > 0)
      || Number(a.place.tur === "ilce") - Number(b.place.tur === "ilce")
      || a.place.ad.length - b.place.ad.length
      || a.place.ad.localeCompare(b.place.ad, "tr"))
    .slice(0, limit)
    .map(({ place }) => place);
}
