import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { WINDOW_POSTURE_QUERY } from "./posture";
import { PHONE_FOLDED, PHONE_FOLD_ONLY } from "./phone-fold-classes";

const css = fs.readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");
const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("the phone Fold's posture", () => {
  it("is posture.ts's window posture: under 48rem wide (max-md) or 30rem tall (short)", () => {
    expect(WINDOW_POSTURE_QUERY).toBe("(max-width: 47.99rem), (max-height: 30rem)");
    // Tailwind's md is 48rem; the short variant is 480px (30rem) tall or less.
    expect(css).toMatch(/@custom-variant short \(@media \(max-height: 480px\)\);/);
    expect(PHONE_FOLDED.split(" ").map((c) => c.split(":")[0]).sort()).toEqual(["max-md", "short"]);
    expect(PHONE_FOLD_ONLY.split(" ")).toEqual(["hidden", "max-md:inline-flex", "short:inline-flex"]);
  });

  it("folds only inside a closed group, so tablet and desktop always show everything", () => {
    for (const c of PHONE_FOLDED.split(" ")) expect(c).toMatch(/^(max-md|short):group-data-\[fold=closed\]\/fold:hidden$/);
  });

  it("is read from a module without \"use client\", so server components get the strings", () => {
    expect(read("src/components/ui/phone-fold-classes.ts")).not.toMatch(/^["']use client["']/m);
    // Ranked progress is a server component: it takes the classes from there, never from the client module.
    const ranked = read("src/components/players/ranked-progress.tsx");
    expect(ranked).toMatch(/import \{ PHONE_FOLDED \} from "@\/components\/ui\/phone-fold-classes"/);
    expect(ranked).not.toMatch(/PHONE_FOLDED[^\n]*from "@\/components\/ui\/phone-fold"/);
  });
});
