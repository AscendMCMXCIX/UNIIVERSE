/**
 * Imports the reviewed facts from Riot's ability text (Matchup Intel's L3; docs/MATCHUP_INTEL.md,
 * "Facts from Riot's text") into the app: one JSON file per champion under
 * src/server/matchup-intel/riot-text/, and the index of loaders beside them (riot-text/index.ts), so
 * the page loads only the files of the champions it shows.
 *
 *   node scripts/matchup-intel/import-riot-text.mjs --from <reviewed dir> --ddragon <championFull.json>
 *   add --check to compare with the committed files instead of writing them (exit 1 if one differs)
 *
 * The reviewed table: <reviewed dir>/champions/<Id>.json (or <reviewed dir>/<Id>.json), with
 * _index.json and DONE beside them. Each champion's file holds {champion, version, reviewedAt,
 * review (a sentence), reviewRecord, abilityText: {slot: {name, descriptionHash, tooltipHash}},
 * facts: [{slot, kind, clause, source, qualifier?, qualifierSource?, conditional?, alsoDescribedAs?}],
 * disagreements: [{slot, description: {kind, clause}, tooltip: {kind, clause}}]}. Every file is
 * checked against Data Dragon's own championFull.json of the version it was reviewed on, read from a
 * file (this script downloads nothing, and reads nothing from the League of Legends Wiki or any Weird
 * Gloop site), and one that fails any check refuses the whole import: all or nothing.
 *   - the review record (reviewRecord: how many independent automated reviewers, whether an
 *     adjudicator settled them, how many automated checkers checked the consistency pass, whether a
 *     person checked it) is read as the table holds it: a file without one is refused, never given a
 *     count, and _index.json must record the same. The review itself wrote only its sentence
 *     (`review`); the record was added to the table for this import, from that sentence, as data
 *     (docs/MATCHUP_INTEL_RIOT_TEXT_REVIEW.md, "The review record");
 *   - the champion, the version and each ability's name are Riot's;
 *   - each ability's descriptionHash and tooltipHash (null for the passive) are the SHA-256 of
 *     Riot's description and tooltip with their markup removed as the drafts were (preparedText,
 *     the drafting rules' prepare()): a file whose hashes are not Riot's text of that version was
 *     reviewed against other words, and is refused;
 *   - each fact names a known kind, slot and source, one fact per slot and kind; its clause, its
 *     qualifier (from its own text, or the slot's other text where qualifierSource says so), its
 *     alsoDescribedAs clause and each disagreement's two clauses are verbatim, on one line, in the
 *     text named; none holds markup or a digit outside Riot's placeholders, and no fact on a slot
 *     with a disagreement names either of its kinds;
 *   - each placeholder of Riot's ("{{ qdamage }}", a value its text fills in at play) is stored as
 *     "[…]": never resolved into a number, from any field;
 *   - each ability is pinned to the hash of its whole raw text (riotTextHash, as the version-check
 *     job stores it), so the page hides its facts once Riot's text changes.
 */
import { readdir, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { riotTextHash } from "./build-ability-fixture.mjs";

export const SLOTS = ["P", "Q", "W", "E", "R"];
/** The kinds a fact may name: the same list, in the same order, as RIOT_TEXT_KINDS in src/domain/matchup-intel/types.ts. */
export const KINDS = ["stun", "knockup", "knockback", "pull", "root", "slow", "silence", "fear", "flee", "charm", "taunt", "suppression", "ground", "polymorph", "sleep", "blind", "disarm", "nearsight", "drowsy", "dash", "blink", "leap", "teleport", "unstoppable", "shield", "untargetable", "invulnerable", "stasis", "spellshield", "damagereduction", "tenacity", "cleanse", "stealth", "parry", "heal", "lifesteal", "omnivamp", "regeneration", "recast", "charges", "cooldownrefund", "reset", "toggle", "empower", "transform"];
const SOURCES = ["description", "tooltip"];
const CHAMPION = /^[A-Za-z0-9]{1,40}$/;
const VERSION = /^\d{1,4}(\.\d{1,4}){1,3}$/;
const HASH = /^[0-9a-f]{64}$/;
/** The longest clause shown, in characters (MAX_CLAUSE in src/server/matchup-intel/riot-text.ts). */
const MAX_CLAUSE = 400;
/** The longest qualifier, in words (the review's own rule). */
const MAX_QUALIFIER_WORDS = 12;
/** The fields a fact may have: one the page does not know how to show is refused, never dropped. */
const FACT_FIELDS = new Set(["slot", "kind", "clause", "source", "qualifier", "qualifierSource", "conditional", "alsoDescribedAs"]);

/* ---------- Riot's text, cleaned as the drafts were ---------- */

/** The entities the drafting rules decode (rules-v3 prepare()): no others, so the hashes agree. */
const PREPARE_ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…" };
const decodePrepared = (t) => t.replace(/&([a-z]+);/gi, (w, e) => (Object.hasOwn(PREPARE_ENTITIES, e.toLowerCase()) ? PREPARE_ENTITIES[e.toLowerCase()] : w)).replace(/&#(\d+);/g, (w, n) => String.fromCodePoint(Number(n)));

/** One line of Riot's text (between line breaks): tags removed, placeholders kept with their spaces collapsed, whitespace collapsed. */
function preparedLine(rawLine) {
  let text = "";
  const tokens = /<(\/?)([A-Za-z][A-Za-z0-9]*)\b[^<>]*>|\{\{[^{}]*\}\}|\s+|[^<{\s]+|[<{]/g;
  for (const m of rawLine.matchAll(tokens)) {
    const t = m[0];
    if (m[2] !== undefined && t.startsWith("<")) continue;
    if (t.startsWith("{{")) {
      text += t.replace(/\s+/g, " ");
      continue;
    }
    if (/^\s+$/.test(t)) {
      if (text && !text.endsWith(" ")) text += " ";
      continue;
    }
    text += t;
  }
  return text.endsWith(" ") ? text.slice(0, -1) : text;
}

/**
 * Riot's raw text as the drafts and the review read it, the same as the drafting rules' prepare(raw).text
 * (rules v3): entities decoded, the description-append placeholder, inline icons and comments removed,
 * one line per line break (<br>, <li>, <hr>), each line's markup removed and its whitespace collapsed,
 * the lines joined by "\n". The table's descriptionHash and tooltipHash are the SHA-256 of this.
 */
export function preparedText(raw) {
  const text = decodePrepared(String(raw ?? ""))
    .replace(/\{\{\s*spellmodifierdescriptionappend\s*\}\}/g, "")
    .replace(/%i:[A-Za-z0-9_]+%/g, "")
    .replace(/<!--[\s\S]*?-->/g, "");
  return text
    .split(/<br\s*\/?>|<\/?li>|<hr\s*\/?>/i)
    .map(preparedLine)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Whether a quoted span is Riot's own words: verbatim, on one line of the prepared text. */
export function spanInText(span, prepared) {
  return typeof span === "string" && span.length > 0 && typeof prepared === "string" && prepared.split("\n").some((line) => line.includes(span));
}

/**
 * A span as the page shows it: Riot's words as quoted, each placeholder of Riot's as "[…]", so no
 * template and no number is ever shown. Never resolved, from effectBurn, datavalues, vars or anything else.
 */
export function shownClause(span) {
  return String(span)
    .replace(/\{\{[^{}]*\}\}/g, "[…]")
    .replace(/\s+/g, " ")
    .trim();
}

const sha256 = (s) => createHash("sha256").update(s, "utf8").digest("hex");
const words = (s) => s.trim().split(/\s+/).filter(Boolean).length;
const isObject = (v) => !!v && typeof v === "object" && !Array.isArray(v);

/* ---------- The review record ---------- */

/**
 * The record of how the review was done (reviewRecord), as the table holds it: how many independent
 * automated reviewers read every draft, whether an adjudicator settled them, how many independent
 * automated checkers checked the consistency pass, and whether a person checked it. The review wrote
 * these in one sentence; the record was added to every file and to _index.json for the import, from
 * that sentence, the same everywhere.
 * Nothing is assumed: a file without the record, or with a field missing or of another type, is
 * refused. A record saying a person checked the facts is refused too, until the owner has decided
 * the words such facts carry (docs/MATCHUP_INTEL.md, "For the owner"): the page's label says "not by
 * a person", and never claims more or less than was done.
 */
export function reviewRecordOf(record) {
  if (!isObject(record)) throw new Error(`no review record ("reviewRecord": ${JSON.stringify(record)})`);
  const { automatedReviewers, adjudicated, consistencyCheckers, checkedByPerson, ...rest } = record;
  if (Object.keys(rest).length) throw new Error(`the review record holds what the app does not read (${Object.keys(rest).join(", ")})`);
  if (!Number.isInteger(automatedReviewers) || automatedReviewers < 1) throw new Error(`the review record does not say how many automated reviewers read every draft (${JSON.stringify(automatedReviewers)})`);
  if (typeof adjudicated !== "boolean") throw new Error(`the review record does not say whether an adjudicator settled the reviews (${JSON.stringify(adjudicated)})`);
  if (!Number.isInteger(consistencyCheckers) || consistencyCheckers < 0) throw new Error(`the review record does not say how many automated checkers checked the consistency pass (${JSON.stringify(consistencyCheckers)})`);
  if (typeof checkedByPerson !== "boolean") throw new Error(`the review record does not say whether a person checked it (${JSON.stringify(checkedByPerson)})`);
  if (checkedByPerson) throw new Error("the review record says a person checked it: the page's label for such facts is the owner's decision, so nothing is imported until it is made (docs/MATCHUP_INTEL.md, For the owner)");
  return { automatedReviewers, adjudicated, consistencyCheckers, checkedByPerson };
}

/* ---------- One champion ---------- */

/** Riot's raw texts for one champion's abilities, by slot, and as the drafts read them. */
function riotTexts(entry) {
  const out = { P: { name: entry.passive?.name, description: entry.passive?.description ?? "", tooltip: null } };
  ["Q", "W", "E", "R"].forEach((slot, i) => {
    const s = entry.spells?.[i];
    out[slot] = { name: s?.name, description: s?.description ?? "", tooltip: s?.tooltip ?? "" };
  });
  for (const t of Object.values(out)) t.prepared = { description: preparedText(t.description), tooltip: t.tooltip === null ? null : preparedText(t.tooltip) };
  return out;
}

/**
 * One span checked and as the app commits it: verbatim on one line of the text named, no markup,
 * no digit outside Riot's placeholders, at most `max` characters shown. Throws with `what` otherwise.
 */
function checkedSpan(span, prepared, what, { max = MAX_CLAUSE, maxWords = Infinity } = {}) {
  if (typeof span !== "string" || !span.trim()) throw new Error(`${what}: no words`);
  if (/[<>]/.test(span)) throw new Error(`${what}: markup in it`);
  const shown = shownClause(span);
  if (/\d/.test(shown)) throw new Error(`${what}: a number in it`);
  if (shown.length > max) throw new Error(`${what}: more than ${max} characters`);
  if (words(span) > maxWords) throw new Error(`${what}: more than ${maxWords} words`);
  if (prepared === null) throw new Error(`${what}: quotes a tooltip the passive does not have`);
  if (!spanInText(span, prepared)) throw new Error(`${what}: not verbatim in Riot's text`);
  return shown;
}

/**
 * One champion's reviewed file as the app commits it. Throws when anything in it is not what the
 * review of Riot's text at that version can have accepted, so the import stops: nothing is left out
 * silently, and nothing is written.
 */
export function importChampion(reviewed, full) {
  const id = reviewed?.champion;
  if (typeof id !== "string" || !CHAMPION.test(id)) throw new Error(`no champion id (${JSON.stringify(id)})`);
  const entry = full?.data?.[id];
  if (!entry) throw new Error(`${id}: not in Data Dragon ${full?.version}`);
  if (reviewed.version !== full.version) throw new Error(`${id}: reviewed on ${reviewed.version}, the Data Dragon file is ${full.version}`);
  const day = typeof reviewed.reviewedAt === "string" ? reviewed.reviewedAt.slice(0, 10) : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error(`${id}: no review day (${JSON.stringify(reviewed.reviewedAt)})`);
  let review;
  try {
    review = reviewRecordOf(reviewed.reviewRecord);
  } catch (err) {
    throw new Error(`${id}: ${err instanceof Error ? err.message : err}`);
  }
  // The accepted facts are the file's own list: a file without one is not a reviewed table (a copy of
  // the drafts, say), so it is refused rather than read as a champion with no facts.
  if (!Array.isArray(reviewed.facts)) throw new Error(`${id}: no list of reviewed facts ("facts")`);
  if (!Array.isArray(reviewed.disagreements)) throw new Error(`${id}: no list of disagreements ("disagreements")`);
  const texts = riotTexts(entry);
  const abilities = {};
  for (const slot of SLOTS) {
    const t = texts[slot];
    const said = reviewed.abilityText?.[slot];
    if (!isObject(said)) throw new Error(`${id} ${slot}: the review does not say which text it read`);
    if (said.name !== t.name) throw new Error(`${id} ${slot}: reviewed as "${said.name}", Riot's name is "${t.name}"`);
    // The text the review read must be Riot's at this version, as the drafts cleaned it.
    if (typeof said.descriptionHash !== "string" || !HASH.test(said.descriptionHash)) throw new Error(`${id} ${slot}: no description hash`);
    if (said.descriptionHash !== sha256(t.prepared.description)) throw new Error(`${id} ${slot}: the review's description hash is not Data Dragon ${full.version}'s description`);
    if (t.tooltip === null) {
      if (said.tooltipHash !== null) throw new Error(`${id} ${slot}: a tooltip hash for a passive, which has no tooltip`);
    } else {
      if (typeof said.tooltipHash !== "string" || !HASH.test(said.tooltipHash)) throw new Error(`${id} ${slot}: no tooltip hash`);
      if (said.tooltipHash !== sha256(t.prepared.tooltip)) throw new Error(`${id} ${slot}: the review's tooltip hash is not Data Dragon ${full.version}'s tooltip`);
    }
    // The name as the app stores it (trimmed, as abilities.ts reads Data Dragon: Bel'Veth's passive ends
    // in a space), so the page's comparison with its stored record is like for like.
    abilities[slot] = { name: String(t.name).trim(), textHash: riotTextHash(t.description, t.tooltip) };
  }
  const facts = [];
  for (const f of reviewed.facts) {
    const where = `${id} ${f?.slot} ${f?.kind}`;
    if (!isObject(f)) throw new Error(`${id}: a fact that is not one (${JSON.stringify(f)})`);
    const unknown = Object.keys(f).filter((k) => !FACT_FIELDS.has(k));
    if (unknown.length) throw new Error(`${where}: fields the app does not show (${unknown.join(", ")})`);
    if (!SLOTS.includes(f.slot)) throw new Error(`${where}: an unknown slot`);
    if (!KINDS.includes(f.kind)) throw new Error(`${where}: an unknown kind`);
    if (!SOURCES.includes(f.source)) throw new Error(`${where}: an unknown source (${f.source})`);
    if (facts.some((x) => x.slot === f.slot && x.kind === f.kind)) throw new Error(`${where}: a second fact for the same ability and kind`);
    const prepared = texts[f.slot].prepared;
    const fact = { slot: f.slot, kind: f.kind, clause: checkedSpan(f.clause, prepared[f.source], `${where}: its clause`), source: f.source };
    if (f.qualifierSource !== undefined && f.qualifier === undefined) throw new Error(`${where}: a qualifier's source without a qualifier`);
    if (f.qualifier !== undefined) {
      if (f.qualifierSource !== undefined && (!SOURCES.includes(f.qualifierSource) || f.qualifierSource === f.source)) throw new Error(`${where}: a qualifier's source that is not the slot's other text (${f.qualifierSource})`);
      const from = f.qualifierSource ?? f.source;
      fact.qualifier = checkedSpan(f.qualifier, prepared[from], `${where}: its qualifier`, { maxWords: MAX_QUALIFIER_WORDS });
      if (f.qualifierSource !== undefined) fact.qualifierSource = f.qualifierSource;
    }
    if (f.conditional !== undefined) {
      if (f.conditional !== true) throw new Error(`${where}: "conditional" is ${JSON.stringify(f.conditional)}, not true`);
      fact.conditional = true;
    }
    if (f.alsoDescribedAs !== undefined) {
      const a = f.alsoDescribedAs;
      if (!isObject(a) || Object.keys(a).some((k) => !["kind", "source", "clause"].includes(k))) throw new Error(`${where}: alsoDescribedAs is not {kind, source, clause}`);
      if (!KINDS.includes(a.kind) || a.kind === f.kind) throw new Error(`${where}: alsoDescribedAs names ${a.kind}, not another known kind`);
      if (!SOURCES.includes(a.source)) throw new Error(`${where}: alsoDescribedAs quotes an unknown source (${a.source})`);
      fact.alsoDescribedAs = { kind: a.kind, source: a.source, clause: checkedSpan(a.clause, prepared[a.source], `${where}: its alsoDescribedAs clause`) };
    }
    facts.push(fact);
  }
  const disagreements = [];
  for (const d of reviewed.disagreements) {
    const where = `${id} ${d?.slot} disagreement`;
    if (!isObject(d) || !SLOTS.includes(d.slot) || !isObject(d.description) || !isObject(d.tooltip) || Object.keys(d).some((k) => !["slot", "description", "tooltip"].includes(k))) throw new Error(`${where}: not {slot, description: {kind, clause}, tooltip: {kind, clause}}`);
    const prepared = texts[d.slot].prepared;
    const side = (source) => {
      const s = d[source];
      if (Object.keys(s).some((k) => !["kind", "clause"].includes(k)) || !KINDS.includes(s.kind)) throw new Error(`${where}: its ${source} names an unknown kind (${s.kind})`);
      return { kind: s.kind, clause: checkedSpan(s.clause, prepared[source], `${where}: its ${source} clause`) };
    };
    const description = side("description");
    const tooltip = side("tooltip");
    if (description.kind === tooltip.kind) throw new Error(`${where}: both texts name ${description.kind}, which is no disagreement`);
    // Never pick one: no fact of either kind on that ability.
    const picked = facts.find((f) => f.slot === d.slot && (f.kind === description.kind || f.kind === tooltip.kind));
    if (picked) throw new Error(`${where}: a fact of ${picked.kind}, one of the two kinds Riot's texts differ on`);
    if (disagreements.some((x) => x.slot === d.slot && isDeepStrictEqual(x, { slot: d.slot, description, tooltip }))) throw new Error(`${where}: recorded twice`);
    disagreements.push({ slot: d.slot, description, tooltip });
  }
  facts.sort((a, b) => SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot) || KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind));
  disagreements.sort((a, b) => SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot));
  return { record: { championId: id, version: full.version, reviewedOn: day, review, abilities, facts, disagreements } };
}

/* ---------- The committed files ---------- */

/** A committed file: one fact and one disagreement per line, so a new review reads as a short diff. */
export function serialise(record) {
  const list = (items) => items.map((x, i) => `    ${JSON.stringify(x)}${i < items.length - 1 ? "," : ""}`);
  const lines = ["{", `  "championId": ${JSON.stringify(record.championId)},`, `  "version": ${JSON.stringify(record.version)},`, `  "reviewedOn": ${JSON.stringify(record.reviewedOn)},`, `  "review": ${JSON.stringify(record.review)},`, `  "abilities": {`];
  SLOTS.forEach((slot, i) => lines.push(`    ${JSON.stringify(slot)}: ${JSON.stringify(record.abilities[slot])}${i < SLOTS.length - 1 ? "," : ""}`));
  const block = (name, items, last) => (items.length ? [`  ${JSON.stringify(name)}: [`, ...list(items), `  ]${last ? "" : ","}`] : [`  ${JSON.stringify(name)}: []${last ? "" : ","}`]);
  lines.push("  },", ...block("facts", record.facts, false), ...block("disagreements", record.disagreements, true), "}", "");
  return lines.join("\n");
}

/** The index of loaders, one dynamic import per committed file. */
export function serialiseIndex(ids) {
  const head = `/*
  THE REVIEWED FACTS FROM RIOT'S TEXT (L3), one JSON file per champion beside this one, each loaded
  only when its champion is on the page (docs/MATCHUP_INTEL.md, "Facts from Riot's text"): a
  dynamic import per file, so no page or job carries the others, and a cold start loads none.

  Generated by scripts/matchup-intel/import-riot-text.mjs from the reviewed table; do not edit by
  hand. riot-text.test.ts checks that every file here is listed, and every listed file reads.
*/

`;
  if (!ids.length) return `${head}export const RIOT_TEXT_FILES: Readonly<Record<string, () => Promise<{ default: unknown }>>> = {};\n`;
  return `${head}export const RIOT_TEXT_FILES: Readonly<Record<string, () => Promise<{ default: unknown }>>> = {\n${ids.map((id) => `  ${id}: () => import("./${id}.json"),`).join("\n")}\n};\n`;
}

/* ---------- The whole table ---------- */

/** What the table's counts are (the index's, DONE's): the champions, facts and disagreements imported, and the markers among the facts. */
export function countsOf(records) {
  const facts = records.flatMap((r) => r.facts);
  return {
    champions: records.length,
    facts: facts.length,
    disagreements: records.reduce((n, r) => n + r.disagreements.length, 0),
    qualifier: facts.filter((f) => f.qualifier !== undefined).length,
    qualifierSource: facts.filter((f) => f.qualifierSource !== undefined).length,
    conditional: facts.filter((f) => f.conditional).length,
    alsoDescribedAs: facts.filter((f) => f.alsoDescribedAs !== undefined).length,
  };
}

/**
 * The whole reviewed table, checked as one: DONE present, _index.json listing exactly the
 * champions' files with each one's counts and the same review record, every file importing, and the
 * totals the index and DONE give. Returns the records in id order; throws at the first thing wrong.
 */
export async function importTable(from, full) {
  if (!existsSync(join(from, "DONE"))) throw new Error(`${from} has no DONE: the review is not complete, so nothing is imported`);
  const dir = existsSync(join(from, "champions")) ? join(from, "champions") : from;
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json") && !f.startsWith("_")).sort();
  if (!files.length) throw new Error(`${dir} holds no champion's file`);
  const indexFile = [join(dir, "_index.json"), join(from, "_index.json")].find((f) => existsSync(f));
  if (!indexFile) throw new Error(`${from} has no _index.json: the table's list of champions is missing, so nothing is imported`);
  const index = JSON.parse(await readFile(indexFile, "utf8"));
  const rows = Array.isArray(index?.champions) ? index.champions : [];
  const ids = rows.map((x) => x?.champion);
  const found = files.map((f) => f.replace(/\.json$/, ""));
  const missing = ids.filter((id) => !found.includes(id));
  const extra = found.filter((id) => !ids.includes(id));
  if (!ids.length || missing.length || extra.length || new Set(ids).size !== ids.length) throw new Error(`${indexFile} does not list exactly the champions' files (missing ${missing.join(", ") || "none"}; not listed ${extra.join(", ") || "none"})`);
  let indexRecord;
  try {
    indexRecord = reviewRecordOf(index.reviewRecord);
  } catch (err) {
    throw new Error(`${indexFile}: ${err instanceof Error ? err.message : err}`);
  }
  const records = [];
  for (const file of files) {
    const reviewed = JSON.parse(await readFile(join(dir, file), "utf8"));
    const { record } = importChampion(reviewed, full);
    if (`${record.championId}.json` !== file) throw new Error(`${file} holds ${record.championId}`);
    const row = rows.find((x) => x.champion === record.championId);
    // A row may carry its own record (a champion a person checked later); otherwise the table's.
    const expected = row.reviewRecord !== undefined ? reviewRecordOf(row.reviewRecord) : indexRecord;
    if (!isDeepStrictEqual(record.review, expected)) throw new Error(`${file}: its review record is not the one _index.json gives it`);
    if (row.facts !== record.facts.length || row.disagreements !== record.disagreements.length) throw new Error(`${file}: ${record.facts.length} facts and ${record.disagreements.length} disagreements, _index.json says ${row.facts} and ${row.disagreements}`);
    if (index.version !== undefined && index.version !== record.version) throw new Error(`${file}: version ${record.version}, _index.json says ${index.version}`);
    records.push(record);
  }
  const counts = countsOf(records);
  const totals = index.totals ?? {};
  for (const key of ["champions", "facts", "disagreements"]) if (totals[key] !== undefined && totals[key] !== counts[key]) throw new Error(`_index.json's total of ${key} is ${totals[key]}, the files hold ${counts[key]}`);
  // DONE may record the table's counts (it does since 19 Nov 2026): each it gives must be the files'.
  let done = null;
  try {
    done = JSON.parse(await readFile(join(from, "DONE"), "utf8"));
  } catch {
    done = null;
  }
  if (isObject(done)) for (const [key, n] of Object.entries(counts)) if (typeof done[key] === "number" && done[key] !== n) throw new Error(`DONE gives ${done[key]} ${key}, the files hold ${n}`);
  return records;
}

async function main(argv) {
  const args = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--check") args.set("--check", "1");
    else if (argv[i]?.startsWith("--")) args.set(argv[i], argv[(i += 1)]);
  }
  const from = args.get("--from");
  const ddragon = args.get("--ddragon");
  if (!from || !ddragon) throw new Error("Give --from <reviewed dir> and --ddragon <championFull.json of the version reviewed>");
  const full = JSON.parse(await readFile(resolve(ddragon), "utf8"));
  if (typeof full.version !== "string" || !VERSION.test(full.version)) throw new Error("the Data Dragon file has no version");
  const records = await importTable(resolve(from), full);
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const outDir = resolve(args.get("--out") ?? join(root, "src/server/matchup-intel/riot-text"));
  const wanted = new Map(records.map((r) => [`${r.championId}.json`, serialise(r)]));
  wanted.set("index.ts", serialiseIndex(records.map((r) => r.championId)));
  const c = countsOf(records);
  const summary = `${c.champions} champions, ${c.facts} facts, ${c.disagreements} disagreements (${c.qualifier} facts with a qualifier, ${c.qualifierSource} of them from the other text; ${c.conditional} conditional; ${c.alsoDescribedAs} also described as another kind), Data Dragon ${full.version}`;
  if (args.has("--check")) {
    let same = true;
    for (const [name, text] of wanted) {
      const current = await readFile(join(outDir, name), "utf8").catch(() => "");
      if (current !== text) {
        console.error(`${name} differs from the reviewed table.`);
        same = false;
      }
    }
    const extra = (await readdir(outDir).catch(() => [])).filter((f) => f.endsWith(".json") && !wanted.has(f));
    for (const f of extra) console.error(`${f} is not in the reviewed table.`);
    if (!same || extra.length) process.exit(1);
    console.log(`The committed facts match the reviewed table: ${summary}.`);
    return;
  }
  await mkdir(outDir, { recursive: true });
  for (const f of (await readdir(outDir)).filter((f) => f.endsWith(".json") && !wanted.has(f))) await rm(join(outDir, f));
  for (const [name, text] of wanted) await writeFile(join(outDir, name), text);
  console.log(`Wrote ${outDir}: ${summary}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
