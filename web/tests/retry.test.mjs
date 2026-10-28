import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import ts from "typescript";

const { outputText } = ts.transpileModule(readFileSync(new URL("../lib/retry.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
const retryModule = { exports: {} };
new Function("module", "exports", outputText)(retryModule, retryModule.exports);
const { RETRY_DELAY, retryOnce } = retryModule.exports;

/** An attempt that plays the given outcomes in turn: values resolve, errors reject. */
function attempts(...outcomes) {
  const calls = { count: 0 };
  const attempt = async () => {
    const outcome = outcomes[calls.count++];
    if (outcome instanceof Error) throw outcome;
    return outcome;
  };
  return { attempt, calls };
}

test("a first success is returned without a reset", async () => {
  const { attempt, calls } = attempts("tile");
  let resets = 0;
  assert.equal(await retryOnce(attempt, () => resets++), "tile");
  assert.equal(calls.count, 1);
  assert.equal(resets, 0);
});

test("one failure resets, pauses and tries again", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { attempt, calls } = attempts(new Error("whole file instead of a range"), "tile");
  let resets = 0;
  const result = retryOnce(attempt, () => resets++);
  await setImmediate();
  assert.equal(resets, 1);
  t.mock.timers.tick(RETRY_DELAY - 1);
  await setImmediate();
  assert.equal(calls.count, 1, "no second try before the pause ends");
  t.mock.timers.tick(1);
  assert.equal(await result, "tile");
  assert.equal(calls.count, 2);
});

test("two failures reset twice and fail with the second error", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const second = new Error("still failing");
  const { attempt, calls } = attempts(new Error("first"), second);
  let resets = 0;
  const result = retryOnce(attempt, () => resets++);
  await setImmediate();
  t.mock.timers.tick(RETRY_DELAY);
  await assert.rejects(result, second);
  assert.equal(calls.count, 2);
  assert.equal(resets, 2);
});
