import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../lib/viewport.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
const context = vm.createContext({ exports: {}, window: undefined });
vm.runInContext(outputText, context);
const { hasPhoneSheet } = context.exports;

test("the sheet follows the CSS viewport breakpoint, including 640 px", () => {
  const previous = context.window;
  try {
    for (const [width, expected] of [[375, true], [639, true], [640, true], [641, false], [900, false], [1440, false]]) {
      context.window = {
        matchMedia(query) {
          assert.equal(query, "(max-width: 640px)");
          return { matches: width <= 640 };
        },
      };
      assert.equal(hasPhoneSheet(), expected, `viewport ${width} px`);
    }
  } finally {
    context.window = previous;
  }
});

test("the stylesheet uses the same inclusive phone breakpoint", () => {
  const css = readFileSync(new URL("../components/RegionPanel.module.css", import.meta.url), "utf8");
  assert.match(css, /@media\s*\(max-width:\s*640px\)/);
});
