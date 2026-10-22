import { createHmac } from "node:crypto";
import type { Db } from "@/server/db/types";
import { sessionSecretValue } from "@/server/auth/mode";
import type { ErasureFilter } from "@/server/privacy/ledger";
import { candidateKey } from "@/domain/clash-scout/identity";
import { inferPrecision } from "@/domain/clash-scout/mastery-input";
import { decide, judgeAccount, rankJudged, scoutLabel, type Judgement, type MasterySnapshot, type Outcome, type ShownPlayer } from "@/domain/clash-scout/mastery-match";
import { formatDayMonth } from "@/lib/format";
import { discoverAccounts, PER_NAME, type DiscoveredAccount } from "./candidates";
import { MASTERY_UNAVAILABLE_TEXT, type CandidateRiot } from "./candidate-riot";

/*
  IDENTIFICATION, one engine for Clash Scout and the Testing Lab. For each player shown:

    1. the accounts UNIIVERSE knows by that name (candidates.ts), or, in a controlled test only, a
       given pool of accounts (names ignored there);
    2. each account's Riot ID now and its mastery now (candidate-riot.ts), with what earlier scouts
       showed of it;
    3. the same rules judge, rank and decide (domain/clash-scout/mastery-match.ts).

  Nothing here knows which account is right: a test's answers are opened only afterwards, by the
  grader (server/clash/lab.ts). Accounts leave the server as a keyed reference (an HMAC of the
  PUUID under the server's secret) and their Riot ID now, never as a PUUID.
*/

/** A stable reference to an account that reveals nothing of it (the same account gets the same reference). */
export function accountRef(puuid: string): string {
  return createHmac("sha256", sessionSecretValue()).update(`clash-account\n${puuid}`).digest("base64url").slice(0, 22);
}

export interface PlayerToIdentify {
  slot: number;
  /** The name as shown (no tag). */
  name: string;
  shown: ShownPlayer;
}

export interface CandidateOutcome {
  ref: string;
  /** Its Riot ID now, as Riot gives it; null for a synthetic test account. */
  riotId: string | null;
  label: string;
  /** Where it was found, in words. */
  sources: string[];
  judgement: Judgement;
  verified: boolean;
}

export interface DiscoveryReport {
  /** Accounts known by the name. */
  found: number;
  /** Known by the name in the past, named otherwise now (left out for a current screen). */
  renamed: number;
  /** Riot no longer knows them, or could not say now. */
  gone: number;
  fromScouts: number;
  fromGames: number;
  /** More accounts had the name than were looked at. */
  capped: boolean;
  /** Why live mastery was missing for some account, when it was. */
  masteryUnavailable: string | null;
}

export interface IdentifiedPlayer {
  slot: number;
  name: string;
  outcome: Outcome;
  reasons: string[];
  candidates: CandidateOutcome[];
  discovery: DiscoveryReport | null;
  ms: number;
}

const DAY = 86_400_000;

/** What an earlier scout's mastery screen showed of an account (its five champions with the most points then). */
export function scoutSnapshot(s: DiscoveredAccount["scouts"][number]): MasterySnapshot | null {
  const mastery = (s.player?.mastery ?? []).filter((c) => c.championId && c.points !== null && c.championCertainty !== "low");
  if (!mastery.length) return null;
  return {
    champions: mastery.map((c) => ({ championId: c.championId!, points: c.points!, precision: inferPrecision(c.points!) })),
    coverage: "top",
    totalScore: s.player?.totalMastery ?? null,
    capturedAt: s.scoutedAt.getTime(),
    label: scoutLabel(s.opponentName, s.scoutedAt),
  };
}

function sourcesOf(a: DiscoveredAccount, shown: ShownPlayer, championName: (id: string) => string): string[] {
  const out = a.scouts.slice(0, 2).map((s) => `Verified in ${scoutLabel(s.opponentName, s.scoutedAt)}`);
  if (a.games) {
    const shownIds = new Set(shown.champions.map((c) => c.championId));
    const both = a.games.champions.filter((c) => shownIds.has(c));
    const on = (both.length ? both : a.games.champions).slice(0, 3).map(championName);
    out.push(`Played with or against your team in ${a.games.games} recorded ${a.games.games === 1 ? "game" : "games"} (last ${formatDayMonth(a.games.lastPlayedAt)})${on.length ? `, on ${on.join(", ")}` : ""}`);
  }
  return out;
}

export interface IdentifyOptions {
  championName: (id: string) => string;
  erased?: ErasureFilter;
  perName?: number;
  now?: number;
}

/**
 * The real pipeline: discovery by name on this server, then Riot's figures, then judgement. A
 * screen older than a day keeps an account that has been renamed since (its old name is what that
 * screen showed); a current screen never does.
 */
export async function identifyByName(db: Db, teamId: string, platform: string, players: PlayerToIdentify[], riot: CandidateRiot, options: IdentifyOptions): Promise<IdentifiedPlayer[]> {
  const now = options.now ?? Date.now();
  const started = performance.now();
  const discovered = await discoverAccounts(db, teamId, platform, players.map((p) => ({ slot: p.slot, name: p.name })), options.perName ?? PER_NAME);
  const discoveryMs = (performance.now() - started) / Math.max(1, players.length);
  const out: IdentifiedPlayer[] = [];
  for (const p of players) {
    const t0 = performance.now();
    const found = discovered.get(p.slot) ?? { accounts: [], capped: false };
    const accounts = found.accounts.filter((a) => !options.erased?.puuid(a.puuid));
    const report: DiscoveryReport = { found: accounts.length, renamed: 0, gone: 0, fromScouts: accounts.filter((a) => a.scouts.length).length, fromGames: accounts.filter((a) => a.games).length, capped: found.capped, masteryUnavailable: null };
    const old = p.shown.capturedAt !== null && now - p.shown.capturedAt > DAY;
    const judged = await Promise.all(
      accounts.map(async (a) => {
        const riotId = await riot.riotIdNow(platform, a.puuid);
        if (!riotId || options.erased?.riotId(riotId)) {
          report.gone++;
          return null;
        }
        const renamed = candidateKey(riotId.split("#")[0]!) !== candidateKey(p.name);
        if (renamed) {
          report.renamed++;
          if (!old) return null;
        }
        const live = await riot.mastery(platform, a.puuid);
        if (!live.ok) report.masteryUnavailable ??= MASTERY_UNAVAILABLE_TEXT[live.reason];
        const snapshots = [...(live.ok ? [live.snapshot] : []), ...a.scouts.map(scoutSnapshot).filter((s): s is MasterySnapshot => !!s)];
        const judgement = judgeAccount(p.shown, snapshots, options.championName);
        const sources = sourcesOf(a, p.shown, options.championName);
        if (renamed) sources.push(`Named ${riotId} now: another name than the one shown`);
        if (live.ok && live.snapshot.label !== "Riot, now") sources.push(live.snapshot.label);
        return { candidate: { ref: accountRef(a.puuid), riotId, label: riotId, sources, judgement, verified: false } satisfies CandidateOutcome, judgement, verified: false };
      }),
    );
    const ranked = rankJudged(
      judged.filter((j): j is NonNullable<typeof j> => !!j),
      (c) => c.label,
    );
    const { outcome, reasons } = decide(p.shown, ranked);
    out.push({ slot: p.slot, name: p.name, outcome, reasons, candidates: ranked.map((r) => r.candidate), discovery: report, ms: discoveryMs + performance.now() - t0 });
  }
  return out;
}

/** An account of a controlled test's pool: its figures are fetched before the test runs. */
export interface PoolAccount {
  ref: string;
  /** Its Riot ID now, or a synthetic account's label. */
  label: string;
  riotId: string | null;
  snapshot: MasterySnapshot | null;
  /** A made-up account (an outdated-data test's decoy): never real, never linked. */
  synthetic?: boolean;
}

/**
 * The controlled test: every player against the same given pool of accounts, by mastery alone
 * (names are not compared, so the pool's account that bears the name has no advantage). It shows
 * whether the rules pick the right account when it is there; it says nothing about discovery.
 */
export function identifyAgainstPool(players: PlayerToIdentify[], pool: PoolAccount[], championName: (id: string) => string, keep = 6): IdentifiedPlayer[] {
  return players.map((p) => {
    const t0 = performance.now();
    const ranked = rankJudged(
      pool.map((a) => {
        const judgement = judgeAccount(p.shown, a.snapshot ? [a.snapshot] : [], championName);
        return { candidate: { ref: a.ref, riotId: a.riotId, label: a.label, sources: [a.synthetic ? "Synthetic test account" : "Test pool"], judgement, verified: false } satisfies CandidateOutcome, judgement, verified: false };
      }),
      (c) => c.label,
    );
    const { outcome, reasons } = decide(p.shown, ranked);
    return { slot: p.slot, name: p.name, outcome, reasons, candidates: ranked.slice(0, keep).map((r) => r.candidate), discovery: null, ms: performance.now() - t0 };
  });
}
