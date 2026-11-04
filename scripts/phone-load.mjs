// Page loads on an emulated mid-range phone (docs/PERFORMANCE.md, "Phones"): a Pixel 7 with the CPU
// slowed 4x and a slow 4G network (150 ms round trip, 1.6 Mbps down), an empty cache every load.
// Prints the median of the runs for each page.
//
//   pnpm build
//   UNIIVERSE_DB_MODE=memory UNIIVERSE_SEED_DEMO=true UNIIVERSE_REQUIRE_AUTH=false DATABASE_URL= RIOT_API_KEY= pnpm start -p 3000
//   node scripts/phone-load.mjs http://127.0.0.1:3000 [runs] [page filter, a regular expression]
//
// The demo database answers in-process, so server time is not production's: compare builds with
// each other, not with the live site. Riot's image CDN is not fetched, so pages whose largest element
// is artwork read too fast here: on Team Overview a phone's LCP is the first card's splash art
// (docs/PERFORMANCE.md, "Team Overview's first card", for a measurement with the art).
import { chromium, devices } from "@playwright/test";

const base = process.argv[2] ?? "http://127.0.0.1:3000";
const RUNS = Number(process.argv[3] ?? 3);
const filter = process.argv[4] ? new RegExp(process.argv[4]) : null;

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined });
const { defaultBrowserType: _, ...PHONE } = devices["Pixel 7"];

async function demoMid() {
  const ctx = await browser.newContext();
  await ctx.addCookies([{ name: "uniiverse_view", value: "player", url: base }]);
  const page = await ctx.newPage();
  await page.goto(`${base}/players`);
  const href = await page.locator("main a[data-testid='player-card'][data-player-name='Demo Mid']").getAttribute("href");
  await ctx.close();
  return href;
}
const mid = await demoMid();

const PAGES = [
  ["team", "/team", "player"],
  ["players", "/players", "player"],
  ["profile", mid, "player"],
  ["profile-champions", `${mid}/champions`, "player"],
  ["profile-matches", `${mid}/matches`, "player"],
  ["leaderboards", "/leaderboards", "player"],
  ["matches", "/matches", "player"],
  ["settings", "/settings", "player"],
  ["admin-people", "/admin/people", "admin"],
  ["public", "/public", "guest"],
  ["login", "/login", "guest"],
].filter(([key]) => !filter || filter.test(key));

/** Runs in the page before anything else: records paints, layout shifts and long tasks. */
const OBSERVE = () => {
  const p = (window.__load = { fcp: 0, lcp: 0, cls: 0, long: [] });
  new PerformanceObserver((l) => l.getEntries().forEach((e) => e.name === "first-contentful-paint" && (p.fcp = e.startTime))).observe({ type: "paint", buffered: true });
  new PerformanceObserver((l) => l.getEntries().forEach((e) => (p.lcp = e.renderTime || e.loadTime || e.startTime))).observe({ type: "largest-contentful-paint", buffered: true });
  new PerformanceObserver((l) => l.getEntries().forEach((e) => !e.hadRecentInput && (p.cls += e.value))).observe({ type: "layout-shift", buffered: true });
  new PerformanceObserver((l) => l.getEntries().forEach((e) => p.long.push([e.startTime, e.duration]))).observe({ type: "longtask", buffered: true });
};

async function load(path, view) {
  const ctx = await browser.newContext(PHONE);
  await ctx.addCookies([view === "guest" ? { name: "uniiverse_guest", value: "1", url: base } : { name: "uniiverse_view", value: view, url: base }]);
  await ctx.addInitScript(OBSERVE);
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.route(/ddragon\.leagueoflegends\.com|communitydragon\.org/, (route) => route.abort());
  await page.goto(`${base}${path}`, { waitUntil: "load", timeout: 90_000 });
  // Settled: no new long task for 2 s (15 s at most).
  for (let last = -1, end = Date.now() + 15_000; Date.now() < end; ) {
    await page.waitForTimeout(2_000);
    const n = await page.evaluate(() => window.__load.long.length);
    if (n === last) break;
    last = n;
  }
  const m = await page.evaluate(() => {
    const p = window.__load;
    const nav = performance.getEntriesByType("navigation")[0];
    const scripts = performance.getEntriesByType("resource").filter((r) => /\.js(\?|$)/.test(r.name));
    return {
      fcp: Math.round(p.fcp),
      lcp: Math.round(p.lcp),
      // Blocking time: the part of each long task after first paint beyond 50 ms.
      tbt: Math.round(p.long.filter(([start]) => start >= p.fcp).reduce((sum, [, d]) => sum + Math.max(0, d - 50), 0)),
      longest: Math.round(Math.max(0, ...p.long.map(([, d]) => d))),
      cls: Math.round(p.cls * 1000) / 1000,
      jsKB: Math.round(scripts.reduce((sum, r) => sum + (r.transferSize || 0), 0) / 1024),
      load: Math.round(nav.loadEventEnd),
    };
  });
  await ctx.close();
  return m;
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
for (const [key, path, view] of PAGES) {
  const runs = [];
  for (let i = 0; i < RUNS; i++) runs.push(await load(path, view));
  console.log(key.padEnd(18), JSON.stringify(Object.fromEntries(Object.keys(runs[0]).map((k) => [k, median(runs.map((r) => r[k]))]))));
}
await browser.close();
