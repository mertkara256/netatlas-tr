// The tests run lib/*.ts as written: each module is transpiled in memory and run as CommonJS.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
const lib = new URL("../lib/", import.meta.url);

/** lib/<name>.ts with its imports, loaded afresh on every call. An import named in `stubs` ("./nearby",
 *  "pbf") gets the stub; other "./" imports load the real module, once per call; the rest come from
 *  node_modules. `globals` are variables the code sees, such as `window`. */
export function loadLib(name, { stubs = {}, globals = {} } = {}) {
  const modules = new Map();
  const load = (name) => {
    if (modules.has(name)) return modules.get(name).exports;
    const compiled = { exports: {} };
    modules.set(name, compiled);
    const { outputText } = ts.transpileModule(readFileSync(new URL(`${name}.ts`, lib), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    });
    const localRequire = (specifier) => Object.hasOwn(stubs, specifier) ? stubs[specifier]
      : specifier.startsWith("./") ? load(specifier.slice(2)) : require(specifier);
    new Function("require", "module", "exports", ...Object.keys(globals), outputText)(
      localRequire, compiled, compiled.exports, ...Object.values(globals),
    );
    return compiled.exports;
  };
  return load(name);
}
