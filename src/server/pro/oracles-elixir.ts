import { parseRole, type Role } from "@/domain/roles";
import { patchFromVersion } from "@/domain/patch";
import { csvToObjects } from "./csv";
import type { ProDataProvider, ProFetchOptions, ProFetchResult, ProGameRecord } from "./types";

const POSITION: Record<string, Role> = { top: "TOP", jng: "JUNGLE", jungle: "JUNGLE", mid: "MID", bot: "ADC", adc: "ADC", sup: "SUPPORT", support: "SUPPORT" };

/**
 * Oracle's Elixir match-data CSV adapter (the public per-season export). Works from a URL
 * (PRO_DATA_CSV_URL) or from text supplied by an admin import. Only the columns UNIIVERSE needs
 * are read, so extra columns never matter.
 */
export class OraclesElixirCsvProvider implements ProDataProvider {
  readonly name = "oracleselixir";

  constructor(private readonly source: { url?: string; text?: string; fetchImpl?: typeof fetch }) {}

  async fetchGames(options: ProFetchOptions): Promise<ProFetchResult> {
    let text = this.source.text;
    if (!text) {
      if (!this.source.url) throw new Error("No CSV source configured (set PRO_DATA_CSV_URL or import a file).");
      const res = await (this.source.fetchImpl ?? fetch)(this.source.url, { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`CSV download failed with ${res.status}`);
      text = await res.text();
    }
    return { ...parseOraclesElixirCsv(text, options), degraded: undefined };
  }
}

export function parseOraclesElixirCsv(text: string, options: Pick<ProFetchOptions, "since" | "limit" | "resolver" | "log">): { games: ProGameRecord[]; rejected: number } {
  const rows = csvToObjects(text);
  const byGame = new Map<string, Array<Record<string, string>>>();
  for (const r of rows) {
    const id = r.gameid;
    if (!id) continue;
    byGame.set(id, [...(byGame.get(id) ?? []), r]);
  }
  const games: ProGameRecord[] = [];
  let rejected = 0;
  for (const [gameid, group] of byGame) {
    const first = group[0]!;
    const playedAt = first.date ? new Date(first.date.replace(" ", "T") + "Z") : null;
    if (options.since && playedAt && playedAt < options.since) continue;
    const patch = patchFromVersion(first.patch ?? "") ?? first.patch ?? "";
    if (!patch) {
      rejected += 1;
      continue;
    }
    const picks: ProGameRecord["picks"] = [];
    const bans: ProGameRecord["bans"] = [];
    const teams: Record<"blue" | "red", string> = { blue: "", red: "" };
    let winner: "blue" | "red" | null = null;
    const seenBans = new Set<string>();
    let bad = false;
    for (const r of group) {
      const side = (r.side ?? "").toLowerCase() === "blue" ? "blue" : (r.side ?? "").toLowerCase() === "red" ? "red" : null;
      if (!side) continue;
      if (r.teamname) teams[side] = r.teamname;
      if (r.result === "1") winner = side;
      const pos = (r.position ?? "").toLowerCase();
      if (pos === "team") {
        for (let i = 1; i <= 5; i++) {
          const name = r[`ban${i}`];
          if (!name) continue;
          const id = options.resolver.resolve(name);
          if (!id) continue;
          const key = `${side}:${i}`;
          if (seenBans.has(key)) continue;
          seenBans.add(key);
          bans.push({ side, order: i, championId: id });
        }
        continue;
      }
      const role = POSITION[pos] ?? parseRole(pos);
      const championId = options.resolver.resolve(r.champion);
      if (!role || !championId) {
        bad = true;
        continue;
      }
      picks.push({ side, role, championId, pickOrder: Number(r.pick ?? 0) || 0 });
    }
    if (bad || picks.length !== 10) {
      rejected += 1;
      continue;
    }
    games.push({ id: `oe:${gameid}`, provider: "oracleselixir", tournament: first.league ?? "", league: first.league ?? "", patch, playedAt, blueTeam: teams.blue, redTeam: teams.red, winnerSide: winner, picks, bans });
    if (games.length >= options.limit) break;
  }
  return { games, rejected };
}
