/** Types for scripts/production-audits.mjs (run by node in the Production check's workflow). */
export interface JobAnswer {
  status: number;
  body: { ok?: boolean; summary?: Record<string, unknown> } | null;
  error?: string;
}
export function leaderboardAuditLines(answer: JobAnswer): { lines: string[]; env: Record<string, string>; failed: boolean; warning?: string };
export function buildsAuditLines(answer: JobAnswer, secret: string): { lines: string[]; ids: string[]; failed: boolean; warning?: string };
export function runAudits(input: { base: string; secret: string; summaryFile: string; envFile: string; fetchImpl?: typeof fetch; log?: (line: string) => void }): Promise<number>;
