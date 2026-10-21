const ASCII: Record<string, string> = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" };

/** URL slug of a place name: "Kahramanmaraş" -> "kahramanmaras", "Afyonkarahisar" -> "afyonkarahisar". */
export function slugify(name: string): string {
  return name
    .toLocaleLowerCase("tr-TR")
    .replace(/[çğıöşü]/g, (c) => ASCII[c])
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function provincePath(name: string): string {
  return `/il/${slugify(name)}/`;
}
