import { redirect } from "next/navigation";
import { getSession } from "@/server/auth/session";
import { completeOwnSetupAction } from "@/server/actions/auth";
import { getAppDb } from "@/server/bootstrap";
import { listChampions } from "@/server/repositories/champions";
import { getOrCreateTeam, getPlayer } from "@/server/repositories/team";
import { SetupForm } from "@/components/auth/setup-form";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";

export const dynamic = "force-dynamic";

/** First-login setup for a signed-in account that has not finished it (for example after losing the invite link). */
export default async function WelcomePage() {
  const session = await getSession();
  if (!session?.userId || session.setupComplete) redirect("/team");
  const db = await getAppDb();
  const [team, champions, player] = await Promise.all([getOrCreateTeam(db), listChampions(db), session.playerId ? getPlayer(db, session.playerId) : Promise.resolve(null)]);
  return (
    <div className="mx-auto max-w-2xl">
      <Panel>
        <PanelHeader title="WELCOME TO UNIIVERSE" subtitle="Choose the role you play, the champions you are ready to draft, and a password for other devices." />
        <PanelBody>
          <SetupForm action={completeOwnSetupAction} username={session.username ?? session.label} riotId={player?.riotId ?? null} champions={champions.map((c) => ({ id: c.id, name: c.name, portraitUrl: c.portraitUrl, isNew: c.isNew }))} limits={team.poolLimits} />
        </PanelBody>
      </Panel>
    </div>
  );
}
