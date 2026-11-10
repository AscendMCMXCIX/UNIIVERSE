#!/usr/bin/env node
/*
  ios-sim driver (draft, Node 22, no dependencies). Runs on a GitHub-hosted macOS runner after the
  app is built and started on the in-memory demo database (APP_PORT). For each simulator in
  SIM_PLAN it creates and boots a fresh iPhone, then:
    safari      Mobile Safari opens the demo through a local proxy (PROXY_PORT) that injects
                agent.js into every HTML page; the avatar and the menu's controls are tapped on the
                simulator's screen with AXe (HID touches, like a finger); the page reports what it
                drew (viewport, svh/dvh, env(safe-area-inset-*), the menu's box, its computed
                max-height, every control's hit test) at each step; xcrun simctl takes screenshots.
    standalone  the same page is added to the Home Screen by tapping Safari's own Share menu (or, if
                that fails, a guessed web clip bundle is written into the simulator's data
                container), launched from its icon, and the same scenarios run in the installed app.
    webdriver   cross-check in Safari with Apple's safaridriver (safari:useSimulator), no proxy,
                no AXe: Execute Script measures, Element Click taps.
  Everything goes to OUT: metrics.json, summary.md, per-device screenshots, accessibility trees,
  web clip plists, a video, logs. Numbers, rectangles, test ids and paths only in the log: never a
  name (the demo's are fake, but the account header and the avatar's label hold one).
*/
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import http from "node:http";
import fs from "node:fs/promises";
import { createWriteStream, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const env = process.env;
const OUT = path.resolve(env.OUT || "ios-sim-out");
const APP_PORT = Number(env.APP_PORT || 3000);
const PROXY_PORT = Number(env.PROXY_PORT || 3080);
const WD_PORT = Number(env.WD_PORT || 4444);
const AXE = env.AXE_BIN || "axe";
const MODES = new Set((env.SIM_MODES || "safari,standalone,webdriver").split(",").map((s) => s.trim()).filter(Boolean));
const PLAN = JSON.parse(env.SIM_PLAN || '[{"runtime":"newest","device":"newest-pro"}]');
const BUDGET_MS = Number(env.DRIVER_BUDGET_MIN || 50) * 60_000;
// "first" (default): a video of the first device only; "all"; "0": none. Half scale, 8 fps (AXe).
const RECORD_VIDEO = env.RECORD_VIDEO || "first";
const RUN_TAG = env.GITHUB_RUN_ID ? `${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT || 1}` : String(Date.now());
const ORIGIN = `http://localhost:${PROXY_PORT}`;
const SEL = {
  button: env.MENU_BUTTON_SELECTOR || "[data-testid=account-sheet-button]",
  menu: env.MENU_SELECTOR || "[data-testid=account-sheet]",
  close: env.MENU_CLOSE_SELECTOR || "[data-testid=account-sheet-close]",
  install: env.MENU_INSTALL_SELECTOR || "[data-testid=install-app]",
  field: env.KEYBOARD_FIELD_SELECTOR || "main input[type=text], main input:not([type]), main textarea",
};
// The avatar's accessible name starts with this (mobile-nav.tsx: "Your account: <name>").
const AX_BUTTON_PREFIX = env.MENU_BUTTON_AXLABEL_PREFIX || "Your account";
const VIEW_COOKIE = env.VIEW_COOKIE || "uniiverse_view=player";
const AGENT_SRC = readFileSync(path.join(HERE, "agent.js"), "utf8");
const T0 = Date.now();
let XCODE_MAJOR = 0;

const SCENARIOS = [
  // The page at its top: open, read, swipe inside the menu, close with ×.
  { name: "team-top", path: "/team", scroll: "none", after: ["inner-swipe", "close"] },
  // A long page scrolled to its end by finger (Safari's toolbar collapses on the way): open, follow a tile.
  { name: "resources-end", path: "/resources", scroll: "end", after: ["tile"] },
  // Part-way down: open, close with a tap on the dimmed page below the menu (where there is any).
  { name: "team-scrolled", path: "/team", scroll: "some", after: ["backdrop", "close"] },
  // Another window opened from the menu (Install App: Safari only, hidden in the installed app).
  { name: "install-window", path: "/team", scroll: "none", after: ["install"], modes: ["safari"] },
  // After the keyboard: the visual viewport may be left offset (the --vv-top case).
  { name: "settings-keyboard", path: "/settings", scroll: "none", keyboard: true, after: ["close"] },
  // Other windows of the same kind (requirement 9): the phone's filter sheet (DetailModal "sheet",
  // docked to the bottom edge, as the account sheet was when an iPhone drew only its header).
  { name: "players-filter-sheet", path: "/players", scroll: "none", popup: { open: "[data-filter-toggle]", close: "[data-testid=filter-sheet-done]", closeLabel: "Done" } },
  ...JSON.parse(env.EXTRA_POPUPS || "[]"),
];

// ---- small helpers ---------------------------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const elapsed = () => `${((Date.now() - T0) / 1000).toFixed(1)}s`;
let logStream;
function log(...parts) {
  const line = `[${elapsed()}] ${parts.join(" ")}`;
  console.log(line);
  logStream?.write(line + "\n");
}
const execFileP = promisify(execFile);
async function run(cmd, args, { timeout = 60_000, allowFail = false, quiet = false, extraEnv } = {}) {
  const started = Date.now();
  const shown = `${cmd} ${args.join(" ")}`.slice(0, 220);
  try {
    const { stdout, stderr } = await execFileP(cmd, args, { timeout, maxBuffer: 128 * 1024 * 1024, killSignal: "SIGKILL", env: { ...process.env, ...extraEnv } });
    if (!quiet) log(`$ ${shown} (${Date.now() - started} ms)`);
    return { ok: true, code: 0, stdout, stderr };
  } catch (e) {
    const res = { ok: false, code: e.code ?? null, signal: e.signal ?? null, stdout: String(e.stdout ?? ""), stderr: String(e.stderr ?? e.message ?? "") };
    log(`$ ${shown} FAILED (${res.code ?? res.signal}) after ${Date.now() - started} ms: ${res.stderr.trim().split("\n").slice(-3).join(" | ").slice(0, 400)}`);
    if (!allowFail) throw Object.assign(new Error(`${cmd} ${args[0] ?? ""} failed`), { result: res });
    return res;
  }
}
const simctl = (args, opts) => run("xcrun", ["simctl", ...args], opts);
const axe = (args, opts) => run(AXE, args, { timeout: 45_000, allowFail: true, ...opts });
const budgetLeft = () => BUDGET_MS - (Date.now() - T0);
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
async function writeJSON(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2));
}
const versionKey = (v) => String(v).split(".").map((n) => Number(n) || 0);
function cmpVersion(a, b) {
  const x = versionKey(a);
  const y = versionKey(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  return 0;
}

// ---- the page agent hub and the proxy in front of the app -----------------------------------------
class Hub {
  constructor() {
    this.events = [];
    this.pages = new Map();
    this.queues = new Map();
    this.pending = new Map();
    this.waiters = new Set();
    this.nextId = 1;
    this.stats = { html: 0, injected: 0, proxied: 0, upstreamErrors: 0, polls: 0, reports: 0 };
  }
  page(id) {
    let p = this.pages.get(id);
    if (!p) {
      p = { id, first: Date.now(), last: 0 };
      this.pages.set(id, p);
    }
    return p;
  }
  poll(q) {
    this.stats.polls++;
    const p = this.page(q.get("page"));
    Object.assign(p, { last: Date.now(), path: q.get("path"), vis: q.get("vis"), sa: q.get("sa") === "1", rs: q.get("rs") });
    this.notify();
    const queue = this.queues.get(p.id);
    return queue?.length ? queue.shift() : null;
  }
  report(msg) {
    this.stats.reports++;
    const ev = { t: Date.now(), page: msg.page, type: msg.type, id: msg.id ?? null, data: msg.data };
    this.events.push(ev);
    const p = this.page(msg.page);
    p.last = Date.now();
    if (msg.type === "hello" || msg.type === "ready") Object.assign(p, { path: msg.data?.path, sa: !!msg.data?.standalone, rs: msg.data?.readyState, info: msg.data });
    if (msg.type === "nav") p.path = msg.data?.path;
    if (msg.type === "page-error" || msg.type === "console-error") log(`page ${msg.type}: ${String(msg.data?.message ?? "").slice(0, 160)}`);
    if (msg.type === "result" && this.pending.has(msg.id)) this.pending.get(msg.id)(msg.data);
    this.notify();
  }
  notify() {
    for (const w of [...this.waiters]) w();
  }
  waitFor(fn, timeout) {
    const v = fn();
    if (v) return Promise.resolve(v);
    return new Promise((resolve) => {
      const check = () => {
        const val = fn();
        if (val) {
          clearTimeout(timer);
          this.waiters.delete(check);
          resolve(val);
        }
      };
      const timer = setTimeout(() => {
        this.waiters.delete(check);
        resolve(null);
      }, timeout);
      this.waiters.add(check);
    });
  }
  /** A command for one page; resolves with its result, or { error: "timeout" }. */
  cmd(pageId, op, args = {}, timeout = 10_000) {
    const id = this.nextId++;
    const q = this.queues.get(pageId) ?? [];
    q.push({ id, op, args });
    this.queues.set(pageId, q);
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve({ error: "timeout", op });
      }, timeout);
      this.pending.set(id, (data) => {
        clearTimeout(timer);
        this.pending.delete(id);
        resolve(data ?? {});
      });
    });
  }
  /** The newest event since `since` that matches. */
  event(pred, since) {
    for (let i = this.events.length - 1; i >= 0; i--) {
      const e = this.events[i];
      if (e.t < since) break;
      if (pred(e)) return e;
    }
    return null;
  }
  waitEvent(pred, since, timeout) {
    return this.waitFor(() => this.event(pred, since), timeout);
  }
  /** A page loaded after `since`, polling, visible, fully loaded, and matching. */
  waitPage({ since = 0, standalone, pathPrefix, timeout = 45_000 }) {
    return this.waitFor(() => {
      let best = null;
      for (const p of this.pages.values()) {
        if (p.first < since || Date.now() - p.last > 2500 || p.vis !== "visible" || p.rs !== "complete") continue;
        if (standalone !== undefined && p.sa !== standalone) continue;
        if (pathPrefix && !String(p.path ?? "").startsWith(pathPrefix)) continue;
        if (!best || p.first > best.first) best = p;
      }
      return best;
    }, timeout);
  }
}
const hub = new Hub();

function agentScript() {
  const cfg = { poll: true, base: "/__agent", cookie: VIEW_COOKIE, selectors: { button: SEL.button, menu: SEL.menu, close: SEL.close } };
  return `window.__SIM_AGENT_CONFIG__=${JSON.stringify(cfg)};\n${AGENT_SRC}`;
}
function inject(html) {
  const tag = '<script src="/__agent/agent.js"></script>';
  const m = html.match(/<head[^>]*>/i);
  return m ? html.replace(m[0], m[0] + tag) : tag + html;
}
function readBody(req, limit = 4 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error("body too large"));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}
function forward(req, res) {
  hub.stats.proxied++;
  // Uncompressed and never 304 for pages, so the agent can be added to every one.
  const headers = { ...req.headers, "accept-encoding": "identity" };
  delete headers["if-none-match"];
  delete headers["if-modified-since"];
  const up = http.request({ host: "127.0.0.1", port: APP_PORT, method: req.method, path: req.url, headers }, (ur) => {
    const h = { ...ur.headers };
    delete h.connection;
    if (h.location) h.location = String(h.location).replace(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/, ORIGIN);
    const html = String(h["content-type"] ?? "").includes("text/html") && req.method === "GET";
    if (!html) {
      res.writeHead(ur.statusCode ?? 502, h);
      ur.pipe(res);
      return;
    }
    hub.stats.html++;
    const chunks = [];
    ur.on("data", (c) => chunks.push(c));
    ur.on("end", () => {
      const page = inject(Buffer.concat(chunks).toString("utf8"));
      if (page.includes("/__agent/agent.js")) hub.stats.injected++;
      const body = Buffer.from(page, "utf8");
      for (const k of ["content-length", "transfer-encoding", "content-encoding", "etag"]) delete h[k];
      h["content-length"] = String(body.length);
      h["cache-control"] = "no-store";
      res.writeHead(ur.statusCode ?? 200, h);
      res.end(body);
    });
  });
  up.on("error", (e) => {
    hub.stats.upstreamErrors++;
    if (!res.headersSent) res.writeHead(502, { "content-type": "text/plain" });
    res.end(`proxy: the app did not answer (${e.code})`);
  });
  req.pipe(up);
}
async function handle(req, res) {
  const url = new URL(req.url, ORIGIN);
  if (!url.pathname.startsWith("/__agent/")) return forward(req, res);
  const nostore = { "cache-control": "no-store" };
  if (url.pathname === "/__agent/agent.js") {
    res.writeHead(200, { ...nostore, "content-type": "text/javascript; charset=utf-8" });
    return res.end(agentScript());
  }
  if (url.pathname === "/__agent/poll") {
    const cmd = hub.poll(url.searchParams);
    if (!cmd) {
      res.writeHead(204, nostore);
      return res.end();
    }
    res.writeHead(200, { ...nostore, "content-type": "application/json" });
    return res.end(JSON.stringify(cmd));
  }
  if (url.pathname === "/__agent/report" && req.method === "POST") {
    try {
      hub.report(JSON.parse((await readBody(req)).toString("utf8")));
      res.writeHead(204, nostore);
    } catch (e) {
      res.writeHead(400, nostore);
    }
    return res.end();
  }
  res.writeHead(404, nostore);
  res.end();
}
async function startProxy() {
  const servers = [];
  // Both loopbacks: Safari may resolve localhost to ::1 first.
  for (const host of ["127.0.0.1", "::1"]) {
    await new Promise((resolve) => {
      const s = http.createServer((req, res) => handle(req, res).catch(() => res.end()));
      s.on("error", (e) => {
        log(`proxy: could not listen on ${host}:${PROXY_PORT} (${e.code})`);
        resolve();
      });
      s.listen(PROXY_PORT, host, () => {
        servers.push(s);
        resolve();
      });
    });
  }
  if (!servers.length) throw new Error("the proxy could not listen on any loopback address");
  log(`proxy: ${ORIGIN} -> 127.0.0.1:${APP_PORT} (${servers.length} listener(s))`);
  return servers;
}

// ---- simulators ------------------------------------------------------------------------------------
async function inventory() {
  const rt = JSON.parse((await simctl(["list", "runtimes", "-j"], { quiet: true })).stdout);
  const dt = JSON.parse((await simctl(["list", "devicetypes", "-j"], { quiet: true })).stdout);
  const runtimes = (rt.runtimes ?? []).filter((r) => (r.platform ? r.platform === "iOS" : /iOS/.test(r.identifier)) && r.isAvailable !== false).sort((a, b) => cmpVersion(a.version, b.version));
  return { runtimes, devicetypes: dt.devicetypes ?? [] };
}
function pickRuntime(inv, sel) {
  if (!inv.runtimes.length) return null;
  if (!sel || sel === "newest") return inv.runtimes.at(-1);
  if (sel === "oldest") return inv.runtimes[0];
  return inv.runtimes.filter((r) => String(r.version).startsWith(String(sel))).at(-1) ?? null;
}
function pickDeviceType(inv, runtime, group) {
  const supported = runtime.supportedDeviceTypes?.length ? runtime.supportedDeviceTypes : inv.devicetypes.filter((d) => d.productFamily === "iPhone");
  const iphones = supported.filter((d) => (d.productFamily ?? "iPhone") === "iPhone" || /^iPhone/.test(d.name));
  const newest = (re) =>
    iphones
      .map((d) => ({ d, n: Number((d.name.match(re) ?? [])[1]) }))
      .filter((x) => x.n)
      .sort((a, b) => b.n - a.n)[0]?.d;
  for (const cand of String(group).split("|").map((s) => s.trim())) {
    const hit = cand === "newest-pro" ? (newest(/^iPhone (\d+) Pro$/) ?? newest(/^iPhone (\d+)$/)) : iphones.find((d) => d.name === cand);
    if (hit) return inv.devicetypes.find((d) => d.identifier === hit.identifier) ?? hit;
  }
  return null;
}
async function screenOf(deviceType) {
  // Points from the device type's profile (pixels / scale); the page reports its own as well.
  if (!deviceType.bundlePath) return null;
  const r = await run("plutil", ["-convert", "json", "-o", "-", path.join(deviceType.bundlePath, "Contents/Resources/profile.plist")], { allowFail: true, quiet: true });
  if (!r.ok) return null;
  try {
    const p = JSON.parse(r.stdout);
    const scale = p.mainScreenScale || 3;
    return { w: Math.round(p.mainScreenWidth / scale), h: Math.round(p.mainScreenHeight / scale), scale };
  } catch {
    return null;
  }
}
async function bootFresh(ctx) {
  const name = `uv-${ctx.slug}-${RUN_TAG}`.slice(0, 60);
  ctx.udid = (await simctl(["create", name, ctx.deviceType.identifier, ctx.runtime.identifier], { timeout: 120_000 })).stdout.trim();
  log(`device ${ctx.slug}: created ${ctx.udid} (${ctx.deviceType.name}, iOS ${ctx.runtime.version})`);
  await simctl(["boot", ctx.udid], { timeout: 180_000, allowFail: true });
  const t = Date.now();
  await simctl(["bootstatus", ctx.udid, "-b"], { timeout: 420_000 });
  ctx.bootMs = Date.now() - t;
  // Remote automation and inspection for safaridriver (formicarium #129 wrote these seven; which of
  // them are needed is unverified). Written while booted, read back after the restart below.
  const keys = [
    "com.apple.webinspectord:RemoteInspectorEnabled",
    "com.apple.webinspectord:RemoteAutomationEnabled",
    "com.apple.webinspectord:WIRRemoteAutomationEnabled",
    "com.apple.mobilesafari:WebKitDeveloperExtrasEnabledPreferenceKey",
    "com.apple.mobilesafari:WebInspectorEnabled",
    "com.apple.mobilesafari:RemoteAutomationEnabled",
    "com.apple.mobilesafari:WebKitRemoteAutomationEnabled",
  ];
  if (ctx.modes.has("webdriver")) {
    for (const k of keys) await simctl(["spawn", ctx.udid, "defaults", "write", k.split(":")[0], k.split(":")[1], "-bool", "true"], { allowFail: true, quiet: true });
    await simctl(["shutdown", ctx.udid], { timeout: 120_000, allowFail: true });
    await simctl(["boot", ctx.udid], { timeout: 180_000, allowFail: true });
    await simctl(["bootstatus", ctx.udid, "-b"], { timeout: 420_000 });
    const back = {};
    for (const domain of ["com.apple.webinspectord", "com.apple.mobilesafari"]) back[domain] = (await simctl(["spawn", ctx.udid, "defaults", "read", domain], { allowFail: true, quiet: true })).stdout.slice(0, 4000);
    await writeJSON(path.join(ctx.dir, "prefs-after-restart.json"), back);
  }
  await simctl(["status_bar", ctx.udid, "override", "--time", "9:41", "--dataNetwork", "wifi", "--wifiMode", "active", "--wifiBars", "3", "--cellularMode", "active", "--cellularBars", "4", "--batteryState", "charged", "--batteryLevel", "100"], { allowFail: true });
}
async function startVideo(ctx) {
  if (RECORD_VIDEO === "0" || (RECORD_VIDEO === "first" && ctx.index !== 0)) return;
  const file = path.join(ctx.dir, "video.mp4");
  // AXe's recorder (stops cleanly on SIGINT); simctl's recordVideo has no scale and runs to hundreds of MB.
  ctx.video = spawn(AXE, ["record-video", "--output", file, "--fps", "8", "--quality", "60", "--scale", "0.5", "--udid", ctx.udid], { stdio: ["ignore", "ignore", "pipe"] });
  ctx.video.stderr.on("data", () => {});
  ctx.video.on("error", () => {});
  await sleep(1500);
}
async function stopVideo(ctx) {
  if (!ctx.video) return;
  const v = ctx.video;
  ctx.video = null;
  const done = new Promise((r) => v.on("exit", r));
  v.kill("SIGINT");
  await Promise.race([done, sleep(20_000)]);
  if (v.exitCode === null) v.kill("SIGKILL");
}
let shotNo = 0;
async function shot(ctx, name) {
  const file = path.join(ctx.dir, "screens", `${String(++shotNo).padStart(3, "0")}-${ctx.mode ?? "setup"}-${slug(name)}.png`);
  await fs.mkdir(path.dirname(file), { recursive: true });
  let r = await simctl(["io", ctx.udid, "screenshot", "--type=png", "--mask=black", file], { allowFail: true, quiet: true, timeout: 30_000 });
  if (!r.ok) r = await simctl(["io", ctx.udid, "screenshot", file], { allowFail: true, quiet: true, timeout: 30_000 });
  return r.ok ? path.relative(OUT, file) : null;
}

// ---- the accessibility tree (AXe describe-ui) and taps on the screen -------------------------------
function flatten(roots) {
  const out = [];
  const walk = (n, web, depth) => {
    if (!n || typeof n !== "object") return;
    const kind = `${n.type ?? ""} ${n.role ?? ""} ${n.role_description ?? ""} ${n.subrole ?? ""}`;
    const inWeb = web || /web|html/i.test(kind);
    out.push({ type: n.type ?? null, role: n.role ?? null, roleDescription: n.role_description ?? null, label: n.AXLabel ?? null, value: n.AXValue ?? null, id: n.AXUniqueId ?? n.AXIdentifier ?? null, frame: n.frame ?? null, web: inWeb, depth });
    for (const c of n.children ?? []) walk(c, inWeb, depth + 1);
  };
  for (const r of Array.isArray(roots) ? roots : [roots]) walk(r, false, 0);
  return out;
}
const norm = (s) => String(s ?? "").replace(/…/g, "...").replace(/\s+/g, " ").trim().toLowerCase();
const labelIn = (n, labels) => labels.some((l) => norm(n.label) === norm(l));
const visible = (n) => n.frame && n.frame.width > 0 && n.frame.height > 0;
const centre = (f) => ({ x: Math.round(f.x + f.width / 2), y: Math.round(f.y + f.height / 2) });
function redact(roots) {
  // The avatar's label holds the member's name: keep only its fixed start.
  return JSON.parse(JSON.stringify(roots), (k, v) => (k === "AXLabel" && typeof v === "string" && v.startsWith(AX_BUTTON_PREFIX) ? AX_BUTTON_PREFIX : v));
}
async function describe(ctx, saveAs) {
  const r = await axe(["describe-ui", "--udid", ctx.udid], { quiet: true, timeout: 60_000 });
  if (!r.ok) return { ok: false, nodes: [], error: r.stderr.slice(0, 300) };
  let roots;
  try {
    roots = JSON.parse(r.stdout);
  } catch {
    return { ok: false, nodes: [], error: "describe-ui printed no JSON" };
  }
  if (saveAs) await writeJSON(path.join(ctx.dir, "ax", `${String(++shotNo).padStart(3, "0")}-${ctx.mode ?? "setup"}-${slug(saveAs)}.json`), redact(roots));
  const nodes = flatten(roots);
  const app = Array.isArray(roots) ? roots.find((n) => n.frame) : roots;
  return { ok: true, nodes, screen: app?.frame ? { w: Math.round(app.frame.width), h: Math.round(app.frame.height) } : null };
}
async function tapAt(ctx, p, why) {
  const x = Math.max(1, Math.round(p.x));
  const y = Math.max(1, Math.round(p.y));
  const r = await axe(["tap", "-x", String(x), "-y", String(y), "--udid", ctx.udid], { quiet: true });
  log(`tap ${why} at ${x},${y}: ${r.ok ? "ok" : "failed"}`);
  return r.ok;
}
async function swipe(ctx, from, to, duration = 0.3) {
  return (await axe(["swipe", "--start-x", String(Math.round(from.x)), "--start-y", String(Math.round(from.y)), "--end-x", String(Math.round(to.x)), "--end-y", String(Math.round(to.y)), "--duration", String(duration), "--udid", ctx.udid], { quiet: true })).ok;
}
/**
 * AXe works headless on Xcode 26 and through Device Hub on Xcode 27 (AXe 1.8.0 notes). If it cannot
 * read the simulator, open the host app the selected Xcode uses and try again.
 */
async function openSimulatorHost(ctx) {
  const dev = (await run("xcode-select", ["-p"], { allowFail: true, quiet: true })).stdout.trim();
  const xcode = dev.replace(/\/Contents\/Developer$/, "");
  if (XCODE_MAJOR >= 27) await run("open", ["-g", path.join(xcode, "Contents/Applications/DeviceHub.app")], { allowFail: true });
  else await run("open", ["-g", "-a", path.join(dev, "Applications/Simulator.app"), "--args", "-CurrentDeviceUDID", ctx.udid], { allowFail: true });
  await sleep(8000);
}
async function home(ctx) {
  await axe(["button", "home", "--udid", ctx.udid], { quiet: true });
  await sleep(1500);
}

// ---- page coordinates to screen points: tap twice where the page listens, see where it was touched -
async function calibrate(ctx, pageId) {
  const s = ctx.screen;
  const pts = [
    { x: Math.round(s.w / 2), y: Math.round(s.h * 0.42) },
    { x: Math.round(s.w / 2), y: Math.round(s.h * 0.58) },
  ];
  const samples = [];
  for (const p of pts) {
    await hub.cmd(pageId, "arm", { ms: 6000 });
    const since = Date.now();
    await tapAt(ctx, p, "calibration");
    const ev = await hub.waitEvent((e) => e.page === pageId && e.type === "calibration", since, 6000);
    if (!ev?.data?.first) return { ok: false, samples, reason: "the page saw no touch (Safari UI in the way, or taps do not reach web content)" };
    samples.push({ screen: p, client: { x: ev.data.first.clientX, y: ev.data.first.clientY }, events: ev.data.seen, firstType: ev.data.first.type });
  }
  const dy = samples[1].client.y - samples[0].client.y;
  const scale = dy ? (samples[1].screen.y - samples[0].screen.y) / dy : 1;
  const off = { x: samples[0].screen.x - samples[0].client.x * scale, y: samples[0].screen.y - samples[0].client.y * scale };
  const map = { ok: true, scale: Math.round(scale * 1000) / 1000, off: { x: Math.round(off.x * 10) / 10, y: Math.round(off.y * 10) / 10 }, samples };
  log(`calibration (${ctx.mode}): screen = ${map.off.x},${map.off.y} + client x ${map.scale}; first event ${samples[0].firstType}`);
  ctx.map = map;
  return map;
}
const toScreen = (map, p) => ({ x: map.off.x + p.x * map.scale, y: map.off.y + p.y * map.scale });
/**
 * Taps a page element like a finger: by its accessibility frame (when AXe sees web content), or by
 * the calibrated map from the page's own rectangle. `prefer` picks which is tried first.
 */
async function tapElement(ctx, pageId, { selector, axPrefix, axLabel, why, prefer = "map" }) {
  const viaAx = async () => {
    if (!axPrefix && !axLabel) return null;
    const tree = await describe(ctx);
    // Web content flagged as such where the tree says so (ctx.webFlag), any element otherwise.
    const n = tree.nodes.find((x) => visible(x) && (x.web || !ctx.webFlag) && (axPrefix ? String(x.label ?? "").startsWith(axPrefix) : norm(x.label) === norm(axLabel)));
    return n ? { how: "ax", ok: await tapAt(ctx, centre(n.frame), `${why} (ax)`), frame: n.frame } : null;
  };
  const viaMap = async () => {
    if (!ctx.map?.ok) return null;
    const r = await hub.cmd(pageId, "rect", { selector });
    if (!r?.center) return null;
    const p = toScreen(ctx.map, r.center);
    return { how: "map", ok: await tapAt(ctx, p, `${why} (map)`), client: r.center, screen: p };
  };
  const order = prefer === "ax" ? [viaAx, viaMap] : [viaMap, viaAx];
  for (const way of order) {
    const done = await way();
    if (done) return done;
  }
  return { how: "none", ok: false, reason: ctx.map?.ok ? `${selector} not found` : "no calibration and no accessibility frame" };
}

// ---- one scenario ------------------------------------------------------------------------------------
async function goTo(ctx, pageId, pathname, standalone = ctx.mode === "standalone" ? true : undefined) {
  let since = Date.now();
  const sent = await hub.cmd(pageId, "navigate", { url: pathname }, 5000);
  let p = await hub.waitPage({ since, pathPrefix: pathname, standalone, timeout: sent?.error ? 5000 : 45_000 });
  if (!p && standalone !== true) {
    // The page stopped answering (Safari reloaded it, or it is in the background): open the address.
    since = Date.now();
    await simctl(["openurl", ctx.udid, `${ORIGIN}${pathname}`], { timeout: 90_000, allowFail: true });
    p = await hub.waitPage({ since, pathPrefix: pathname, standalone, timeout: 45_000 });
  }
  if (p) await sleep(1500); // hydration, fonts, images settle
  return p;
}
async function scrollByFinger(ctx, pageId, how) {
  const s = ctx.screen;
  const from = { x: s.w / 2, y: s.h * 0.72 };
  const to = { x: s.w / 2, y: s.h * 0.32 };
  const steps = [];
  const max = how === "end" ? 14 : 2;
  let last = -1;
  for (let i = 0; i < max; i++) {
    await swipe(ctx, from, to, 0.25);
    await sleep(900);
    const m = await hub.cmd(pageId, "measure", { label: `scroll-${i}` });
    const y = m?.viewport?.scrollY ?? -1;
    steps.push({ i, scrollY: y, innerHeight: m?.viewport?.innerHeight, vvHeight: m?.viewport?.vv?.height });
    if (how === "end" && y === last) break;
    last = y;
  }
  const end = await hub.cmd(pageId, "measure", { label: "scrolled" });
  const v = end?.viewport;
  const atEnd = v ? v.scrollY + v.innerHeight >= v.scrollHeight - 4 : false;
  let fallback = false;
  if (how === "end" && !atEnd) {
    await hub.cmd(pageId, "scrollEnd");
    fallback = true;
    await sleep(600);
  }
  return { steps, byFinger: steps.length > 0 && steps.at(-1).scrollY > 0, fallbackToScript: fallback };
}
async function runScenario(ctx, pageId, sc) {
  const res = { name: sc.name, mode: ctx.mode, steps: [], actions: [], errors: [] };
  const measure = async (label) => {
    const m = await hub.cmd(pageId, "measure", { label }, 10_000);
    res.steps.push({ label, m });
    return m;
  };
  const p = await goTo(ctx, pageId, sc.path);
  if (!p) {
    res.errors.push(`no page at ${sc.path}`);
    return { res, pageId };
  }
  pageId = p.id;
  if (sc.scroll !== "none") res.scroll = await scrollByFinger(ctx, pageId, sc.scroll);
  // Fresh calibration for this page and scroll position (where the page sits on the screen can move
  // with Safari's toolbars and the keyboard).
  let cal = await calibrate(ctx, pageId);
  if (sc.keyboard) {
    const tap = await tapElement(ctx, pageId, { selector: SEL.field, why: "text field" });
    await sleep(1800);
    await measure("keyboard-up");
    await shot(ctx, `${sc.name}-keyboard`);
    await hub.cmd(pageId, "blur");
    await sleep(1500);
    res.actions.push({ action: "keyboard", tap });
    cal = await calibrate(ctx, pageId);
  }
  res.calibration = cal.ok ? { scale: cal.scale, off: cal.off, firstType: cal.samples[0]?.firstType } : { ok: false, reason: cal.reason };
  const before = await measure("before");
  res.screens = { before: await shot(ctx, `${sc.name}-before`) };
  if (sc.popup) return popupScenario(ctx, pageId, sc, res, measure, before);
  // Open: one tap on the avatar.
  let since = Date.now();
  let tap = await tapElement(ctx, pageId, { selector: SEL.button, axPrefix: AX_BUTTON_PREFIX, why: "avatar", prefer: "ax" });
  let opened = await hub.waitEvent((e) => e.page === pageId && e.type === "menu-open", since, 6000);
  if (!opened) {
    since = Date.now();
    tap = { ...(await tapElement(ctx, pageId, { selector: SEL.button, why: "avatar, again" })), retry: true };
    opened = await hub.waitEvent((e) => e.page === pageId && e.type === "menu-open", since, 6000);
  }
  if (!opened) {
    res.errors.push("the menu did not open from a tap on the screen; opened by script instead");
    since = Date.now();
    await hub.cmd(pageId, "click", { selector: SEL.button });
    opened = await hub.waitEvent((e) => e.page === pageId && e.type === "menu-open", since, 6000);
    res.opened = opened ? "script" : false;
  } else res.opened = "finger";
  res.openTap = tap;
  if (!opened) return { res, pageId };
  await sleep(900);
  const open = await measure("open");
  res.screens.open = await shot(ctx, `${sc.name}-open`);
  await sleep(1200);
  await measure("open-settled");
  res.pageMovedOnOpen = before?.viewport && open?.viewport ? Math.abs(open.viewport.scrollY - before.viewport.scrollY) : null;
  for (const act of sc.after) {
    if (budgetLeft() < 4 * 60_000) break;
    // Every action starts in the open menu (a tap where × was would land on the page behind).
    const now = await hub.cmd(pageId, "measure", { label: `before-${act}` });
    if (!now?.menu?.shown) {
      res.actions.push({ action: act, skipped: "the menu is not open" });
      continue;
    }
    if (act === "inner-swipe") {
      const menu = open?.menu;
      const scroller = menu?.scrollables?.[0];
      const region = scroller?.rect ?? menu?.rect;
      if (region && ctx.map?.ok) {
        const a = toScreen(ctx.map, { x: region.x + region.w / 2, y: region.y + region.h * 0.75 });
        const b = toScreen(ctx.map, { x: region.x + region.w / 2, y: region.y + region.h * 0.3 });
        await swipe(ctx, a, b, 0.35);
        await sleep(900);
        const m = await measure("after-inner-swipe");
        res.actions.push({ action: "inner-swipe", scrolled: !!scroller, pageScrollYBefore: open.viewport.scrollY, pageScrollYAfter: m?.viewport?.scrollY, menuStillOpen: !!m?.menu?.shown });
        await shot(ctx, `${sc.name}-after-inner-swipe`);
      }
    }
    if (act === "close") {
      since = Date.now();
      const t = await tapElement(ctx, pageId, { selector: SEL.close, axLabel: "Close", why: "close" });
      const closed = await hub.waitEvent((e) => e.page === pageId && e.type === "menu-closed", since, 5000);
      const m = await measure("after-close");
      res.actions.push({ action: "close", tap: t, closed: !!closed, pageScrollY: m?.viewport?.scrollY, before: before?.viewport?.scrollY, focus: m?.focus });
      await shot(ctx, `${sc.name}-closed`);
    }
    if (act === "backdrop") {
      const menu = open?.menu?.rect;
      const tabTop = open?.tabbar?.y ?? open?.viewport?.innerHeight;
      if (menu && ctx.map?.ok && tabTop - menu.bottom > 60) {
        since = Date.now();
        const p2 = toScreen(ctx.map, { x: open.viewport.innerWidth / 2, y: (menu.bottom + tabTop) / 2 });
        await tapAt(ctx, p2, "dimmed page");
        const closed = await hub.waitEvent((e) => e.page === pageId && e.type === "menu-closed", since, 5000);
        const m = await measure("after-backdrop");
        res.actions.push({ action: "backdrop", closed: !!closed, pageScrollY: m?.viewport?.scrollY, before: before?.viewport?.scrollY });
      } else res.actions.push({ action: "backdrop", skipped: "no dimmed page below the menu" });
    }
    if (act === "tile") {
      const list = (await hub.cmd(pageId, "menuControls"))?.controls ?? [];
      const here = (open?.path ?? "").split("?")[0];
      const tile = list.find((c) => c.tag === "a" && c.href && c.href.startsWith("/") && c.href.split("?")[0] !== here && c.visible && c.hit);
      if (tile && ctx.map?.ok) {
        since = Date.now();
        await tapAt(ctx, toScreen(ctx.map, { x: tile.rect.x + tile.rect.w / 2, y: tile.rect.y + tile.rect.h / 2 }), `tile ${tile.href}`);
        const target = tile.href.split("?")[0];
        const moved = await hub.waitFor(() => {
          const e = hub.event((x) => (x.type === "nav" || x.type === "hello" || x.type === "ready") && String(x.data?.path ?? "").startsWith(target), since);
          if (e) return e;
          const same = hub.pages.get(pageId);
          return same && String(same.path ?? "").startsWith(target) ? { page: pageId, type: "poll" } : null;
        }, 10_000);
        await sleep(1500);
        res.actions.push({ action: "tile", href: tile.href, navigated: !!moved, controls: list.length, unreachable: list.filter((c) => !c.visible || !c.hit).map((c) => c.testid ?? c.href ?? c.tag) });
        await shot(ctx, `${sc.name}-after-tile`);
        if (moved && moved.page !== pageId) pageId = moved.page;
      } else res.actions.push({ action: "tile", skipped: "no tile to follow", controls: list.length });
    }
    if (act === "install") {
      since = Date.now();
      const t = await tapElement(ctx, pageId, { selector: `${SEL.menu} ${SEL.install}`, why: "Install App" });
      const win = await hub.waitEvent((e) => e.page === pageId && e.type === "dialog-open", since, 6000);
      res.actions.push({ action: "install", tap: t, opened: !!win, window: win?.data?.dialogs?.[0] ?? null });
      await shot(ctx, `${sc.name}-install-window`);
      if (win) {
        since = Date.now();
        const c = await tapElement(ctx, pageId, { selector: "[data-testid=install-window] [aria-label=Close]", axLabel: "Close", why: "install close" });
        const gone = await hub.waitEvent((e) => e.page === pageId && e.type === "dialog-closed", since, 5000);
        res.actions.push({ action: "install-close", tap: c, closed: !!gone });
      }
    }
  }
  // Leave nothing open for the next scenario.
  const last = await hub.cmd(pageId, "measure", { label: "end" });
  if (last?.menu?.shown) await hub.cmd(pageId, "click", { selector: SEL.close });
  if (last?.dialogs?.length) await hub.cmd(pageId, "click", { selector: "dialog[open] [aria-label=Close]" });
  if (last?.menu?.shown || last?.dialogs?.length) await sleep(800);
  return { res, pageId };
}

/** Any other window: opened by a tap on `popup.open`, measured (the agent's `dialogs`), closed by `popup.close`. */
async function popupScenario(ctx, pageId, sc, res, measure, before) {
  res.kind = "popup";
  let since = Date.now();
  res.openTap = await tapElement(ctx, pageId, { selector: sc.popup.open, why: sc.name });
  let win = await hub.waitEvent((e) => e.page === pageId && e.type === "dialog-open", since, 6000);
  res.opened = win ? "finger" : false;
  if (!win) {
    res.errors.push("the window did not open from a tap on the screen; opened by script instead");
    since = Date.now();
    await hub.cmd(pageId, "click", { selector: sc.popup.open });
    win = await hub.waitEvent((e) => e.page === pageId && e.type === "dialog-open", since, 6000);
    res.opened = win ? "script" : false;
  }
  if (!win) return { res, pageId };
  const open = await measure("open");
  res.screens.open = await shot(ctx, `${sc.name}-open`);
  res.pageMovedOnOpen = before?.viewport && open?.viewport ? Math.abs(open.viewport.scrollY - before.viewport.scrollY) : null;
  const w = open?.dialogs?.[0];
  const region = w?.scrollables?.[0]?.rect ?? w?.rect;
  if (region && ctx.map?.ok) {
    await swipe(ctx, toScreen(ctx.map, { x: region.x + region.w / 2, y: region.y + region.h * 0.75 }), toScreen(ctx.map, { x: region.x + region.w / 2, y: region.y + region.h * 0.3 }), 0.35);
    await sleep(900);
    const m = await measure("after-inner-swipe");
    res.actions.push({ action: "inner-swipe", scrolled: !!w?.scrollables?.length, pageScrollYBefore: open.viewport.scrollY, pageScrollYAfter: m?.viewport?.scrollY, stillOpen: (m?.dialogs?.length ?? 0) > 0 });
  }
  since = Date.now();
  const c = await tapElement(ctx, pageId, { selector: sc.popup.close, axLabel: sc.popup.closeLabel ?? "Close", why: `${sc.name} close` });
  const gone = await hub.waitEvent((e) => e.page === pageId && e.type === "dialog-closed", since, 5000);
  const after = await measure("after-close");
  res.actions.push({ action: "close", tap: c, closed: !!gone, pageScrollY: after?.viewport?.scrollY, before: before?.viewport?.scrollY });
  await shot(ctx, `${sc.name}-closed`);
  if (after?.dialogs?.length) {
    await hub.cmd(pageId, "click", { selector: sc.popup.close });
    await sleep(800);
  }
  return { res, pageId };
}

// ---- modes -------------------------------------------------------------------------------------------
async function safariPhase(ctx) {
  ctx.mode = "safari";
  const ph = { mode: "safari", scenarios: [] };
  let since = Date.now();
  await simctl(["openurl", ctx.udid, `${ORIGIN}/team`], { timeout: 90_000, allowFail: true });
  let page = await hub.waitPage({ since, pathPrefix: "/", timeout: 90_000 });
  if (!page) {
    await shot(ctx, "no-page");
    await describe(ctx, "no-page");
    // A first-launch sheet in Safari's own UI (never seen on 26.x so far; labels guessed).
    const tree = await describe(ctx);
    const btn = tree.nodes.find((n) => visible(n) && !n.web && labelIn(n, ["Continue", "Not Now", "OK", "Done", "Dismiss", "Close"]));
    if (btn) await tapAt(ctx, centre(btn.frame), "first-launch prompt");
    since = Date.now();
    await simctl(["openurl", ctx.udid, `${ORIGIN}/team`], { timeout: 90_000, allowFail: true });
    page = await hub.waitPage({ since, pathPrefix: "/", timeout: 60_000 });
  }
  if (!page) {
    ph.error = "Safari never loaded a page through the proxy";
    return ph;
  }
  ph.info = await hub.cmd(page.id, "info");
  if (ph.info?.screen?.width) ctx.screen = { w: ph.info.screen.width, h: ph.info.screen.height };
  ph.firstScreen = await shot(ctx, "first-load");
  const tree = await describe(ctx, "safari-first-load");
  ph.webContentInAxTree = tree.nodes.some((n) => n.web);
  ctx.webFlag = ph.webContentInAxTree;
  ph.avatarInAxTree = tree.nodes.some((n) => String(n.label ?? "").startsWith(AX_BUTTON_PREFIX));
  ph.avatarFlaggedWeb = tree.nodes.some((n) => n.web && String(n.label ?? "").startsWith(AX_BUTTON_PREFIX));
  log(`safari: web content flagged in the accessibility tree: ${ph.webContentInAxTree}; avatar found by label: ${ph.avatarInAxTree} (flagged web: ${ph.avatarFlaggedWeb})`);
  let pageId = page.id;
  ph.firstCalibration = await calibrate(ctx, pageId);
  if (!ph.firstCalibration.ok) {
    // Something of Safari's own may cover the page on a first launch (labels guessed; see ax/).
    const t2 = await describe(ctx, "safari-no-touch");
    const btn = t2.nodes.find((n) => visible(n) && !n.web && labelIn(n, ["Continue", "Not Now", "OK", "Done", "Dismiss", "Close", "Keep Bottom Tab Bar", "Compact"]));
    if (btn) await tapAt(ctx, centre(btn.frame), `prompt "${btn.label}"`);
    await sleep(1000);
    ph.firstCalibration = await calibrate(ctx, pageId);
  }
  const only = ctx.scenarios;
  for (const sc of SCENARIOS) {
    if (only && !only.has(sc.name)) continue;
    if (sc.modes && !sc.modes.includes("safari")) continue;
    if (budgetLeft() < 5 * 60_000) {
      ph.cut = "time budget";
      break;
    }
    const { res, pageId: next } = await runScenario(ctx, pageId, sc);
    ph.scenarios.push(res);
    pageId = next;
  }
  ctx.safariPage = pageId;
  return ph;
}

const SHARE_STEPS = {
  pageMenu: ["Page Menu", "More", "More Options", "Show Page Menu", "Tab Options", "..."],
  share: ["Share"],
  addToHome: ["Add to Home Screen"],
  moreActions: ["More", "Edit Actions...", "View More", "Show More"],
  add: ["Add"],
  webAppSwitch: ["Open as Web App"],
};
async function addToHomeScreen(ctx) {
  const trail = [];
  for (let i = 0; i < 9; i++) {
    const t = await describe(ctx, `a2hs-${i}`);
    if (!t.ok) return { ok: false, trail, error: t.error };
    const chrome = t.nodes.filter((n) => visible(n) && !n.web && /button|cell|menu|link|switch|toggle|icon/i.test(`${n.type} ${n.role} ${n.roleDescription}`));
    const find = (labels, pred = () => true) => chrome.find((n) => labelIn(n, labels) && pred(n));
    const add = find(SHARE_STEPS.add, (n) => n.frame.y < ctx.screen.h * 0.25);
    const sw = find(SHARE_STEPS.webAppSwitch);
    if (add && trail.includes("add-to-home-screen")) {
      if (sw && String(sw.value) === "0") {
        await tapAt(ctx, centre(sw.frame), "Open as Web App on");
        trail.push("web-app-switch-on");
        await sleep(600);
      }
      trail.push(`web-app-switch=${sw ? sw.value : "absent"}`);
      await tapAt(ctx, centre(add.frame), "Add");
      trail.push("add");
      await sleep(2500);
      return { ok: true, trail };
    }
    const a2hs = find(SHARE_STEPS.addToHome);
    if (a2hs) {
      await tapAt(ctx, centre(a2hs.frame), "Add to Home Screen");
      trail.push("add-to-home-screen");
      await sleep(1800);
      continue;
    }
    const share = !trail.includes("share") && find(SHARE_STEPS.share);
    if (share) {
      await tapAt(ctx, centre(share.frame), "Share");
      trail.push("share");
      await sleep(2000);
      continue;
    }
    const menu = !trail.includes("page-menu") && find(SHARE_STEPS.pageMenu, (n) => n.frame.y > ctx.screen.h * 0.55 || n.frame.y < 120);
    if (menu) {
      await tapAt(ctx, centre(menu.frame), `page menu "${menu.label}"`);
      trail.push("page-menu");
      await sleep(1500);
      continue;
    }
    if (trail.includes("share")) {
      const more = !trail.includes("more-actions") && find(SHARE_STEPS.moreActions);
      if (more) {
        await tapAt(ctx, centre(more.frame), "share sheet: more");
        trail.push("more-actions");
        await sleep(1500);
        continue;
      }
      // The action list may be below the sheet's first height: pull the sheet up.
      await swipe(ctx, { x: ctx.screen.w / 2, y: ctx.screen.h * 0.85 }, { x: ctx.screen.w / 2, y: ctx.screen.h * 0.35 }, 0.4);
      trail.push("sheet-swipe");
      await sleep(1200);
      continue;
    }
    trail.push("nothing-to-tap");
    break;
  }
  await shot(ctx, "a2hs-stuck");
  return { ok: false, trail };
}
async function webclips(ctx) {
  const data = path.join(os.homedir(), "Library/Developer/CoreSimulator/Devices", ctx.udid, "data");
  const found = await run("find", [data, "-maxdepth", "7", "-name", "*.webclip", "-type", "d"], { allowFail: true, quiet: true, timeout: 60_000 });
  const dirs = found.stdout.split("\n").filter(Boolean);
  const out = [];
  for (const d of dirs) {
    const files = await fs.readdir(d).catch(() => []);
    const plist = await run("plutil", ["-convert", "xml1", "-o", "-", path.join(d, "Info.plist")], { allowFail: true, quiet: true });
    const name = slug(path.basename(d));
    if (plist.ok) await fs.writeFile(path.join(ctx.dir, `webclip-${name}.plist.xml`), plist.stdout);
    out.push({ dir: path.relative(data, d), files, plist: plist.ok ? `webclip-${name}.plist.xml` : null });
  }
  return out;
}
/** GUESS: a web clip written straight into the data container (format unverified on iOS 26/27). */
async function seedWebclip(ctx, title) {
  const dir = path.join(os.homedir(), "Library/Developer/CoreSimulator/Devices", ctx.udid, "data/Library/WebClips", `${crypto.randomUUID().replace(/-/g, "").toUpperCase()}.webclip`);
  await fs.mkdir(dir, { recursive: true });
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Title</key><string>${esc(title)}</string>
<key>URL</key><string>${esc(`${ORIGIN}/team`)}</string>
<key>FullScreen</key><true/>
<key>IgnoreManifestScope</key><false/>
<key>IsAppClip</key><false/>
<key>ClassicMode</key><false/>
<key>Removable</key><true/>
</dict></plist>`;
  await fs.writeFile(path.join(dir, "Info.plist"), plist);
  const icon = await fetch(`http://127.0.0.1:${APP_PORT}/icons/icon-192.png`).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null);
  if (icon) await fs.writeFile(path.join(dir, "icon.png"), Buffer.from(icon));
  // SpringBoard reads web clips when it starts.
  await simctl(["shutdown", ctx.udid], { timeout: 120_000, allowFail: true });
  await simctl(["boot", ctx.udid], { timeout: 180_000, allowFail: true });
  await simctl(["bootstatus", ctx.udid, "-b"], { timeout: 420_000, allowFail: true });
  return { seeded: true, guess: true };
}
async function launchFromIcon(ctx, title) {
  await home(ctx);
  for (let pageNo = 0; pageNo < 3; pageNo++) {
    const t = await describe(ctx, `home-${pageNo}`);
    const icons = t.nodes.filter((n) => visible(n) && !n.web);
    const known = new Set(ctx.homeBaseline ?? []);
    const hit = icons.find((n) => title && norm(n.label) === norm(title)) ?? icons.find((n) => title && norm(n.label).startsWith(norm(title).slice(0, 6))) ?? icons.find((n) => n.label && !known.has(n.label) && /icon|button/i.test(`${n.type} ${n.role}`));
    if (hit) {
      const since = Date.now();
      await tapAt(ctx, centre(hit.frame), "web app icon");
      const page = await hub.waitPage({ since, standalone: true, timeout: 45_000 });
      if (page) return { ok: true, page, iconPage: pageNo };
      const any = await hub.waitPage({ since, timeout: 5000 });
      return { ok: false, reason: any ? "the icon opened a page that is not standalone (Safari?)" : "no page after tapping the icon", iconPage: pageNo };
    }
    await swipe(ctx, { x: ctx.screen.w * 0.85, y: ctx.screen.h * 0.5 }, { x: ctx.screen.w * 0.15, y: ctx.screen.h * 0.5 }, 0.3);
    await sleep(1000);
  }
  return { ok: false, reason: "no web app icon on the first three Home Screen pages" };
}
async function standalonePhase(ctx) {
  ctx.mode = "standalone";
  const ph = { mode: "standalone", scenarios: [] };
  // From Safari, on the Team page (the clip's address; the manifest's start_url may override it).
  await simctl(["launch", ctx.udid, "com.apple.mobilesafari"], { allowFail: true, timeout: 60_000 });
  await sleep(1500);
  let safariPage = ctx.safariPage ? hub.pages.get(ctx.safariPage) : null;
  if (!safariPage || Date.now() - safariPage.last > 3000) {
    const since = Date.now();
    await simctl(["openurl", ctx.udid, `${ORIGIN}/team`], { timeout: 90_000, allowFail: true });
    safariPage = await hub.waitPage({ since, timeout: 60_000 });
  }
  if (safariPage && !String(safariPage.path ?? "").startsWith("/team")) safariPage = (await goTo(ctx, safariPage.id, "/team", false)) ?? safariPage;
  const info = safariPage ? await hub.cmd(safariPage.id, "info") : null;
  const title = info?.appTitle ?? null;
  ph.safariPage = !!safariPage;
  ph.add = await addToHomeScreen(ctx);
  ph.webclips = await webclips(ctx);
  if (!ph.add.ok && !ph.webclips.length) ph.seed = await seedWebclip(ctx, title ?? "UNIIVERSE");
  ph.launch = await launchFromIcon(ctx, title);
  if (!ph.launch.ok) {
    await shot(ctx, "no-web-app");
    ph.error = ph.launch.reason;
    return ph;
  }
  let pageId = ph.launch.page.id;
  ph.info = await hub.cmd(pageId, "info");
  ph.firstScreen = await shot(ctx, "web-app-first");
  ph.firstMeasure = await hub.cmd(pageId, "measure", { label: "web-app-first" });
  for (const sc of SCENARIOS) {
    if (ctx.scenarios && !ctx.scenarios.has(sc.name)) continue;
    if (sc.modes && !sc.modes.includes("standalone")) continue;
    if (budgetLeft() < 5 * 60_000) {
      ph.cut = "time budget";
      break;
    }
    const { res, pageId: next } = await runScenario(ctx, pageId, sc);
    ph.scenarios.push(res);
    pageId = next;
  }
  return ph;
}

// ---- cross-check with Apple's safaridriver (no proxy, no AXe) --------------------------------------
async function wd(method, p, body, timeout = 60_000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(`http://127.0.0.1:${WD_PORT}${p}`, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined, signal: ctl.signal });
    const j = await r.json().catch(() => ({}));
    return { status: r.status, value: j.value };
  } catch (e) {
    return { status: 0, value: { error: "request", message: String(e.message) } };
  } finally {
    clearTimeout(t);
  }
}
async function webdriverPhase(ctx) {
  ctx.mode = "webdriver";
  const ph = { mode: "webdriver" };
  await simctl(["launch", ctx.udid, "com.apple.mobilesafari"], { allowFail: true, timeout: 60_000 });
  await sleep(2000);
  const logFile = createWriteStream(path.join(ctx.dir, "safaridriver.log"));
  const drv = spawn("safaridriver", ["-p", String(WD_PORT), "--diagnose"], { stdio: ["ignore", "pipe", "pipe"] });
  drv.stdout.pipe(logFile);
  drv.stderr.pipe(logFile);
  try {
    let up = false;
    for (let i = 0; i < 20 && !up; i++) {
      await sleep(500);
      up = (await wd("GET", "/status", null, 3000)).status === 200;
    }
    if (!up) return { ...ph, error: "safaridriver did not start" };
    const caps = { capabilities: { alwaysMatch: { platformName: "iOS", browserName: "Safari", "safari:useSimulator": true, "safari:deviceUDID": ctx.udid } } };
    const t0 = Date.now();
    let s = await wd("POST", "/session", caps, 150_000);
    if (!s.value?.sessionId) {
      ph.firstAttempt = { status: s.status, error: s.value?.error, message: String(s.value?.message ?? "").slice(0, 300) };
      await sleep(3000);
      s = await wd("POST", "/session", caps, 150_000); // runner-images#1453: the first attempt sometimes fails
    }
    ph.sessionMs = Date.now() - t0;
    if (!s.value?.sessionId) return { ...ph, error: `${s.value?.error ?? s.status}: ${String(s.value?.message ?? "").slice(0, 300)}` };
    const sid = s.value.sessionId;
    ph.capabilities = s.value.capabilities;
    const exec = (fn, args = []) => wd("POST", `/session/${sid}/execute/sync`, { script: `window.__SIM_AGENT_CONFIG__={poll:false,selectors:${JSON.stringify({ button: SEL.button, menu: SEL.menu, close: SEL.close })}};\n${AGENT_SRC}\n${fn}`, args });
    const find = async (css) => {
      const r = await wd("POST", `/session/${sid}/element`, { using: "css selector", value: css });
      return r.status === 200 && r.value ? Object.values(r.value)[0] : null;
    };
    const click = async (css) => {
      const id = await find(css);
      return id ? (await wd("POST", `/session/${sid}/element/${id}/click`, {})).status === 200 : false;
    };
    const app = `http://localhost:${APP_PORT}`;
    ph.steps = [];
    await wd("POST", `/session/${sid}/url`, { url: `${app}/team` }, 90_000);
    await wd("POST", `/session/${sid}/cookie`, { cookie: { name: VIEW_COOKIE.split("=")[0], value: VIEW_COOKIE.split("=")[1], path: "/" } });
    for (const [label, route, scroll] of [
      ["team-top", "/team", false],
      ["resources-end", "/resources", true],
    ]) {
      await wd("POST", `/session/${sid}/url`, { url: `${app}${route}` }, 90_000);
      await sleep(2500);
      if (scroll) await exec("window.scrollTo(0, document.documentElement.scrollHeight); return window.scrollY;");
      await sleep(600);
      const before = (await exec("return window.__simAgent.measure(arguments[0]);", [`${label}-before`])).value;
      const clicked = await click(SEL.button);
      await sleep(1500);
      const open = (await exec("return window.__simAgent.measure(arguments[0]);", [`${label}-open`])).value;
      await shot(ctx, `${label}-open`);
      const shotB64 = (await wd("GET", `/session/${sid}/screenshot`)).value;
      if (typeof shotB64 === "string") await fs.writeFile(path.join(ctx.dir, "screens", `webdriver-${label}-page.png`), Buffer.from(shotB64, "base64"));
      const closed = await click(SEL.close);
      await sleep(800);
      const after = (await exec("return window.__simAgent.measure(arguments[0]);", [`${label}-closed`])).value;
      ph.steps.push({ label, clicked, closed, before, open, after });
    }
    await wd("DELETE", `/session/${sid}`, null, 30_000);
    return ph;
  } finally {
    drv.kill("SIGTERM");
    await sleep(500);
    logFile.end();
  }
}

// ---- one device ----------------------------------------------------------------------------------------
async function runDevice(inv, entry, index) {
  const runtime = pickRuntime(inv, entry.runtime);
  const deviceType = runtime ? pickDeviceType(inv, runtime, entry.device) : null;
  const result = { plan: entry, runtime: runtime ? { version: runtime.version, build: runtime.buildversion, identifier: runtime.identifier } : null, deviceType: deviceType ? { name: deviceType.name, identifier: deviceType.identifier } : null, phases: {} };
  if (!runtime || !deviceType) {
    result.error = !runtime ? `no iOS runtime matches "${entry.runtime}"` : `no device type in "${entry.device}" for iOS ${runtime.version}`;
    log(`plan ${index}: ${result.error}`);
    return result;
  }
  const ctx = { slug: `${index}-${slug(deviceType.name)}-ios${slug(runtime.version)}`, runtime, deviceType, index };
  ctx.dir = path.join(OUT, ctx.slug);
  await fs.mkdir(ctx.dir, { recursive: true });
  ctx.screen = (await screenOf(deviceType)) ?? { w: 402, h: 874 };
  result.slug = ctx.slug;
  result.screenPoints = ctx.screen;
  ctx.modes = new Set(String(entry.modes ?? [...MODES].join(",")).split(",").map((m) => m.trim()).filter((m) => MODES.has(m)));
  ctx.scenarios = entry.scenarios ? new Set(String(entry.scenarios).split(",").map((x) => x.trim())) : null;
  try {
    await bootFresh(ctx);
    result.bootMs = ctx.bootMs;
    await startVideo(ctx);
    ctx.mode = "setup";
    await home(ctx);
    let base = await describe(ctx, "home-baseline");
    if (!base.ok) {
      log(`device ${ctx.slug}: AXe could not read the simulator (${base.error}); opening the simulator host app`);
      await openSimulatorHost(ctx);
      result.openedHostApp = true;
      await home(ctx);
      base = await describe(ctx, "home-baseline-retry");
    }
    result.axe = { ok: base.ok, nodes: base.nodes.length, error: base.error };
    if (base.screen) ctx.screen = base.screen;
    ctx.homeBaseline = base.nodes.map((n) => n.label).filter(Boolean);
    log(`device ${ctx.slug}: AXe ${base.ok ? `sees ${base.nodes.length} elements on the Home Screen` : `FAILED: ${base.error}`}; screen ${ctx.screen.w}x${ctx.screen.h} pt`);
    const modes = ctx.modes;
    if (modes.has("safari") && base.ok) result.phases.safari = await safariPhase(ctx);
    if (modes.has("standalone") && base.ok && budgetLeft() > 6 * 60_000) result.phases.standalone = await standalonePhase(ctx);
    if (modes.has("webdriver") && budgetLeft() > 4 * 60_000) result.phases.webdriver = await webdriverPhase(ctx);
  } catch (e) {
    result.error = String(e.message).slice(0, 400);
    log(`device ${ctx.slug}: ${result.error}`);
    if (ctx.udid) await shot(ctx, "error");
  } finally {
    await stopVideo(ctx);
    if (ctx.udid) await simctl(["shutdown", ctx.udid], { timeout: 120_000, allowFail: true });
  }
  return result;
}

// ---- the summary: numbers only -------------------------------------------------------------------------
function row(device, mode, sc) {
  const open = sc.steps.find((s) => s.label === "open")?.m;
  const v = open?.viewport;
  const u = open?.units;
  const menu = sc.kind === "popup" ? open?.dialogs?.[0] : open?.menu;
  const kids = menu?.children ?? [];
  const ok = menu?.controls ? `${menu.controls.filter((c) => c.visible && c.hit).length}/${menu.controls.length}` : "-";
  const f = (n) => (n === undefined || n === null ? "-" : String(n));
  return `| ${device} | ${mode} | ${sc.name} | ${sc.opened ?? "no"} | ${f(v?.innerHeight)} / ${f(v?.clientHeight)} / ${f(v?.vv?.height)} | ${f(u?.svh)} / ${f(u?.dvh)} / ${f(u?.lvh)} | ${f(u?.safe?.top)} / ${f(u?.safe?.bottom)} | ${f(menu?.rect?.y)} | ${f(menu?.rect?.h)} | ${f(menu?.style?.["max-height"])} | ${kids.map((k) => `${f(k.rect?.h)}(${f(k.clientHeight)}/${f(k.scrollHeight)})`).join(" + ")} | ${f(menu?.vars?.vvTop)} / ${f(menu?.vars?.vvBottom)} | ${ok} | ${f(menu?.scrollables?.length)} | ${f(sc.pageMovedOnOpen)} |`;
}
function summarize(all) {
  const lines = [];
  const count = (type) => hub.events.filter((e) => e.type === type).length;
  lines.push(`# iOS Simulator: account menu`, "", `Image: ${env.ImageOS ?? "?"} ${env.ImageVersion ?? ""}; driver ran ${elapsed()}; proxy: ${JSON.stringify(hub.stats)}`, "");
  lines.push(`Page errors ${count("page-error")}, console errors ${count("console-error")}, agent errors ${count("agent-error")} (messages in metrics.json, events).`, "");
  lines.push("## Checks", "");
  for (const d of all.devices) {
    const s = d.phases?.safari;
    const a = d.phases?.standalone;
    const w = d.phases?.webdriver;
    lines.push(`- ${d.slug ?? d.plan.device}: ${d.error ? `ERROR ${d.error}` : `boot ${d.bootMs ?? "?"} ms; AXe ${d.axe?.ok ? "ok" : "failed"}; Safari ${s ? (s.error ?? `${s.scenarios.length} scenarios; web content in AX tree ${s.webContentInAxTree}; avatar by label ${s.avatarInAxTree}`) : "not run"}; Home Screen app ${a ? (a.error ? `failed: ${a.error}` : `ok (add: ${a.add?.trail?.join(" > ")}${a.seed ? "; SEEDED BUNDLE (guess)" : ""}; standalone ${a.info?.standalone})`) : "not run"}; safaridriver ${w ? (w.error ? `failed: ${w.error}` : `ok (${w.sessionMs} ms to a session)`) : "not run"}`}`);
  }
  lines.push("", "## The menu when open (CSS px)", "");
  lines.push("| device | mode | scenario | opened by | innerH / clientH / vv.h | svh / dvh / lvh | safe top / bottom | menu top | menu h | max-height | children h (client/scroll) | --vv-top / --vv-bottom | controls ok | scrollers | page moved |");
  lines.push("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const d of all.devices) for (const mode of ["safari", "standalone"]) for (const sc of d.phases?.[mode]?.scenarios ?? []) lines.push(row(d.slug, mode, sc));
  for (const d of all.devices) {
    const w = d.phases?.webdriver;
    for (const st of w?.steps ?? []) {
      const m = st.open?.menu;
      lines.push(`| ${d.slug} | webdriver | ${st.label} | ${st.clicked ? "click" : "no"} | ${st.open?.viewport?.innerHeight ?? "-"} / ${st.open?.viewport?.clientHeight ?? "-"} / ${st.open?.viewport?.vv?.height ?? "-"} | ${st.open?.units?.svh ?? "-"} / ${st.open?.units?.dvh ?? "-"} / ${st.open?.units?.lvh ?? "-"} | ${st.open?.units?.safe?.top ?? "-"} / ${st.open?.units?.safe?.bottom ?? "-"} | ${m?.rect?.y ?? "-"} | ${m?.rect?.h ?? "-"} | ${m?.style?.["max-height"] ?? "-"} | ${(m?.children ?? []).map((k) => `${k.rect?.h}(${k.clientHeight}/${k.scrollHeight})`).join(" + ")} | ${m?.vars?.vvTop ?? "-"} / ${m?.vars?.vvBottom ?? "-"} | ${m?.controls ? `${m.controls.filter((c) => c.visible && c.hit).length}/${m.controls.length}` : "-"} | ${m?.scrollables?.length ?? "-"} | - |`);
    }
  }
  lines.push("", "Artifacts: per device a folder with screens/, ax/ (accessibility trees), video.mp4, webclip plists; metrics.json holds every measurement.");
  return lines.join("\n");
}

// ---- main ------------------------------------------------------------------------------------------------
async function main() {
  await fs.mkdir(OUT, { recursive: true });
  logStream = createWriteStream(path.join(OUT, "driver.log"), { flags: "a" });
  log(`plan: ${JSON.stringify(PLAN)}; modes: ${[...MODES].join(",")}; budget ${BUDGET_MS / 60_000} min`);
  const health = await fetch(`http://127.0.0.1:${APP_PORT}/api/health`).then((r) => r.status).catch((e) => String(e.message));
  log(`app health: ${health}`);
  const servers = await startProxy();
  const viaProxy = await fetch(`http://127.0.0.1:${PROXY_PORT}/team`).then(async (r) => ({ status: r.status, injected: (await r.text()).includes("/__agent/agent.js") })).catch((e) => ({ error: String(e.message) }));
  log(`proxy self-check /team: ${JSON.stringify(viaProxy)}`);
  await simctl(["shutdown", "all"], { allowFail: true, timeout: 120_000 });
  const xcodeVersion = (await run("xcodebuild", ["-version"], { allowFail: true, quiet: true })).stdout.trim();
  XCODE_MAJOR = Number((xcodeVersion.match(/Xcode (\d+)/) ?? [])[1]) || 0;
  log(`${xcodeVersion.split("\n").join(", ")}`);
  const inv = await inventory();
  await writeJSON(path.join(OUT, "inventory.json"), { xcode: xcodeVersion, runtimes: inv.runtimes.map((r) => ({ version: r.version, build: r.buildversion, identifier: r.identifier, devices: (r.supportedDeviceTypes ?? []).map((d) => d.name) })), axe: (await run(AXE, ["--version"], { allowFail: true, quiet: true })).stdout.trim() });
  log(`iOS runtimes: ${inv.runtimes.map((r) => r.version).join(", ") || "none"}`);
  const all = { startedAt: new Date(T0).toISOString(), plan: PLAN, modes: [...MODES], devices: [] };
  for (let i = 0; i < PLAN.length; i++) {
    if (budgetLeft() < 8 * 60_000) {
      all.devices.push({ plan: PLAN[i], error: "skipped: time budget" });
      continue;
    }
    all.devices.push(await runDevice(inv, PLAN[i], i));
    await writeJSON(path.join(OUT, "metrics.json"), { ...all, events: hub.events });
  }
  all.proxy = hub.stats;
  await writeJSON(path.join(OUT, "metrics.json"), { ...all, events: hub.events });
  const summary = summarize(all);
  await fs.writeFile(path.join(OUT, "summary.md"), summary);
  console.log(summary);
  for (const s of servers) s.close();
  logStream.end();
  // A run that measured nothing at all fails the job; partial results still pass (read the summary).
  const measured = all.devices.some((d) => Object.values(d.phases ?? {}).some((p) => p.scenarios?.length || p.steps?.length));
  process.exitCode = measured ? 0 : 1;
}

export { flatten, pickRuntime, pickDeviceType, inject, Hub, summarize, cmpVersion };

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    log(`driver crashed: ${e.stack ?? e}`);
    process.exitCode = 1;
  });
}
