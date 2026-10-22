import { defineJob, type JobContext } from "./registry";
import { getOrCreateTeam } from "@/server/repositories/team";
import { listChampions } from "@/server/repositories/champions";
import { erasureFilter } from "@/server/privacy/ledger";
import { clashScoutEnabled } from "@/server/clash/access";
import { candidateRiot } from "@/server/clash/candidate-riot";
import { teamPlatform } from "@/server/clash/scouts";
import { generateBlindTest, runBlindTest, runVariants, type LabContext, type LabRun } from "@/server/clash/lab";
import { DEFAULT_VARIANTS, type VariantSpec } from "@/domain/clash-scout/lab";

/*
  CLASH SCOUT ACCURACY CHECK, on demand only (the Data jobs workflow or Admin → Data): the Testing
  Lab's blind tests run here without a browser, so the identification engine is measured on the
  team's real recorded games and Riot's real figures. Several blind tests of five known accounts
  each, graded under the two conditions kept apart (A: real discovery, as Clash Scout runs it;
  B: the controlled pool, the rules alone), then the outdated-data versions of the first test.

  Read-only and counts only: the outcome, its logs and what is stored of the run hold numbers,
  never a name, a Riot ID or an account. The same bounds as the Lab (twelve accounts read for a
  test, eight more for its pool; Riot's answers kept half an hour, so later versions cost little),
  and it stops starting new work well before the job's time budget.
*/

const ROUNDS = 3;
/** Time kept in hand for the round or version under way when the budget is checked. */
const RESERVE_MS = 70_000;

type Tally = { players: number; correct: number; incorrect: number; ambiguous: number; notIdentified: number; notDiscovered: number; notEnough: number; truthDiscovered: number; topRanked: number };

const emptyTally = (): Tally => ({ players: 0, correct: 0, incorrect: 0, ambiguous: 0, notIdentified: 0, notDiscovered: 0, notEnough: 0, truthDiscovered: 0, topRanked: 0 });

function add(t: Tally, run: LabRun): Tally {
  const g = run.summary.graded;
  if (!g) return t;
  return {
    players: t.players + run.summary.players,
    correct: t.correct + g.correct,
    incorrect: t.incorrect + g.incorrect,
    ambiguous: t.ambiguous + g.ambiguous,
    notIdentified: t.notIdentified + g.notIdentified,
    notDiscovered: t.notDiscovered + g.notDiscovered,
    notEnough: t.notEnough + g.notEnough,
    truthDiscovered: t.truthDiscovered + g.truthDiscovered,
    topRanked: t.topRanked + g.topRanked,
  };
}

const line = (t: Tally) => `${t.correct}/${t.players} correct, ${t.incorrect} wrong, ${t.ambiguous} ambiguous, ${t.notIdentified + t.notEnough} not identified, ${t.notDiscovered} without the right account`;

async function run(ctx: JobContext) {
  if (!clashScoutEnabled()) return { ok: true, degraded: true, error: "Clash Scout is switched off.", summary: { state: "off" } };
  const riot = await candidateRiot(ctx.db);
  if (!riot) return { ok: true, degraded: true, error: "RIOT_API_KEY is not configured.", summary: { state: "no-key" } };
  const team = await getOrCreateTeam(ctx.db);
  const platform = (await teamPlatform(ctx.db, team.id)) ?? "oc1";
  const [champions, erased] = await Promise.all([listChampions(ctx.db), erasureFilter(ctx.db)]);
  const names = new Map(champions.map((c) => [c.id, c.name]));
  const lab: LabContext = { db: ctx.db, teamId: team.id, platform, riot, erased, now: Date.now(), championName: (id) => names.get(id) ?? id };
  const timeLeft = () => ctx.startedAt + ctx.budgetMs - Date.now() > RESERVE_MS;

  let discovery = emptyTally(), controlled = emptyTally();
  // Discovery's ways of missing the right account, counted apart.
  const misses = { renamedSinceGames: 0, moreAccountsThanLooked: 0, noAccountByName: 0 };
  const accounts = new Set<string>();
  let first: { inputs: Parameters<typeof runVariants>[1]; key: string } | null = null;
  let rounds = 0, skipped = 0;
  for (let round = 0; round < ROUNDS && timeLeft(); round++) {
    const test = await generateBlindTest(lab, { players: 5, rounding: "client", includeTotal: true });
    skipped += test.skipped;
    if (!test.inputs.length) break;
    const result = await runBlindTest(lab, test.inputs, test.key);
    if (!result) break;
    rounds++;
    first ??= { inputs: test.inputs, key: test.key };
    discovery = add(discovery, result.discovery);
    controlled = add(controlled, result.controlled);
    for (const p of result.discovery.players) {
      if (p.truth) accounts.add(p.truth.ref);
      if (!p.truth || p.truth.rank !== null) continue;
      if (p.truth.renamedSinceGames) misses.renamedSinceGames++;
      else if (p.discovery?.capped) misses.moreAccountsThanLooked++;
      else misses.noAccountByName++;
    }
    ctx.log(`test ${round + 1}: A ${line(add(emptyTally(), result.discovery))} · B ${line(add(emptyTally(), result.controlled))}`);
  }
  if (!rounds) return { ok: true, degraded: true, error: "No known account on this server could be used for a blind test.", summary: { state: "no-accounts", platform, skipped } };

  // The outdated-data versions of the first test (Riot's answers are already kept).
  const versions: Array<{ variant: VariantSpec; discovery: Tally; controlled: Tally }> = [];
  for (const variant of DEFAULT_VARIANTS.filter((v) => v.kind !== "baseline")) {
    if (!timeLeft() || !first) break;
    const out = await runVariants(lab, first.inputs, [variant], first.key);
    const v = out?.[0];
    if (!v) break;
    versions.push({ variant, discovery: add(emptyTally(), v.discovery), controlled: v.controlled ? add(emptyTally(), v.controlled) : emptyTally() });
    ctx.log(`${variant.kind}: A ${line(versions.at(-1)!.discovery)} · B ${line(versions.at(-1)!.controlled)}`);
  }

  const requests = riot.counts();
  ctx.log(`A, real discovery: ${line(discovery)}`);
  ctx.log(`B, controlled pool: ${line(controlled)}`);
  return {
    ok: true,
    degraded: riot.standIn,
    error: riot.standIn ? "Stand-in figures (no Riot key on this server): the counts show how the check runs, not how well the engine does." : undefined,
    summary: { platform, tests: rounds, players: discovery.players, distinctAccounts: accounts.size, accountsSetAside: skipped, discovery, discoveryMisses: misses, controlled, versions, riotRequests: requests, standIn: riot.standIn },
  };
}

defineJob({
  key: "lab-benchmark",
  description: "Read-only accuracy check of Clash Scout's opponent identification: blind tests from accounts of the team's recorded games, graded under real discovery and the controlled pool, with outdated-data versions. Reports counts only; stores nothing about the accounts.",
  defaultIntervalMinutes: null,
  run,
});
