import { redirect } from "next/navigation";
import { getAuthState } from "@/server/auth/session";
import { getAppDb } from "@/server/bootstrap";
import { loadPickerChampions } from "@/server/champions/picker";
import { getPlayer } from "@/server/repositories/team";
import { listAccountsForPlayer } from "@/server/accounts/repository";
import { rankView } from "@/server/players/overview";
import { avatarUrl } from "@/server/repositories/users";
import { loadSocialLinks } from "@/server/repositories/profile";
import { visibleSocialLinks } from "@/domain/social-links";
import { cardLookFor } from "@/domain/card-style";
import { cardArt, featurableChampions } from "@/domain/player-card";
import { BrandFrame } from "@/components/auth/brand-frame";
import { welcomeEyebrow } from "@/components/auth/welcome-steps";
import { PersonaliseStep } from "@/components/auth/personalise-step";

export const dynamic = "force-dynamic";

/**
 * The optional last step of the first sign-in, right after the required setup: a picture and the
 * player card, with the existing editors. Setup is already complete here, so the rest of UNIIVERSE
 * is open and each editor saves through its usual, permission-checked action.
 */
export default async function PersonalisePage() {
  const db = await getAppDb();
  const auth = await getAuthState(db);
  if (auth.mode === "locked" || auth.mode === "setup") redirect("/setup");
  const session = auth.session;
  if (!session?.userId) redirect("/login?next=%2Fwelcome%2Fpersonalise");
  if (session.mustChangePassword || !session.setupComplete) redirect("/welcome");
  if (!session.playerId) redirect("/");
  const [player, champions, social, accounts] = await Promise.all([getPlayer(db, session.playerId), loadPickerChampions(db), loadSocialLinks(db, [session.playerId]), listAccountsForPlayer(db, session.playerId)]);
  if (!player) redirect("/");
  // The card's rank as Team and Players show it: the main account's, else the first ranked one.
  // With no account nothing was read, so the card claims no rank (never "Unranked").
  const ranked = (accounts.find((a) => a.label === "main" && a.tier) ?? accounts.find((a) => a.tier)) ?? null;
  const read = ranked ? rankView(ranked) : null;
  const rank = read ? { tier: read.tier, division: read.division, leaguePoints: read.leaguePoints, queue: read.queue } : null;
  const picture = avatarUrl(session.userId, session.avatarVersion ?? null);
  const customised = !!picture || player.cardStyle !== null || player.cardBannerVersion !== null || !!player.featuredChampionId;
  return (
    <BrandFrame eyebrow={welcomeEyebrow} width="max-w-4xl">
      <PersonaliseStep
        card={{ playerId: player.id, name: player.displayName, avatarUrl: picture, look: cardLookFor(player), art: cardArt(player), role: player.primaryRole, rank, showRank: accounts.length > 0, poolIds: featurableChampions(player), social: visibleSocialLinks(social.get(player.id)) }}
        champions={champions}
        customised={customised}
        social={social.get(player.id) ?? null}
      />
    </BrandFrame>
  );
}
