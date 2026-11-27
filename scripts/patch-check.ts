/**
 * The patch-day check (Release 19; docs/PATCH_MAINTENANCE.md): runs the app's own Champion Intel
 * rules over a game version's Data Dragon files and prints counts beside the committed offline
 * fixture's (the version the rules were last checked on). Read only: it downloads Data Dragon's
 * public files into memory and writes nothing. Run by hand on patch day, never by a workflow.
 *
 *   pnpm exec tsx scripts/patch-check.ts                     (Data Dragon's latest version)
 *   pnpm exec tsx scripts/patch-check.ts --version 16.23.1
 *   pnpm exec tsx scripts/patch-check.ts --from path/to/championFull.json [--items path/to/item.json]
 *   add --max-drop 5 to change the failing drop (percentage points of resolved figures; default 5)
 *
 * Exits 1 when a champion's file cannot be read by the rules, or when the share of spells with a
 * resolved cost or cooldown (or the mechanics chips per champion) drops by more than --max-drop:
 * a format change Riot made, which docs/CHAMPION_INTEL.md "Data" says how to handle.
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { compactChampionAbilities } from "@/server/riot/static/abilities";
import { abilityFixture } from "@/server/riot/static/ability-fixture";
import { itemHaste, isRiftItem } from "@/server/riot/static/assets";
import { itemKindsOf } from "@/domain/build-path";
import { patchCounts, patchDiff, patchProblems } from "@/server/riot/static/patch-check";
import type { DdragonChampionAbilities } from "@/domain/champion-lookup/types";

const VERSION = /^\d{1,4}(?:\.\d{1,4}){1,3}$/;
const DDRAGON = "https://ddragon.leagueoflegends.com";

async function json(url: string): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000), headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`Data Dragon answered ${res.status} for ${url}`);
  return res.json();
}

async function main(argv: string[]) {
  const args = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) if (argv[i]?.startsWith("--")) args.set(argv[i]!, argv[(i += 1)] ?? "");
  const maxDrop = Number(args.get("--max-drop") ?? 5);
  let version = args.get("--version") ?? "latest";
  let full: { version?: string; data?: Record<string, { name?: string }> };
  if (args.get("--from")) full = JSON.parse(await readFile(resolve(args.get("--from")!), "utf8"));
  else {
    if (version === "latest") version = ((await json(`${DDRAGON}/api/versions.json`)) as string[])[0] ?? "";
    if (!VERSION.test(version)) throw new Error(`Not a Data Dragon version: ${version}`);
    full = (await json(`${DDRAGON}/cdn/${version}/data/en_US/championFull.json`)) as typeof full;
  }
  version = String(full.version ?? version);
  const data = full.data ?? {};

  const records: Record<string, DdragonChampionAbilities> = {};
  const names: Record<string, string> = {};
  const unreadable: string[] = [];
  for (const id of Object.keys(data).sort()) {
    names[id] = String(data[id]?.name ?? id);
    let record: DdragonChampionAbilities | null = null;
    try {
      record = compactChampionAbilities(data[id], version);
    } catch {
      record = null;
    }
    if (!record || record.championId !== id) unreadable.push(id);
    else records[id] = record;
  }
  const fixture = abilityFixture();
  const baseline = patchCounts(fixture.champions);
  const next = patchCounts(records, names);
  const diff = patchDiff(fixture.champions, records);
  const problems = patchProblems({ unreadable, baseline, next, maxDropPct: maxDrop });

  const line = (label: string, a: unknown, b: unknown) => console.log(`${label.padEnd(34)} ${String(a).padStart(8)}  ${String(b).padStart(8)}`);
  console.log(`Champion Intel rules over Data Dragon ${version}, beside the committed fixture (${fixture.version})\n`);
  line("", fixture.version, version);
  line("champions", baseline.champions, next.champions);
  line("spells (Q, W, E, R)", baseline.spells, next.spells);
  line("costs per rank", baseline.costs.perRank, next.costs.perRank);
  line("costs: no cost", baseline.costs.none, next.costs.none);
  line("costs: Riot's words", baseline.costs.words, next.costs.words);
  line("costs: not resolved (shown as none)", baseline.costs.unresolved, next.costs.unresolved);
  for (const key of [...new Set([...Object.keys(baseline.cooldowns), ...Object.keys(next.cooldowns)])].sort()) line(`cooldowns: ${key}`, baseline.cooldowns[key] ?? 0, next.cooldowns[key] ?? 0);
  line("mechanics chips", baseline.mechanicChips, next.mechanicChips);
  line("spells with a cost or cooldown", baseline.resolved, next.resolved);
  console.log("");
  console.log(`unreadable champions: ${unreadable.length}${unreadable.length ? ` (${unreadable.join(", ")})` : ""}`);
  console.log(`champions new since the fixture: ${diff.added.length}${diff.added.length ? ` (${diff.added.join(", ")})` : ""}; gone: ${diff.removed.length}${diff.removed.length ? ` (${diff.removed.join(", ")})` : ""}`);
  console.log(`abilities whose Riot text changed: ${diff.textChanged}; cooldowns changed: ${diff.cooldownChanged}; costs changed: ${diff.costChanged}`);
  console.log(`mechanics exceptions whose text changed (review each): ${diff.staleMechanicExceptions.length}${diff.staleMechanicExceptions.length ? ` (${diff.staleMechanicExceptions.join(", ")})` : ""}`);
  console.log(`cooldown exceptions whose array changed (review each): ${diff.staleCooldownExceptions.length}${diff.staleCooldownExceptions.length ? ` (${diff.staleCooldownExceptions.join(", ")})` : ""}`);

  // The items: Summoner's Rift items, the ability haste the parser reads, the build path's kinds.
  if (args.get("--items") || !args.get("--from")) {
    const items = (args.get("--items") ? JSON.parse(await readFile(resolve(args.get("--items")!), "utf8")) : await json(`${DDRAGON}/cdn/${version}/data/en_US/item.json`)) as { data?: Record<string, { description?: string; maps?: Record<string, boolean> }> };
    const rift = Object.entries(items.data ?? {}).filter(([id, v]) => isRiftItem(id, v));
    const namesHaste = rift.filter(([, v]) => /<stats>[\s\S]*Ability Haste[\s\S]*<\/stats>/i.test(v.description ?? ""));
    const unparsed = namesHaste.filter(([, v]) => itemHaste(v.description) === null);
    const kinds = itemKindsOf(items.data ?? {});
    console.log(`\nitems on Summoner's Rift: ${rift.length}; finished: ${kinds.done.length}; minor (consumables, trinkets): ${kinds.minor.length}`);
    console.log(`items naming ability haste: ${namesHaste.length}; the haste parser reads ${namesHaste.length - unparsed.length}${unparsed.length ? `, not: ${unparsed.map(([id]) => id).join(", ")}` : ""}`);
    if (unparsed.length) problems.push(`${unparsed.length} item(s) name ability haste the parser cannot read`);
  }

  console.log("");
  if (problems.length) {
    for (const p of problems) console.error(`PROBLEM: ${p}`);
    console.error("See docs/PATCH_MAINTENANCE.md: a format change needs the rules updated (docs/CHAMPION_INTEL.md, \"Data\").");
    process.exit(1);
  }
  console.log("No problem: the rules read every champion, and no resolved figure dropped beyond the limit.");
}

main(process.argv.slice(2)).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
