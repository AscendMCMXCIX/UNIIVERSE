/** Types for scripts/matchup-intel-facts.mjs (the live check is plain JavaScript run by node). */
export interface MatchupIntelRead {
  size: string;
  heading: string;
  layer: string | null;
  label: string;
  threat: number;
  opportunity: number;
  checked: string;
  expired: boolean;
  hiddenWhole: boolean;
  hiddenParts: number;
  assembledWhy: string;
  barWarning: string;
  notRechecked: boolean;
  slots: string;
  named: number;
  missing: boolean;
  tilesBottom: number;
  summary: string;
  summaryBottom: number | null;
  summaryShown: boolean;
  ddragon: string;
  /** The bar's game patch ("Patch 26.23", or "Game patch not known"), and the bar's whole line. */
  patch?: string;
  patchState?: string;
  notice: string;
  licence: string | null;
  innerHeight: number;
  scrollHeight: number;
  riotTextChips: number;
  riotTextLabel: boolean;
  /** The lane buttons' words, the pressed one marked "*" ("Top* Jungle Mid ADC Support"). */
  roles: string;
  /** The slots the lane sets ("2" or "4"); null when the bar is not there. */
  slotCount: string | null;
  tipsLabel: string;
  highElo: string;
  /** S7b: the evidence fold's tiers ("In your games (n = 9) · In the team's games (n = 23)"). */
  evidenceTiers: string;
  /** The tier beside the briefing's (or the assembled reference's) title. */
  briefingTier: string;
  /** The tier beside the enemy kit's title. */
  kitTier: string;
}
export function readMatchupIntel(): MatchupIntelRead;
export function briefingState(f: MatchupIntelRead): "expired" | "hidden" | "parts hidden" | "shown";
export function matchupIntelVerdicts(input: { kind: string; pair: string; enemy: string; at: MatchupIntelRead; wide: MatchupIntelRead; wiki: string[]; healthPatch?: string | null }): Array<{ name: string; status: "PASS" | "FAIL" | "WARN"; detail: unknown }>;
export function publicPatch(patch: string | null | undefined): string | null;
export function patchVerdict(at: MatchupIntelRead, healthPatch: string | null): { ok: boolean; detail: { health: string | null; page: string | undefined; data: string[]; older: boolean } };
