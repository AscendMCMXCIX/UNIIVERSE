/**
 * Builds the offline copy of every champion's abilities (Champion Lookup) from Data Dragon's
 * championFull.json, stored where the server cannot reach Data Dragon (the offline champion
 * fixture, a demo without network): src/server/riot/fixtures/champion-abilities.fixture.json.
 * Also writes Data Dragon's own numbers for every champion, which abilities.test.ts holds the copy
 * to without championFull.json: tests/fixtures/ddragon-<version>-ability-digest.json.
 *
 *   node scripts/static/build-ability-fixture.mjs --from path/to/championFull.json
 *   node scripts/static/build-ability-fixture.mjs --version 16.22.1      (downloads it)
 *   add --check to compare with the committed files instead of writing them (exit 1 if one differs)
 *
 * Plain Node, no TypeScript step: the rules below are the same as compactChampionAbilities and
 * cleanDescription in src/server/riot/static/abilities.ts (which the app cannot import from
 * scripts/, and this script cannot import from TypeScript). abilities.test.ts holds the two to the
 * same results, on Data Dragon's own files and on made-up edge cases. When the rules change, bump
 * ABILITY_RULES_FORMAT in both and run this again.
 */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { z } from "zod";

export const ABILITY_RULES_FORMAT = 3;
export const DESCRIPTION_MAX = 400;
const CHAMPION_ID = /^[A-Za-z0-9]{1,40}$/;
const VERSION = /^\d{1,4}(?:\.\d{1,4}){1,3}$/;

/* ---------- The rules (the same as src/server/riot/static/abilities.ts) ---------- */

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", middot: "·", times: "×", deg: "°" };
const PLACEHOLDER = /\{\{[^{}]*\}\}|@[A-Za-z][A-Za-z0-9_.*]*@/g;
const HAS_PLACEHOLDER = /\{\{|\}\}|@[A-Za-z][A-Za-z0-9_.*]*@/;
const QUANTITY = /(?:\{\{[^{}]*\}\}|@[A-Za-z][A-Za-z0-9_.*]*@)\s*(?:%|(?:seconds?|secs?|s|units?|times|stacks?|charges?|levels?|ranks?|gold|meters?)\b)/i;
const DANGLING = /\b(?:by|to|of|for|from|with|at|per|every|than|over|under|plus)\s*(?:[.,;:!?)]|$)/i;

function decodeEntities(text) {
  return text.replace(/&(#[xX][0-9A-Fa-f]{1,6}|#[0-9]{1,7}|[A-Za-z]{2,8});/g, (whole, ref) => {
    if (ref[0] !== "#") return Object.hasOwn(ENTITIES, ref) ? ENTITIES[ref] : whole;
    const code = ref[1] === "x" || ref[1] === "X" ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
    if (code === 9 || code === 10 || code === 13) return " ";
    if (code < 0x20 || (code >= 0x7f && code < 0xa0) || (code >= 0xd800 && code <= 0xdfff) || code > 0x10ffff) return "";
    return String.fromCodePoint(code);
  });
}

function capDescription(text) {
  if (text.length <= DESCRIPTION_MAX) return text;
  const room = DESCRIPTION_MAX - 1;
  const slice = text.slice(0, room + 1);
  const at = slice.lastIndexOf(" ");
  const head = at >= room / 2 ? slice.slice(0, at) : slice.slice(0, room);
  return `${head.replace(/[\uD800-\uDBFF]$/, "").replace(/[\s.,;:(–—-]+$/, "")}…`;
}

/** A short hash of Riot's whole text for one ability: its raw description and tooltip (null for the passive), as riotTextHash in abilities.ts. */
export function riotTextHash(description, tooltip) {
  return createHash("sha256").update(JSON.stringify([description, tooltip])).digest("hex").slice(0, 16);
}

/** Riot's short description as plain text (see cleanDescription in abilities.ts). */
export function cleanDescription(raw) {
  let text = raw
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/?[A-Za-z][^<>]*>/g, "")
    .replace(/%i:[A-Za-z0-9_]+%/g, "");
  text = decodeEntities(text);
  if (HAS_PLACEHOLDER.test(text)) {
    if (QUANTITY.test(text)) return "";
    text = text
      .replace(PLACEHOLDER, " ")
      .replace(/[([]\s*[^A-Za-z0-9()[\]]*\s*[)\]]/g, " ")
      .replace(/\s+/g, " ")
      .replace(/\s+([.,;:!?])/g, "$1")
      .replace(/([.,;:!?])(?:\s*[,;:])+/g, "$1")
      .trim();
    if (HAS_PLACEHOLDER.test(text) || DANGLING.test(text) || (text.match(/[A-Za-z]+/g)?.length ?? 0) < 4) return "";
  }
  return capDescription(text.replace(/\s+/g, " ").trim());
}

const name = z.string().trim().min(1).max(120);
const icon = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,119}$/).refine((s) => !s.includes(".."));
const description = z.string().max(20_000).optional();
const passiveSchema = z.object({ name, description, image: z.object({ full: icon }) });
const spellSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_]{1,80}$/),
  name,
  description,
  maxrank: z.number().int().min(1).max(10),
  cooldown: z.array(z.number().min(0).max(100_000)).max(10),
  maxammo: z.union([z.string().max(20), z.number()]).optional(),
  tooltip: z.string().max(40_000).optional(),
  image: z.object({ full: icon }),
});
const tipList = z.array(z.unknown()).max(40).optional();
const detailSchema = z.object({ id: z.string().regex(CHAMPION_ID), passive: passiveSchema, spells: z.array(spellSchema).min(4), allytips: tipList, enemytips: tipList });

/** The longest tip kept, in characters: a longer one is left out whole, never cut (a tip is shown verbatim). */
export const TIP_MAX = 600;

/** Riot's tips as Data Dragon gives them, verbatim: each a non-empty string of at most TIP_MAX characters, in Riot's order; anything else left out. */
export function riotTips(list) {
  return Array.isArray(list) ? list.filter((t) => typeof t === "string" && t.trim() !== "" && t.length <= TIP_MAX) : [];
}

const SPELL_SLOTS = ["Q", "W", "E", "R"];

function chargesOf(maxammo) {
  const n = Number(maxammo);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** One champion's abilities from its Data Dragon detail object, or null (see compactChampionAbilities in abilities.ts). */
export function compactChampionAbilities(detail, version) {
  try {
    if (typeof version !== "string" || !VERSION.test(version)) return null;
    const parsed = detailSchema.safeParse(detail);
    if (!parsed.success) return null;
    const { id, passive, spells, allytips, enemytips } = parsed.data;
    const abilities = [
      { slot: "P", id: null, name: passive.name, icon: passive.image.full, maxRank: 1, cooldown: [], charges: null, description: cleanDescription(passive.description ?? ""), textHash: riotTextHash(passive.description ?? "", null) },
      ...SPELL_SLOTS.map((slot, i) => {
        const s = spells[i];
        return { slot, id: s.id, name: s.name, icon: s.image.full, maxRank: s.maxrank, cooldown: [...s.cooldown], charges: chargesOf(s.maxammo), description: cleanDescription(s.description ?? ""), textHash: riotTextHash(s.description ?? "", s.tooltip ?? "") };
      }),
    ];
    return { championId: id, version, abilities, tips: { ally: riotTips(allytips), enemy: riotTips(enemytips) } };
  } catch {
    return null;
  }
}

/* ---------- The fixture ---------- */

const NOTE =
  "OFFLINE FIXTURE (Champion Lookup). Every champion's abilities from Riot's Data Dragon, built by scripts/static/build-ability-fixture.mjs with the rules of src/server/riot/static/abilities.ts. Stored only where the server cannot reach Data Dragon: when the champions come from the offline fixture, or by the demo's bootstrap when no abilities are stored. Never over abilities read from Data Dragon; the first sync that reads Data Dragon's files replaces it.";

/** The fixture's content from a parsed championFull.json. Throws when any champion cannot be read: the copy is all or nothing. */
export function buildFixture(full) {
  const version = full?.version;
  if (typeof version !== "string" || !VERSION.test(version)) throw new Error(`championFull.json has no usable version (${JSON.stringify(version)})`);
  const data = full?.data;
  if (!data || typeof data !== "object") throw new Error("championFull.json has no data");
  const champions = {};
  const unreadable = [];
  for (const id of Object.keys(data).sort()) {
    const record = compactChampionAbilities(data[id], version);
    if (!record || record.championId !== id) unreadable.push(id);
    else champions[id] = record;
  }
  if (unreadable.length) throw new Error(`${unreadable.length} champions could not be read: ${unreadable.join(", ")}`);
  return { format: ABILITY_RULES_FORMAT, version, source: "fixture", champions };
}

/** The fixture as committed: one ability per line, so a new game version's changes read as a short diff. */
export function serialiseFixture(fixture) {
  const ids = Object.keys(fixture.champions);
  const lines = ["{", `  "_note": ${JSON.stringify(NOTE)},`, `  "format": ${fixture.format},`, `  "version": ${JSON.stringify(fixture.version)},`, `  "source": "fixture",`, `  "champions": {`];
  ids.forEach((id, i) => {
    const c = fixture.champions[id];
    lines.push(`    ${JSON.stringify(id)}: {`, `      "championId": ${JSON.stringify(c.championId)},`, `      "version": ${JSON.stringify(c.version)},`, `      "abilities": [`);
    c.abilities.forEach((a, j) => lines.push(`        ${JSON.stringify(a)}${j < c.abilities.length - 1 ? "," : ""}`));
    lines.push(c.tips ? "      ]," : "      ]");
    if (c.tips) lines.push(`      "tips": ${JSON.stringify(c.tips)}`);
    lines.push(`    }${i < ids.length - 1 ? "," : ""}`);
  });
  lines.push("  }", "}", "");
  return lines.join("\n");
}

/* ---------- The digest: Data Dragon's own numbers, which CI checks the fixture against ---------- */

const DIGEST_NOTE =
  "Data Dragon's own numbers for every champion (championFull.json, en_US), copied as Riot gives them with no rule applied: each spell as [id, maxrank, cooldown, maxammo] (maxammo null when absent); and Riot's tips as Riot gives them (allytips, enemytips; null when absent). Written with the offline fixture by scripts/static/build-ability-fixture.mjs; src/server/riot/static/abilities.test.ts holds every champion of the fixture to it, so CI needs no championFull.json.";

/** Each champion's four spells as Data Dragon gives them, [id, maxrank, cooldown, maxammo]. Throws when a champion has no four spells. */
export function buildDigest(full) {
  const version = full?.version;
  if (typeof version !== "string" || !VERSION.test(version)) throw new Error(`championFull.json has no usable version (${JSON.stringify(version)})`);
  const data = full?.data;
  if (!data || typeof data !== "object") throw new Error("championFull.json has no data");
  const champions = {};
  const tips = {};
  const unreadable = [];
  for (const id of Object.keys(data).sort()) {
    const spells = data[id]?.spells;
    if (!Array.isArray(spells) || spells.length < 4) unreadable.push(id);
    else champions[id] = spells.slice(0, 4).map((s) => [s?.id ?? null, s?.maxrank ?? null, s?.cooldown ?? null, s?.maxammo ?? null]);
    tips[id] = { ally: data[id]?.allytips ?? null, enemy: data[id]?.enemytips ?? null };
  }
  if (unreadable.length) throw new Error(`${unreadable.length} champions have no four spells: ${unreadable.join(", ")}`);
  return { version, champions, tips };
}

/** The digest as committed: one champion per line. */
export function serialiseDigest(digest) {
  const ids = Object.keys(digest.champions);
  const lines = ["{", `  "_note": ${JSON.stringify(DIGEST_NOTE)},`, `  "version": ${JSON.stringify(digest.version)},`, `  "champions": {`];
  ids.forEach((id, i) => lines.push(`    ${JSON.stringify(id)}: ${JSON.stringify(digest.champions[id])}${i < ids.length - 1 ? "," : ""}`));
  if (!digest.tips) {
    lines.push("  }", "}", "");
    return lines.join("\n");
  }
  // Riot's tips exactly as Data Dragon gives them (allytips, enemytips; null when absent), one champion per line.
  const tipIds = Object.keys(digest.tips);
  lines.push("  },", `  "tips": {`);
  tipIds.forEach((id, i) => lines.push(`    ${JSON.stringify(id)}: ${JSON.stringify(digest.tips[id])}${i < tipIds.length - 1 ? "," : ""}`));
  lines.push("  }", "}", "");
  return lines.join("\n");
}

async function readChampionFull(args) {
  const from = args.get("--from");
  if (from) return JSON.parse(await readFile(resolve(from), "utf8"));
  const version = args.get("--version");
  if (!version || !VERSION.test(version)) throw new Error("Give --from <championFull.json> or --version <Data Dragon version, e.g. 16.22.1>");
  const url = `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/championFull.json`;
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000), headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`Data Dragon answered ${res.status} for ${url}`);
  return res.json();
}

async function main(argv) {
  const args = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--check") args.set("--check", "1");
    else if (argv[i]?.startsWith("--")) args.set(argv[i], argv[(i += 1)]);
  }
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const out = resolve(args.get("--out") ?? join(root, "src/server/riot/fixtures/champion-abilities.fixture.json"));
  const full = await readChampionFull(args);
  const fixture = buildFixture(full);
  const text = serialiseFixture(fixture);
  if (JSON.stringify(JSON.parse(text).champions) !== JSON.stringify(fixture.champions)) throw new Error("The serialised fixture does not read back as built");
  const digestOut = resolve(args.get("--digest-out") ?? join(root, `tests/fixtures/ddragon-${fixture.version}-ability-digest.json`));
  const digestText = serialiseDigest(buildDigest(full));
  const count = Object.keys(fixture.champions).length;
  if (args.has("--check")) {
    let same = true;
    for (const [path, wanted, what] of [[out, text, "through the current rules"], [digestOut, digestText, "(its own numbers)"]]) {
      const current = await readFile(path, "utf8").catch(() => "");
      if (current === wanted) console.log(`${path} matches Data Dragon ${fixture.version} ${what} (${count} champions).`);
      else {
        console.error(`${path} differs from Data Dragon ${fixture.version} ${what} (${count} champions). Run without --check to rebuild it.`);
        same = false;
      }
    }
    if (!same) process.exit(1);
    return;
  }
  await writeFile(out, text);
  await writeFile(digestOut, digestText);
  console.log(`Wrote ${out}: Data Dragon ${fixture.version}, ${count} champions, ${Buffer.byteLength(text)} bytes.`);
  console.log(`Wrote ${digestOut}: Data Dragon ${fixture.version}'s own numbers, ${count} champions, ${Buffer.byteLength(digestText)} bytes.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
