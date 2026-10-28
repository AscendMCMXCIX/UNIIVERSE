"use client";

import * as React from "react";
import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { categoryLabel } from "@/domain/development/categories";
import { executionLabel } from "@/domain/development/reviews";
import { blockLabel } from "@/domain/ranked-improvement";
import { skipReviewAction } from "@/server/actions/development";
import type { PlanView } from "@/server/development/repository";
import type { PendingReview, ReviewedGame } from "@/server/development/page-data";
import { ChampionPortrait } from "@/components/champion-portrait";
import { Button } from "@/components/ui/button";
import type { JournalLookups } from "@/components/ranked/types";
import { formatDate } from "@/lib/format";
import { GameFacts } from "./game-facts";
import { ReviewDialog } from "./review-dialog";
import { useAction } from "./use-action";

/**
 * AFTER A GAME: the games waiting for a review (newest first), each a minute's review or a skip
 * without penalty. Shown only while there are some.
 */
export function PendingReviews({ games, plans, lookups }: { games: PendingReview[]; plans: Record<string, Pick<PlanView, "ifText" | "thenText"> | null>; lookups: JournalLookups }) {
  const { busy, run } = useAction();
  const [open, setOpen] = React.useState<string | null>(null);
  const game = games.find((g) => g.id === open) ?? null;
  if (games.length === 0) return null;
  return (
    <section className="rounded-card border border-accent/40 bg-surface p-4 sm:p-5" aria-labelledby="pending-reviews" data-testid="pending-reviews">
      <h2 id="pending-reviews" className="flex items-center gap-2 text-base font-semibold text-fg">
        <ClipboardCheck className="h-4 w-4 text-accent" aria-hidden /> {games.length === 1 ? "Review your last game" : `${games.length} games to review`}
      </h2>
      <p className="mt-0.5 text-sm text-fg-muted">Under a minute each: how well you followed your plan, what you learned, what you will adjust. Skipping costs nothing.</p>
      <ul className="mt-3 space-y-2">
        {games.map((g) => (
          <li key={g.id} className="flex flex-wrap items-center gap-3 rounded-panel border border-border bg-bg-elevated p-2.5" data-testid="pending-review">
            <ChampionPortrait champion={lookups.championsById[g.championId] ?? { id: g.championId, name: g.championId, portraitUrl: "" }} size="sm" />
            <GameFacts game={g} lookups={lookups} className="flex-1" />
            <span className="flex gap-1.5 max-sm:w-full">
              <Button size="sm" variant="primary" onClick={() => setOpen(g.id)} className="max-sm:flex-1" data-testid="pending-review-open">
                Review
              </Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(() => skipReviewAction(g.id), { success: "Skipped." })} className="max-sm:flex-1" data-testid="pending-review-skip">
                Skip
              </Button>
            </span>
          </li>
        ))}
      </ul>
      {game ? <ReviewDialog open onClose={() => setOpen(null)} game={game} objectiveTitle={game.objectiveTitle} plan={game.objectiveId ? (plans[game.objectiveId] ?? null) : null} lookups={lookups} /> : null}
    </section>
  );
}

/** The latest reviews, newest first: the player's own words, labelled self-reported. */
export function RecentReviews({ reviews, lookups }: { reviews: ReviewedGame[]; lookups: Pick<JournalLookups, "championsById"> }) {
  return (
    <section className="rounded-card border border-border bg-surface p-4 sm:p-5" aria-labelledby="recent-reviews" data-testid="recent-reviews">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="recent-reviews" className="text-base font-semibold text-fg">
          Recent reviews
        </h2>
        <span className="text-xs text-fg-subtle">Self-reported</span>
      </div>
      {reviews.length === 0 ? (
        <p className="mt-2 text-sm text-fg-muted">Your reviews appear here. After a game, a short review records how the plan went and what to adjust.</p>
      ) : (
        <ul className="mt-2 divide-y divide-border">
          {reviews.map((r) => (
            <li key={r.id} className="py-2.5">
              <Link href={`/overview/development/sessions/${r.blockId}`} className="flex items-start gap-3 rounded-md hover:bg-surface-2/40">
                <ChampionPortrait champion={lookups.championsById[r.championId] ?? { id: r.championId, name: r.championId, portraitUrl: "" }} size="xs" />
                <span className="min-w-0 flex-1 text-sm">
                  <span className="block text-xs text-fg-muted">
                    <span className={r.result === "win" ? "text-blue" : "text-red"}>{r.result === "win" ? "Win" : "Loss"}</span> · {blockLabel(r.sessionNumber)} · {formatDate(r.playedAt)}
                    {r.execution !== null ? ` · plan: ${executionLabel(r.execution)}` : ""}
                  </span>
                  {r.learning ? <span className="block text-fg">{r.learning}</span> : null}
                  {r.adjustment ? <span className="block text-fg-muted">Next: {r.adjustment}</span> : null}
                  {!r.learning && !r.adjustment ? <span className="block text-fg-muted">{[r.wentWell ? `Best: ${categoryLabel(r.wentWell)}` : null, r.wentWrong ? `Hardest: ${categoryLabel(r.wentWrong)}` : null].filter(Boolean).join(" · ") || "Rated only"}</span> : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
