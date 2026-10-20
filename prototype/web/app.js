"use strict";

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const numberFormats = new Map();
function fmt(value, digits = 0) {
  if (value == null || Number.isNaN(value)) return "–";
  if (!numberFormats.has(digits)) {
    numberFormats.set(digits, new Intl.NumberFormat("tr-TR", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }));
  }
  return numberFormats.get(digits).format(value);
}
const pct = (value, digits = 0) => (value == null ? "–" : `%${fmt(value * 100, digits)}`);
const dateFormat = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric" });

// ---------------------------------------------------------------------------
// What the map can show
// ---------------------------------------------------------------------------

const METRICS = [
  {
    id: "down",
    label: "Hız",
    title: "Ortalama indirme hızı",
    get: (p) => p.speed?.down,
    format: (v) => `${fmt(v)} Mbps`,
    tick: (v) => fmt(v),
    note: (meta) => `Mbps · ${meta.speed_period}, test ağırlıklı ortalama`,
  },
  {
    id: "growth",
    label: "2019'dan beri artış",
    title: "2019'a göre hız artışı",
    get: (p) => p.growth,
    format: (v) => `${fmt(v, 1)} kat`,
    tick: (v) => fmt(v, 1),
    note: (meta) => `kat · ${meta.speed_period} ortalaması ÷ 2019 ortalaması`,
  },
  {
    id: "fixed_per_100",
    label: "Abonelik",
    title: "100 kişiye sabit internet aboneliği",
    get: (p) => p.fixed_per_100,
    format: (v) => fmt(v, 1),
    tick: (v) => fmt(v, 1),
    note: (meta) => `abonelik · BTK, ${meta.btk_year} yıl sonu`,
  },
  {
    id: "fiber_share",
    label: "Fiber payı",
    title: "Sabit aboneliklerde fiber payı",
    get: (p) => p.fiber_share,
    format: (v) => pct(v),
    tick: (v) => pct(v),
    note: (meta) => `BTK, ${meta.btk_year} yıl sonu`,
  },
  {
    id: "tests_per_1000",
    label: "Ölçüm yoğunluğu",
    title: "1000 kişiye düşen Speedtest ölçümü",
    get: (p) => p.tests_per_1000,
    format: (v) => fmt(v, 1),
    tick: (v) => fmt(v, 0),
    note: (meta) => `ölçüm · ${meta.speed_period}; verinin ne kadar sağlam olduğunu gösterir`,
  },
];

const CELL_BREAKS = [50, 100, 200, 400]; // Mbps, for the ~2.4 km cells
const CELLS_FROM_ZOOM = 6.8;
const RELIABILITY = {
  yuksek: { label: "Yüksek güvenilirlik", short: "Yüksek", icon: "●", rank: 3 },
  orta: { label: "Orta güvenilirlik", short: "Orta", icon: "◐", rank: 2 },
  dusuk: { label: "Düşük güvenilirlik", short: "Düşük", icon: "○", rank: 1 },
};
const TURKEY_BOUNDS = [[25.6, 35.8], [44.9, 42.2]];
const THEME_KEY = "tr-internet-theme";
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

const state = {
  meta: null,
  national: null,
  provinces: {},
  shapes: null,
  bboxes: {},
  metricId: "down",
  breaks: [],
  selected: null,
  hovered: null,
  sort: { key: "down", dir: -1 },
  map: null,
  mapReady: false,
};

const metric = () => METRICS.find((m) => m.id === state.metricId);
const provinceList = () => Object.values(state.provinces);

// ---------------------------------------------------------------------------
// DOM helpers (all text goes through textContent)
// ---------------------------------------------------------------------------

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else node.setAttribute(key, value);
  }
  for (const child of children) if (child != null) node.append(child);
  return node;
}

const SVG_NS = "http://www.w3.org/2000/svg";
function svg(tag, attrs = {}, text) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) if (value != null) node.setAttribute(key, value);
  if (text != null) node.textContent = text;
  return node;
}

const root = document.documentElement;
const cssVar = (name) => getComputedStyle(root).getPropertyValue(name).trim();
const ramp = () => [1, 2, 3, 4, 5].map((i) => cssVar(`--seq-${i}`));

function currentTheme() {
  if (root.dataset.theme) return root.dataset.theme;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function reliabilityBadge(level) {
  const info = RELIABILITY[level] ?? RELIABILITY.dusuk;
  return el("span", { class: `badge ${level}`, title: info.label },
    el("span", { class: "icon", "aria-hidden": "true", text: info.icon }),
    el("span", { text: info.short }));
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

function quantileBreaks(values, classes = 5) {
  const sorted = values.filter((v) => v != null).sort((a, b) => a - b);
  const breaks = [];
  for (let i = 1; i < classes; i++) {
    const pos = ((sorted.length - 1) * i) / classes;
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    breaks.push(sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo));
  }
  return { breaks, min: sorted[0], max: sorted[sorted.length - 1] };
}

function classOf(value, breaks) {
  if (value == null) return -1;
  let i = 0;
  while (i < breaks.length && value > breaks[i]) i++;
  return i;
}

function rankOf(code) {
  const m = metric();
  const ordered = provinceList().filter((p) => m.get(p) != null).sort((a, b) => m.get(b) - m.get(a));
  return ordered.findIndex((p) => p.code === code) + 1;
}

// ---------------------------------------------------------------------------
// Map
// ---------------------------------------------------------------------------

// OpenFreeMap: free vector basemaps, no API key.
const BASEMAP_STYLES = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
};

function cellsToGeoJSON({ zoom, cells }) {
  const n = 2 ** zoom;
  const lon = (x) => (x / n) * 360 - 180;
  const lat = (y) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;
  return {
    type: "FeatureCollection",
    features: cells.map(([x, y, d, t]) => ({
      type: "Feature",
      properties: { d, t },
      geometry: {
        type: "Polygon",
        coordinates: [[[lon(x), lat(y)], [lon(x + 1), lat(y)], [lon(x + 1), lat(y + 1)],
          [lon(x), lat(y + 1)], [lon(x), lat(y)]]],
      },
    })),
  };
}

function provinceFillColor() {
  const m = metric();
  const colors = ramp();
  const nodata = cssVar("--nodata");
  const expr = ["match", ["get", "code"]];
  for (const p of provinceList()) {
    const cls = classOf(m.get(p), state.breaks);
    expr.push(p.code, cls < 0 ? nodata : colors[cls]);
  }
  expr.push(nodata);
  return expr;
}

function cellFillColor() {
  const colors = ramp();
  const expr = ["step", ["get", "d"], colors[0]];
  CELL_BREAKS.forEach((b, i) => expr.push(b, colors[i + 1]));
  return expr;
}

const cellsEnabled = () => state.metricId === "down" && document.getElementById("cells-toggle").checked;
const cellsVisible = () => cellsEnabled() && state.map.getZoom() >= CELLS_FROM_ZOOM;

function provinceOpacity() {
  return cellsEnabled() ? ["interpolate", ["linear"], ["zoom"], 6.3, 0.9, 7.3, 0.12] : 0.9;
}

// Our layers go above every basemap fill and road but under the final run of label
// layers, so place names stay readable on top of the data.
function addOverlay(map) {
  const surface = cssVar("--surface");
  const ink = cssVar("--ink");
  const layers = map.getStyle().layers;
  let firstLabel = layers.length;
  while (firstLabel > 0 && layers[firstLabel - 1].type === "symbol") firstLabel--;
  const beforeId = layers[firstLabel]?.id;
  map.addSource("provinces", { type: "geojson", data: state.shapes, promoteId: "code" });
  map.addSource("cells", { type: "geojson", data: state.cellsGeo });
  map.addLayer({
    id: "province-fill",
    type: "fill",
    source: "provinces",
    paint: { "fill-color": provinceFillColor(), "fill-opacity": provinceOpacity() },
  }, beforeId);
  map.addLayer({
    id: "cells-fill",
    type: "fill",
    source: "cells",
    minzoom: 6,
    layout: { visibility: cellsEnabled() ? "visible" : "none" },
    paint: {
      "fill-color": cellFillColor(),
      "fill-outline-color": surface,
      "fill-opacity": ["interpolate", ["linear"], ["zoom"], 6.3, 0, 7.3, 0.88],
    },
  }, beforeId);
  map.addLayer({
    id: "province-line",
    type: "line",
    source: "provinces",
    paint: { "line-color": surface, "line-width": ["interpolate", ["linear"], ["zoom"], 5, 0.8, 9, 2] },
  }, beforeId);
  map.addLayer({
    id: "province-hover",
    type: "line",
    source: "provinces",
    paint: { "line-color": ink, "line-width": ["case", ["boolean", ["feature-state", "hover"], false], 1.5, 0] },
  }, beforeId);
  map.addLayer({
    id: "province-selected",
    type: "line",
    source: "provinces",
    paint: { "line-color": ink, "line-width": ["case", ["boolean", ["feature-state", "selected"], false], 2.5, 0] },
  }, beforeId);
}

function createMap(cells) {
  state.cellsGeo = cellsToGeoJSON(cells);
  const map = new maplibregl.Map({
    container: "map",
    style: BASEMAP_STYLES[currentTheme()],
    bounds: TURKEY_BOUNDS,
    fitBoundsOptions: { padding: 12 },
    minZoom: 3, // a phone-width map needs ~3.6 to fit the whole country
    maxZoom: 12,
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    attributionControl: { compact: true, customAttribution: "Speedtest® by Ookla® Open Data · BTK · geoBoundaries" },
    // The page keeps going below the map, so plain scrolling must scroll the page.
    cooperativeGestures: true,
    locale: {
      "NavigationControl.ZoomIn": "Yakınlaş",
      "NavigationControl.ZoomOut": "Uzaklaş",
      "AttributionControl.ToggleAttribution": "Kaynakları göster",
      "CooperativeGesturesHandler.WindowsHelpText": "Yakınlaşmak için Ctrl + kaydırma kullanın",
      "CooperativeGesturesHandler.MacHelpText": "Yakınlaşmak için ⌘ + kaydırma kullanın",
      "CooperativeGesturesHandler.MobileHelpText": "Haritayı iki parmakla kaydırın",
    },
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
  map.touchZoomRotate.disableRotation();
  // On phones the expanded attribution covers a third of the map; the ⓘ button and the
  // sources section below still credit every source.
  // MapLibre re-expands it on every resize, so collapse again unless the reader opened it.
  if (matchMedia("(max-width: 640px)").matches) {
    let openedByReader = false;
    const collapse = () => setTimeout(() => {
      if (!openedByReader) document.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
    }, 0);
    map.on("load", collapse);
    map.on("resize", collapse);
    map.getContainer().addEventListener("click", (e) => {
      if (e.target.closest(".maplibregl-ctrl-attrib-button")) openedByReader = true;
    });
  }

  // Fires on first load and again after every theme switch (setStyle drops our layers).
  map.on("style.load", () => {
    addOverlay(map);
    state.mapReady = true;
    state.hovered = null;
    if (state.selected) map.setFeatureState({ source: "provinces", id: state.selected }, { selected: true });
  });
  map.on("zoomend", renderLegend);
  // Only resize on a real size change: every resize event re-expands the attribution.
  const container = document.getElementById("map");
  new ResizeObserver(() => {
    const canvas = map.getCanvas();
    if (canvas.clientWidth !== container.clientWidth || canvas.clientHeight !== container.clientHeight) map.resize();
  }).observe(container);

  map.on("mousemove", (e) => {
    const layers = cellsVisible() ? ["cells-fill", "province-fill"] : ["province-fill"];
    const features = map.queryRenderedFeatures(e.point, { layers });
    const province = features.find((f) => f.layer.id === "province-fill");
    const cell = features.find((f) => f.layer.id === "cells-fill");
    setHover(province?.properties.code ?? null);
    map.getCanvas().style.cursor = province ? "pointer" : "";
    if (province) showTooltip(e.originalEvent, provinceTooltip(province.properties.code, cell?.properties));
    else hideTooltip();
  });
  map.getCanvas().addEventListener("mouseleave", () => {
    setHover(null);
    hideTooltip();
  });
  map.on("click", (e) => {
    const [feature] = map.queryRenderedFeatures(e.point, { layers: ["province-fill"] });
    selectProvince(feature ? feature.properties.code : null);
  });
  return map;
}

function setHover(code) {
  if (code === state.hovered) return;
  if (state.mapReady && state.hovered) {
    state.map.setFeatureState({ source: "provinces", id: state.hovered }, { hover: false });
  }
  state.hovered = code;
  if (state.mapReady && code) state.map.setFeatureState({ source: "provinces", id: code }, { hover: true });
  highlightScatter();
}

function refreshMapColors() {
  const map = state.map;
  if (!map || !state.mapReady) return;
  const surface = cssVar("--surface");
  const ink = cssVar("--ink");
  map.setPaintProperty("province-fill", "fill-color", provinceFillColor());
  map.setPaintProperty("province-fill", "fill-opacity", provinceOpacity());
  map.setPaintProperty("cells-fill", "fill-color", cellFillColor());
  map.setPaintProperty("cells-fill", "fill-outline-color", surface);
  map.setLayoutProperty("cells-fill", "visibility", cellsEnabled() ? "visible" : "none");
  map.setPaintProperty("province-line", "line-color", surface);
  map.setPaintProperty("province-hover", "line-color", ink);
  map.setPaintProperty("province-selected", "line-color", ink);
}

// ---------------------------------------------------------------------------
// Tooltip
// ---------------------------------------------------------------------------

const tooltip = document.getElementById("tooltip");

function provinceTooltip(code, cell) {
  const p = state.provinces[code];
  const m = metric();
  const frag = document.createDocumentFragment();
  if (cell) {
    frag.append(
      el("div", { class: "tt-value", text: `~${fmt(cell.d)} Mbps` }),
      el("div", { class: "tt-name", text: `${p.name} · bu hücre` }),
      el("div", { class: "tt-extra", text: `${fmt(cell.t)} ölçüm, ${state.meta.speed_period}` }),
    );
  } else {
    frag.append(
      el("div", { class: "tt-value", text: m.format(m.get(p)) }),
      el("div", { class: "tt-name", text: p.name }),
      el("div", { class: "tt-extra", text: `${m.title} · ${RELIABILITY[p.reliability].label.toLowerCase()}` }),
    );
  }
  return frag;
}

function showTooltip(event, content) {
  tooltip.replaceChildren(content);
  tooltip.hidden = false;
  const pad = 14;
  const { innerWidth: vw, innerHeight: vh } = window;
  const rect = tooltip.getBoundingClientRect();
  let x = event.clientX + pad;
  let y = event.clientY + pad;
  if (x + rect.width > vw - 8) x = event.clientX - rect.width - pad;
  if (y + rect.height > vh - 8) y = event.clientY - rect.height - pad;
  tooltip.style.left = `${Math.max(8, x)}px`;
  tooltip.style.top = `${Math.max(8, y)}px`;
}

function hideTooltip() {
  tooltip.hidden = true;
}

// ---------------------------------------------------------------------------
// Legend, metric switch, KPIs
// ---------------------------------------------------------------------------

function renderLegend() {
  const legend = document.getElementById("legend");
  const items = [];
  let title;
  if (state.map && cellsVisible()) {
    title = "Hücre ortalaması, Mbps (~2,4 km'lik kareler, son dört çeyrek)";
    const labels = [`< ${CELL_BREAKS[0]}`];
    for (let i = 0; i < CELL_BREAKS.length - 1; i++) labels.push(`${CELL_BREAKS[i]}–${CELL_BREAKS[i + 1]}`);
    labels.push(`≥ ${CELL_BREAKS[CELL_BREAKS.length - 1]}`);
    labels.forEach((label, i) => items.push([`var(--seq-${i + 1})`, label]));
  } else {
    const m = metric();
    title = `${m.title} (${m.note(state.meta)}). Her renkte ~16 il.`;
    const { breaks, min, max } = state.classInfo;
    const edges = [min, ...breaks, max];
    for (let i = 0; i < 5; i++) items.push([`var(--seq-${i + 1})`, `${m.tick(edges[i])}–${m.tick(edges[i + 1])}`]);
  }
  const scale = el("div", { class: "legend-scale" });
  for (const [color, label] of items) {
    scale.append(el("div", { class: "legend-item" },
      el("div", { class: "legend-swatch", style: `background:${color}` }),
      el("div", { class: "legend-label", text: label })));
  }
  legend.replaceChildren(el("div", { class: "legend-title", text: title }), scale);
}

function renderMetricSwitch() {
  const group = document.getElementById("metric-switch");
  const buttons = METRICS.map((m) => {
    const button = el("button", { type: "button", role: "radio", "data-metric": m.id, text: m.label });
    button.addEventListener("click", () => setMetric(m.id));
    return button;
  });
  group.replaceChildren(...buttons);
  group.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const index = METRICS.findIndex((m) => m.id === state.metricId);
    const next = (index + (e.key === "ArrowRight" ? 1 : -1) + METRICS.length) % METRICS.length;
    setMetric(METRICS[next].id);
    group.querySelector(`[data-metric="${METRICS[next].id}"]`).focus();
  });
}

function setMetric(id) {
  state.metricId = id;
  state.classInfo = quantileBreaks(provinceList().map((p) => metric().get(p)));
  state.breaks = state.classInfo.breaks;
  for (const button of document.querySelectorAll("#metric-switch button")) {
    const active = button.dataset.metric === id;
    button.setAttribute("aria-checked", String(active));
    button.tabIndex = active ? 0 : -1;
  }
  document.getElementById("cells-toggle-wrap").hidden = id !== "down";
  state.sort = { key: id, dir: -1 };
  refreshMapColors();
  renderLegend();
  renderTable();
  renderDetail();
}

function renderKpis() {
  const { national: n, meta } = state;
  const set = (id, text) => { document.getElementById(id).textContent = text; };
  set("kpi-down", `${fmt(n.speed.down)} Mbps`);
  set("kpi-down-note", `${meta.speed_period} · test ağırlıklı ortalama`);
  set("kpi-growth", `${fmt(n.growth, 1)} kat`);
  set("kpi-growth-note", `2019 ortalaması ${fmt(n.speed_2019.down)} Mbps`);
  set("kpi-subs", fmt(n.fixed_per_100, 1));
  set("kpi-subs-note", `${fmt(n.fixed_subs)} sabit abonelik · BTK ${meta.btk_year}`);
  set("kpi-fiber", pct(n.fiber_share));
  set("kpi-fiber-note", `xDSL ${pct(n.xdsl_share)} · kablo ${pct(n.cable_share)}`);
}

function fillMethodText() {
  const { meta } = state;
  const values = {
    speed_period: meta.speed_period,
    baseline_period: meta.baseline_period,
    btk_year: String(meta.btk_year),
    generated: dateFormat.format(new Date(meta.generated)),
    floor_yuksek: fmt(meta.reliability_floors.yuksek),
    floor_orta: fmt(meta.reliability_floors.orta),
    min_cell_tests: fmt(meta.min_cell_tests),
  };
  for (const node of document.querySelectorAll("[data-fill]")) node.textContent = values[node.dataset.fill] ?? "";
}

// ---------------------------------------------------------------------------
// Detail panel
// ---------------------------------------------------------------------------

function statRow(label, value, ref) {
  const v = el("span", { class: "v", text: value });
  if (ref) v.append(el("span", { class: "ref", text: ref }));
  return el("div", { class: "stat-row" }, el("span", { class: "k", text: label }), v);
}

function sparkline(label, values, format) {
  const width = 280;
  const height = 40;
  const padX = 4;
  const padY = 6;
  const plotRight = width - 44;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const x = (i) => padX + (i / (values.length - 1)) * (plotRight - padX);
  const y = (v) => (max === min ? height / 2 : height - padY - ((v - min) / (max - min)) * (height - 2 * padY));
  const chart = svg("svg", { viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": `${label}: ${values.map(format).join(", ")}` });
  chart.append(svg("path", { class: "line", d: values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("") }));
  const last = values.length - 1;
  chart.append(svg("circle", { class: "end", cx: x(last), cy: y(values[last]), r: 4 }));
  chart.append(svg("text", { x: x(last) + 8, y: y(values[last]) + 4 }, format(values[last])));
  const years = state.national.trend.years;
  return el("div", { class: "spark" },
    el("div", { class: "spark-label" },
      el("span", { text: label }),
      el("span", { class: "muted", text: `${years[0]}: ${format(values[0])}` })),
    chart);
}

function renderDetail() {
  const panel = document.getElementById("detail");
  const { meta, national: n } = state;
  const p = state.selected ? state.provinces[state.selected] : null;
  const subject = p ?? n;
  const speed = subject.speed;
  const base = subject.speed_2019;
  const nodes = [];

  if (p) {
    nodes.push(el("div", { class: "detail-head" },
      el("div", {},
        el("h2", { text: p.name }),
        el("div", { class: "detail-sub", text: `Nüfus ${fmt(p.population)} · plaka ${p.code}` })),
      reliabilityBadge(p.reliability)));
    const m = metric();
    nodes.push(el("div", {
      class: "rank-note",
      text: `${m.title}: ${m.format(m.get(p))}. 81 il arasında ${rankOf(p.code)}. sırada.`,
    }));
  } else {
    nodes.push(el("div", { class: "detail-head" },
      el("div", {},
        el("h2", { text: "Türkiye geneli" }),
        el("div", { class: "detail-sub", text: `Nüfus ${fmt(n.population)}` }))));
    nodes.push(el("p", { class: "hint", text: "Ayrıntı için haritada bir ile tıklayın ya da aşağıdaki tablodan seçin." }));
  }

  const ref = (value, format) => (p && value != null ? `Türkiye: ${format(value)}` : null);
  const speedSection = el("div", { class: "detail-section" }, el("h3", { text: `Hız · Ookla, ${meta.speed_period}` }));
  if (speed) {
    speedSection.append(
      statRow("Ortalama indirme", `${fmt(speed.down)} Mbps`, ref(n.speed.down, (v) => `${fmt(v)} Mbps`)),
      statRow("Ortalama yükleme", `${fmt(speed.up)} Mbps`),
      statRow("Gecikme (ping)", `${fmt(speed.latency)} ms`),
      statRow("100 Mbps üstü karelerdeki ölçüm payı", pct(speed.share_100)),
      statRow("2019 ortalaması", base ? `${fmt(base.down)} Mbps` : "–",
        subject.growth ? `${fmt(subject.growth, 1)} kat arttı` : null),
      statRow("Ölçüm sayısı", fmt(speed.tests), p ? `1000 kişiye ${fmt(p.tests_per_1000, 1)}` : null),
    );
  } else {
    speedSection.append(el("p", { class: "hint", text: "Bu il için yeterli ölçüm yok." }));
  }
  nodes.push(speedSection);

  const accessSection = el("div", { class: "detail-section" }, el("h3", { text: `Erişim · BTK, ${meta.btk_year}` }));
  accessSection.append(
    statRow("100 kişiye sabit abonelik", fmt(subject.fixed_per_100, 1), ref(n.fixed_per_100, (v) => fmt(v, 1))),
    statRow("Fiber payı", pct(subject.fiber_share), ref(n.fiber_share, pct)),
    statRow("xDSL (bakır) payı", pct(subject.xdsl_share)),
  );
  if (subject.cable_share > 0) accessSection.append(statRow("Kablo payı", pct(subject.cable_share)));
  accessSection.append(statRow("1000 kişiye fiber kablo", `${fmt(subject.fiber_km_per_1000, 1)} km`));
  if (subject.coverage_45g != null) accessSection.append(statRow("4.5G nüfus kapsaması", pct(subject.coverage_45g / 100, 1)));
  accessSection.append(
    sparkline("100 kişiye sabit abonelik", subject.trend.fixed_per_100, (v) => fmt(v, 1)),
    sparkline("Fiber payı", subject.trend.fiber_share, (v) => pct(v)),
  );
  nodes.push(accessSection);
  panel.replaceChildren(...nodes);
}

// ---------------------------------------------------------------------------
// Scatter: speed vs access
// ---------------------------------------------------------------------------

function niceStep(max, count) {
  const raw = max / count;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((f) => f * power).find((s) => s >= raw);
  return step;
}

function renderScatter() {
  const box = document.getElementById("scatter");
  const width = Math.max(300, box.clientWidth);
  const height = width < 560 ? 300 : 380;
  const margin = { top: 28, right: 24, bottom: 44, left: 48 };
  const list = provinceList().filter((p) => p.speed);
  const n = state.national;

  const xStep = niceStep(Math.max(...list.map((p) => p.fixed_per_100)), 6);
  const yStep = niceStep(Math.max(...list.map((p) => p.speed.down)), 5);
  const xMax = Math.ceil(Math.max(...list.map((p) => p.fixed_per_100)) / xStep) * xStep;
  const yMax = Math.ceil(Math.max(...list.map((p) => p.speed.down)) / yStep) * yStep;
  const x = (v) => margin.left + (v / xMax) * (width - margin.left - margin.right);
  const y = (v) => height - margin.bottom - (v / yMax) * (height - margin.top - margin.bottom);

  const chart = svg("svg", {
    viewBox: `0 0 ${width} ${height}`,
    width,
    height,
    role: "img",
    "aria-label": "İllerin sabit abonelik oranı ile ortalama indirme hızı. Değerler aşağıdaki tabloda.",
  });

  const grid = svg("g", { class: "grid" });
  const ticks = svg("g", { class: "tick" });
  for (let v = 0; v <= yMax + 1e-9; v += yStep) {
    grid.append(svg("line", { x1: margin.left, x2: width - margin.right, y1: y(v), y2: y(v) }));
    ticks.append(svg("text", { x: margin.left - 8, y: y(v) + 4, "text-anchor": "end" }, fmt(v)));
  }
  for (let v = 0; v <= xMax + 1e-9; v += xStep) {
    ticks.append(svg("text", { x: x(v), y: height - margin.bottom + 18, "text-anchor": "middle" }, fmt(v)));
  }
  const axis = svg("g", { class: "axis" });
  axis.append(svg("line", { x1: margin.left, x2: width - margin.right, y1: y(0), y2: y(0) }));
  chart.append(grid, axis, ticks);
  chart.append(svg("text", { class: "axis-title", x: margin.left, y: 14 }, "Ortalama indirme, Mbps"));
  chart.append(svg("text", { class: "axis-title", x: width - margin.right, y: height - 6, "text-anchor": "end" },
    `100 kişiye sabit abonelik (BTK, ${state.meta.btk_year})`));

  const refs = svg("g", { class: "ref" });
  refs.append(svg("line", { x1: x(n.fixed_per_100), x2: x(n.fixed_per_100), y1: margin.top, y2: y(0) }));
  refs.append(svg("line", { x1: margin.left, x2: width - margin.right, y1: y(n.speed.down), y2: y(n.speed.down) }));
  refs.append(svg("text", { x: x(n.fixed_per_100) + 6, y: margin.top + 10 }, `Türkiye: ${fmt(n.fixed_per_100, 1)}`));
  refs.append(svg("text", { x: width - margin.right, y: y(n.speed.down) - 6, "text-anchor": "end" },
    `Türkiye: ${fmt(n.speed.down)} Mbps`));
  chart.append(refs);

  const labelled = new Set([state.selected]);
  const by = (f) => [...list].sort((a, b) => f(a) - f(b));
  const bySpeed = by((p) => p.speed.down);
  const byAccess = by((p) => p.fixed_per_100);
  [bySpeed[0], bySpeed[bySpeed.length - 1], byAccess[0], byAccess[byAccess.length - 1]].forEach((p) => labelled.add(p.code));

  const dots = svg("g");
  const labels = svg("g");
  const hits = svg("g");
  for (const p of list) {
    const cx = x(p.fixed_per_100);
    const cy = y(p.speed.down);
    const selected = p.code === state.selected;
    dots.append(svg("circle", { class: `dot${selected ? " selected" : ""}`, cx, cy, r: selected ? 6 : 4, "data-code": p.code }));
    if (labelled.has(p.code)) {
      const right = cx < width - 110;
      labels.append(svg("text", {
        class: `label${selected ? " selected" : ""}`,
        x: right ? cx + 9 : cx - 9,
        y: cy + 4,
        "text-anchor": right ? "start" : "end",
      }, p.name));
    }
    const hit = svg("circle", { class: "hit", cx, cy, r: 12 });
    hit.addEventListener("pointerenter", (e) => {
      setHover(p.code);
      const frag = document.createDocumentFragment();
      frag.append(
        el("div", { class: "tt-value", text: `${fmt(p.speed.down)} Mbps · ${fmt(p.fixed_per_100, 1)} abonelik` }),
        el("div", { class: "tt-name", text: p.name }),
        el("div", { class: "tt-extra", text: "ortalama indirme · 100 kişiye sabit abonelik" }));
      showTooltip(e, frag);
    });
    hit.addEventListener("pointerleave", () => {
      setHover(null);
      hideTooltip();
    });
    hit.addEventListener("click", () => selectProvince(p.code, { fly: true }));
    hits.append(hit);
  }
  chart.append(dots, labels, hits);
  box.replaceChildren(chart);
}

function highlightScatter() {
  for (const dot of document.querySelectorAll("#scatter .dot")) {
    dot.classList.toggle("hovered", dot.dataset.code === state.hovered);
  }
}

// ---------------------------------------------------------------------------
// Table (the accessible twin of the map)
// ---------------------------------------------------------------------------

const COLUMNS = [
  { key: "name", label: "İl", get: (p) => p.name, cell: (p) => p.name, text: true },
  { key: "down", label: "Hız (Mbps)", get: (p) => p.speed?.down, cell: (p) => fmt(p.speed?.down) },
  { key: "growth", label: "2019'a göre", get: (p) => p.growth, cell: (p) => (p.growth == null ? "–" : `${fmt(p.growth, 1)} kat`) },
  { key: "fixed_per_100", label: "Abonelik / 100 kişi", get: (p) => p.fixed_per_100, cell: (p) => fmt(p.fixed_per_100, 1) },
  { key: "fiber_share", label: "Fiber payı", get: (p) => p.fiber_share, cell: (p) => pct(p.fiber_share) },
  { key: "tests_per_1000", label: "Ölçüm / 1000 kişi", get: (p) => p.tests_per_1000, cell: (p) => fmt(p.tests_per_1000, 1) },
  { key: "reliability", label: "Güvenilirlik", get: (p) => RELIABILITY[p.reliability]?.rank, cell: (p) => reliabilityBadge(p.reliability) },
];

function renderTable() {
  const table = document.getElementById("table");
  const { key, dir } = state.sort;
  const column = COLUMNS.find((c) => c.key === key) ?? COLUMNS[1];

  const headRow = el("tr");
  for (const c of COLUMNS) {
    const th = el("th", { scope: "col" });
    if (c.key === key) th.setAttribute("aria-sort", dir > 0 ? "ascending" : "descending");
    const button = el("button", { type: "button", text: c.label });
    button.addEventListener("click", () => {
      state.sort = state.sort.key === c.key ? { key: c.key, dir: -state.sort.dir } : { key: c.key, dir: c.text ? 1 : -1 };
      renderTable();
    });
    th.append(button);
    headRow.append(th);
  }
  table.tHead.replaceChildren(headRow);

  const rows = provinceList().sort((a, b) => {
    const va = column.get(a);
    const vb = column.get(b);
    if (va == null) return 1;
    if (vb == null) return -1;
    return column.text ? dir * String(va).localeCompare(String(vb), "tr") : dir * (va - vb);
  });
  const body = rows.map((p) => {
    const tr = el("tr", { tabindex: "0", "data-code": p.code, "aria-selected": String(p.code === state.selected) });
    for (const c of COLUMNS) tr.append(el("td", {}, c.cell(p)));
    const choose = () => {
      selectProvince(p.code, { fly: true });
      const mapRect = document.getElementById("map").getBoundingClientRect();
      if (mapRect.bottom < 0 || mapRect.top > window.innerHeight) {
        document.querySelector(".map-card").scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
      }
    };
    tr.addEventListener("click", choose);
    tr.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        choose();
      }
    });
    return tr;
  });
  table.tBodies[0].replaceChildren(...body);
}

function updateTableSelection() {
  for (const tr of document.querySelectorAll("#table tbody tr")) {
    tr.setAttribute("aria-selected", String(tr.dataset.code === state.selected));
  }
}

// ---------------------------------------------------------------------------
// Selection and theme
// ---------------------------------------------------------------------------

function selectProvince(code, { fly = false } = {}) {
  const map = state.map;
  if (state.mapReady && state.selected) map.setFeatureState({ source: "provinces", id: state.selected }, { selected: false });
  state.selected = code;
  if (code && state.mapReady) {
    map.setFeatureState({ source: "provinces", id: code }, { selected: true });
    if (fly) map.fitBounds(state.bboxes[code], { padding: 48, maxZoom: 8, duration: reducedMotion ? 0 : 800 });
  }
  renderDetail();
  updateTableSelection();
  renderScatter();
}

function onThemeChange() {
  const map = state.map;
  if (!map) return;
  state.mapReady = false;
  map.setStyle(BASEMAP_STYLES[currentTheme()], { diff: false });
}

function setupTheme() {
  document.getElementById("theme-toggle").addEventListener("click", () => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch (e) {
      // Storage can be unavailable (private mode); the toggle still works for this visit.
    }
    onThemeChange();
  });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (!root.dataset.theme) onThemeChange();
  });
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

function bboxOf(geometry) {
  let [w, s, e, n] = [180, 90, -180, -90];
  const visit = (c) => {
    if (typeof c[0] === "number") {
      w = Math.min(w, c[0]);
      e = Math.max(e, c[0]);
      s = Math.min(s, c[1]);
      n = Math.max(n, c[1]);
    } else c.forEach(visit);
  };
  visit(geometry.coordinates);
  return [[w, s], [e, n]];
}

async function loadJSON(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return response.json();
}

async function main() {
  setupTheme();
  let data;
  let shapes;
  let cells;
  try {
    [data, shapes, cells] = await Promise.all([
      loadJSON("data/iller.json"),
      loadJSON("data/iller.geojson"),
      loadJSON("data/hucreler.json"),
    ]);
  } catch (error) {
    document.getElementById("map").replaceChildren(el("p", {
      class: "hint",
      style: "padding:24px",
      text: "Veri yüklenemedi. Sayfayı bir yerel sunucuyla açın: python3 -m http.server -d web",
    }));
    console.error(error);
    return;
  }

  state.meta = data.meta;
  state.national = data.national;
  state.provinces = data.provinces;
  state.shapes = shapes;
  for (const f of shapes.features) state.bboxes[f.properties.code] = bboxOf(f.geometry);
  state.classInfo = quantileBreaks(provinceList().map((p) => metric().get(p)));
  state.breaks = state.classInfo.breaks;

  renderKpis();
  fillMethodText();
  renderMetricSwitch();
  state.map = createMap(cells);
  document.getElementById("cells-toggle").addEventListener("change", () => {
    refreshMapColors();
    renderLegend();
  });
  setMetric(state.metricId);
  renderScatter();
  new ResizeObserver(() => renderScatter()).observe(document.getElementById("scatter"));
}

main();
