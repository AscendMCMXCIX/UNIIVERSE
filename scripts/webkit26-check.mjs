#!/usr/bin/env node
/*
  Safari 26's engine on every kind of window (docs/RESPONSIVE.md, "Safari 26").

    PW26_CORE=<playwright-core 1.58.2 folder> PLAYWRIGHT_BROWSERS_PATH=<its browsers> \
      node scripts/webkit26-check.mjs [base url]

  Safari 26 and earlier (iOS, iPadOS and macOS 26) collapse a window that is as tall as its content
  (a dialog's fit-content height) to its header when the window's body grows from nothing
  (`flex-1`): on the owner's iPhone the account menu was a 95pt strip (10 Nov), as the iOS 26
  Simulator also showed, and in WebKit 26.0 most other sheets, the compact windows and the centred
  windows of wider screens collapsed the same way. WebKit 27 fixed it, and the browser tests run
  Playwright's current WebKit (27), so they cannot see it. This runs the same pages in Playwright
  1.58.2's WebKit 26.0, the last build before the fix, which draws the collapse exactly as the
  iPhone did (DetailModal's BODY_SCROLLS).

  - PW26_CORE: the playwright-core 1.58.2 package folder (npm install --prefix <dir>
    playwright-core@1.58.2), and PLAYWRIGHT_BROWSERS_PATH where its WebKit was installed
    (node <PW26_CORE>/cli.js install --with-deps webkit). The WebKit workflow does both, on Ubuntu
    24.04: Playwright 1.58.2 has no WebKit for newer Ubuntu releases.
  - base url: a running demo build. Without one, the production build (pnpm build first) is started
    on the browser tests' demo settings at port 3198 and stopped afterwards.
  - WEBKIT26_SHOTS=<folder>: a screenshot of every window.

  Each check opens one window on a phone (an installed app's whole screen, Safari's tab, the smallest
  iPhone, held sideways), an iPad or a Mac, waits for it to come to rest and asserts that its body
  shows its content (all of it, or at least 160px where it scrolls). The account screen also fills
  the screen exactly, with every control in view and reached by a tap where it is drawn on a phone
  held upright, and the page behind never moves; a sheet on a phone sits on the bottom edge. It
  prints labels and sizes only (the demo roster), and exits 1 if any check fails.
*/
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const require = createRequire(import.meta.url);
if (!process.env.PW26_CORE) {
  console.error("PW26_CORE is not set: the folder of playwright-core 1.58.2 (see the top of this file).");
  process.exit(2);
}
const { webkit } = require(process.env.PW26_CORE);
const SHOTS = process.env.WEBKIT26_SHOTS;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1";
const MAC_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15";
const phone = (width, height) => ({ viewport: { width, height }, isMobile: true, hasTouch: true, userAgent: IPHONE_UA, deviceScaleFactor: 2 });
const FRAMES = {
  "iPhone 15, installed": phone(393, 852),
  "iPhone 15, Safari": phone(393, 659),
  "iPhone SE (1st gen.)": phone(320, 568),
  "iPhone sideways": phone(667, 375),
  iPad: { viewport: { width: 820, height: 1180 }, hasTouch: true, userAgent: MAC_UA, deviceScaleFactor: 2 },
  Mac: { viewport: { width: 1440, height: 900 }, userAgent: MAC_UA },
};
const UPRIGHT_PHONES = ["iPhone 15, installed", "iPhone 15, Safari", "iPhone SE (1st gen.)"];

/** The window matching `selector`, measured at rest. */
function measure(page, selector) {
  return page.evaluate((selector) => {
    const d = document.querySelector(selector);
    if (!d) return null;
    const r = d.getBoundingClientRect();
    const kids = [...d.children];
    // The body: what scrolls (data-sheet-scroll), else the part with the most content.
    const body = d.querySelector(":scope > [data-sheet-scroll]") ?? kids.slice().sort((a, b) => b.scrollHeight - a.scrollHeight)[0] ?? d;
    const style = getComputedStyle(body);
    const padding = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
    const controls = [...d.querySelectorAll("a[href], button, input, select, textarea, [role=menuitem]")].filter((el) => {
      const b = el.getBoundingClientRect();
      return b.width > 0 && b.height > 0 && getComputedStyle(el).visibility !== "hidden";
    });
    const reached = controls.filter((el) => {
      const b = el.getBoundingClientRect();
      const at = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      return !!at && (at === el || el.contains(at));
    });
    return {
      box: { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height) },
      shown: Math.round(body.clientHeight - padding),
      content: Math.round(body.scrollHeight - padding),
      scrolls: body.scrollHeight > body.clientHeight + 1,
      controls: controls.length,
      reached: reached.length,
      scrollY: Math.round(window.scrollY),
    };
  }, selector);
}

async function tap(page, locator, touch) {
  await locator.waitFor({ state: "visible", timeout: 15_000 });
  const b = await locator.boundingBox();
  if (touch) await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  else await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
}
/** Waits until the window exists and nothing in it is moving (its opening motion has run). */
async function atRest(page, selector) {
  const el = page.locator(selector);
  await el.waitFor({ state: "attached", timeout: 15_000 });
  await page.waitForFunction((s) => {
    const d = document.querySelector(s);
    return !!d && d.getAnimations({ subtree: true }).every((a) => a.playState !== "running");
  }, selector, { timeout: 5_000 }).catch(() => undefined);
  await page.waitForTimeout(300);
}
async function open(page, path, base) {
  await page.goto(base + path, { waitUntil: "load" });
  await page.waitForTimeout(500);
}

let playerId = null;
async function firstPlayer(page, base) {
  if (!playerId) {
    await open(page, "/team", base);
    playerId = await page.getByTestId("lineup-row-TOP").first().getAttribute("data-player-id");
  }
  return playerId;
}

/** Each check opens one window; `expect` adds its own assertions to the common one. */
const CHECKS = [
  {
    name: "account screen, page scrolled",
    selector: "[data-testid=account-sheet]",
    frames: [...UPRIGHT_PHONES, "iPhone sideways"],
    async run(page, { touch, base, frame }) {
      await open(page, "/team", base);
      const upright = frame !== "iPhone sideways";
      // Sideways the top bar slides away as the page scrolls; upright, open it from far down a page.
      if (upright) await page.evaluate(() => window.scrollTo(0, Math.round((document.documentElement.scrollHeight - innerHeight) * 0.6)));
      await page.waitForTimeout(300);
      const before = await page.evaluate(() => Math.round(window.scrollY));
      await tap(page, page.getByTestId("account-sheet-button"), touch);
      return { before };
    },
    expect(m, { viewport, frame, before }) {
      const fails = [];
      if (m.box.top !== 0 || m.box.left !== 0 || m.box.width !== viewport.width || m.box.height !== viewport.height) fails.push(`fills ${JSON.stringify(m.box)}, not the ${viewport.width}×${viewport.height} screen`);
      if (UPRIGHT_PHONES.includes(frame)) {
        if (m.scrolls) fails.push("scrolls on a phone held upright");
        if (m.reached !== m.controls) fails.push(`${m.controls - m.reached} of ${m.controls} controls out of reach`);
      }
      if (m.scrollY !== before) fails.push(`the page behind moved from ${before} to ${m.scrollY}`);
      return fails;
    },
  },
  {
    name: "install window (compact)",
    selector: "[data-testid=install-window]",
    frames: ["iPhone 15, installed"],
    async run(page, { touch, base }) {
      await open(page, "/team", base);
      await tap(page, page.getByTestId("account-sheet-button"), touch);
      await atRest(page, "[data-testid=account-sheet]");
      await tap(page, page.getByTestId("account-sheet").getByTestId("install-app"), touch);
    },
  },
  {
    name: "filter sheet (sheet)",
    selector: "[data-testid=filter-sheet]",
    frames: [...UPRIGHT_PHONES, "iPhone sideways"],
    async run(page, { touch, base }) {
      const id = await firstPlayer(page, base);
      await open(page, `/players/${id}/matches`, base);
      await tap(page, page.getByTestId("filter-toggle"), touch);
    },
    expect: docked,
  },
  {
    name: "lineup editor (sheet with Save)",
    selector: "[data-testid=lineup-sheet-TOP]",
    frames: ["iPhone 15, installed", "iPhone SE (1st gen.)", "iPad", "Mac"],
    async run(page, { touch, base }) {
      await open(page, "/team", base);
      await tap(page, page.getByTestId("edit-lineup"), touch);
      const change = page.getByTestId("lineup-change-TOP");
      await change.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      await tap(page, change, touch);
    },
    expect: docked,
  },
  {
    name: "player window (standard)",
    selector: "[data-testid=player-detail]",
    frames: ["iPhone 15, installed", "iPad", "Mac"],
    async run(page, { touch, base }) {
      await open(page, "/team", base);
      await tap(page, page.getByTestId("lineup-row-TOP").getByTestId("open-player-detail"), touch);
    },
  },
  {
    name: "game window (wide)",
    selector: "[data-testid=match-detail]",
    frames: ["iPhone 15, installed"],
    async run(page, { touch, base }) {
      const id = await firstPlayer(page, base);
      await open(page, `/players/${id}/matches`, base);
      await tap(page, page.getByTestId("match-card").first(), touch);
    },
  },
  {
    name: "Card Studio (wide, scrolling inside)",
    selector: "[data-testid=card-studio-window]",
    frames: ["iPhone 15, installed", "iPad", "Mac"],
    async run(page, { touch, base }) {
      const id = await firstPlayer(page, base);
      await open(page, `/players/${id}`, base);
      await tap(page, page.getByTestId("profile-header").getByTestId("customise-card"), touch);
    },
  },
  {
    name: "sign-in window (form)",
    selector: "[data-testid=sign-in-window]",
    guest: true,
    frames: ["iPhone 15, installed", "iPad", "Mac"],
    async run(page, { touch, base }) {
      await open(page, "/public", base);
      await tap(page, page.getByTestId("public-sign-in"), touch);
    },
  },
  {
    name: "tablet menu (drawer)",
    selector: "[data-testid=mobile-drawer]",
    frames: ["iPad"],
    async run(page, { touch, base }) {
      await open(page, "/team", base);
      await tap(page, page.getByTestId("menu-button"), touch);
    },
  },
  {
    name: "account menu (dropdown)",
    selector: "[data-testid=account-menu]",
    frames: ["iPad", "Mac"],
    async run(page, { touch, base }) {
      await open(page, "/team", base);
      await tap(page, page.getByTestId("account-menu-button").filter({ visible: true }).first(), touch);
    },
    expect: (m) => (m.reached !== m.controls ? [`${m.controls - m.reached} of ${m.controls} items out of reach`] : []),
  },
];

/** A sheet on a phone (upright or sideways) sits on the bottom edge. */
function docked(m, { viewport, frame }) {
  return frame.startsWith("iPhone") && Math.abs(m.box.top + m.box.height - viewport.height) > 1 ? [`its bottom at ${m.box.top + m.box.height}, not on the bottom edge (${viewport.height})`] : [];
}

/** Every window: the body shows its content, or at least 160px of it where it scrolls. */
function showsContent(m) {
  const needed = Math.min(m.content, 160);
  return m.shown + 1 < needed ? [`its body shows ${m.shown}px of ${m.content}px of content (the collapse)`] : [];
}

const PORT = 3198;
const answers = (url) => fetch(url, { redirect: "manual" }).then((r) => r.status < 500, () => false);

/**
 * Starts the production build on the browser tests' demo settings, in a process group of its own so
 * the whole of it (pnpm, next) stops with the check, interrupted or not.
 */
async function startServer() {
  const base = `http://127.0.0.1:${PORT}`;
  // Something already answering there would be checked instead of this build.
  if (await answers(`${base}/team`)) throw new Error(`port ${PORT} already answers: stop what serves it, or pass its address`);
  const server = spawn("pnpm", ["start", "-p", String(PORT)], {
    detached: true,
    stdio: ["ignore", "ignore", "inherit"],
    env: { ...process.env, UNIIVERSE_DB_MODE: "memory", UNIIVERSE_SEED_DEMO: "true", UNIIVERSE_REQUIRE_AUTH: "false", UNIIVERSE_JOB_LOGS: "silent", NEXT_TELEMETRY_DISABLED: "1", DATABASE_URL: "", RIOT_API_KEY: "", UNIIVERSE_FAKE_RIOT_IDS: "1" },
  });
  let exited = null;
  server.on("exit", (code) => (exited = code ?? "a signal"));
  const stop = () => {
    try {
      process.kill(-server.pid);
    } catch {
      // The group has already gone.
    }
  };
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      stop();
      process.exit(130);
    });
  }
  for (let i = 0; i < 120; i++) {
    if (exited !== null) throw new Error(`the demo build stopped before it answered (exit ${exited}): run pnpm build first`);
    if (await answers(`${base}/team`)) return { base, stop };
    await new Promise((r) => setTimeout(r, 1000));
  }
  stop();
  throw new Error("the demo build did not answer within 2 minutes (run pnpm build first)");
}

const server = process.argv[2] ? null : await startServer();
const base = (process.argv[2] ?? server.base).replace(/\/$/, "");
const failures = [];
let checks = 0;
let failed = 0;
let browser = null;
let version = "?";
try {
  browser = await webkit.launch();
  version = browser.version();
  console.log(`WebKit ${version} on ${base}`);
  if (!version.startsWith("26.")) failures.push(`WebKit ${version} is not Safari 26's engine: install playwright-core 1.58.2's WebKit (see the top of this file)`);
  for (const check of CHECKS) {
    for (const frame of check.frames) {
      const label = `${check.name} · ${frame}`;
      const options = FRAMES[frame];
      const context = await browser.newContext(options);
      await context.addCookies([check.guest ? { name: "uniiverse_guest", value: "1", url: base } : { name: "uniiverse_view", value: "player", url: base }]);
      const page = await context.newPage();
      let fails;
      let m = null;
      try {
        const extra = (await check.run(page, { touch: !!options.hasTouch, base, frame })) ?? {};
        await atRest(page, check.selector);
        m = await measure(page, check.selector);
        fails = m ? [...showsContent(m), ...(check.expect?.(m, { viewport: options.viewport, frame, ...extra }) ?? [])] : ["did not open"];
        if (SHOTS) await page.screenshot({ path: join(SHOTS, `${label.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`) });
      } catch (e) {
        fails = [`did not open: ${String(e?.message ?? e).split("\n")[0]}`];
      }
      const size = m ? `${m.box.width}×${m.box.height} at ${m.box.top}, body ${m.shown}/${m.content}px, ${m.reached}/${m.controls} controls in reach` : "";
      console.log(`${fails.length ? "✗" : "✓"} ${label.padEnd(54)} ${size}${fails.length ? `\n    ${fails.join("\n    ")}` : ""}`);
      checks++;
      if (fails.length) failed++;
      for (const f of fails) failures.push(`${label}: ${f}`);
      await context.close();
    }
  }
} finally {
  await browser?.close();
  server?.stop();
}
if (failures.length) {
  console.log(`\n${failed} of ${checks} checks failed in WebKit ${version}:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`\nAll ${checks} checks passed: every window drawn whole in WebKit ${version}.`);
