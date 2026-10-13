import { z } from "zod";
import { parseRole } from "@/domain/roles";
import { patchFromVersion } from "@/domain/patch";
import type { ProDataProvider, ProFetchOptions, ProFetchResult, ProGameRecord } from "./types";

const cargoRow = z.object({
  GameId: z.string(),
  Tournament: z.string().optional().default(""),
  League: z.string().optional().default(""),
  DateTimeUTC: z.string().optional().default(""),
  Patch: z.string().optional().default(""),
  Team1: z.string().optional().default(""),
  Team2: z.string().optional().default(""),
  Winner: z.union([z.string(), z.number()]).optional(),
  Team1Bans: z.string().optional().default(""),
  Team2Bans: z.string().optional().default(""),
  Team1Picks: z.string().optional().default(""),
  Team2Picks: z.string().optional().default(""),
  Champion: z.string().optional().default(""),
  Role: z.string().optional().default(""),
  Side: z.union([z.string(), z.number()]).optional(),
  PlayerTeam: z.string().optional().default(""),
});

const cargoResponse = z.object({ cargoquery: z.array(z.object({ title: z.record(z.string(), z.union([z.string(), z.number(), z.null()])) })) });
/** MediaWiki/Cargo report problems (unknown field, bad join, rate limit) as HTTP 200 with an error object. */
const cargoError = z.object({ error: z.object({ code: z.string().optional(), info: z.string().optional() }) });

interface CargoQueryShape {
  tables: string;
  joinOn: string;
  fields: string;
}

const GAME_FIELDS =
  "SG.GameId=GameId,SG.Tournament=Tournament,SG.DateTime_UTC=DateTimeUTC,SG.Patch=Patch,SG.Team1=Team1,SG.Team2=Team2,SG.Winner=Winner,SG.Team1Bans=Team1Bans,SG.Team2Bans=Team2Bans,SG.Team1Picks=Team1Picks,SG.Team2Picks=Team2Picks,SP.Champion=Champion,SP.Role=Role,SP.Side=Side,SP.Team=PlayerTeam";

/**
 * ScoreboardGames has no League column; the league name lives in Tournaments, joined on the
 * tournament's OverviewPage. If that join is ever refused the provider retries without it and
 * leaves the league blank (it is informational only).
 */
export const CARGO_QUERY_WITH_LEAGUE: CargoQueryShape = {
  tables: "ScoreboardGames=SG,ScoreboardPlayers=SP,Tournaments=T",
  joinOn: "SG.GameId=SP.GameId,SG.OverviewPage=T.OverviewPage",
  fields: `${GAME_FIELDS},T.League=League`,
};
export const CARGO_QUERY_BASIC: CargoQueryShape = {
  tables: "ScoreboardGames=SG,ScoreboardPlayers=SP",
  joinOn: "SG.GameId=SP.GameId",
  fields: GAME_FIELDS,
};

/** Turns whatever Leaguepedia answered into either rows or a message that says what went wrong. */
export function interpretCargoResponse(json: unknown): { rows: z.infer<typeof cargoRow>[] } | { error: string } {
  const ok = cargoResponse.safeParse(json);
  if (ok.success) {
    const rows = ok.data.cargoquery
      .map((r) => cargoRow.safeParse(Object.fromEntries(Object.entries(r.title).map(([k, v]) => [k, v ?? ""]))))
      .filter((r) => r.success)
      .map((r) => r.data);
    return { rows };
  }
  const failed = cargoError.safeParse(json);
  if (failed.success) return { error: `Leaguepedia rejected the query: ${failed.data.error.info ?? failed.data.error.code ?? "unknown error"}` };
  const keys = json && typeof json === "object" ? Object.keys(json as object).join(", ") : typeof json;
  return { error: `Leaguepedia response shape changed (got ${keys || "an empty response"})` };
}

/** Champion id → 1-based pick order from a comma-separated pick list (empty map when unknown). */
export function pickOrderMap(raw: string, resolver: ProFetchOptions["resolver"]): Map<string, number> {
  const out = new Map<string, number>();
  raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((name, i) => {
      const id = resolver.resolve(name);
      if (id && !out.has(id)) out.set(id, i + 1);
    });
  return out.size === 5 ? out : new Map();
}

/**
 * Leaguepedia (lol.fandom.com) Cargo API adapter. Public, no key required, rate-limited politely.
 * ScoreboardGames carries picks/bans/winner per game; ScoreboardPlayers carries each player's
 * champion and role. One query joins both so every game arrives as ten rows.
 */
export class LeaguepediaProvider implements ProDataProvider {
  readonly name = "leaguepedia";
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly lookbackDays: number;

  constructor(options: { baseUrl?: string; fetchImpl?: typeof fetch; lookbackDays?: number } = {}) {
    this.baseUrl = options.baseUrl ?? process.env.LEAGUEPEDIA_BASE_URL ?? "https://lol.fandom.com/api.php";
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.lookbackDays = options.lookbackDays ?? 60;
  }

  private async query(shape: CargoQueryShape, stamp: string, offset: number, pageSize: number): Promise<{ rows: z.infer<typeof cargoRow>[] } | { error: string }> {
    const params = new URLSearchParams({
      action: "cargoquery",
      format: "json",
      tables: shape.tables,
      join_on: shape.joinOn,
      fields: shape.fields,
      where: `SG.DateTime_UTC >= "${stamp}"`,
      order_by: "SG.DateTime_UTC DESC",
      limit: String(pageSize),
      offset: String(offset),
    });
    let json: unknown;
    try {
      const res = await this.fetchImpl(`${this.baseUrl}?${params.toString()}`, { headers: { "user-agent": "UNIIVERSE draft tool (contact: repository owner)", accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      json = await res.json();
    } catch (err) {
      return { error: `Leaguepedia request failed: ${(err as Error).message}` };
    }
    return interpretCargoResponse(json);
  }

  async fetchGames(options: ProFetchOptions): Promise<ProFetchResult> {
    const since = options.since ?? new Date(Date.now() - this.lookbackDays * 86_400_000);
    const stamp = since.toISOString().slice(0, 19).replace("T", " ");
    const games = new Map<string, { rows: z.infer<typeof cargoRow>[] }>();
    let offset = 0;
    const pageSize = 500;
    let degraded: string | undefined;
    let shape = CARGO_QUERY_WITH_LEAGUE;
    for (let page = 0; page < 20; page++) {
      let result = await this.query(shape, stamp, offset, pageSize);
      if ("error" in result && shape === CARGO_QUERY_WITH_LEAGUE && result.error.startsWith("Leaguepedia rejected")) {
        options.log(`${result.error}; retrying without the Tournaments join`);
        shape = CARGO_QUERY_BASIC;
        result = await this.query(shape, stamp, offset, pageSize);
      }
      if ("error" in result) {
        degraded = result.error;
        break;
      }
      const rows = result.rows;
      for (const row of rows) {
        const g = games.get(row.GameId) ?? { rows: [] };
        g.rows.push(row);
        games.set(row.GameId, g);
      }
      if (rows.length < pageSize || games.size >= options.limit) break;
      offset += pageSize;
      await new Promise((r) => setTimeout(r, 1100)); // be polite
    }

    const out: ProGameRecord[] = [];
    let rejected = 0;
    for (const [gameId, g] of games) {
      const first = g.rows[0]!;
      const picks: ProGameRecord["picks"] = [];
      // Team1Picks/Team2Picks list the champions in the order they were locked, which gives
      // each pick its slot (B1, R1/R2, …) for the professional draft-pattern statistics.
      const orderBySide = { blue: pickOrderMap(first.Team1Picks, options.resolver), red: pickOrderMap(first.Team2Picks, options.resolver) };
      let bad = false;
      for (const row of g.rows) {
        const side = String(row.Side) === "1" ? "blue" : String(row.Side) === "2" ? "red" : row.PlayerTeam && row.PlayerTeam === first.Team1 ? "blue" : row.PlayerTeam && row.PlayerTeam === first.Team2 ? "red" : null;
        const role = parseRole(row.Role);
        const championId = options.resolver.resolve(row.Champion);
        if (!side || !role || !championId) {
          bad = true;
          continue;
        }
        picks.push({ side, role, championId, pickOrder: orderBySide[side].get(championId) ?? 0 });
      }
      if (bad || picks.length !== 10) {
        rejected += 1;
        continue;
      }
      const bans: ProGameRecord["bans"] = [];
      (["blue", "red"] as const).forEach((side, i) => {
        const raw = i === 0 ? first.Team1Bans : first.Team2Bans;
        raw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .forEach((name, order) => {
            const id = options.resolver.resolve(name);
            if (id) bans.push({ side, order: order + 1, championId: id });
          });
      });
      const patch = patchFromVersion(first.Patch) ?? "";
      if (!patch) {
        rejected += 1;
        continue;
      }
      const winner = String(first.Winner) === "1" ? "blue" : String(first.Winner) === "2" ? "red" : null;
      out.push({
        id: `lp:${gameId}`,
        provider: "leaguepedia",
        tournament: first.Tournament,
        league: first.League,
        patch,
        playedAt: first.DateTimeUTC ? new Date(first.DateTimeUTC.replace(" ", "T") + "Z") : null,
        blueTeam: first.Team1,
        redTeam: first.Team2,
        winnerSide: winner,
        picks,
        bans,
      });
    }
    return { games: out, rejected, degraded };
  }
}
