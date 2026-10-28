import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/server/auth/session";
import { getAppDb } from "@/server/bootstrap";
import { getOrCreateTeam } from "@/server/repositories/team";
import { listObjectives } from "@/server/development/repository";
import { associateQuietly } from "@/server/development/association";
import { loadSession } from "@/server/development/page-data";
import { getActiveBlock, listBlocks } from "@/server/ranked/repository";
import { loadJournalLookups } from "@/server/ranked/page-data";
import { isActiveStatus } from "@/domain/development/objectives";
import { planSentence } from "@/domain/development/plans";
import { sessionLimitText, sessionStatusText } from "@/domain/development/sessions";
import { accountShortNames } from "@/domain/account-names";
import { CurrentSessionPanel, DeleteSessionButton, NextSessionChoice } from "@/components/development/current-session";
import { DevelopmentNeedsProfile } from "@/components/development/needs-profile";
import { SessionGameList } from "@/components/development/session-games";
import { SessionNoteEditor } from "@/components/development/session-note";
import { SessionSummaryView } from "@/components/development/session-summary";
import { Badge } from "@/components/ui/badge";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { formatDate, formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * One session: its summary (results and LP from Riot, then what the player's reviews say), the
 * objective and plan it was played with (as they were then), its games with their reviews, the
 * closing note, and for the latest session the choice for the next one. Another player's session
 * is simply not found.
 */
export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.playerId) return <DevelopmentNeedsProfile />;
  const owner = session.playerId;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = await getAppDb();
  await associateQuietly(db, owner);
  const detail = await loadSession(db, owner, id);
  if (!detail) notFound();
  const [team, objectives, latest, active] = await Promise.all([getOrCreateTeam(db), listObjectives(db, owner), listBlocks(db, owner, { limit: 1 }), getActiveBlock(db, owner)]);
  const lookups = await loadJournalLookups(db, team.id, owner, detail.games.flatMap((g) => [...g.playedWith.map((p) => p.playerId), ...g.notPlayedWith]));
  const library = objectives.filter((o) => isActiveStatus(o.status));
  const s = detail.session;
  const back = (
    <Link href="/overview/development/sessions" className="inline-flex min-h-6 items-center text-xs text-accent hover:underline">
      ← Sessions
    </Link>
  );
  if (s.status === "active")
    return (
      <div className="space-y-3">
        {back}
        <CurrentSessionPanel detail={detail} library={library} lookups={lookups} playerId={owner} />
      </div>
    );
  const objective = objectives.find((o) => o.id === s.objectiveId) ?? null;
  const isLatest = latest[0]?.id === s.id && !active;
  const account = s.accountId ? accountShortNames(lookups.accounts).get(s.accountId) : null;
  return (
    <div className="space-y-4" data-testid="session-page">
      {back}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Panel className="min-w-0">
          <PanelHeader
            title={
              <span className="inline-flex flex-wrap items-center gap-2">
                {s.label} <Badge>{sessionStatusText(s)}</Badge>
              </span>
            }
            subtitle={`${formatDateTime(s.startedAt)}${s.completedAt ? ` → ${formatDate(s.completedAt)}` : ""} · ${sessionLimitText(s)} · ${account ?? "any of your accounts"}`}
            actions={<DeleteSessionButton session={s} after="/overview/development/sessions" />}
          />
          <PanelBody className="space-y-4">
            <div className="space-y-2 rounded-md bg-bg-elevated px-3 py-2.5 text-sm">
              <p>
                <span className="text-fg-muted">Objective: </span>
                <span className="font-medium text-fg">{s.focus ?? "none"}</span>
              </p>
              {detail.plan ? (
                <p>
                  <span className="text-fg-muted">Plan played with: </span>
                  <span className="text-fg">{planSentence(detail.plan)}</span>
                </p>
              ) : null}
            </div>
            <SessionSummaryView summary={detail.summary} lp={detail.lp} lookups={lookups} />
            <SessionNoteEditor sessionId={s.id} note={s.closingNote} />
            {isLatest ? (
              <div className="border-t border-border pt-3">
                <NextSessionChoice objective={objective && isActiveStatus(objective.status) ? objective : null} library={library} lookups={lookups} />
              </div>
            ) : null}
          </PanelBody>
        </Panel>
        <section className="min-w-0 space-y-2" aria-labelledby="session-games-title">
          <h2 id="session-games-title" className="text-base font-semibold text-fg">
            Games
          </h2>
          <SessionGameList
            games={detail.games}
            session={{ id: s.id, label: s.label, objectiveTitle: s.focus, measure: detail.objective?.measure ?? null, plan: detail.plan }}
            alternatives={detail.alternatives}
            lookups={lookups}
            playerId={owner}
            emptyText="No games in this session. A game played in it that Riot hands over late still joins it."
          />
        </section>
      </div>
    </div>
  );
}
