import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { loadLib } from "./load.mjs";

// The window the module sees; each case gives it the matchMedia of one viewport width.
const window = {};
const { hasPhoneSheet } = loadLib("viewport", { globals: { window } });

test("the sheet follows the CSS viewport breakpoint, including 640 px", () => {
  for (const [width, expected] of [[375, true], [639, true], [640, true], [641, false], [900, false], [1440, false]]) {
    window.matchMedia = (query) => {
      assert.equal(query, "(max-width: 640px)");
      return { matches: width <= 640 };
    };
    assert.equal(hasPhoneSheet(), expected, `viewport ${width} px`);
  }
});

test("the stylesheet uses the same inclusive phone breakpoint", () => {
  const css = readFileSync(new URL("../components/RegionPanel.module.css", import.meta.url), "utf8");
  assert.match(css, /@media\s*\(max-width:\s*640px\)/);
});
