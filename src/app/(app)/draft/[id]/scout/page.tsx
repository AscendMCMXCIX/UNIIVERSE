import { notFound, redirect } from "next/navigation";
import { getAppDb } from "@/server/bootstrap";
import { canControlDraft, getSession } from "@/server/auth/session";
import { getDraft } from "@/server/repositories/drafts";
import { listEnemyScouting } from "@/server/scouting/session";
import { COMPETITION_MODE_INFO } from "@/domain/competition";
import { ROLES } from "@/domain/roles";
import { DraftStepper } from "@/components/draft/draft-stepper";
import { EnemyScoutPanel } from "@/components/draft/enemy-scout-panel";
import { PageHeader } from "@/components/ui/page-header";

export const dynamic = "force-dynamic";

/**
 * Step two of a draft: optional opponent scouting. Five Riot ID fields; each is verified and its
 * recent ranked games collected while the team gets ready. Only the draft's controller edits it,
 * and only before the first ban or pick; afterwards this page simply leads to the draft room.
 */
export default async function DraftScoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getAppDb();
  const [draft, session] = await Promise.all([getDraft(db, id), getSession()]);
  if (!draft) notFound();
  if (!canControlDraft(session, draft) || draft.actions.length > 0 || draft.status !== "in_progress") redirect(`/draft/${id}`);
  const scouting = await listEnemyScouting(db, id);
  const info = COMPETITION_MODE_INFO[draft.mode];
  const values = ROLES.map((r) => draft.enemyPlayers[r] ?? "");
  const context = [info.label, draft.seriesId ? `Game ${draft.gameNumber}` : null, draft.opponentName ? `vs ${draft.opponentName}` : null].filter(Boolean).join(" · ");
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <DraftStepper current={2} />
      <PageHeader
        title="Opponent scouting"
        description={
          <>
            {context}. Optional: enter the enemy Riot IDs you know, in any order. Their recent ranked games shape bans and picks; leave the fields empty to draft without them.
            {draft.seriesId && draft.gameNumber > 1 ? " Carried over from the last game: change anyone who was substituted." : ""}
          </>
        }
      />
      <section className="rounded-card border border-border bg-surface p-4 sm:p-5" aria-label="Enemy players">
        <EnemyScoutPanel draftId={id} initialValues={values} initialScouting={scouting} prepareHref={info.scouting === "full" || draft.seriesId ? `/draft/${id}/prepare` : null} />
      </section>
    </div>
  );
}
