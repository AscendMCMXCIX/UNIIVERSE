/** Types for scripts/boundary-facts.mjs (the live check is plain JavaScript run by node). */
export interface BoundaryVerdict {
  name: string;
  status: "PASS" | "FAIL";
  detail: Record<string, unknown>;
}
export interface HttpAnswer {
  status: number;
  text?: string;
}
export const MANAGEMENT_CONTROLS: { team: string[]; profile: string[] };
export const ACCOUNT_CONTROLS: string[];
export const NO_PROFILE: string;
export function readManagementControls(prefixes: readonly string[]): Record<string, number>;
export function readBookmarkControls(): { removable: number; states: number };
export function managementVerdict(kind: string, where: "team" | "profile" | string, counts: Record<string, number>): BoundaryVerdict;
export function bookmarkVerdict(kind: string, read: { removable: number; states: number }): BoundaryVerdict;
export function accountsPageVerdict(res: HttpAnswer): BoundaryVerdict;
export function noProfileVerdict(path: string, res: HttpAnswer): BoundaryVerdict;
export function jobsSessionVerdict(res: { status: number }): BoundaryVerdict;
