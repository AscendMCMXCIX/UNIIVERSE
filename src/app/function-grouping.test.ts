import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/*
  Every page shares one server function on Vercel (docs/PERFORMANCE.md, "The start page's two
  functions"). Vercel groups pages into functions by their settings, so a page or layout with a
  maxDuration of its own splits its pages into a separate function. On 4 Nov 2026 "/" (the
  installed app's start page, which redirects to the member's start page) and the member pages were
  two functions: opening the app started both, one after the other, often both cold.

  Route handlers (route.ts) are grouped apart from pages anyway, so they may set their own.
*/

const APP = join(process.cwd(), "src/app");
const MAX_DURATION = /export\s+const\s+maxDuration\s*=\s*(\d+)/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /^(page|layout)\.tsx$/.test(name) ? [path] : [];
  });
}

describe("pages share one server function", () => {
  it("the root layout sets the limit, and no page or layout below it sets another", () => {
    const root = MAX_DURATION.exec(readFileSync(join(APP, "layout.tsx"), "utf8"));
    expect(root, "src/app/layout.tsx exports maxDuration").not.toBeNull();
    const limit = Number(root![1]);
    const different = files(APP)
      .map((path) => ({ file: relative(APP, path), value: MAX_DURATION.exec(readFileSync(path, "utf8"))?.[1] }))
      .filter(({ value }) => value !== undefined && Number(value) !== limit)
      .map(({ file, value }) => `${file}: ${value}`);
    expect(different, `every page and layout uses the root layout's ${limit} s`).toEqual([]);
  });
});
