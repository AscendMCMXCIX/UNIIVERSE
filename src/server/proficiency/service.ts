import type { Db } from "@/server/db/types";
import { comparePatches } from "@/domain/patch";
import { estimateProficiency, type ChampionHistoryEvidence, type MasteryEvidence, type ProficiencyEstimate, type ProficiencyLookup } from "@/domain/proficiency";
import type { Role } from "@/domain/roles";
import { listAccountsForOpponentPlayers, listAccountsForPlayers, loadHistoryForAccounts, loadMasteryForAccounts } from "@/server/accounts/repository";
import { listPatchesDesc } from "@/server/repositories/champions";

interface Bundle {
  history: Map<string, ChampionHistoryEvidence[]>; // ownerId → rows
  mastery: Map<string, Map<string, MasteryEvidence>>; // ownerId → championId → mastery
  baseline: Map<string, number>; // ownerId → overall win rate
  accountCount: Map<string, number>;
}

declare global {
  var __uniiverseProficiencyCache: { loadedAt: number; bundles: Map<string, Bundle> } | undefined;
}

const TTL_MS = 5 * 60_000;

export function invalidateProficiencyCache() {
  globalThis.__uniiverseProficiencyCache = undefined;
}

async function buildBundle(db: Db, owner: "player" | "opponent", ownerIds: string[]): Promise<Bundle> {
  const accounts = owner === "player" ? await listAccountsForPlayers(db, ownerIds) : await listAccountsForOpponentPlayers(db, ownerIds);
  const ownerOf = new Map(accounts.map((a) => [a.id, (owner === "player" ? a.playerId : a.opponentPlayerId)!]));
  const ids = accounts.map((a) => a.id);
  const [history, mastery, patches] = await Promise.all([loadHistoryForAccounts(db, ids), loadMasteryForAccounts(db, ids), listPatchesDesc(db)]);
  const bundle: Bundle = { history: new Map(), mastery: new Map(), baseline: new Map(), accountCount: new Map() };
  for (const a of accounts) bundle.accountCount.set(ownerOf.get(a.id)!, (bundle.accountCount.get(ownerOf.get(a.id)!) ?? 0) + 1);
  const totals = new Map<string, { wins: number; games: number }>();
  for (const h of history) {
    const ownerId = ownerOf.get(h.accountId);
    if (!ownerId) continue;
    const distance = patches.length ? Math.max(0, patches.findIndex((p) => comparePatches(p, h.patch) <= 0)) : null;
    bundle.history.set(ownerId, [...(bundle.history.get(ownerId) ?? []), { championId: h.championId, role: (h.role as Role | "UNKNOWN") ?? "UNKNOWN", games: h.games, wins: h.wins, lastPlayedAt: h.lastPlayedAt, patchDistance: distance }]);
    const t = totals.get(ownerId) ?? { wins: 0, games: 0 };
    t.wins += h.wins;
    t.games += h.games;
    totals.set(ownerId, t);
  }
  for (const [ownerId, t] of totals) bundle.baseline.set(ownerId, t.games > 0 ? t.wins / t.games : 0.5);
  for (const m of mastery) {
    const ownerId = ownerOf.get(m.accountId);
    if (!ownerId) continue;
    const map = bundle.mastery.get(ownerId) ?? new Map<string, MasteryEvidence>();
    const prev = map.get(m.championId);
    // Several accounts: keep the strongest mastery, sum nothing (mastery is per account).
    if (!prev || prev.points < m.points) map.set(m.championId, { championId: m.championId, points: m.points, level: m.level, lastPlayedAt: m.lastPlayedAt });
    bundle.mastery.set(ownerId, map);
  }
  return bundle;
}

/** Proficiency lookup for a set of our players (cached briefly per process). */
export async function getProficiencyLookup(db: Db, playerIds: string[], owner: "player" | "opponent" = "player"): Promise<ProficiencyLookup & { hasData: (ownerId: string) => boolean }> {
  const key = `${owner}:${[...playerIds].sort().join(",")}`;
  const cache = globalThis.__uniiverseProficiencyCache ?? { loadedAt: Date.now(), bundles: new Map() };
  if (Date.now() - cache.loadedAt > TTL_MS) cache.bundles.clear(), (cache.loadedAt = Date.now());
  let bundle = cache.bundles.get(key);
  if (!bundle) {
    bundle = await buildBundle(db, owner, playerIds);
    cache.bundles.set(key, bundle);
    globalThis.__uniiverseProficiencyCache = cache;
  }
  const b = bundle;
  const memo = new Map<string, ProficiencyEstimate | null>();
  const lookup = ((ownerId: string, championId: string, role: Role) => {
    const k = `${ownerId}|${championId}|${role}`;
    if (memo.has(k)) return memo.get(k)!;
    const history = b.history.get(ownerId);
    const mastery = b.mastery.get(ownerId)?.get(championId) ?? null;
    const est = history || mastery ? estimateProficiency(championId, role, history ?? [], mastery, { playerBaselineWinRate: b.baseline.get(ownerId) }) : null;
    memo.set(k, est);
    return est;
  }) as ProficiencyLookup & { hasData: (ownerId: string) => boolean };
  lookup.hasData = (ownerId: string) => (b.accountCount.get(ownerId) ?? 0) > 0 && ((b.history.get(ownerId)?.length ?? 0) > 0 || (b.mastery.get(ownerId)?.size ?? 0) > 0);
  return lookup;
}
