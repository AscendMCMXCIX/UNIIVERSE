const TIER_SHORT: Record<string, string> = { IRON: "Iron", BRONZE: "Bronze", SILVER: "Silver", GOLD: "Gold", PLATINUM: "Plat", EMERALD: "Emerald", DIAMOND: "Diamond", MASTER: "Master", GRANDMASTER: "GM", CHALLENGER: "Chall" };
const DIVISION: Record<string, string> = { I: "1", II: "2", III: "3", IV: "4" };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Older than this, a last-known rank shows when it was read on the badge itself, not only on hover. */
export const RANK_AGE_SHOWN_DAYS = 30;

/**
 * The badge for a player's last-known Ranked Solo/Duo rank in a match (stored data, read at
 * `asOf`, not the rank at match time). A rank older than 30 days carries its month on the badge
 * (and the year when it differs), so its age is visible without hovering, on phones too.
 */
export function knownRankLabel(rank: { tier: string; division: string | null; asOf: string }, now = new Date()): { text: string; title: string } {
  const tier = TIER_SHORT[rank.tier] ?? rank.tier.charAt(0) + rank.tier.slice(1).toLowerCase();
  const base = `${tier}${rank.division ? ` ${DIVISION[rank.division] ?? rank.division}` : ""}`;
  const at = new Date(rank.asOf);
  const month = MONTHS[at.getUTCMonth()]!;
  const sameYear = at.getUTCFullYear() === now.getUTCFullYear();
  const old = now.getTime() - at.getTime() > RANK_AGE_SHOWN_DAYS * 86_400_000;
  return {
    text: old ? `${base} · ${month}${sameYear ? "" : ` ${at.getUTCFullYear()}`}` : base,
    title: `Ranked Solo/Duo, last known ${at.getUTCDate()} ${month} ${at.getUTCFullYear()}: their rank then, not at the time of this match`,
  };
}
