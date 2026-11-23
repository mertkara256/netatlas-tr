// The province and district tables from data/processed/, copied into the site at build time so the
// methodology page can offer them as downloads (GitHub's raw files open as plain text in the browser).
import { readFile } from "node:fs/promises";
import path from "node:path";

const CSV_FILES = ["iller_hiz.csv", "ilceler_hiz.csv"] as const;

export const dynamic = "force-static";
export const dynamicParams = false;
export const generateStaticParams = () => CSV_FILES.map((dosya) => ({ dosya }));

export async function GET(_request: Request, { params }: RouteContext<"/veri/[dosya]">) {
  const { dosya } = await params;
  const csv = await readFile(path.join(process.cwd(), "..", "data", "processed", dosya));
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8" } });
}
