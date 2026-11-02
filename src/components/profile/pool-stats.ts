/** What a pool row shows about one champion in one role (season and mode as filtered). */
export interface PoolChampionStats {
  games: number;
  winRate: number | null;
  kdaRatio: number | null;
  perfectKda: boolean;
  /** Total CS ÷ total minutes of these games (remakes left out); null when no game has both. */
  csPerMinute: number | null;
  /** Average vision score per game (not per minute); shown instead of CS/min for Support. */
  visionPerGame: number | null;
  /** Combined mastery points across linked accounts (champion-wide). */
  mastery: number | null;
}

export type PoolStats = Partial<Record<string, Record<string, PoolChampionStats>>>;
