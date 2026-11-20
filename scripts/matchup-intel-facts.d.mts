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
}
export function readMatchupIntel(): MatchupIntelRead;
export function briefingState(f: MatchupIntelRead): "expired" | "hidden" | "parts hidden" | "shown";
export function matchupIntelVerdicts(input: { kind: string; pair: string; enemy: string; at: MatchupIntelRead; wide: MatchupIntelRead; wiki: string[] }): Array<{ name: string; status: "PASS" | "FAIL" | "WARN"; detail: unknown }>;
