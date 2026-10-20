/**
 * What an account is called where several of a player's accounts are listed side by side (tabs,
 * pickers): its in-game name, with the tagline only where two of the accounts share that name.
 * Never "Main": which account is the primary one is shown separately.
 */
export function accountShortNames(accounts: ReadonlyArray<{ id: string; riotId: string }>): Map<string, string> {
  const gameName = (riotId: string) => riotId.split("#")[0]!.trim() || riotId;
  const seen = new Map<string, number>();
  for (const a of accounts) {
    const key = gameName(a.riotId).toLocaleLowerCase("en");
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  return new Map(accounts.map((a) => [a.id, (seen.get(gameName(a.riotId).toLocaleLowerCase("en")) ?? 0) > 1 ? a.riotId : gameName(a.riotId)]));
}
