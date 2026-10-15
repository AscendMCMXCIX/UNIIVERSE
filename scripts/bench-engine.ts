/**
 * Development only: deterministic draft-engine benchmark.
 *
 *   pnpm exec tsx scripts/bench-engine.ts [--runs 15] [--out file.json] [--baseline file.json]
 *
 * Statistics come from a seeded simulation of ~6,000 ranked games aggregated like production
 * (scripts/bench/sim.ts), so the sample sizes look like production while the numbers are
 * synthetic. Each scenario is run once cold (first call) and then `runs` times; the report lists
 * median / p95 latency, the recommendation, its decision label, and a legality check. With
 * --baseline it prints what changed against an earlier run.
 */
import { writeFileSync, readFileSync } from "node:fs";
import { deriveDraft } from "@/domain/draft";
import { recommend, type RecommendationResult, type PickRecommendation } from "@/domain/engine";
import { MemoryStatsProvider } from "@/domain/engine/memory-stats";
import { poolFor } from "@/domain/roster/eligibility";
import { buildChampionMap } from "../tests/fixtures/champions";
import { simulateRanked } from "./bench/sim";
import { buildScenarios } from "./bench/scenarios";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const runs = Number(arg("runs") ?? 15);

interface ScenarioResult {
  name: string;
  coldMs: number;
  medianMs: number;
  p95Ms: number;
  kind: string;
  primary: string;
  top: string[];
  decision: string | null;
  gap: number | null;
  denial: number | null;
  legal: boolean;
  evidence: string;
}

const quantile = (xs: number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * (s.length - 1) + 0.5))]!;
};

function describePrimary(r: RecommendationResult): string {
  const p = r.primary;
  if (!p) return "—";
  if (p.kind === "pick") return `${p.championId} ${p.role}`;
  if (p.kind === "pair") return p.picks.map((x) => `${x.championId} ${x.role}`).join(" + ");
  return `ban ${p.championId}`;
}

function legal(r: RecommendationResult, input: Parameters<typeof recommend>[0]): boolean {
  const unavailable = deriveDraft(input.draft).unavailableChampionIds;
  const picks: PickRecommendation[] = [];
  for (const x of [r.primary, ...r.alternatives]) {
    if (x?.kind === "pick") picks.push(x);
    if (x?.kind === "pair") picks.push(...x.picks);
  }
  for (const p of picks) {
    const player = input.players.find((pl) => pl.id === p.playerId);
    if (!player || !poolFor(player, p.role).includes(p.championId) || unavailable.has(p.championId)) return false;
  }
  for (const c of r.candidates) {
    const player = input.players.find((pl) => pl.id === c.playerId);
    if (!player || !poolFor(player, c.role).includes(c.championId) || unavailable.has(c.championId)) return false;
  }
  return true;
}

function main() {
  const champions = buildChampionMap();
  const t0 = performance.now();
  const { data } = simulateRanked(champions);
  const simMs = performance.now() - t0;
  const stats = new MemoryStatsProvider(data);
  const scenarios = buildScenarios(champions, stats);
  const explain = arg("explain");
  if (explain) {
    const s = scenarios.find((x) => x.name === explain);
    if (!s) throw new Error(`unknown scenario ${explain}`);
    const r = recommend(s.input);
    console.log(`${s.name}: ${describePrimary(r)} · ${r.decision?.label ?? "-"} (gap ${((r.decision?.gap ?? 0) * 100).toFixed(2)} pts)`);
    console.log("candidate".padEnd(22), "pickNow", "  fit  ", "timing", "denial", "atRisk", " strength(games)", "comfort");
    const picks = [r.primary, ...r.alternatives].flatMap((x) => (x?.kind === "pick" ? [x] : x?.kind === "pair" ? x.picks : []));
    for (const p of picks) {
      const c = p.candidate;
      const st = stats.strength(c.championId, c.role);
      console.log(`${c.championId} ${c.role}`.padEnd(22), (c.pickNowScore * 100).toFixed(2).padStart(7), (c.fitScore * 100).toFixed(2).padStart(6), (c.timing.adjustment * 100).toFixed(2).padStart(6), c.timing.denialProbability.toFixed(3).padStart(6), (c.timing.valueAtRisk * 100).toFixed(2).padStart(6), `${(st.estimate * 100).toFixed(1)}% (${Math.round(st.games)})`.padStart(15), (c.evaluation.components.comfort * 100).toFixed(2));
    }
    console.log("top candidates (pickNow / fit):", r.candidates.slice(0, 8).map((c) => `${c.championId} ${c.role} ${(c.pickNowScore * 100).toFixed(2)}/${(c.fitScore * 100).toFixed(2)}`).join(" · "));
    return;
  }
  const results: ScenarioResult[] = [];
  for (const s of scenarios) {
    const c0 = performance.now();
    let result = recommend(s.input);
    const coldMs = performance.now() - c0;
    const times: number[] = [];
    for (let i = 0; i < runs; i++) {
      const t = performance.now();
      result = recommend(s.input);
      times.push(performance.now() - t);
    }
    const top = result.candidates.slice(0, 3).map((c) => `${c.championId} ${c.role} ${(c.pickNowScore * 100).toFixed(2)}`);
    const denial = result.primary?.kind === "pick" ? result.primary.candidate.timing.denialProbability : null;
    results.push({
      name: s.name,
      coldMs: Math.round(coldMs * 10) / 10,
      medianMs: Math.round(quantile(times, 0.5) * 10) / 10,
      p95Ms: Math.round(quantile(times, 0.95) * 10) / 10,
      kind: result.kind,
      primary: describePrimary(result),
      top: result.kind === "ban" ? [result.primary, ...result.alternatives].filter(Boolean).slice(0, 3).map((b) => `ban ${(b as { championId: string }).championId}`) : top,
      decision: result.decision?.label ?? null,
      gap: result.decision?.gap ?? null,
      denial: denial === null ? null : Math.round(denial * 1000) / 1000,
      legal: legal(result, s.input),
      evidence: result.confidence,
    });
  }

  const matchupRows = data.matchups.length;
  const synergyRows = data.synergies.length;
  console.log(`dataset: ${data.totalGames} simulated games · ${data.roleStats.length} champion-role rows · ${matchupRows} matchup rows · ${synergyRows} pair rows (≥2 games) · simulated in ${Math.round(simMs)} ms`);
  console.log(`node ${process.version} · ${runs} warm runs per scenario`);
  const baseline: ScenarioResult[] | null = arg("baseline") ? JSON.parse(readFileSync(arg("baseline")!, "utf8")).results : null;
  for (const r of results) {
    const b = baseline?.find((x) => x.name === r.name);
    const speed = b ? ` (was ${b.medianMs}, ${Math.round(((r.medianMs - b.medianMs) / b.medianMs) * 100)}%)` : "";
    console.log(`${r.name.padEnd(24)} cold ${String(r.coldMs).padStart(7)} ms · median ${String(r.medianMs).padStart(7)} ms${speed} · p95 ${String(r.p95Ms).padStart(7)} ms · ${r.legal ? "legal" : "ILLEGAL"} · ${r.kind}: ${r.primary} · ${r.decision ?? "-"}${r.denial !== null ? ` · denial ${r.denial}` : ""}`);
    if (b && (b.primary !== r.primary || b.decision !== r.decision)) console.log(`${"".padEnd(24)} CHANGED from: ${b.primary} · ${b.decision ?? "-"}${b.denial !== null ? ` · denial ${b.denial}` : ""}`);
  }
  const total = results.reduce((s, r) => s + r.medianMs, 0);
  console.log(`sum of medians: ${Math.round(total)} ms${baseline ? ` (was ${Math.round(baseline.reduce((s, r) => s + r.medianMs, 0))} ms)` : ""}`);
  const out = arg("out");
  if (out) writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), node: process.version, runs, dataset: { games: data.totalGames, roleRows: data.roleStats.length, matchupRows, synergyRows }, results }, null, 2));
}

main();
