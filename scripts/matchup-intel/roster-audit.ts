/*
  Matchup Intel's roster audit (docs/MATCHUP_INTEL_ROSTER_AUDIT.md): for every champion, what the page
  can show for it in any matchup, from the data committed and Riot's own: each ability's cooldown as
  the page's guard allows it (ddragonCooldownDisplay), the reviewed facts from Riot's ability text by
  kind, Riot's tips, and whether a person-curated (AI-reviewed) set of notes exists. It reads
  Data Dragon's public files for the tips and nothing else online, and writes the report.

  Run: pnpm exec tsx scripts/matchup-intel/roster-audit.ts
*/
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ddragonCooldownDisplay } from "../../src/domain/matchup-intel/cooldown";
import { RIOT_TEXT_KIND_GROUP, type DdragonAbility, type KindGroup, type RiotTextKind } from "../../src/domain/matchup-intel/types";
import { getChampionNotes } from "../../src/server/matchup-intel/curated";

const ROOT = path.resolve(__dirname, "../..");
const fixture = JSON.parse(readFileSync(path.join(ROOT, "src/server/riot/fixtures/champion-abilities.fixture.json"), "utf8")) as { version: string; champions: Record<string, { abilities: DdragonAbility[] }> };
const TEXT = path.join(ROOT, "src/server/matchup-intel/riot-text");

interface Row {
  id: string;
  cooldowns: number;
  noCooldown: string[];
  facts: number;
  groups: Partial<Record<KindGroup, number>>;
  tips: { ally: number; enemy: number };
  curated: boolean;
}

async function main() {
  const version = (await (await fetch("https://ddragon.leagueoflegends.com/api/versions.json")).json())[0] as string;
  const full = (await (await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/championFull.json`)).json()).data as Record<string, { allytips: string[]; enemytips: string[] }>;
  const rows: Row[] = [];
  for (const [id, c] of Object.entries(fixture.champions).sort(([a], [b]) => a.localeCompare(b))) {
    const basic = c.abilities.filter((a) => a.slot !== "P");
    const shown = basic.filter((a) => ddragonCooldownDisplay(a).kind !== "unknown");
    const noCooldown = basic.filter((a) => ddragonCooldownDisplay(a).kind === "unknown").map((a) => `${a.slot} (${(ddragonCooldownDisplay(a) as { reason: string }).reason})`);
    let facts = 0;
    const groups: Partial<Record<KindGroup, number>> = {};
    if (readdirSync(TEXT).includes(`${id}.json`)) {
      const file = JSON.parse(readFileSync(path.join(TEXT, `${id}.json`), "utf8")) as { facts: Array<{ kind: RiotTextKind }> };
      for (const f of file.facts) {
        facts += 1;
        const g = RIOT_TEXT_KIND_GROUP[f.kind];
        if (g) groups[g] = (groups[g] ?? 0) + 1;
      }
    }
    rows.push({ id, cooldowns: shown.length, noCooldown, facts, groups, tips: { ally: full[id]?.allytips?.length ?? 0, enemy: full[id]?.enemytips?.length ?? 0 }, curated: !!getChampionNotes(id) });
  }
  const n = rows.length;
  const count = (f: (r: Row) => boolean) => rows.filter(f).length;
  const cc = (r: Row) => r.groups["crowd-control"] ?? 0;
  const mob = (r: Row) => r.groups.mobility ?? 0;
  const lines: string[] = [];
  lines.push("# Matchup Intel: roster audit", "");
  lines.push(`What Matchup Intel can show for each of the ${n} champions in any matchup, from the committed data (Data Dragon ${fixture.version}'s abilities, the 1,112 reviewed facts from Riot's text) and Riot's tips at Data Dragon ${version}. Made by \`scripts/matchup-intel/roster-audit.ts\` on 23 Nov 2026; run it again after an import or a patch.`, "");
  lines.push("## Summary", "");
  lines.push("| Measure | Champions |", "|---|---|");
  lines.push(`| A cooldown shown for all four basic abilities | ${count((r) => r.cooldowns === 4)} of ${n} |`);
  lines.push(`| At least one basic ability without a cooldown shown (the guard's reason in the table) | ${count((r) => r.cooldowns < 4)} |`);
  lines.push(`| Reviewed facts from Riot's text | ${count((r) => r.facts > 0)} of ${n} (median ${[...rows].map((r) => r.facts).sort((a, b) => a - b)[Math.floor(n / 2)]} a champion) |`);
  lines.push(`| No crowd-control fact recorded | ${count((r) => cc(r) === 0)} |`);
  lines.push(`| No mobility fact recorded | ${count((r) => mob(r) === 0)} |`);
  lines.push(`| Riot's tips (ally and enemy) | ${count((r) => r.tips.ally + r.tips.enemy > 0)} of ${n} |`);
  lines.push(`| Curated notes (AI reviewers, owner-approved rule) | ${count((r) => r.curated)} of ${n} |`, "");
  lines.push("## What every matchup has, and what only curated ones have", "");
  lines.push("- **Every pair:** each ability's base cooldowns where Riot's data gives a true one (the guard below), the cooldown at a chosen ability haste, the kinds of mechanic Riot's own ability text names (crowd control, mobility, defence, sustain, power), each with its clause, labelled \"reviewed automatically (not by a person)\", Riot's tips (quoted and dated), and the team's own games.");
  lines.push("- **Only curated pairs (3) and champions (6):** trading windows, threats and opportunities in words, level spikes and ability interactions. These need a source that states them (the wiki, read by a person or with its consent): Riot's data does not, so they are not assembled for other pairs, and nothing is inferred.");
  lines.push("- **With OD4's high-elo statistics (once compliant):** observed choices and results, with samples, for every champion with enough games.", "");
  lines.push("## Gaps to work on, in order", "");
  const gaps = rows.filter((r) => r.cooldowns < 4);
  lines.push(`1. **Abilities without a cooldown shown (${gaps.length} champions).** Riot's data gives no true cooldown there (charges, two abilities in one slot, a picked-up spell, a known wrong value). Only a checked source can fill them: they stay "Cooldown not in Riot's data" until then.`);
  lines.push(`2. **Champions with no crowd-control or mobility fact (${count((r) => cc(r) === 0 && mob(r) === 0)}).** Either the kit has none in Riot's text, or the review left a fact out; a person's review of those files (owner's step 11) would settle which.`);
  lines.push("3. **Curated notes beyond the top lane.** Jungle, Mid, ADC and Support have none; each new champion's notes follow the existing rules (sources, patch, AI-reviewed label, owner approval).", "");
  lines.push("## Every champion", "");
  lines.push("| Champion | Cooldowns shown | Without | Facts | Crowd control | Mobility | Defence | Sustain | Tips | Curated |", "|---|---|---|---|---|---|---|---|---|---|");
  for (const r of rows) lines.push(`| ${r.id} | ${r.cooldowns}/4 | ${r.noCooldown.join(", ") || "—"} | ${r.facts} | ${cc(r)} | ${mob(r)} | ${r.groups.defence ?? 0} | ${r.groups.sustain ?? 0} | ${r.tips.ally + r.tips.enemy} | ${r.curated ? "yes" : "—"} |`);
  writeFileSync(path.join(ROOT, "docs/MATCHUP_INTEL_ROSTER_AUDIT.md"), lines.join("\n") + "\n");
  console.log(lines.slice(0, 22).join("\n"));
}
void main();
