/**
 * Builds the offline copy of every champion's abilities (Matchup Intel) from Data Dragon's
 * championFull.json, for the demo and the browser tests, which run without Data Dragon:
 * src/server/riot/fixtures/champion-abilities.fixture.json.
 *
 *   node scripts/matchup-intel/build-ability-fixture.mjs --from path/to/championFull.json
 *   node scripts/matchup-intel/build-ability-fixture.mjs --version 16.22.1      (downloads it)
 *   add --check to compare with the committed fixture instead of writing it (exit 1 if it differs)
 *
 * Plain Node, no TypeScript step: the rules below are the same as compactChampionAbilities and
 * cleanDescription in src/server/matchup-intel/abilities.ts (which the app cannot import from
 * scripts/, and this script cannot import from TypeScript). abilities.test.ts holds the two to the
 * same results, on Data Dragon's own files and on made-up edge cases. When the rules change, bump
 * ABILITY_RULES_FORMAT in both and run this again.
 */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { z } from "zod";

export const ABILITY_RULES_FORMAT = 1;
export const DESCRIPTION_MAX = 400;
const CHAMPION_ID = /^[A-Za-z0-9]{1,40}$/;
const VERSION = /^\d{1,4}(?:\.\d{1,4}){1,3}$/;

/* ---------- The rules (the same as src/server/matchup-intel/abilities.ts) ---------- */

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
  image: z.object({ full: icon }),
});
const detailSchema = z.object({ id: z.string().regex(CHAMPION_ID), passive: passiveSchema, spells: z.array(spellSchema).min(4) });

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
    const { id, passive, spells } = parsed.data;
    const abilities = [
      { slot: "P", id: null, name: passive.name, icon: passive.image.full, maxRank: 1, cooldown: [], charges: null, description: cleanDescription(passive.description ?? "") },
      ...SPELL_SLOTS.map((slot, i) => {
        const s = spells[i];
        return { slot, id: s.id, name: s.name, icon: s.image.full, maxRank: s.maxrank, cooldown: [...s.cooldown], charges: chargesOf(s.maxammo), description: cleanDescription(s.description ?? "") };
      }),
    ];
    return { championId: id, version, abilities };
  } catch {
    return null;
  }
}

/* ---------- The fixture ---------- */

const NOTE =
  "OFFLINE FIXTURE (Matchup Intel). Every champion's abilities from Riot's Data Dragon, built by scripts/matchup-intel/build-ability-fixture.mjs with the rules of src/server/matchup-intel/abilities.ts. Stored only when the champions come from the offline fixture (demo, browser tests); the version-check job replaces it with Data Dragon's current files.";

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
    lines.push("      ]", `    }${i < ids.length - 1 ? "," : ""}`);
  });
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
  const fixture = buildFixture(await readChampionFull(args));
  const text = serialiseFixture(fixture);
  if (JSON.stringify(JSON.parse(text).champions) !== JSON.stringify(fixture.champions)) throw new Error("The serialised fixture does not read back as built");
  const count = Object.keys(fixture.champions).length;
  if (args.has("--check")) {
    const current = await readFile(out, "utf8").catch(() => "");
    if (current !== text) {
      console.error(`${out} differs from Data Dragon ${fixture.version} through the current rules (${count} champions). Run without --check to rebuild it.`);
      process.exit(1);
    }
    console.log(`${out} matches Data Dragon ${fixture.version} through the current rules (${count} champions).`);
    return;
  }
  await writeFile(out, text);
  console.log(`Wrote ${out}: Data Dragon ${fixture.version}, ${count} champions, ${Buffer.byteLength(text)} bytes.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
