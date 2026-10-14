import { notFound } from "next/navigation";
import { getAppDb } from "@/server/bootstrap";
import { canControlDraft, getSession } from "@/server/auth/session";
import { loadDraftRoom } from "@/server/actions/drafts";
import { loadPickerChampions } from "@/server/champions/picker";
import { DraftRoom } from "@/components/draft/draft-room";
import { SideGate } from "@/components/draft/side-gate";
import { getDraft } from "@/server/repositories/drafts";
import { listEnemyScouting } from "@/server/scouting/session";
import { getUser } from "@/server/repositories/users";
import { competitionModeLabel } from "@/domain/competition";
import { getSeries } from "@/server/series/repository";

export const dynamic = "force-dynamic";

export default async function DraftRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getAppDb();
  // A new draft first asks for our side: nothing is computed for a side that is not known yet.
  const [pending, session] = await Promise.all([getDraft(db, id), getSession()]);
  if (!pending) notFound();
  if (!pending.sideConfirmed && pending.status === "in_progress") {
    const canEdit = canControlDraft(session, pending);
    const scouting = await listEnemyScouting(db, id);
    const entered = Object.values(pending.enemyPlayers).filter((v) => (v ?? "").trim()).length;
    const owner = pending.createdByUserId ? await getUser(db, pending.createdByUserId) : null;
    return (
      <SideGate
        draftId={id}
        formatId={pending.formatId}
        title={pending.opponentName ? `vs ${pending.opponentName}` : competitionModeLabel(pending.mode)}
        subtitle={[competitionModeLabel(pending.mode), pending.seriesId ? `Game ${pending.gameNumber}` : null, pending.isTheorycraft ? "Theorycraft" : null, `Patch ${pending.patch}`].filter(Boolean).join(" · ")}
        canEdit={canEdit}
        controllerLabel={owner?.username ?? null}
        scoutHref={canEdit && !pending.isTheorycraft ? `/draft/${id}/scout` : null}
        scouted={{ ready: scouting.filter((r) => r.status === "ok").length, entered }}
      />
    );
  }
  const [payload, champions] = await Promise.all([loadDraftRoom(id), loadPickerChampions(db)]);
  if (!payload) notFound();
  const { getBranding } = await import("@/server/repositories/branding");
  const [branding, series] = await Promise.all([getBranding(db), payload.draft.seriesId ? getSeries(db, payload.draft.seriesId) : Promise.resolve(null)]);
  return (
    <DraftRoom
      initial={payload}
      champions={champions}
      canEdit={canControlDraft(session, payload.draft)}
      canCreateDrafts={!!session}
      viewer={{ userId: session?.userId ?? null, label: session?.label ?? "viewer", playerId: session?.playerId ?? null }}
      ourName={branding.shortName}
      series={series ? { id: series.id, bestOf: series.bestOf, status: series.status, ourWins: series.ourWins, theirWins: series.theirWins, gamesStarted: series.gamesStarted } : null}
    />
  );
}
