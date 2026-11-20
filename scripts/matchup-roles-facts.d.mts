/** Types for scripts/matchup-roles-facts.mjs (the live check is plain JavaScript run by node). */
export type Role = "top" | "jungle" | "mid" | "adc" | "support";
export interface RoleBarRead { pressed: string | null; slots: string | null; labels: string[]; addressRole: string | null; path: string; length: number; busy: boolean }
export const ROLE_SLOTS: Record<Role, string[]>;
export function readRoleBar(): RoleBarRead;
export function matchupRolesVerdicts(input: { kind: string; start: RoleBarRead; reads: Array<{ role: string; at: RoleBarRead }> }): Array<{ name: string; status: "PASS" | "FAIL" | "WARN"; detail: unknown }>;
