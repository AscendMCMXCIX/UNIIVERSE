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

const RATE_LIMITED = /rate ?limit/i;
const USER_AGENT = "UNIIVERSE draft tool (contact: repository owner)";
const NEEDS_LOGIN = "Leaguepedia rate-limits anonymous API clients; create a bot password and set LEAGUEPEDIA_USERNAME and LEAGUEPEDIA_PASSWORD (docs/DEPLOYMENT.md §2b).";

/** A wiki request that takes longer than this is abandoned; the job records the failure and moves on. */
const REQUEST_TIMEOUT_MS = 20_000;

/** Minimal cookie jar for the MediaWiki login session (fetch keeps no cookies of its own). */
class CookieJar {
  private readonly cookies = new Map<string, string>();
  absorb(res: Response): void {
    const raw: string[] = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : (res.headers.get("set-cookie")?.split(/,(?=\s*[A-Za-z0-9_-]+=)/) ?? []);
    for (const line of raw) {
      const [pair] = line.split(";");
      const eq = pair?.indexOf("=") ?? -1;
      if (!pair || eq <= 0) continue;
      this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }
  header(): string | undefined {
    if (this.cookies.size === 0) return undefined;
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }
}

/**
 * Leaguepedia (lol.fandom.com) Cargo API adapter. ScoreboardGames carries picks/bans/winner per
 * game; ScoreboardPlayers carries each player's champion and role; Tournaments the league name.
 * One query joins them so every game arrives as ten rows.
 *
 * Leaguepedia rate-limits anonymous clients so tightly that a shared cloud egress address is
 * refused on the first request; with a bot password (Special:BotPasswords) the adapter logs in
 * once per run and queries as that user. Credentials come from the environment and never leave
 * the server.
 */
export class LeaguepediaProvider implements ProDataProvider {
  readonly name = "leaguepedia";
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly lookbackDays: number;
  private readonly credentials: { username: string; password: string } | null;
  private readonly jar = new CookieJar();
  private authenticated = false;

  constructor(options: { baseUrl?: string; fetchImpl?: typeof fetch; lookbackDays?: number; username?: string | null; password?: string | null } = {}) {
    this.baseUrl = options.baseUrl ?? process.env.LEAGUEPEDIA_BASE_URL ?? "https://lol.fandom.com/api.php";
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.lookbackDays = options.lookbackDays ?? 60;
    const username = options.username === undefined ? process.env.LEAGUEPEDIA_USERNAME : options.username;
    const password = options.password === undefined ? process.env.LEAGUEPEDIA_PASSWORD : options.password;
    this.credentials = username && password ? { username, password } : null;
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    const cookie = this.jar.header();
    return { "user-agent": USER_AGENT, accept: "application/json", ...(cookie ? { cookie } : {}), ...extra };
  }

  private async api(params: Record<string, string>, method: "GET" | "POST" = "GET"): Promise<unknown> {
    const body = new URLSearchParams({ format: "json", ...params });
    const res =
      method === "POST"
        ? await this.fetchImpl(this.baseUrl, { method: "POST", headers: this.headers({ "content-type": "application/x-www-form-urlencoded" }), body: body.toString(), signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
        : await this.fetchImpl(`${this.baseUrl}?${body.toString()}`, { headers: this.headers(), signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    this.jar.absorb(res);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  /** MediaWiki bot-password login: fetch a login token, then post the credentials with it. */
  private async login(): Promise<void> {
    if (this.authenticated || !this.credentials) return;
    // A bot password logs in as "Account@BotName"; without the @ MediaWiki treats the request as a
    // normal (unsupported) API login and answers with a generic failure, so say so up front.
    if (!this.credentials.username.includes("@")) throw new Error(`Leaguepedia login: LEAGUEPEDIA_USERNAME is "${this.credentials.username}" but must be the full bot login name Account@BotName as shown on Special:BotPasswords (for example Account@uniiverse).`);
    const tokenResponse = z.object({ query: z.object({ tokens: z.object({ logintoken: z.string() }) }) }).safeParse(await this.api({ action: "query", meta: "tokens", type: "login" }));
    if (!tokenResponse.success) throw new Error("Leaguepedia login: no login token in the response");
    const result = z
      .object({ login: z.object({ result: z.string(), reason: z.union([z.string(), z.object({ text: z.string().optional() })]).optional() }) })
      .safeParse(await this.api({ action: "login", lgname: this.credentials.username, lgpassword: this.credentials.password, lgtoken: tokenResponse.data.query.tokens.logintoken }, "POST"));
    if (!result.success) throw new Error("Leaguepedia login: unexpected response");
    if (result.data.login.result !== "Success") {
      const reason = typeof result.data.login.reason === "string" ? result.data.login.reason : result.data.login.reason?.text;
      throw new Error(`Leaguepedia login ${result.data.login.result.toLowerCase()}${reason ? `: ${reason}` : ""} (signed in as "${this.credentials.username}" with a ${this.credentials.password.length}-character password; a bot password is 32 characters and is shown once on Special:BotPasswords)`);
    }
    this.authenticated = true;
  }

  private async query(shape: CargoQueryShape, stamp: string, offset: number, pageSize: number): Promise<{ rows: z.infer<typeof cargoRow>[] } | { error: string }> {
    let json: unknown;
    try {
      json = await this.api({
        action: "cargoquery",
        tables: shape.tables,
        join_on: shape.joinOn,
        fields: shape.fields,
        where: `SG.DateTime_UTC >= "${stamp}"`,
        order_by: "SG.DateTime_UTC DESC",
        limit: String(pageSize),
        offset: String(offset),
        // With a login, make the wiki refuse rather than silently answer as an anonymous user.
        ...(this.authenticated ? { assert: "user" } : {}),
      });
    } catch (err) {
      return { error: `Leaguepedia request failed: ${(err as Error).message}` };
    }
    const result = interpretCargoResponse(json);
    if ("error" in result && RATE_LIMITED.test(result.error) && !this.credentials) return { error: `${result.error.replace(/\.+$/, "")}. ${NEEDS_LOGIN}` };
    return result;
  }

  async fetchGames(options: ProFetchOptions): Promise<ProFetchResult> {
    const since = options.since ?? new Date(Date.now() - this.lookbackDays * 86_400_000);
    const stamp = since.toISOString().slice(0, 19).replace("T", " ");
    const games = new Map<string, { rows: z.infer<typeof cargoRow>[] }>();
    let offset = 0;
    const pageSize = 500;
    let degraded: string | undefined;
    let shape = CARGO_QUERY_WITH_LEAGUE;
    try {
      await this.login();
    } catch (err) {
      return { games: [], rejected: 0, degraded: (err as Error).message };
    }
    if (this.authenticated) options.log(`logged in to Leaguepedia as ${this.credentials?.username}`);
    for (let page = 0; page < 20; page++) {
      let result = await this.query(shape, stamp, offset, pageSize);
      // A refused *query* (unknown column, bad join) is worth one retry without the Tournaments
      // join; a rate limit is not, another request would only make it worse.
      if ("error" in result && shape === CARGO_QUERY_WITH_LEAGUE && result.error.startsWith("Leaguepedia rejected") && !RATE_LIMITED.test(result.error)) {
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
