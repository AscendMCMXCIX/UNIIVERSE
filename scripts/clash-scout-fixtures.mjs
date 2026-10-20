/**
 * Generates the synthetic Clash scouting screenshots Clash Scout's recognition tests read
 * (tests/fixtures/clash/*.png and expected.json). They imitate the client's two scouting screens:
 * a dark background, the opponent's team name as the title, five equal player panels with the
 * name, rank and three champion rows (round portraits with a gold frame). Real screenshots are not
 * committed (they show real players); these use synthetic portraits (portrait.mjs) and invented
 * names in several scripts. Development only:
 *   node scripts/clash-scout-fixtures.mjs   (uses the Chromium at PW_CHROMIUM_PATH or /opt/pw-browsers/chromium)
 */
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { portraitPixels } from "../tests/fixtures/clash/portrait.mjs";

const OUT = new URL("../tests/fixtures/clash/", import.meta.url);
const truth = {
  opponent: "Night Owls Gaming",
  players: [
    { name: "Пётр Пустота", rank: ["GOLD", "II", 54], ranked: [["Ahri", 63, 41, 3.21], ["Akali", 48, 25, 2.4], ["Annie", 71, 14, 4.05]], mastery: [["Ahri", 7, 512345], ["Annie", 6, 210004], ["Akali", 5, 98120]] },
    { name: "오징어게임", rank: ["EMERALD", "IV", 12], ranked: [["Amumu", 55, 60, 2.88], ["Diana", 52, 33, 3.1], ["Ekko", 40, 10, 1.95]], mastery: [["Amumu", 7, 1204400], ["Ekko", 7, 456700], ["Diana", 4, 40210]] },
    { name: "ドラゴンの心", rank: ["PLATINUM", "I", 87], ranked: [["Azir", 58, 52, 3.4], ["Corki", 50, 20, 2.75], ["Galio", 66, 9, 5.2]], mastery: [["Azir", 7, 801000], ["Galio", 5, 120330], ["Corki", 5, 60500]] },
    { name: "我是大魔王", rank: ["DIAMOND", "III", 3], ranked: [["Caitlyn", 61, 88, 3.05], ["Ezreal", 49, 35, 2.6], ["Draven", 57, 21, 2.9]], mastery: [["Caitlyn", 7, 2000150], ["Ezreal", 7, 950000], ["Draven", 6, 300700]] },
    { name: "xX_Sn1per_Xx", rank: ["MASTER", null, 213], ranked: [["Braum", 60, 77, 3.75], ["Bard", 53, 30, 3.33], ["Alistar", 45, 12, 2.1]], mastery: [["Braum", 7, 1500300], ["Bard", 7, 700100], ["Alistar", 6, 260900]] },
  ],
};

const CSS = `
  body{margin:0;background:radial-gradient(ellipse at top,#0a1c2e,#010a13 70%);color:#f0e6d2;font-family:'Liberation Sans','DejaVu Sans','WenQuanYi Zen Hei','IPAGothic',sans-serif}
  .title{position:absolute;left:64px;top:28px}
  .label{font-size:14px;letter-spacing:.2em;color:#a09b8c}
  .team{font-size:34px;font-weight:700;color:#f0e6d2;margin-top:6px}
  .row{position:absolute;left:64px;right:64px;top:150px;display:flex;gap:24px}
  .panel{flex:1;height:680px;background:linear-gradient(#0b1726,#071019);border:1px solid #1e2d3d;padding:22px 20px}
  .name{font-size:22px;font-weight:700;color:#f0e6d2}
  .rank{font-size:16px;color:#c8aa6e;margin-top:10px}
  .champs{margin-top:44px;display:flex;flex-direction:column;gap:30px}
  .champ{display:flex;align-items:center;gap:16px}
  canvas{width:58px;height:58px;border-radius:50%;border:2px solid #c8aa6e}
  .stat{font-size:16px;line-height:1.5;color:#cdbe91}
  .stat b{color:#f0e6d2;font-weight:600}`;

function html(kind) {
  const panels = truth.players
    .map((p, i) => {
      const [tier, div, lp] = p.rank;
      const rank = `${tier[0]}${tier.slice(1).toLowerCase()}${div ? ` ${div}` : ""} · ${lp} LP`;
      const rows = (kind === "ranked" ? p.ranked : p.mastery)
        .map(([id, a, b, c], j) => {
          const text = kind === "ranked" ? `<b>${a}%</b> · ${b} games<br>${c.toFixed(2)} KDA` : `<b>Mastery ${a}</b><br>${b.toLocaleString("en-US")} pts`;
          return `<div class="champ"><canvas data-id="${id}" width="120" height="120" id="c${i}${j}"></canvas><div class="stat">${text}</div></div>`;
        })
        .join("");
      return `<div class="panel"><div class="name">${p.name}</div><div class="rank">${rank}</div><div class="champs">${rows}</div></div>`;
    })
    .join("");
  return `<style>${CSS}</style><div class="title"><div class="label">CLASH · ${kind === "ranked" ? "RANKED" : "MASTERY"}</div><div class="team">${truth.opponent}</div></div><div class="row">${panels}</div>`;
}

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH ?? "/opt/pw-browsers/chromium" });
for (const [file, kind, width] of [
  ["ranked-1600.png", "ranked", 1600, 900],
  ["mastery-1600.png", "mastery", 1600, 900],
  ["ranked-1280.png", "ranked", 1280, 720],
]) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: width / 1600 });
  await page.setContent(html(kind));
  const ids = await page.$$eval("canvas", (cs) => cs.map((c) => c.dataset.id));
  for (const [k, id] of ids.entries()) {
    const px = portraitPixels(id);
    await page.evaluate(([k, data]) => {
      const c = document.querySelectorAll("canvas")[k];
      c.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(data), 120, 120), 0, 0);
    }, [k, [...px.data]]);
  }
  writeFileSync(new URL(file, OUT), await page.screenshot());
  await page.close();
}
await browser.close();
writeFileSync(new URL("expected.json", OUT), JSON.stringify(truth, null, 2) + "\n");
console.log("Clash Scout fixtures written.");
