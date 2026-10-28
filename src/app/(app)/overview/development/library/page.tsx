import { BookOpenCheck } from "lucide-react";
import { getSession } from "@/server/auth/session";
import { getAppDb } from "@/server/bootstrap";
import { getOrCreateTeam } from "@/server/repositories/team";
import { loadDevelopment, objectiveReviewHistory } from "@/server/development/page-data";
import { loadJournalLookups } from "@/server/ranked/page-data";
import { isActiveStatus } from "@/domain/development/objectives";
import { NewObjectiveButton, PatternsPanel, PlanHistoryPanel } from "@/components/development/library-panels";
import { DevelopmentNeedsProfile } from "@/components/development/needs-profile";
import { ObjectiveCard } from "@/components/development/objective-card";
import { EmptyState } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";

/** Review histories are read for at most this many objectives (the working ones first). */
const HISTORIES = 12;

/**
 * RANKED DEVELOPMENT → DEVELOPMENT: the weakness library. The current objective first, then the
 * others being worked on, then the maintained ones (with a reminder to revisit); each with its
 * plan, its evidence and its recent reviews. Below: patterns in the player's reviews and every
 * If–Then plan they have written.
 */
export default async function DevelopmentLibraryPage() {
  const session = await getSession();
  if (!session?.playerId) return <DevelopmentNeedsProfile />;
  const owner = session.playerId;
  const db = await getAppDb();
  const team = await getOrCreateTeam(db);
  const [data, lookups] = await Promise.all([loadDevelopment(db, owner), loadJournalLookups(db, team.id, owner, [])]);
  const histories = new Map(await Promise.all(data.objectives.slice(0, HISTORIES).map(async (p) => [p.objective.id, await objectiveReviewHistory(db, owner, p.objective.id)] as const)));
  const working = data.objectives.filter((p) => isActiveStatus(p.objective.status));
  const maintained = data.objectives.filter((p) => !isActiveStatus(p.objective.status));
  const hasPrimary = data.objectives.some((p) => p.objective.isPrimary);
  const activeObjectives = working.map((p) => p.objective);
  return (
    <div className="space-y-5" data-testid="development-library">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-fg">Your development library</h2>
          <p className="text-sm text-fg-muted">Skills you practise, one at a time: Identified → Practising → Improving → Maintaining. You move them; wins alone never do.</p>
        </div>
        <NewObjectiveButton lookups={lookups} hasPrimary={hasPrimary} />
      </div>
      {data.objectives.length === 0 ? (
        <EmptyState icon={BookOpenCheck} title="Your library is empty" testId="library-empty" action={<NewObjectiveButton lookups={lookups} hasPrimary={false} label="Add your first objective" />}>
          Add something you noticed in your games: an area such as wave management, vision or trading, in your own words, with an If–Then plan to apply it. Practise it in sessions, review a game or two, and adjust.
        </EmptyState>
      ) : (
        <>
          <section className="space-y-3" aria-labelledby="working-on">
            <h3 id="working-on" className="text-sm font-semibold uppercase tracking-label text-fg-subtle">
              Working on · {working.length}
            </h3>
            {working.length ? working.map((p) => <ObjectiveCard key={p.objective.id} progress={p} reviews={histories.get(p.objective.id) ?? null} lookups={lookups} hasPrimary={hasPrimary} />) : <p className="text-sm text-fg-muted">Nothing in progress: reopen a maintained skill below or add a new objective.</p>}
          </section>
          {maintained.length ? (
            <section className="space-y-3" aria-labelledby="maintaining">
              <h3 id="maintaining" className="text-sm font-semibold uppercase tracking-label text-fg-subtle">
                Maintaining · {maintained.length}
              </h3>
              {maintained.map((p) => (
                <ObjectiveCard key={p.objective.id} progress={p} reviews={histories.get(p.objective.id) ?? null} lookups={lookups} hasPrimary={hasPrimary} />
              ))}
            </section>
          ) : null}
        </>
      )}
      <div className="grid items-start gap-4 xl:grid-cols-2">
        <PatternsPanel patterns={data.patterns} covered={activeObjectives.map((o) => o.category)} lookups={lookups} hasPrimary={hasPrimary} />
        <PlanHistoryPanel plans={data.plans} objectives={activeObjectives} />
      </div>
    </div>
  );
}
