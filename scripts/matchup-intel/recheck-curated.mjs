#!/usr/bin/env node
/*
  OD6's per-patch re-check of Matchup Intel's curated notes against Riot's own sources
  (docs/MATCHUP_INTEL.md, "Freshness"): for each curated champion, Data Dragon at the version it was
  last checked or re-checked on against a newer version (every ability's cooldown, cost, ranks, range,
  description and tooltip, the passive, the base stats and Riot's tips), and Riot's patch notes for
  every patch between them (the champion's name, and each item or rune the notes name). It reads
  Riot's public CDN and Riot's patch notes only: never the League of Legends Wiki, whose Terms of Use
  forbid automated use without consent. It writes nothing: it prints what changed, and a person (or a
  session, through a reviewed pull request) then records `riotRecheck` on the files with no change, or
  re-checks the ones that changed. Champions with a change are also flagged on the page by
  themselves, ability by ability, from the per-version diff.

  Usage: node scripts/matchup-intel/recheck-curated.mjs [ddragonVersion]   (default: Riot's newest)
  RECHECK_FROM=16.21.1 compares from that version instead of each file's (to try the script itself).
*/
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const CURATED = path.join(ROOT, "src/server/matchup-intel/curated");
const CDN = "https://ddragon.leagueoflegends.com";

const get = async (url) => {
  const res = await fetch(url, { headers: { "User-Agent": "matchup-intel-recheck" } });
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  return res;
};
const json = async (url) => (await get(url)).json();
const minor = (v) => Number(v.split(".")[1]);
const publicPatch = (v) => `${Number(v.split(".")[0]) + 10}.${minor(v)}`;

/** Each curated file's champion(s) and the version its age counts from (the Riot re-check, else the check). */
function curatedFiles() {
  const out = [];
  for (const dir of ["champions", "matchups"]) {
    for (const f of readdirSync(path.join(CURATED, dir)).filter((x) => x.endsWith(".ts"))) {
      const text = readFileSync(path.join(CURATED, dir, f), "utf8");
      const base = process.env.RECHECK_FROM || (/riotRecheck:\s*\{[^}]*ddragonVersion:\s*"([\d.]+)"/.exec(text)?.[1] ?? /ddragonVersion:\s*"([\d.]+)"/.exec(text)?.[1]);
      const champions = f.replace(/\.ts$/, "").split("-vs-");
      out.push({ file: `${dir}/${f}`, champions, base, text });
    }
  }
  return out;
}

async function champion(version, id) {
  return (await json(`${CDN}/cdn/${version}/data/en_US/champion/${id}.json`)).data[id];
}

function diffChampion(a, b) {
  const out = [];
  for (const k of Object.keys(a.stats)) if (a.stats[k] !== b.stats[k]) out.push(`base stat ${k}: ${a.stats[k]} → ${b.stats[k]}`);
  a.spells.forEach((s, i) => {
    const t = b.spells[i];
    for (const f of ["id", "name", "maxrank", "cooldownBurn", "costBurn", "rangeBurn", "description", "tooltip"]) if (JSON.stringify(s[f]) !== JSON.stringify(t?.[f])) out.push(`${"QWER"[i]} ${f}${f.endsWith("Burn") || f === "maxrank" ? `: ${s[f]} → ${t?.[f]}` : " changed"}`);
  });
  if (a.passive.description !== b.passive.description) out.push("passive description changed");
  if (JSON.stringify([a.allytips, a.enemytips]) !== JSON.stringify([b.allytips, b.enemytips])) out.push("Riot's tips changed");
  return out;
}

async function patchNotesText(version) {
  const p = publicPatch(version).replace(".", "-");
  try {
    const html = await (await get(`https://www.leagueoflegends.com/en-us/news/game-updates/league-of-legends-patch-${p}-notes`)).text();
    return html.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ");
  } catch (err) {
    return { missing: err.message };
  }
}

const versions = await json(`${CDN}/api/versions.json`);
const target = process.argv[2] ?? versions[0];
const files = curatedFiles();
const names = new Set();
for (const v of [target]) {
  const items = Object.values((await json(`${CDN}/cdn/${v}/data/en_US/item.json`)).data).map((i) => i.name);
  const runes = (await json(`${CDN}/cdn/${v}/data/en_US/runesReforged.json`)).flatMap((t) => t.slots.flatMap((s) => s.runes.map((r) => r.name)));
  for (const n of [...items, ...runes]) if (n.length > 4) names.add(n);
}
console.log(`Re-check of the curated notes against Data Dragon ${target} (patch ${publicPatch(target)}) and Riot's patch notes.\n`);
const notesCache = new Map();
let changed = 0;
for (const f of files) {
  if (!f.base) {
    console.log(`${f.file}: no version found`);
    continue;
  }
  if (minor(f.base) >= minor(target) && f.base.split(".")[0] === target.split(".")[0]) {
    console.log(`${f.file}: already checked or re-checked for ${publicPatch(f.base)}`);
    continue;
  }
  const lines = [];
  for (const id of f.champions) for (const d of diffChampion(await champion(f.base, id), await champion(target, id))) lines.push(`${id}: ${d}`);
  const named = [...names].filter((n) => f.text.includes(n) && !["Opportunity"].includes(n));
  for (const v of versions.filter((x) => x.split(".")[0] === target.split(".")[0] && minor(x) > minor(f.base) && minor(x) <= minor(target))) {
    if (!notesCache.has(v)) notesCache.set(v, await patchNotesText(v));
    const text = notesCache.get(v);
    if (typeof text !== "string") {
      lines.push(`patch notes ${publicPatch(v)} could not be read (${text.missing}): check them by hand`);
      continue;
    }
    for (const n of [...f.champions, ...named]) if (new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(text)) lines.push(`patch notes ${publicPatch(v)} name ${n}: read that entry (it may be a game mode's)`);
  }
  if (lines.length) changed += 1;
  console.log(`${f.file} (from ${publicPatch(f.base)}): ${lines.length ? `\n  - ${lines.join("\n  - ")}` : "no change"}`);
}
console.log(`\n${changed} of ${files.length} files need a person's look; the others can record riotRecheck { patch: "${publicPatch(target)}", ddragonVersion: "${target}" }.`);
