import { expect, test, type Page } from "@playwright/test";

const STUB_STYLE = JSON.stringify({
  version: 8,
  sources: {},
  layers: [{ id: "background", type: "background", paint: { "background-color": "#f9f9f7" } }],
});

async function stubOpenFreeMap(page: Page) {
  await page.route("https://tiles.openfreemap.org/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: STUB_STYLE }),
  );
}

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console.error: ${message.text()}`);
  });
  return errors;
}

test("home page renders the map and fetches PMTiles via HTTP Range", async ({ page }) => {
  await stubOpenFreeMap(page);
  const errors = watchErrors(page);
  const rangeResponses: string[] = [];
  page.on("response", (response) => {
    if (response.url().includes(".pmtiles") && response.status() === 206) {
      rangeResponses.push(response.url());
    }
  });

  await page.goto("./");
  await expect(page.getByRole("heading", { level: 1, name: "NetAtlas TR" })).toBeVisible();

  const canvas = page.locator(".maplibregl-canvas").first();
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThan(200);
  expect(box!.height).toBeGreaterThan(200);

  await expect.poll(() => rangeResponses.length).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test("basemap failure falls back cleanly", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route("https://tiles.openfreemap.org/**", (route) => route.abort("failed"));

  const rangeResponses: string[] = [];
  page.on("response", (response) => {
    if (response.url().includes(".pmtiles") && response.status() === 206) {
      rangeResponses.push(response.url());
    }
  });

  await page.goto("./");
  await expect(page.locator(".maplibregl-canvas").first()).toBeVisible();
  await expect.poll(() => rangeResponses.length).toBeGreaterThan(0);
  expect(pageErrors).toEqual([]);
});

test("Turkish search opens the region panel, updates the URL hash, and closes on Escape", async ({ page }) => {
  await stubOpenFreeMap(page);
  const errors = watchErrors(page);

  await page.goto("./");
  const search = page.getByRole("combobox", { name: "İl ya da ilçe ara" });
  await search.click();
  await search.fill("sanliurfa");

  const option = page.getByRole("option", { name: /Şanlıurfa/ });
  await expect(option).toBeVisible();
  await search.press("Enter");

  const panel = page.getByRole("complementary", { name: "Bölge bilgileri" });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("heading", { level: 2, name: "Şanlıurfa" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.location.hash)).toContain("s=iller:63");

  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(search).toBeFocused();
  await expect.poll(() => page.evaluate(() => window.location.hash)).not.toContain("s=iller:63");
  expect(errors).toEqual([]);
});

test("controls switch metric, view, period, and period comparison divider", async ({ page }) => {
  await stubOpenFreeMap(page);
  const errors = watchErrors(page);

  await page.goto("./");
  const metricGroup = page.getByRole("group", { name: "Gösterge" });
  const uploadBtn = metricGroup.getByRole("button", { name: "Yükleme" });
  await uploadBtn.click();
  await expect(uploadBtn).toHaveAttribute("aria-pressed", "true");

  const viewGroup = page.getByRole("group", { name: "Görünüm" });
  const provincesBtn = viewGroup.getByRole("button", { name: "İller" });
  await provincesBtn.click();
  await expect(provincesBtn).toHaveAttribute("aria-pressed", "true");

  await expect.poll(() => page.evaluate(() => window.location.hash)).toContain("m=yukleme");
  await expect.poll(() => page.evaluate(() => window.location.hash)).toContain("g=iller");

  const periodBtn = page.getByRole("group", { name: "Dönem" }).getByRole("button", { name: /^2020/ });
  await periodBtn.click();
  await expect(periodBtn).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => page.evaluate(() => window.location.hash)).toContain("d=2020");

  const compareBtn = page.getByRole("button", { name: "İki dönemi karşılaştır" });
  await compareBtn.click();
  await expect(compareBtn).toHaveAttribute("aria-pressed", "true");

  const slider = page.getByRole("slider", { name: "Karşılaştırma çizgisi" });
  await expect(slider).toBeVisible();
  await expect(slider).toHaveAttribute("aria-valuenow", "50");
  await expect(page.locator(".maplibregl-canvas")).toHaveCount(2);

  await slider.focus();
  await page.keyboard.press("ArrowRight");
  await expect(slider).toHaveAttribute("aria-valuenow", "55");

  await compareBtn.click();
  await expect(slider).toBeHidden();
  expect(errors).toEqual([]);
});

test("table view filters areas and opens the region panel", async ({ page }) => {
  await stubOpenFreeMap(page);
  const errors = watchErrors(page);

  await page.goto("./");
  await page.getByRole("group", { name: "Görünüm" }).getByRole("button", { name: "İller" }).click();
  await page.getByRole("group", { name: "Gösterim" }).getByRole("button", { name: "Tablo" }).click();

  await expect(page.getByRole("region", { name: "Hız haritası" })).toBeHidden();
  await expect(page.getByText("81 il")).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();

  await page.getByRole("searchbox", { name: "İllerde ara" }).fill("ankara");
  await expect(page.getByText("1 il")).toBeVisible();
  await page.getByRole("table").getByRole("button", { name: "Ankara" }).click();

  const panel = page.getByRole("complementary", { name: "Bölge bilgileri" });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("heading", { level: 2, name: "Ankara" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("URL hash deep-link restores period, metric, view, and selection", async ({ page }) => {
  await stubOpenFreeMap(page);
  const errors = watchErrors(page);

  await page.goto("./#d=2024&m=yukleme&g=iller&s=iller:06");

  const panel = page.getByRole("complementary", { name: "Bölge bilgileri" });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("heading", { level: 2, name: "Ankara" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Gösterge" }).getByRole("button", { name: "Yükleme" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("group", { name: "Görünüm" }).getByRole("button", { name: "İller" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("group", { name: "Dönem" }).getByRole("button", { name: /^2024/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(errors).toEqual([]);
});

test("static pages, JSON-LD Dataset markup, CSV downloads, and mobile layout", async ({ page }) => {
  await stubOpenFreeMap(page);
  const errors = watchErrors(page);

  await page.goto("il/");
  await expect(page.getByRole("heading", { level: 1, name: "İller" })).toBeVisible();
  expect(await page.locator("tbody tr").count()).toBeGreaterThanOrEqual(82);

  await page.getByRole("link", { name: "İstanbul" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "İstanbul" })).toBeVisible();
  await page.getByRole("link", { name: "Haritada aç", exact: true }).click();

  const panel = page.getByRole("complementary", { name: "Bölge bilgileri" });
  await expect(panel.getByRole("heading", { level: 2, name: "İstanbul" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.location.hash)).toContain("s=iller:34");

  await page.goto("fiber/");
  await expect(page.getByRole("heading", { level: 1, name: "Fiber, telefon hattını nerede geçti?" })).toBeVisible();
  await expect(page.locator(".maplibregl-canvas").first()).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Türkiye nerede?" })).toBeVisible();

  await page.goto("yontem/");
  await expect(page.getByRole("heading", { level: 1, name: "Yöntem ve kaynaklar" })).toBeVisible();
  const ldJsonRaw = await page.locator('script[type="application/ld+json"]').textContent();
  expect(ldJsonRaw).not.toBeNull();
  const ldJson = JSON.parse(ldJsonRaw!);
  expect(ldJson["@type"]).toBe("Dataset");
  expect(ldJson.distribution).toHaveLength(3);

  for (const file of ["iller_hiz.csv", "ilceler_hiz.csv", "iller_yerlesim.csv"]) {
    const res = await page.request.get(`veri/${file}`);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/csv");
    const lines = (await res.text()).trim().split("\n");
    expect(lines.length).toBeGreaterThan(10);
  }

  await page.setViewportSize({ width: 375, height: 812 });
  for (const route of ["./", "il/istanbul/", "yontem/"]) {
    await page.goto(route);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow, `horizontal overflow on ${route}`).toBe(false);
  }

  expect(errors).toEqual([]);
});
