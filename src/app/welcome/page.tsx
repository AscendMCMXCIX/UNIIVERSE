import { redirect } from "next/navigation";
import { getAuthState } from "@/server/auth/session";
import { getAppDb } from "@/server/bootstrap";
import { loadPickerChampions } from "@/server/champions/picker";
import { getPlayer } from "@/server/repositories/team";
import { loadSetupState } from "@/server/auth/onboarding";
import { SetupForm } from "@/components/auth/setup-form";
import { BrandFrame } from "@/components/auth/brand-frame";
import { SetPasswordForm } from "@/components/auth/set-password-form";

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
      <BrandFrame eyebrow="WELCOME TO UNIIVERSE" width="max-w-md">
        <h1 className="mt-1 text-xl font-bold tracking-[0.2em]">Choose your password</h1>
        <p className="mt-2 text-sm text-fg-muted">You signed in as <span className="font-medium text-fg">{session.username}</span> with a temporary password. Choose your own now; the temporary one stops working as soon as you save.</p>
        <SetPasswordForm username={session.username ?? ""} />
        {signOut}
      </BrandFrame>
    );
  }
  if (session.setupComplete || !session.playerId) redirect("/team");
  // Step 2: roles and champion pools.
  const [{ state }, champions, player] = await Promise.all([loadSetupState(db, session.userId), loadPickerChampions(db), getPlayer(db, session.playerId)]);
  return (
    <BrandFrame eyebrow="WELCOME TO UNIIVERSE" width="max-w-2xl">
      <h1 className="mt-1 text-xl font-bold tracking-[0.2em]">Set up your player profile</h1>
      <p className="mt-2 text-sm text-fg-muted">Choose the role you play and the champions you are ready to draft. This is required once, takes about a minute, and is saved as you go.</p>
      <SetupForm username={session.username ?? session.label} riotId={player?.riotId ?? null} champions={champions} initial={state} />
      {signOut}
    </BrandFrame>
  );
}
