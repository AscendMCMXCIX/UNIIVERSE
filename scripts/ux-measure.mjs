#!/usr/bin/env node
/*
  The page budgets' full matrix (docs/MOBILE.md, "Page budgets"): every page × every setup × four
  text sizes, against a running demo server, locally (no CI time, no deploy). About 600 page loads.

    node scripts/ux-measure.mjs http://127.0.0.1:3900 [--pages team,players] [--setups i15,se1] [--text 100,150] [--json out.json] [--ceilings]

  Prints one line per page and setup: height in screens, the frame's share at rest and after a
  100px scroll, sideways overflow, and touch targets under 44px on the first screen; marks figures
  over their ceiling in e2e/page-budgets.json. --ceilings prints a new ceilings file from the
  figures (each plus 2%), for a stage to copy the pages it changed into e2e/page-budgets.json.
  Figures only: no names, no ids.
*/
import { chromium } from "@playwright/test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { PAGES, SETUPS, TEXT_SIZES, applySetup, contextOptions, findPlayerId, openAndMeasure, overBudget } from "./page-budgets.mjs";

const args = process.argv.slice(2);
const base = (args.find((a) => !a.startsWith("--") && /^https?:/.test(a)) ?? "http://127.0.0.1:3900").replace(/\/$/, "");
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const pages = opt("pages")?.split(",") ?? Object.keys(PAGES);
const setups = opt("setups")?.split(",") ?? Object.keys(SETUPS);
const texts = opt("text")?.split(",").map(Number) ?? TEXT_SIZES;
const ceilings = JSON.parse(readFileSync(new URL("../e2e/page-budgets.json", import.meta.url), "utf8"));
const executablePath = process.env.PW_CHROMIUM_PATH ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);

const browser = await chromium.launch({ executablePath });
const results = {};
let playerId = null;
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  playerId = await findPlayerId(page, base);
  await ctx.close();
}
let over = 0;
for (const setup of setups) {
  for (const text of texts) {
    for (const admin of [false, true]) {
      const keys = pages.filter((k) => !!PAGES[k]?.admin === admin);
      if (!keys.length) continue;
      const ctx = await browser.newContext(contextOptions(setup));
      await ctx.addCookies([{ name: "uniiverse_view", value: admin ? "admin" : "player", url: base }]);
      const page = await ctx.newPage();
      await applySetup(page, setup, text);
      for (const key of keys) {
        const id = `${key}@${setup}-${text}`;
        try {
          const f = await openAndMeasure(page, base, key, playerId);
          results[id] = f;
          const bad = overBudget(f, ceilings.pages?.[id]);
          if (bad.length) over++;
          console.log(`${id.padEnd(28)} screens ${String(f.screens).padStart(5)}  frame ${f.frame.toFixed(2)} → ${f.frameScrolled.toFixed(2)}  overflow ${f.overflow}  small ${f.small}${bad.length ? `  OVER: ${bad.join(", ")}` : ""}`);
        } catch (e) {
          console.log(`${id.padEnd(28)} failed: ${String(e?.message ?? e).split("\n")[0]}`);
        }
      }
      await ctx.close();
    }
  }
}
await browser.close();
const json = opt("json");
if (json) writeFileSync(json, JSON.stringify(results, null, 1));
if (args.includes("--ceilings")) {
  const up = (v) => Math.round(v * 1.02 * 100) / 100;
  const next = Object.fromEntries(Object.entries(results).map(([k, f]) => [k, { screens: up(f.screens), frame: up(f.frame), frameScrolled: up(f.frameScrolled), small: f.small }]));
  console.log(JSON.stringify(next, null, 1));
}
console.log(`${Object.keys(results).length} measured, ${over} over a ceiling`);
