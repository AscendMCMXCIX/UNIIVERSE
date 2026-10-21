/*
  PUBLIC / GUEST VIEW. The public team page (/public) is open to everyone, without an account, and
  shows the lineup and its substitutes (server/public/team.ts decides exactly what). There is no
  switch for it and no per-member opt-in any more; the old settings rows are left unused.

  Riot-derived figures (rank, statistics, leaderboards) stay off the public
  pages unless the deployment sets UNIIVERSE_PUBLIC_RIOT_DATA=true. Riot does not allow an app on
  a Personal API key to serve its data for public consumption; set it only once the product holds
  a Production key and its registration describes the public pages. With it set, the public cards
  carry the figures members see (server/public/team.ts) and /public/leaderboards ranks the public
  players (server/public/leaderboards.ts); without it that address is not found.
*/

/** Whether Riot-derived figures may appear on public pages (deployment setting; off by default). */
export function publicRiotDataAllowed(env: Record<string, string | undefined> = process.env): boolean {
  return (env.UNIIVERSE_PUBLIC_RIOT_DATA ?? "").trim().toLowerCase() === "true";
}
