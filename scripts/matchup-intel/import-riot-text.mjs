/**
 * Imports the reviewed facts from Riot's ability text (Matchup Intel's L3; docs/MATCHUP_INTEL.md,
 * "Facts from Riot's text") into the app: one JSON file per champion under
 * src/server/matchup-intel/riot-text/, and the index of loaders beside them (riot-text/index.ts), so
 * the page loads only the files of the champions it shows.
 *
 *   node scripts/matchup-intel/import-riot-text.mjs --from <reviewed dir> --ddragon <championFull.json>
 *   add --check to compare with the committed files instead of writing them (exit 1 if one differs)
 *
 * The reviewed table (<reviewed dir>/champions/<Id>.json, with _index.json and DONE beside them) holds
 * per champion: {champion, version, reviewedAt, review, abilityText: {slot: {name, descriptionHash,
 * tooltipHash}}, facts: [{slot, kind, clause, source}]}. Each file is checked against Data Dragon's own
 * championFull.json of the version it was reviewed on (read from a file: this script downloads
 * nothing, and reads nothing from the League of Legends Wiki):
 *   - the champion and each ability's name are Riot's;
 *   - each fact names a known kind, a slot and which of Riot's two texts it quotes, and its clause
 *     appears in that text (markup removed, Riot's placeholders read as "N"); a fact that does not is
 *     left out and reported;
 *   - each ability is pinned to the hash of its whole text (riotTextHash, as the version-check job
 *     stores it), so the page hides its facts once Riot's text changes.
 * Nothing is written unless the table is complete (DONE) and every file reads: all or nothing.
 */
import { readdir, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { riotTextHash } from "./build-ability-fixture.mjs";

export const SLOTS = ["P", "Q", "W", "E", "R"];
/** The kinds a fact may name: the same list, in the same order, as RIOT_TEXT_KINDS in src/domain/matchup-intel/types.ts. */
export const KINDS = ["stun", "knockup", "knockback", "pull", "root", "slow", "silence", "fear", "flee", "charm", "taunt", "suppression", "ground", "polymorph", "sleep", "blind", "disarm", "nearsight", "drowsy", "dash", "blink", "leap", "teleport", "unstoppable", "shield", "untargetable", "invulnerable", "stasis", "spellshield", "damagereduction", "tenacity", "cleanse", "stealth", "parry", "heal", "lifesteal", "omnivamp", "regeneration", "recast", "charges", "cooldownrefund", "reset", "toggle", "empower", "transform"];
const SOURCES = ["description", "tooltip"];
const CHAMPION = /^[A-Za-z0-9]{1,40}$/;
const VERSION = /^\d{1,4}(\.\d{1,4}){1,3}$/;
const MAX_CLAUSE = 400;

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”" };

/** Riot's text as plain words: markup and inline icons removed, entities decoded, placeholders read as "N", whitespace collapsed. */
export function plainText(raw) {
  return String(raw ?? "")
    .replace(/&([a-z]+);/gi, (w, e) => ENTITIES[e.toLowerCase()] ?? w)
    .replace(/&#(\d+);/g, (w, n) => String.fromCodePoint(Number(n)))
    .replace(/\{\{\s*spellmodifierdescriptionappend\s*\}\}/g, "")
    .replace(/%i:[A-Za-z0-9_]+%/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<br\s*\/?>|<\/?li>|<hr\s*\/?>/gi, " ")
    .replace(/\{\{\s*[^{}]*?\s*\}\}/g, "N")
    .replace(/<\/?[A-Za-z][^<>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** A clause as compared: whitespace collapsed, curly quotes straightened, case kept. */
const squash = (s) => String(s).replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();

/**
 * Whether a quoted clause is in Riot's text (both as plain words). A clause cut short with an
 * ellipsis at either end ("…Slowing th…") is checked on the words it quotes.
 */
export function clauseInText(clause, raw) {
  const text = squash(plainText(raw));
  const quote = squash(clause).replace(/^[“"']|[”"']$/g, "");
  const core = quote.replace(/^(?:…|\.\.\.)\s*/, "").replace(/\s*(?:…|\.\.\.)$/, "");
  return core.length >= 8 && text.includes(core);
}

const sha256 = (s) => createHash("sha256").update(s).digest("hex");

/** Whether a hash the review recorded is the SHA-256 of `text` (in full, or its first digits). */
function sameHash(recorded, text) {
  if (typeof recorded !== "string" || !/^[0-9a-f]{8,64}$/.test(recorded)) return false;
  return sha256(text).startsWith(recorded);
}

/** The review's record of how it was done, as the app keeps it: independent automated reviews, an adjudicator, a person. */
export function reviewOf(review) {
  const r = review && typeof review === "object" ? review : {};
  const reviews = Number.isInteger(r.automatedReviews) ? r.automatedReviews : Number.isInteger(r.reviewers) ? r.reviewers : Array.isArray(r.reviews) ? r.reviews.length : Number.isInteger(r.independentReviews) ? r.independentReviews : 2;
  const adjudicated = typeof r.adjudicated === "boolean" ? r.adjudicated : typeof r.adjudicator === "string" || r.adjudicator === true || !!r.adjudication;
  const person = r.person === true || r.byPerson === true || r.human === true;
  return { automatedReviews: reviews, adjudicated, person };
}

/** Riot's raw texts for one champion's abilities, by slot. */
function riotTexts(entry) {
  const out = { P: { name: entry.passive?.name, description: entry.passive?.description ?? "", tooltip: null } };
  ["Q", "W", "E", "R"].forEach((slot, i) => {
    const s = entry.spells?.[i];
    out[slot] = { name: s?.name, description: s?.description ?? "", tooltip: s?.tooltip ?? "" };
  });
  return out;
}

/**
 * One champion's reviewed file as the app commits it, with what was left out and why. Throws when
 * the file cannot be read as the champion's at the version given.
 */
export function importChampion(reviewed, full) {
  const id = reviewed?.champion ?? reviewed?.championId;
  if (typeof id !== "string" || !CHAMPION.test(id)) throw new Error(`no champion id (${JSON.stringify(id)})`);
  const entry = full?.data?.[id];
  if (!entry) throw new Error(`${id}: not in Data Dragon ${full?.version}`);
  if (reviewed.version !== full.version) throw new Error(`${id}: reviewed on ${reviewed.version}, the Data Dragon file is ${full.version}`);
  const day = typeof reviewed.reviewedAt === "string" ? reviewed.reviewedAt.slice(0, 10) : typeof reviewed.reviewedOn === "string" ? reviewed.reviewedOn.slice(0, 10) : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error(`${id}: no review day (${JSON.stringify(reviewed.reviewedAt)})`);
  const texts = riotTexts(entry);
  const notes = [];
  const abilities = {};
  for (const slot of SLOTS) {
    const t = texts[slot];
    const said = reviewed.abilityText?.[slot];
    if (said && said.name !== t.name) throw new Error(`${id} ${slot}: reviewed as "${said.name}", Riot's name is "${t.name}"`);
    if (said?.descriptionHash && !sameHash(said.descriptionHash, t.description)) notes.push(`${id} ${slot}: the review's description hash is not Data Dragon ${full.version}'s description`);
    if (said?.tooltipHash && t.tooltip !== null && !sameHash(said.tooltipHash, t.tooltip)) notes.push(`${id} ${slot}: the review's tooltip hash is not Data Dragon ${full.version}'s tooltip`);
    abilities[slot] = { name: t.name, textHash: riotTextHash(t.description, t.tooltip) };
  }
  const facts = [];
  const left = [];
  for (const f of Array.isArray(reviewed.facts) ? reviewed.facts : []) {
    const decision = f?.decision ?? f?.verdict ?? "accept";
    if (decision !== "accept" && decision !== "accepted" && decision !== true) continue;
    const why = !SLOTS.includes(f?.slot) ? "an unknown slot" : !KINDS.includes(f?.kind) ? `an unknown kind (${f?.kind})` : !SOURCES.includes(f?.source) ? `an unknown source (${f?.source})` : typeof f?.clause !== "string" || !f.clause.trim() ? "no clause" : f.clause.length > MAX_CLAUSE ? "a clause too long" : /[<>]|\{\{|\}\}/.test(f.clause) ? "markup in its clause" : f.source === "tooltip" && texts[f.slot].tooltip === null ? "a tooltip the passive does not have" : !clauseInText(f.clause, texts[f.slot][f.source]) ? `a clause not in Riot's ${f.source}` : null;
    if (why) {
      left.push(`${id} ${f?.slot} ${f?.kind}: ${why}`);
      continue;
    }
    const clause = squash(f.clause).replace(/^[“"']|[”"']$/g, "");
    if (facts.some((x) => x.slot === f.slot && x.kind === f.kind && x.clause === clause && x.source === f.source)) continue;
    facts.push({ slot: f.slot, kind: f.kind, clause, source: f.source });
  }
  facts.sort((a, b) => SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot) || KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind) || SOURCES.indexOf(a.source) - SOURCES.indexOf(b.source));
  return { record: { championId: id, version: full.version, reviewedOn: day, review: reviewOf(reviewed.review), abilities, facts }, notes, left };
}

/** A committed file: one fact per line, so a new review reads as a short diff. */
export function serialise(record) {
  const lines = ["{", `  "championId": ${JSON.stringify(record.championId)},`, `  "version": ${JSON.stringify(record.version)},`, `  "reviewedOn": ${JSON.stringify(record.reviewedOn)},`, `  "review": ${JSON.stringify(record.review)},`, `  "abilities": {`];
  SLOTS.forEach((slot, i) => lines.push(`    ${JSON.stringify(slot)}: ${JSON.stringify(record.abilities[slot])}${i < SLOTS.length - 1 ? "," : ""}`));
  lines.push("  },", `  "facts": [`);
  record.facts.forEach((f, i) => lines.push(`    ${JSON.stringify(f)}${i < record.facts.length - 1 ? "," : ""}`));
  lines.push("  ]", "}", "");
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

async function main(argv) {
  const args = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--check") args.set("--check", "1");
    else if (argv[i]?.startsWith("--")) args.set(argv[i], argv[(i += 1)]);
  }
  const from = args.get("--from");
  const ddragon = args.get("--ddragon");
  if (!from || !ddragon) throw new Error("Give --from <reviewed dir> and --ddragon <championFull.json of the version reviewed>");
  if (!existsSync(join(from, "DONE"))) throw new Error(`${from} has no DONE: the review is not complete, so nothing is imported`);
  const full = JSON.parse(await readFile(resolve(ddragon), "utf8"));
  if (typeof full.version !== "string" || !VERSION.test(full.version)) throw new Error("the Data Dragon file has no version");
  const dir = join(from, "champions");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort();
  const records = [];
  const notes = [];
  const left = [];
  for (const file of files) {
    const out = importChampion(JSON.parse(await readFile(join(dir, file), "utf8")), full);
    if (`${out.record.championId}.json` !== file) throw new Error(`${file} holds ${out.record.championId}`);
    records.push(out.record);
    notes.push(...out.notes);
    left.push(...out.left);
  }
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const outDir = resolve(args.get("--out") ?? join(root, "src/server/matchup-intel/riot-text"));
  const wanted = new Map(records.map((r) => [`${r.championId}.json`, serialise(r)]));
  wanted.set("index.ts", serialiseIndex(records.map((r) => r.championId)));
  const facts = records.reduce((n, r) => n + r.facts.length, 0);
  const summary = `${records.length} champions, ${facts} facts (${left.length} left out, ${notes.length} hash notes), Data Dragon ${full.version}`;
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
  for (const line of left) console.log(`left out: ${line}`);
  for (const line of notes) console.log(`note: ${line}`);
  console.log(`Wrote ${outDir}: ${summary}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
