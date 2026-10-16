/*
  The one order of a player's linked Riot accounts, used everywhere accounts are listed (Riot
  Accounts, profile account choices, ranked progression, Match History, Matchups, recent
  performance): the Main account first, then the alternatives in the order the player chose.
  Accounts never placed fall back to the order they were linked. Ordering is presentation only:
  it never changes which games belong to an account or any statistic.
*/

export interface OrderableAccount {
  id: string;
  label: string;
  /** The player's chosen position among their accounts; null until they reorder. */
  sortOrder?: number | null;
  createdAt: Date | string | number;
}

const time = (v: Date | string | number) => (v instanceof Date ? v.getTime() : new Date(v).getTime());

export function compareAccounts(a: OrderableAccount, b: OrderableAccount): number {
  const main = Number(b.label === "main") - Number(a.label === "main");
  if (main) return main;
  const ao = a.sortOrder ?? Number.POSITIVE_INFINITY;
  const bo = b.sortOrder ?? Number.POSITIVE_INFINITY;
  if (ao !== bo) return ao < bo ? -1 : 1;
  return time(a.createdAt) - time(b.createdAt) || a.id.localeCompare(b.id);
}

/** Main first, then the chosen order, then the order linked. Returns a new array. */
export function orderAccounts<T extends OrderableAccount>(accounts: readonly T[]): T[] {
  return [...accounts].sort(compareAccounts);
}

/** The ids after moving one account up (-1) or down (+1) among the alternatives; the Main stays first. */
export function moveAccount(ordered: readonly OrderableAccount[], id: string, by: -1 | 1): string[] {
  const ids = ordered.map((a) => a.id);
  const i = ids.indexOf(id);
  const j = i + by;
  const firstAlt = ordered[0]?.label === "main" ? 1 : 0;
  if (i < firstAlt || j < firstAlt || j >= ids.length) return ids;
  [ids[i], ids[j]] = [ids[j]!, ids[i]!];
  return ids;
}
