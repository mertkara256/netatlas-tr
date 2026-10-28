import type { MetadataRoute } from "next";
import { BASE_PATH, NATIONAL, SITE_ORIGIN } from "@/lib/data";
import { readProvinces } from "@/lib/serverData";
import { provincePath } from "@/lib/slug";

// Written once at build time, as the static export requires.
export const dynamic = "force-static";

/** Every page of the site, for search engines: the map, the province list, the 81 province pages
 *  and the methodology. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { iller } = await readProvinces();
  const provinces = Object.entries(iller)
    .filter(([code]) => code !== NATIONAL)
    .map(([, province]) => provincePath(province.ad));
  return ["/", "/il/", ...provinces, "/yontem/"].map((path) => ({ url: `${SITE_ORIGIN}${BASE_PATH}${path}` }));
}
