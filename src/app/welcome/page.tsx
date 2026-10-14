import { redirect } from "next/navigation";
import { getAuthState } from "@/server/auth/session";
import { getAppDb } from "@/server/bootstrap";
import { loadPickerChampions } from "@/server/champions/picker";
import { getPlayerRow } from "@/server/repositories/team";
import { loadSetupState } from "@/server/auth/onboarding";
import { BrandFrame } from "@/components/auth/brand-frame";
import { WELCOME_EYEBROW, WelcomePasswordStep, WelcomeSetupStep } from "@/components/auth/welcome-steps";

export const dynamic = "force-dynamic";

/**
 * Mandatory first sign-in: choose a permanent password (when signed in with a temporary one),
 * then roles and champion pools. Outside the app layout on purpose: until it is finished, the app
 * layout sends the player here and every server action refuses, so it cannot be skipped by
 * navigating, refreshing or calling actions directly.
 */
export default async function WelcomePage() {
  const db = await getAppDb();
  const auth = await getAuthState(db);
  if (auth.mode === "locked" || auth.mode === "setup") redirect("/setup");
  const session = auth.session;
  if (!session?.userId) redirect("/login?next=%2Fwelcome");
  const signOut = (
    <form action="/api/auth/logout" method="post" className="mt-4 text-center">
      <button type="submit" className="text-xs text-fg-subtle hover:text-fg">
        Sign out (your progress is kept)
      </button>
    </form>
  );
  // Step 1: replace the temporary password from the admin.
  if (session.mustChangePassword) {
    return (
      <BrandFrame eyebrow={WELCOME_EYEBROW} width="max-w-md">
        <WelcomePasswordStep username={session.username ?? ""} />
        {signOut}
      </BrandFrame>
    );
  }
  if (session.setupComplete || !session.playerId) redirect("/");
  // Step 2: roles and champion pools.
  const [{ state }, champions, player] = await Promise.all([loadSetupState(db, session.userId), loadPickerChampions(db), getPlayerRow(db, session.playerId)]);
  return (
    <BrandFrame eyebrow={WELCOME_EYEBROW} width="max-w-2xl">
      <WelcomeSetupStep username={session.username ?? session.label} riotId={player?.riotId ?? null} champions={champions} initial={state} />
      {signOut}
    </BrandFrame>
  );
}
