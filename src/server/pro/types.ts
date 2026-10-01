import type { Role } from "@/domain/roles";
import type { ChampionNameResolver } from "./champion-names";

export interface ProGameRecord {
  id: string;
  provider: string;
  tournament: string;
  league: string;
  patch: string;
  playedAt: Date | null;
  blueTeam: string;
  redTeam: string;
  winnerSide: "blue" | "red" | null;
  picks: Array<{ side: "blue" | "red"; role: Role; championId: string; pickOrder: number }>;
  bans: Array<{ side: "blue" | "red"; order: number; championId: string }>;
}

export interface ProFetchOptions {
  /** Only games played at/after this time (null = provider default lookback). */
  since: Date | null;
  limit: number;
  resolver: ChampionNameResolver;
  log: (message: string) => void;
}

export interface ProFetchResult {
  games: ProGameRecord[];
  /** Rows the provider could not convert (unknown champion names, missing roles). */
  rejected: number;
  /** Set when the provider partially failed but returned what it could. */
  degraded?: string;
}

export interface ProDataProvider {
  readonly name: string;
  fetchGames(options: ProFetchOptions): Promise<ProFetchResult>;
}
