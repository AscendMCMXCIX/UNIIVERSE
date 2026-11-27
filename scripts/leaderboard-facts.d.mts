/** Types for scripts/leaderboard-facts.mjs (the live check is plain JavaScript run by node). */
export interface LeaderboardScopeRead {
  scopeCount: number | null;
  form: number;
  partialForm: number;
  multikills: number;
  players: number;
  empty: boolean;
}
export interface ScopeVerdict {
  name: string;
  status: "PASS" | "FAIL" | "WARN";
  detail: unknown;
}
export function readLeaderboardScope(): LeaderboardScopeRead;
export function leaderboardScopeVerdicts(input: { kind: string; read: LeaderboardScopeRead | null; active: number | null; boundary: number | null }): ScopeVerdict[];
export function auditCounts(env?: Record<string, string | undefined>): { active: number | null; boundary: number | null };
