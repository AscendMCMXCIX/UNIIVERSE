/**
 * Ability ranges (Champion Intel, docs/CHAMPION_INTEL.md, "Ranges"): drafts the reviewed table's rows
 * from Riot's Data Dragon, and checks the committed table against a game version.
 *
 * The table (src/server/riot/static/ability-ranges.reviewed.json) says, for each spell, what Data
 * Dragon's `range` measures: a reach (a cast range, a skillshot's length, a dash), the whole map, the
 * champion itself, or nothing usable. The page shows Data Dragon's number only where a row says it is
 * a reach and only while Riot's spell id, its range array and the hash of its description and tooltip
 * are the ones the row was made for (src/domain/champion-lookup/range.ts). The number shown is always
 * Data Dragon's; the table never supplies one.
 *
 *   node scripts/static/review-ability-ranges.mjs --version 16.23.1 --check     (downloads championFull.json)
 *   node scripts/static/review-ability-ranges.mjs --from path/to/championFull.json --check
 *     --check           what still matches, which rows Riot changed since (with Riot's old and new
 *                       text where the old file is given with --was), which spells have no row, and
 *                       rows for spells that no longer exist. Exit 1 when a row no longer matches or
 *                       names a spell that is gone (a spell with no row is only counted).
 *     --draft out.json  every spell's draft by the fixed rules below, with its evidence: Riot's
 *                       description and tooltip (markup and placeholders taken out), Data Dragon's
 *                       range, the rule that decided, its cues and its confidence (high, medium, low).
 *     --write           rewrites the table: rows that still match are kept as they are; a row a
 *                       reviewer confirmed ("automated review", "owner") that no longer matches is kept
 *                       too (the page hides its range until it is reviewed again); a stale
 *                       "automated draft" row is replaced by the new high-confidence draft, or dropped;
 *                       a spell with no row gets its high-confidence draft (reviewer "automated
 *                       draft"). Medium and low drafts are never written: a reviewer decides them.
 *     --date YYYY-MM-DD the date written on new rows (default: today, UTC).
 *
 * Plain Node, Data Dragon only (no wiki, no CommunityDragon): the same text hash as
 * src/server/riot/static/abilities.ts (riotTextHash, from build-ability-fixture.mjs). CI never runs
 * it (no network); src/server/riot/static/ability-ranges.test.ts holds the committed table to the
 * offline fixture and to these rules.
 */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { riotTextHash } from "./build-ability-fixture.mjs";

export const RANGE_TABLE_FORMAT = 1;
export const SPELL_SLOTS = ["Q", "W", "E", "R"];
export const RANGE_KINDS = ["reach", "global", "self", "none"];
/** Who decided a row: the fixed rules below, an independent automated review, or the team. Never a person's name. */
export const RANGE_REVIEWERS = ["automated draft", "automated review", "owner"];
/** Why a row says the number is not shown (for `none` only; never shown). "unconfirmed": a review could not confirm that Riot's number is the reach (a reviewer unsure, the reviewers split, or the adjudicators not both confirming), so it is recorded as reviewed and not shown, and --write never drafts it again. */
export const NONE_REASONS = ["placeholder", "two-forms", "not-the-reach", "scales-in-game", "several-abilities", "unconfirmed"];
const VERSION = /^\d{1,4}(?:\.\d{1,4}){1,3}$/;
/** A slot that holds two abilities ("To the Skies! / Shock Blast", "Arc of Judgment | Arc of Ruin"): one array for both. */
export const TWO_FORMS = / \/ | \| /;

const NOTE =
  "Ability ranges (Champion Intel, docs/CHAMPION_INTEL.md, \"Ranges\"): what Data Dragon's `range` measures for each spell. The number shown is always Data Dragon's current one; a row applies only while Riot's spell id, range array and text hash (description and tooltip) are the ones in the row. kind: reach (shown as \"Range 1,175\"), global (\"Global\"), self (cast on the champion; not shown, by the owner's decision for Release 19), none (not the reach; not shown). reviewer: \"automated draft\" (the fixed rules of scripts/static/review-ability-ranges.mjs, high confidence only), \"automated review\" (docs/CHAMPION_INTEL.md, \"Ranges\": two independent reviewers, and two adjudicators where the rules differed) or \"owner\". why \"unconfirmed\": reviewed, and the review could not confirm Riot's number is the reach, so it is not shown. Rows are changed through pull requests: git history is the review log. No personal data.";
const PROCESS =
  "Drafted by the fixed rules of scripts/static/review-ability-ranges.mjs from Data Dragon's numbers and Riot's descriptions and tooltips (only high-confidence drafts are ever written, as \"automated draft\"); then reviewed (\"automated review\"): two independent reviewers classify every spell from the same evidence without the draft; a reach or global is kept only where both say so and the draft agrees, or where a verifier and a skeptic both confirm it; any doubt is written as none, \"unconfirmed\", never shown. The team may confirm or change any row (\"owner\"). Data Dragon only: no wiki, no CommunityDragon.";

/* ---------- Riot's text, as the rules read it ---------- */

/** Riot's text as plain words: markup and inline icons removed, each placeholder a "#", whitespace collapsed. */
export function plainText(raw) {
  return String(raw ?? "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/?[A-Za-z][^<>]*>/g, "")
    .replace(/%i:[A-Za-z0-9_]+%/g, "")
    .replace(/\{\{[^{}]*\}\}|@[A-Za-z][A-Za-z0-9_.*]*@/g, "#")
    .replace(/&[A-Za-z]{2,8};|&#\d{1,7};/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const firstSentence = (text) => text.split(/(?<=[.!?])\s/)[0] ?? "";

/*
  The fixed rules. Each cue is a phrase of Riot's own text; none names a champion.
  - AIMED: the ability is aimed away from the champion, in the first sentence of the description or
    the tooltip: it is thrown, fired or launched, the champion dashes, leaps or blinks, or it is cast
    at a target, a location or in a direction.
  - FIRST_HIT: Riot's tooltip says it hits "the first enemy hit", which only a skillshot does.
  - PROJECTILE: the AIMED verbs for a missile (a projectile that falls short of the champion's attack
    range is not its reach as the description reads it, e.g. one that measures a cast field).
  - AROUND: anything that suggests the number may be a radius around the champion, a change to its
    attacks or a state it enters, anywhere in Riot's description or tooltip.
  - MODES: a tooltip or description in parts ("Passive:", "Toggle:", "Recast:"), one that does
    something else "instead", or a cast that changes "at 2 stacks": the number may belong to either.
  - CHARGE: charged, held or channelled casts, whose reach grows or depends on the hold.
  - RANGE_WORDS: Riot's text speaks of a range or distance itself (one that grows, a "short range",
    "up to a max distance"), so the number may not be the whole story.
  - MAP: Riot's text says the whole map ("regardless of distance", "anywhere on the map", "all enemy
    champions").
  - SELF_FIRST: the description's first sentence is about the champion itself (its next attack, a
    toggle, a passive, an area around it).
  - AIMED_ANY: any sign of aim anywhere (a target, an enemy, an ally, a location, a line, a trap),
    which keeps an ability from being called "self" with confidence.
*/
const AIMED = /\b(?:fir(?:e|es|ed|ing)|throw(?:s|n|ing)?|hurl(?:s|ed|ing)?|launch(?:es|ed|ing)?|sends?(?! out)|send(?:ing)?(?! out)|shoots?|shooting|toss(?:es|ed|ing)?|fling(?:s|ing)?|lobs?|lobbing|dash(?:es|ed|ing)?|leaps?|leaping|blinks?|teleports?|jumps?|lunges?|vaults?|in a (?:line|direction)|(?:at|to|towards?) (?:a|the) (?:target )?(?:location|area)|target (?:enemy|ally|champion|location|area|unit|direction|minion|monster)|calls? down|tethers?|hooks?|grabs?)\b/i;
const FIRST_HIT = /\bthe first (?:enemy|champion|unit|target)(?: champion)?s? (?:hit|struck)\b/i;
const PROJECTILE = /\b(?:fir(?:e|es|ed|ing)|throw(?:s|n|ing)?|hurl(?:s|ed|ing)?|launch(?:es|ed|ing)?|shoots?|shooting|toss(?:es|ed|ing)?|fling(?:s|ing)?|lobs?|lobbing)\b/i;
const AROUND =
  /\b(?:next (?:basic )?attacks?|attacks? (?:gain|deal|apply|heal|grant)|attack range|treated as an attack|gains?|granting|toggles?|activates?|aura|around (?:him|her|it|them)(?:self|selves)?|surround(?:s|ing)?|nearby|empower(?:s|ed)?|enhance[sd]?|passive(?:ly)?|channel(?:s|ing|ed|led|ling)?|transform(?:s|ed|ing)?|form|stance|becomes?|enters?|spins?|whirl(?:s|wind)?|evolve[sd]?|upgrade[sd]?|heals? (?:him|her|it)self|shields? (?:him|her|it)self|self)\b/i;
const MODES = /\b(?:Passive|Toggle|Re-?cast|Second Cast|Third Cast|Active)\s*:|\binstead\b|\bat (?:\d+|#|max(?:imum)?) stacks\b/i;
const CHARGE = /\b(?:charg(?:e|es|ed|ing)|hold(?:s|ing)?|release[sd]?|tap(?:s|ped)?)\b/i;
const RANGE_WORDS = /\b(?:range|distance|farther|further)\b/i;
const MAP = /\b(?:global(?:ly)?|anywhere on the map|across the map|regardless of distance|on the map|entire map|map-wide|all (?:enemy|allied|friendly) champions|every (?:enemy|allied) champion)\b/i;
const SELF_FIRST = /\b(?:next (?:basic )?attacks?|(?:his|her|its|their) (?:basic )?attacks|'s (?:basic )?attacks|toggles?|passively|around (?:him|her|it)(?:self)?|surrounding (?:him|her|it)(?:self)?)\b/i;
const AIMED_ANY =
  /\b(?:target(?:s|ed|ing)?|enem(?:y|ies)|all(?:y|ies|ied)|location|direction|line|towards?|traps?|sets?|places?|plants?|deploys?|summons?|creates?|zone|area|path|missile|projectile|bolt|wave|cone|fir(?:e|es|ed|ing)|throw(?:s|n|ing)?|hurl(?:s|ed|ing)?|launch(?:es|ed|ing)?|shoots?|dash(?:es|ed|ing)?|leaps?|blinks?|jumps?|lunges?|pulls?|grabs?|hooks?|tethers?|binds?)\b/i;

/**
 * One spell's draft by the fixed rules: its kind, why (for `none`), the rule that decided, the cues
 * found, and the confidence. High confidence is the only one --write takes. Never throws.
 */
export function draftRange(spell, champion) {
  const range = Array.isArray(spell?.range) ? spell.range : null;
  const name = typeof spell?.name === "string" ? spell.name : "";
  const description = plainText(spell?.description);
  const tooltip = plainText(spell?.tooltip);
  const text = `${description} ${tooltip}`;
  const out = (kind, confidence, rule, extra = {}) => ({ kind, confidence, rule, ...extra });
  if (!range || range.length !== spell?.maxrank || !range.every((v) => typeof v === "number" && Number.isFinite(v))) return out("none", "high", "not-one-number-per-rank", { why: "placeholder" });
  if (TWO_FORMS.test(name)) return out("none", "high", "two-abilities-in-the-slot", { why: "two-forms" });
  if (range.some((v) => v <= 50)) return out("none", "high", "placeholder-number", { why: "placeholder" });
  if (range.some((v, i) => i > 0 && v < range[i - 1])) return out("none", "high", "not-increasing-by-rank", { why: "placeholder" });
  if (range.some((v) => v >= 10_000)) {
    // 25000, 10000 and the like are the engine's "not limited by the cast": the whole map only where Riot's text says so.
    if (range.every((v) => v >= 10_000) && MAP.test(text)) return out("global", "high", "whole-map-in-riots-text");
    return out("none", "medium", "engine-number", { why: "not-the-reach" });
  }
  const attackRange = Number(champion?.stats?.attackrange);
  const cues = {
    aimed: AIMED.test(firstSentence(description)) || AIMED.test(firstSentence(tooltip)),
    firstHit: FIRST_HIT.test(tooltip),
    around: AROUND.test(text),
    modes: MODES.test(String(spell?.tooltip ?? "")) || MODES.test(String(spell?.description ?? "")),
    charge: CHARGE.test(text),
    rangeWords: RANGE_WORDS.test(text),
    map: MAP.test(text),
    // Tristana's E: a reach equal to the champion's attack range grows with it in a game.
    attackRange: Number.isFinite(attackRange) && range.some((v) => v === attackRange),
    shortProjectile: Number.isFinite(attackRange) && attackRange > 300 && PROJECTILE.test(firstSentence(description)) && range.some((v) => v < attackRange),
    outsideBand: range.some((v) => v < 100 || v > 5000),
    selfFirst: SELF_FIRST.test(firstSentence(description)),
    aimedAny: AIMED_ANY.test(text) || FIRST_HIT.test(tooltip),
  };
  const aimed = cues.aimed || cues.firstHit;
  const doubt = cues.around || cues.modes || cues.charge || cues.rangeWords || cues.map || cues.attackRange || cues.shortProjectile || cues.outsideBand;
  if (aimed && !doubt) return out("reach", "high", "aimed-in-riots-text", { cues });
  if (cues.selfFirst && !cues.aimedAny && !cues.map) return out("self", "high", "about-the-champion-in-riots-text", { cues });
  if (aimed) return out("reach", "medium", "aimed-with-doubt", { cues });
  if (cues.around) return out("self", "medium", "around-the-champion-with-doubt", { cues });
  return out(null, "low", "no-cue", { cues });
}

/* ---------- The table against a game version ---------- */

const same = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => x === b[i]);
const keyOf = (champion, slot) => `${champion}:${slot}`;

/** Every spell of a parsed championFull.json, Q to R, with what a row is keyed on. Throws when the file has no usable version. */
export function spellsOf(full) {
  const version = full?.version;
  if (typeof version !== "string" || !VERSION.test(version)) throw new Error(`championFull.json has no usable version (${JSON.stringify(version)})`);
  const out = [];
  for (const id of Object.keys(full?.data ?? {}).sort()) {
    const c = full.data[id];
    (Array.isArray(c?.spells) ? c.spells.slice(0, 4) : []).forEach((s, i) => {
      out.push({ champion: id, slot: SPELL_SLOTS[i], spell: s?.id ?? null, name: s?.name ?? "", range: Array.isArray(s?.range) ? [...s.range] : null, textHash: riotTextHash(s?.description ?? "", s?.tooltip ?? ""), detail: s, championDetail: c });
    });
  }
  return { version, spells: out };
}

/** Whether a row still applies to a spell: the same spell id, range array and text hash. */
export function rowMatches(row, spell) {
  return !!row && !!spell && row.spell === spell.spell && same(row.range, spell.range) && row.textHash === spell.textHash;
}

/**
 * The committed table against a game version: rows that still match (by kind), rows Riot changed
 * since (what moved), spells with no row, and rows whose spell is gone. Counts and champions' and
 * spells' names only.
 */
export function checkTable(table, full) {
  const { version, spells } = spellsOf(full);
  const rows = new Map((table?.rows ?? []).map((r) => [keyOf(r.champion, r.slot), r]));
  const result = { version, spells: spells.length, rows: rows.size, matching: { reach: 0, global: 0, self: 0, none: 0 }, changed: [], unreviewed: [], gone: [] };
  const seen = new Set();
  for (const s of spells) {
    const key = keyOf(s.champion, s.slot);
    const row = rows.get(key);
    if (!row) {
      result.unreviewed.push(key);
      continue;
    }
    seen.add(key);
    if (rowMatches(row, s)) result.matching[row.kind] = (result.matching[row.kind] ?? 0) + 1;
    else result.changed.push({ key, reviewer: row.reviewer, kind: row.kind, moved: [row.spell !== s.spell ? `spell ${row.spell} → ${s.spell}` : null, !same(row.range, s.range) ? `range ${row.range?.join("/")} → ${s.range?.join("/")}` : null, row.textHash !== s.textHash ? "Riot's text" : null].filter(Boolean) });
  }
  for (const key of rows.keys()) if (!seen.has(key)) result.gone.push(key);
  return result;
}

/** Every spell's draft with its evidence (what a reviewer reads), and whether the table's row for it still matches. */
export function draftAll(full, table) {
  const { version, spells } = spellsOf(full);
  const rows = new Map((table?.rows ?? []).map((r) => [keyOf(r.champion, r.slot), r]));
  return {
    version,
    drafts: spells.map((s) => {
      const row = rows.get(keyOf(s.champion, s.slot)) ?? null;
      return {
        champion: s.champion,
        slot: s.slot,
        spell: s.spell,
        name: s.name,
        range: s.range,
        textHash: s.textHash,
        attackRange: s.championDetail?.stats?.attackrange ?? null,
        description: plainText(s.detail?.description),
        tooltip: plainText(s.detail?.tooltip),
        draft: draftRange(s.detail, s.championDetail),
        row: row ? { kind: row.kind, reviewer: row.reviewer, version: row.version, matches: rowMatches(row, s) } : null,
      };
    }),
  };
}

/** A row for a spell from its draft (high confidence only). */
function rowFrom(spell, draft, version, date) {
  const row = { champion: spell.champion, slot: spell.slot, spell: spell.spell, kind: draft.kind, range: [...spell.range], textHash: spell.textHash, version, reviewed: date, reviewer: "automated draft", rule: draft.rule };
  if (draft.kind === "none") row.why = draft.why;
  return row;
}

/**
 * The table rewritten for a game version (see --write): matching rows kept, a confirmed row that no
 * longer matches kept (hidden on the page until reviewed again), a stale automated draft replaced by
 * the new high-confidence draft or dropped, a spell with no row given its high-confidence draft.
 * Rows for spells that are gone are dropped. Returns the table and what changed, counted.
 */
export function writeTable(table, full, date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Not a date: ${date}`);
  const { version, spells } = spellsOf(full);
  const rows = new Map((table?.rows ?? []).map((r) => [keyOf(r.champion, r.slot), r]));
  const next = [];
  const done = { kept: 0, keptStale: 0, replaced: 0, dropped: 0, added: 0, leftForReview: 0 };
  for (const s of spells) {
    const row = rows.get(keyOf(s.champion, s.slot));
    if (row && rowMatches(row, s)) {
      next.push(row);
      done.kept += 1;
      continue;
    }
    if (row && row.reviewer !== "automated draft") {
      next.push(row);
      done.keptStale += 1;
      continue;
    }
    const d = s.range ? draftRange(s.detail, s.championDetail) : null;
    if (d && d.confidence === "high" && d.kind) {
      next.push(rowFrom(s, d, version, date));
      if (row) done.replaced += 1;
      else done.added += 1;
    } else {
      if (row) done.dropped += 1;
      done.leftForReview += 1;
    }
  }
  return { table: { format: RANGE_TABLE_FORMAT, rows: next }, done };
}

/** The table as committed: one row per line, in champion and slot order, so a review reads as a short diff. */
export function serialiseTable(table) {
  const order = (r) => `${r.champion}:${SPELL_SLOTS.indexOf(r.slot)}`;
  const rows = [...table.rows].sort((a, b) => (order(a) < order(b) ? -1 : order(a) > order(b) ? 1 : 0));
  const field = ["champion", "slot", "spell", "kind", "why", "range", "textHash", "version", "reviewed", "reviewer", "rule"];
  const line = (r) => `{${field.filter((f) => r[f] !== undefined).map((f) => `${JSON.stringify(f)}:${JSON.stringify(r[f])}`).join(",")}}`;
  return ["{", `  "_note": ${JSON.stringify(NOTE)},`, `  "format": ${RANGE_TABLE_FORMAT},`, `  "process": ${JSON.stringify(PROCESS)},`, `  "rows": [`, ...rows.map((r, i) => `    ${line(r)}${i < rows.length - 1 ? "," : ""}`), "  ]", "}", ""].join("\n");
}

/* ---------- The command line ---------- */

async function readChampionFull(from, version) {
  if (from) return JSON.parse(await readFile(resolve(from), "utf8"));
  if (!version || !VERSION.test(version)) throw new Error("Give --from <championFull.json> or --version <Data Dragon version, e.g. 16.23.1>");
  const url = `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/championFull.json`;
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000), headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`Data Dragon answered ${res.status} for ${url}`);
  return res.json();
}

async function main(argv) {
  const args = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--check" || argv[i] === "--write") args.set(argv[i], "1");
    else if (argv[i]?.startsWith("--")) args.set(argv[i], argv[(i += 1)]);
  }
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const tablePath = resolve(args.get("--table") ?? join(root, "src/server/riot/static/ability-ranges.reviewed.json"));
  const full = await readChampionFull(args.get("--from"), args.get("--version"));
  const table = JSON.parse(await readFile(tablePath, "utf8").catch(() => '{"rows":[]}'));
  if (args.has("--draft")) {
    const out = resolve(args.get("--draft"));
    const drafts = draftAll(full, table);
    await writeFile(out, `${JSON.stringify(drafts, null, 1)}\n`);
    const by = {};
    for (const d of drafts.drafts) by[`${d.draft.kind ?? "needs a reviewer"} (${d.draft.confidence})`] = (by[`${d.draft.kind ?? "needs a reviewer"} (${d.draft.confidence})`] ?? 0) + 1;
    console.log(`Wrote ${out}: ${drafts.drafts.length} spells at Data Dragon ${drafts.version}.`, by);
  }
  if (args.has("--write")) {
    const date = args.get("--date") ?? new Date().toISOString().slice(0, 10);
    const { table: next, done } = writeTable(table, full, date);
    await writeFile(tablePath, serialiseTable(next));
    console.log(`Wrote ${tablePath} for Data Dragon ${full.version}: ${next.rows.length} rows.`, done);
  }
  if (args.has("--check") || (!args.has("--draft") && !args.has("--write"))) {
    const current = args.has("--write") ? JSON.parse(await readFile(tablePath, "utf8")) : table;
    const r = checkTable(current, full);
    const was = args.get("--was") ? spellsOf(JSON.parse(await readFile(resolve(args.get("--was")), "utf8"))) : null;
    console.log(`Ability ranges at Data Dragon ${r.version}: ${r.spells} spells, ${r.rows} rows; matching ${JSON.stringify(r.matching)}; ${r.changed.length} changed since their row; ${r.unreviewed.length} with no row; ${r.gone.length} rows for spells that are gone.`);
    for (const c of r.changed) {
      console.log(`  changed: ${c.key} (${c.kind}, ${c.reviewer}): ${c.moved.join("; ")}`);
      const before = was?.spells.find((s) => keyOf(s.champion, s.slot) === c.key);
      const after = spellsOf(full).spells.find((s) => keyOf(s.champion, s.slot) === c.key);
      if (before && after) console.log(`    was: ${plainText(before.detail?.description)} | ${plainText(before.detail?.tooltip)}\n    now: ${plainText(after.detail?.description)} | ${plainText(after.detail?.tooltip)}`);
    }
    for (const key of r.gone) console.log(`  gone: ${key}`);
    if (r.changed.length || r.gone.length) process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
