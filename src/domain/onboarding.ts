import { ROLES, type Role } from "./roles";
import { MAX_POOL_SIZE } from "./roster";

/*
  The rules of a new player's first-time setup, shared by the server (which enforces them) and
  Admin → Previews (which shows exactly the same messages without saving anything).
*/

export interface SetupState {
  primaryRole: Role | null;
  primaryPool: string[];
  secondaryRole: Role | null;
  secondaryPool: string[];
}

const isRole = (v: unknown): v is Role => typeof v === "string" && (ROLES as readonly string[]).includes(v);
const cleanPool = (v: unknown): string[] => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean))].slice(0, MAX_POOL_SIZE) : []);

export function sanitiseSetup(input: Partial<Record<keyof SetupState, unknown>>): SetupState {
  const primaryRole = isRole(input.primaryRole) ? input.primaryRole : null;
  const secondaryRole = isRole(input.secondaryRole) && input.secondaryRole !== primaryRole ? input.secondaryRole : null;
  return { primaryRole, primaryPool: cleanPool(input.primaryPool), secondaryRole, secondaryPool: secondaryRole ? cleanPool(input.secondaryPool) : [] };
}

/** Problems that keep the setup from finishing, in the order the form shows them. Pools have no size limit. */
export function setupProblems(state: SetupState): string[] {
  const out: string[] = [];
  if (!state.primaryRole) out.push("Choose your primary role.");
  if (state.primaryPool.length < 1) out.push("Choose at least one champion for your primary role.");
  return out;
}

