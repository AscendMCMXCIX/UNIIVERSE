import { notFound } from "next/navigation";
import { getAppDb } from "@/server/bootstrap";
import { canControlDraft, getSession } from "@/server/auth/session";
import { loadDraftRoom } from "@/server/actions/drafts";
import { loadPickerChampions } from "@/server/champions/picker";
import { DraftRoom } from "@/components/draft/draft-room";
import { getSeries } from "@/server/series/repository";

export const dynamic = "force-dynamic";

export default async function DraftRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getAppDb();
  const [payload, champions, session] = await Promise.all([loadDraftRoom(id), loadPickerChampions(db), getSession()]);
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
