import { redirect } from "next/navigation";
import { getAppDb } from "@/server/bootstrap";
import { getSession, hasPermission } from "@/server/auth/session";
import { listChampions } from "@/server/repositories/champions";
import { getOrCreateTeam } from "@/server/repositories/team";
import { PlayerEditor } from "@/components/team/player-editor";

export const dynamic = "force-dynamic";

export default async function NewPlayerPage() {
  const session = await getSession();
  if (!hasPermission(session, "manage-players")) redirect("/team");
  const db = await getAppDb();
  const [team, champions] = await Promise.all([getOrCreateTeam(db), listChampions(db)]);
  return <PlayerEditor player={null} champions={champions.map((c) => ({ id: c.id, name: c.name, portraitUrl: c.portraitUrl, isNew: c.isNew }))} limits={team.poolLimits} canDelete={hasPermission(session, "manage-team")} />;
}
