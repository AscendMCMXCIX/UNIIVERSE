import { notFound } from "next/navigation";
import { getAppDb } from "@/server/bootstrap";
import { canEdit, getSession } from "@/server/auth/session";
import { loadDraftRoom } from "@/server/actions/drafts";
import { listChampions } from "@/server/repositories/champions";
import { DraftRoom } from "@/components/draft/draft-room";

export const dynamic = "force-dynamic";

export default async function DraftRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getAppDb();
  const [payload, champions, session] = await Promise.all([loadDraftRoom(id), listChampions(db), getSession()]);
  if (!payload) notFound();
  const { getBranding } = await import("@/server/repositories/branding");
  const branding = await getBranding(db);
  return <DraftRoom initial={payload} champions={champions.map((c) => ({ id: c.id, name: c.name, portraitUrl: c.portraitUrl, isNew: c.isNew }))} canEdit={canEdit(session)} viewer={{ userId: session?.userId ?? null, label: session?.label ?? "viewer" }} ourName={branding.shortName} />;
}
