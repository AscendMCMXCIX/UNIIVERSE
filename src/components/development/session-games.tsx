"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { ClipboardCheck, ExternalLink, Pencil, Trash2, Users, X } from "lucide-react";
import { categoryLabel } from "@/domain/development/categories";
import { formatMeasure } from "@/domain/development/evidence";
import { gameMeasure, MEASURES, type MeasureKey } from "@/domain/development/measures";
import { executionLabel } from "@/domain/development/reviews";
import { mistakeLabel } from "@/domain/ranked-improvement";
import { resolveGameSessionAction, skipReviewAction } from "@/server/actions/development";
import { deleteRankedGameAction, setPlayedWithAction, updateRankedGameAction } from "@/server/actions/ranked";
import type { PlanView } from "@/server/development/repository";
import type { SessionGame } from "@/server/development/page-data";
import { ChampionPortrait } from "@/components/champion-portrait";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { GameForm, toActionInput, toDayInput } from "@/components/ranked/game-form";
import type { JournalLookups } from "@/components/ranked/types";
import { cn } from "@/lib/cn";
import { GameFacts } from "./game-facts";
import { ReviewDialog } from "./review-dialog";
import { useAction } from "./use-action";

// The match window is large and opened rarely from here: it loads when first opened.
const MatchDetailModal = dynamic(() => import("@/components/match-history/match-detail").then((m) => m.MatchDetailModal), { ssr: false });

export interface SessionContext {
  id: string;
  label: string;
  objectiveTitle: string | null;
  measure: MeasureKey | null;
  plan: Pick<PlanView, "ifText" | "thenText"> | null;
}

const REVIEW_BADGE: Record<SessionGame["reviewStatus"], { text: string; tone: "good" | "accent" | "neutral" }> = {
  done: { text: "Reviewed", tone: "good" },
  pending: { text: "Review waiting", tone: "accent" },
  skipped: { text: "Skipped", tone: "neutral" },
  none: { text: "No review", tone: "neutral" },
};

/** The player's own answers, labelled as theirs. */
function ReviewSummary({ game }: { game: SessionGame }) {
  const areas = [game.wentWell ? `Best: ${categoryLabel(game.wentWell)}` : null, game.wentWrong ? `Hardest: ${categoryLabel(game.wentWrong)}` : null].filter(Boolean);
  return (
    <div className="mt-2 space-y-1 rounded-md bg-bg-elevated px-3 py-2 text-sm" data-testid="game-review">
      <p className="text-2xs font-semibold uppercase tracking-label text-fg-subtle">Your review</p>
      {game.execution !== null ? (
        <p className="text-fg">
          <span className="text-fg-muted">Plan followed:</span> {executionLabel(game.execution)}
        </p>
      ) : null}
      {areas.length ? <p className="text-fg-muted">{areas.join(" · ")}</p> : null}
      {game.learning ? (
        <p className="text-fg">
          <span className="text-fg-muted">Learned:</span> {game.learning}
        </p>
      ) : null}
      {game.adjustment ? (
        <p className="text-fg">
          <span className="text-fg-muted">Next game:</span> {game.adjustment}
        </p>
      ) : null}
      {!game.learning && !game.adjustment && game.execution === null && !areas.length && (game.mainMistake || game.notes) ? <LegacyNotes game={game} bare /> : null}
    </div>
  );
}

/** What the Solo Queue Blocks journal recorded for an older game: its main mistake and notes. */
function LegacyNotes({ game, bare = false }: { game: SessionGame; bare?: boolean }) {
  if (!game.mainMistake && !game.notes) return null;
  return (
    <div className={cn("text-sm", !bare && "mt-2 rounded-md bg-bg-elevated px-3 py-2")}>
      {game.mainMistake ? (
        <p className="text-fg">
          <span className="text-fg-muted">Main mistake:</span> {mistakeLabel(game.mainMistake)}
        </p>
      ) : null}
      {game.notes ? <p className="whitespace-pre-wrap text-fg">{game.notes}</p> : null}
    </div>
  );
}

function PlayedWith({ game, lookups }: { game: SessionGame; lookups: Pick<JournalLookups, "teammateNames" | "teammates"> }) {
  const { busy, run } = useAction();
  if (!game.playedWith.length) return null;
  const nameOf = (id: string) => lookups.teammateNames[id] ?? lookups.teammates.find((t) => t.id === id)?.displayName ?? "former teammate";
  return (
    <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs" data-testid="played-with">
      <span className="inline-flex items-center gap-1 text-fg-muted">
        <Users className="h-3.5 w-3.5" aria-hidden /> Played with
      </span>
      {game.playedWith.map((p) => (
        <span key={p.playerId} className="inline-flex items-center gap-0.5 rounded-full border border-accent/40 bg-accent/10 py-0.5 pl-2 pr-0.5 text-fg" title={p.source === "detected" ? "On your team in the same Riot match (not necessarily a duo queue)" : "Tagged by you"}>
          {nameOf(p.playerId)}
          <button type="button" disabled={busy} onClick={() => void run(() => setPlayedWithAction(game.id, p.playerId, false))} className="grid h-6 w-6 place-items-center rounded-full text-fg-subtle hover:bg-bad/15 hover:text-bad pointer-coarse:h-8 pointer-coarse:w-8" aria-label={`Not played with ${nameOf(p.playerId)}`}>
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
    </p>
  );
}

/** A game that fits this session and another one: the player says where it belongs, once. */
function PlacementChoice({ game, session, otherLabel }: { game: SessionGame; session: SessionContext; otherLabel: string }) {
  const { busy, run } = useAction();
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-sm" data-testid="game-placement">
      <span className="min-w-0 flex-1 text-fg">This game was still running when {otherLabel} began. Which session does it belong to?</span>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => resolveGameSessionAction(game.id, false), { success: `Kept in ${session.label}.` })} data-testid="placement-keep">
        {session.label}
      </Button>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => resolveGameSessionAction(game.id, true), { success: `Moved to ${otherLabel}.` })} data-testid="placement-move">
        {otherLabel}
      </Button>
    </div>
  );
}

function SessionGameRow({ game, number, session, otherLabel, lookups, onReview, onMatch }: { game: SessionGame; number: number; session: SessionContext; otherLabel: string | null; lookups: JournalLookups; onReview: () => void; onMatch: () => void }) {
  const { busy, run } = useAction();
  const [editing, setEditing] = React.useState(false);
  const [removing, setRemoving] = React.useState(false);
  const champion = lookups.championsById[game.championId] ?? { id: game.championId, name: game.championId, portraitUrl: "" };
  const value = session.measure && game.figures ? gameMeasure(session.measure, game.figures) : null;
  const badge = REVIEW_BADGE[game.reviewStatus];
  const legacy = !!(game.mainMistake || game.notes);
  return (
    <li className="rounded-panel border border-border bg-surface p-3" data-testid="session-game" data-review={game.reviewStatus}>
      <div className="flex items-start gap-3">
        <span className={cn("mt-0.5 h-12 w-1 shrink-0 rounded-full", game.result === "win" ? "bg-blue" : "bg-red")} aria-hidden />
        <ChampionPortrait champion={champion} size="md" />
        <div className="min-w-0 flex-1">
          <GameFacts game={game} lookups={lookups} />
          {session.measure && value !== null ? (
            <p className="mt-0.5 text-xs text-fg-muted" data-testid="game-measure">
              {MEASURES[session.measure].short}: <span className="font-semibold text-fg tabular-nums">{formatMeasure(session.measure, value)}</span> <span className="text-fg-subtle">· recorded by Riot</span>
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-2xs tabular-nums text-fg-subtle">#{number}</span>
          <Badge tone={badge.tone}>{badge.text}</Badge>
        </div>
      </div>
      {game.needsConfirmation && otherLabel ? <PlacementChoice game={game} session={session} otherLabel={otherLabel} /> : null}
      {game.reviewStatus === "done" ? <ReviewSummary game={game} /> : legacy ? <LegacyNotes game={game} /> : null}
      <PlayedWith game={game} lookups={lookups} />
      <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-border pt-2">
        {game.reviewStatus === "pending" ? (
          <>
            <Button size="sm" variant="primary" onClick={onReview} data-testid="game-review-open">
              <ClipboardCheck className="h-4 w-4" aria-hidden /> Review
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(() => skipReviewAction(game.id), { success: "Skipped." })} data-testid="game-review-skip">
              Skip
            </Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" onClick={onReview} data-testid="game-review-open">
            <ClipboardCheck className="h-4 w-4" aria-hidden /> {game.reviewStatus === "done" ? "Edit review" : "Review"}
          </Button>
        )}
        {game.riotMatchId ? (
          <Button size="sm" variant="ghost" onClick={onMatch} data-testid="game-match">
            <ExternalLink className="h-4 w-4" aria-hidden /> Match details
          </Button>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)} data-testid="game-edit">
            <Pencil className="h-4 w-4" aria-hidden /> Edit
          </Button>
        )}
        <Button size="sm" variant="ghost" className="ml-auto text-fg-muted hover:text-bad" onClick={() => setRemoving(true)} aria-label={`Remove game ${number} from ${session.label}`} data-testid="game-remove">
          <Trash2 className="h-4 w-4" aria-hidden /> <span className="max-sm:sr-only">Remove</span>
        </Button>
      </div>
      <Dialog open={editing} onClose={() => setEditing(false)} title={`Edit game ${number}`} className="sm:max-w-2xl">
        {editing ? (
          <GameForm
            lookups={lookups}
            reflection={legacy}
            initial={{ championId: game.championId, enemyChampionId: game.enemyChampionId, result: game.result, mainMistake: game.mainMistake ?? "", notes: game.notes, link: game.link, role: game.role ?? "", playedOn: toDayInput(game.playedAt), teammatePlayerId: game.teammatePlayerId ?? "", accountId: game.accountId ?? "" }}
            submitLabel="Save changes"
            onCancel={() => setEditing(false)}
            onSubmit={async (values) => {
              if (!(await run(() => updateRankedGameAction(game.id, toActionInput(values)), { success: "Game saved." }))) return "The game was not saved.";
              setEditing(false);
              return null;
            }}
          />
        ) : null}
      </Dialog>
      <ConfirmDialog
        open={removing}
        title={`Remove game ${number} from ${session.label}?`}
        description={
          game.riotMatchId
            ? `${champion.name}, ${game.result}. Its review goes with it. The Riot match stays in your Match History and statistics, and it will not join a session by itself again (you can add it back from your synced games).`
            : `${champion.name}, ${game.result}, added by hand. Its review goes with it.`
        }
        confirmLabel="Remove game"
        busy={busy}
        onCancel={() => setRemoving(false)}
        onConfirm={async () => {
          if (await run(() => deleteRankedGameAction(game.id), { success: "Game removed. Your Riot match history is untouched." })) setRemoving(false);
        }}
      />
    </li>
  );
}

/**
 * A session's games, newest first: what Riot recorded, the objective's statistic for each game, the
 * player's review (or a way to give one), and a confirmation where a game fits two sessions.
 */
export function SessionGameList({ games, session, alternatives, lookups, playerId, emptyText }: { games: SessionGame[]; session: SessionContext; alternatives: Record<string, string>; lookups: JournalLookups; playerId: string; emptyText: React.ReactNode }) {
  const [reviewing, setReviewing] = React.useState<string | null>(null);
  const [match, setMatch] = React.useState<string | null>(null);
  const review = games.find((g) => g.id === reviewing) ?? null;
  if (games.length === 0) return <div className="rounded-panel border border-dashed border-border px-4 py-5 text-center text-sm text-fg-muted">{emptyText}</div>;
  const numbered = games.map((g, i) => ({ g, n: i + 1 })).reverse();
  return (
    <>
      <ol className="space-y-2" data-testid="session-games">
        {numbered.map(({ g, n }) => (
          <SessionGameRow key={g.id} game={g} number={n} session={session} otherLabel={g.alternativeBlockId ? (alternatives[g.alternativeBlockId] ?? null) : null} lookups={lookups} onReview={() => setReviewing(g.id)} onMatch={() => g.riotMatchId && setMatch(g.riotMatchId)} />
        ))}
      </ol>
      {review ? <ReviewDialog open onClose={() => setReviewing(null)} game={review} objectiveTitle={session.objectiveTitle} plan={session.plan} lookups={lookups} /> : null}
      {match ? <MatchDetailModal playerId={playerId} matchId={match} championsById={lookups.championsById} onClose={() => setMatch(null)} /> : null}
    </>
  );
}
