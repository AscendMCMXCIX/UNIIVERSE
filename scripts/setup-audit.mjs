#!/usr/bin/env node
/*
  The first-run page's own audit (docs/RESPONSIVE.md, "The first-run page"): the real /setup form,
  which the demo never shows (it always has an owner), at three phones and three desktops, at 100,
  150 and 200% text. Against a server with no owner, required accounts and a setup key, as a fresh
  production deployment is (no change to the app):

    createdb uniiverse_setup   (an empty database: the app applies its migrations on start)
    UNIIVERSE_REQUIRE_AUTH=true UNIIVERSE_SEED_DEMO=false UNIIVERSE_AUTH_SECRET=<any> \
      UNIIVERSE_ACCESS_PASSWORD=<any> DATABASE_URL=postgres://…/uniiverse_setup pnpm start -p 3951
    node scripts/setup-audit.mjs http://127.0.0.1:3951

  Per size and text size: axe (WCAG 2.1 A/AA and 2.2's target size), touch targets under 44px on a
  phone, sideways scroll, words broken across lines, and the one h1 in the signed-out pages' title
  style. Prints figures only; exits 1 on any finding.
*/
import { chromium } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";
import { existsSync } from "node:fs";

const base = (process.argv[2] ?? "http://127.0.0.1:3951").replace(/\/$/, "");
const executablePath = process.env.PW_CHROMIUM_PATH ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
const SIZES = { i15: [393, 852, true], se3: [375, 667, true], se1: [320, 568, true], d1280: [1280, 800, false], d1440: [1440, 900, false], d1920: [1920, 1080, false] };
const TEXT = [100, 150, 200];
const PAGE_TITLE = "text-2xl font-semibold tracking-tight text-fg";

const browser = await chromium.launch({ executablePath });
let findings = 0;
for (const [name, [width, height, touch]] of Object.entries(SIZES)) {
  for (const text of TEXT) {
    const ctx = await browser.newContext({ viewport: { width, height }, isMobile: touch, hasTouch: touch, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Page.setFontSizes", { fontSizes: { standard: Math.round((16 * text) / 100), fixed: Math.round((13 * text) / 100) } });
    const res = await page.goto(`${base}/setup`, { waitUntil: "networkidle" });
    const m = await page.evaluate(({ touch, PAGE_TITLE }) => {
      const h1s = [...document.querySelectorAll("h1")];
      const visible = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== "hidden"; };
      const small = touch ? [...document.querySelectorAll("a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=radio], [role=checkbox], [role=tab]")].filter(visible).filter((e) => { const r = e.getBoundingClientRect(); return r.width < 44 - 0.5 || r.height < 44 - 0.5; }).map((e) => `${e.tagName.toLowerCase()}${e.getAttribute("name") ? `[name=${e.getAttribute("name")}]` : ""} ${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`) : [];
      // A word broken across lines: one word whose range has boxes on two lines.
      const broken = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!n.parentElement || !visible(n.parentElement) || n.parentElement.closest("pre, script, style")) continue;
        const t = n.textContent ?? "";
        for (const match of t.matchAll(/\S+/g)) {
          const r = document.createRange();
          r.setStart(n, match.index);
          r.setEnd(n, match.index + match[0].length);
          const tops = new Set([...r.getClientRects()].filter((b) => b.width > 0).map((b) => Math.round(b.top)));
          if (tops.size > 1) broken.push(match[0]);
        }
      }
      return {
        h1: h1s.length,
        h1Style: h1s.length === 1 && PAGE_TITLE.split(" ").every((c) => h1s[0].classList.contains(c)),
        h1Text: h1s[0]?.textContent ?? "",
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        screens: Math.round((document.documentElement.scrollHeight / innerHeight) * 100) / 100,
        small,
        broken,
      };
    }, { touch, PAGE_TITLE });
    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    const bad = [];
    if (res?.status() !== 200) bad.push(`status ${res?.status()}`);
    if (m.h1Text !== "Create the owner account") bad.push(`not the form: "${m.h1Text}"`);
    if (m.h1 !== 1 || !m.h1Style) bad.push(`h1 ${m.h1}${m.h1Style ? "" : " not PAGE_TITLE"}`);
    if (m.overflow > 0) bad.push(`sideways ${m.overflow}px`);
    if (m.small.length) bad.push(`small: ${m.small.join(", ")}`);
    if (m.broken.length) bad.push(`broken words: ${m.broken.join(" ")}`);
    if (axe.violations.length) bad.push(`axe: ${axe.violations.map((v) => `${v.id} (${v.nodes.length})`).join(", ")}`);
    findings += bad.length;
    console.log(`${`${name}@${text}`.padEnd(12)} screens ${String(m.screens).padStart(4)}  ${bad.length ? bad.join(" · ") : "clean"}`);
    await ctx.close();
  }
}
await browser.close();
process.exit(findings ? 1 : 0);
