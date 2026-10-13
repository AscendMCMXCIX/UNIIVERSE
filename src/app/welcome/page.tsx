import { redirect } from "next/navigation";
import { getAuthState } from "@/server/auth/session";
import { getAppDb } from "@/server/bootstrap";
import { listChampions } from "@/server/repositories/champions";
import { getPlayer } from "@/server/repositories/team";
import { loadSetupState } from "@/server/auth/onboarding";
import { SetupForm } from "@/components/auth/setup-form";
import { BrandFrame } from "@/components/auth/brand-frame";

export const dynamic = "force-dynamic";

/**
 * Mandatory first-time setup. Outside the app layout on purpose: until it is finished, the app
 * layout sends the player here and every server action refuses, so it cannot be skipped by
 * navigating, refreshing or calling actions directly.
 */
export default async function WelcomePage() {
  const db = await getAppDb();
  const auth = await getAuthState(db);
  if (auth.mode === "locked" || auth.mode === "setup") redirect("/setup");
  const session = auth.session;
  if (!session?.userId) redirect("/login?next=%2Fwelcome");
  if (session.setupComplete || !session.playerId) redirect("/team");
  const [{ state, limits }, champions, player] = await Promise.all([loadSetupState(db, session.userId), listChampions(db), getPlayer(db, session.playerId)]);
  return (
    <BrandFrame eyebrow="WELCOME TO UNIIVERSE" width="max-w-2xl">
      <h1 className="mt-1 text-xl font-bold tracking-[0.2em]">Set up your player profile</h1>
      <p className="mt-2 text-sm text-fg-muted">Choose the role you play and the champions you are ready to draft. This is required once, takes about a minute, and is saved as you go.</p>
      <SetupForm username={session.username ?? session.label} riotId={player?.riotId ?? null} champions={champions.map((c) => ({ id: c.id, name: c.name, portraitUrl: c.portraitUrl, isNew: c.isNew }))} limits={limits} initial={state} />
      <form action="/api/auth/logout" method="post" className="mt-4 text-center">
        <button type="submit" className="text-xs text-fg-subtle hover:text-fg">
          Sign out (your progress is kept)
        </button>
      </form>
    </BrandFrame>
  );
}
