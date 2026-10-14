import type { ProficiencyTier } from "@/domain/proficiency";
import type { EvidenceWord } from "@/components/players/tier-badge";

/** What a pool card shows about one champion in one role (season and mode as filtered). */
export interface PoolChampionStats {
  tier: ProficiencyTier;
  tierLabel: string;
  tierWhy: string;
  evidence: EvidenceWord;
  games: number;
  winRate: number | null;
  kdaRatio: number | null;
  perfectKda: boolean;
  /** Combined mastery points across linked accounts (champion-wide). */
  mastery: number | null;
}

export type PoolStats = Partial<Record<string, Record<string, PoolChampionStats>>>;
