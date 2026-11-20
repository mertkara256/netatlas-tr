import { HIGH_TESTS } from "./metrics";

/** Compares rows of a table of areas by `value`, in `dir` (1 ascending, -1 descending). Rows with no
 *  value go last in either direction. With `reliableFirst`, values from fewer than HIGH_TESTS tests
 *  come after the reliable ones: a few tests make the extremes, which would otherwise top the list.
 *  Ties keep their order, as Array.prototype.sort is stable. */
export function compareAreas<T>({ value, tests, dir, reliableFirst }: {
  value: (row: T) => number | string | undefined;
  tests: (row: T) => number | undefined;
  dir: 1 | -1;
  reliableFirst: boolean;
}): (a: T, b: T) => number {
  const reliable = (row: T) => ((tests(row) ?? 0) >= HIGH_TESTS ? 0 : 1);
  return (a, b) => {
    const x = value(a);
    const y = value(b);
    if (x == null || y == null) return Number(x == null) - Number(y == null);
    if (reliableFirst && reliable(a) !== reliable(b)) return reliable(a) - reliable(b);
    return dir * (typeof x === "string" ? x.localeCompare(y as string, "tr") : x - (y as number));
  };
}
