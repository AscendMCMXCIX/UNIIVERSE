import { redirect } from "next/navigation";
import { getAuthState } from "@/server/auth/session";
import { getAppDb } from "@/server/bootstrap";
import { loadPickerChampions } from "@/server/champions/picker";
import { getPlayer } from "@/server/repositories/team";
import { avatarUrl } from "@/server/repositories/users";
import { cardLookFor } from "@/domain/card-style";
import { cardArt, featurableChampions } from "@/domain/player-card";
import { BrandFrame } from "@/components/auth/brand-frame";
import { WELCOME_EYEBROW } from "@/components/auth/welcome-steps";
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
  const [player, champions] = await Promise.all([getPlayer(db, session.playerId), loadPickerChampions(db)]);
  if (!player) redirect("/");
  const picture = avatarUrl(session.userId, session.avatarVersion ?? null);
  const customised = !!picture || player.cardStyle !== null || player.cardBannerVersion !== null || !!player.featuredChampionId;
  return (
    <BrandFrame eyebrow={WELCOME_EYEBROW} width="max-w-4xl">
      <PersonaliseStep
        card={{ playerId: player.id, name: player.displayName, avatarUrl: picture, look: cardLookFor(player), art: cardArt(player), role: player.primaryRole, poolIds: featurableChampions(player) }}
        champions={champions}
        customised={customised}
      />
    </BrandFrame>
  );
}
