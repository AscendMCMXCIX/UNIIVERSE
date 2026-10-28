import Link from "next/link";
import { getSession } from "@/server/auth/session";
import { getAppDb } from "@/server/bootstrap";
import { getOrCreateTeam } from "@/server/repositories/team";
import { listObjectives } from "@/server/development/repository";
import { associateQuietly } from "@/server/development/association";
import { listSessions, loadSession } from "@/server/development/page-data";
import { getActiveBlock, listBlocks, listImportableMatches } from "@/server/ranked/repository";
import { loadJournalLookups } from "@/server/ranked/page-data";
import { isActiveStatus } from "@/domain/development/objectives";
import { blockLabel } from "@/domain/ranked-improvement";
import { AddGamePanel } from "@/components/development/add-game";
import { BeforeYouQueue } from "@/components/development/before-queue";
import { CurrentSessionPanel } from "@/components/development/current-session";
import { DevelopmentNeedsProfile } from "@/components/development/needs-profile";
import { SessionList } from "@/components/development/session-list";

export const dynamic = "force-dynamic";

/** Sessions per page in the history. */
const PAGE = 10;

/**
 * RANKED DEVELOPMENT → SESSIONS: the session in progress (its games join as they sync, each with its
 * review), adding a game that is missing, and every earlier session a page at a time. With no
 * session running, the same Before you queue card as the Overview starts one.
 */
export default async function SessionsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const session = await getSession();
  if (!session?.playerId) return <DevelopmentNeedsProfile />;
  const owner = session.playerId;
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);
  const db = await getAppDb();
  await associateQuietly(db, owner);
  const [team, active, latest, history, objectives] = await Promise.all([getOrCreateTeam(db), getActiveBlock(db, owner), listBlocks(db, owner, { limit: 1 }), listSessions(db, owner, { limit: PAGE + 1, offset: (page - 1) * PAGE, status: "completed" }), listObjectives(db, owner)]);
  const detail = active ? await loadSession(db, owner, active.id) : null;
  const lookups = await loadJournalLookups(db, team.id, owner, (detail?.games ?? []).flatMap((g) => [...g.playedWith.map((p) => p.playerId), ...g.notPlayedWith]));
  const importable = lookups.accountState === "none" ? [] : await listImportableMatches(db, owner, 6);
  const library = objectives.filter((o) => isActiveStatus(o.status));
  const primary = objectives.find((o) => o.isPrimary) ?? null;
  const past = history.slice(0, PAGE);
  const hasMore = history.length > PAGE;
  const nextLabel = blockLabel((latest[0]?.number ?? 0) + 1);
  return (
    <div className="space-y-4" data-testid="development-sessions">
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          {detail ? <CurrentSessionPanel detail={detail} library={library} lookups={lookups} playerId={owner} /> : <BeforeYouQueue primary={primary} library={library} active={null} lookups={lookups} />}
        </div>
        <div className="min-w-0 lg:sticky lg:top-4">
          <AddGamePanel
            matches={importable}
            accountState={lookups.accountState}
            lookups={lookups}
            target={{ active: !!detail, label: detail?.session.label ?? nextLabel }}
            review={{ objectiveTitle: detail?.objective?.title ?? detail?.session.focus ?? primary?.title ?? null, plan: detail ? detail.plan : (primary?.plan ?? null) }}
          />
        </div>
      </div>
      <section className="space-y-2" aria-labelledby="session-history">
        <h2 id="session-history" className="text-base font-semibold text-fg">
          Earlier sessions
        </h2>
        <div className="rounded-card border border-border bg-surface px-3">
          <SessionList sessions={past} emptyText="Finished sessions appear here, each with its summary." />
        </div>
        {page > 1 || hasMore ? (
          <nav className="flex items-center justify-between text-sm" aria-label="Session pages">
            {page > 1 ? (
              <Link href={`/overview/development/sessions?page=${page - 1}`} className="inline-flex min-h-11 items-center text-accent hover:underline">
                ← Newer
              </Link>
            ) : (
              <span />
            )}
            <span className="text-xs text-fg-subtle">Page {page}</span>
            {hasMore ? (
              <Link href={`/overview/development/sessions?page=${page + 1}`} className="inline-flex min-h-11 items-center text-accent hover:underline">
                Older →
              </Link>
            ) : (
              <span />
            )}
          </nav>
        ) : null}
      </section>
    </div>
  );
}
