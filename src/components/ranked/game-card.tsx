"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Copy,
  ExternalLink,
  Pencil,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { mistakeLabel } from "@/domain/ranked-improvement";
import { ROLE_LABELS } from "@/domain/roles";
import {
  deleteRankedGameAction,
  setPlayedWithAction,
  updateRankedGameAction,
} from "@/server/actions/ranked";
import type { RankedGameView } from "@/server/ranked/repository";
import { ChampionPortrait } from "@/components/champion-portrait";
import { RoleIcon } from "@/components/role-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { formatDate } from "@/lib/format";
import { GameForm, toActionInput, toDayInput } from "./game-form";
import type { JournalLookups } from "./types";

/** One journal game: facts on the left, reflection on the right, edit and delete at hand. */
export function GameCard({
  game,
  index,
  lookups,
  canEdit = true,
}: {
  game: RankedGameView;
  index: number;
  lookups: JournalLookups;
  canEdit?: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [confirming, setConfirming] = React.useState(false);
  const champion = lookups.championsById[game.championId] ?? {
    id: game.championId,
    name: game.championId,
    portraitUrl: "",
  };
  const enemy = game.enemyChampionId
    ? (lookups.championsById[game.enemyChampionId] ?? {
        id: game.enemyChampionId,
        name: game.enemyChampionId,
        portraitUrl: "",
      })
    : null;
  const nameOf = (id: string) =>
    lookups.teammateNames[id] ??
    lookups.teammates.find((t) => t.id === id)?.displayName ??
    "former teammate";
  const correct = async (teammateId: string, played: boolean) => {
    setBusy(true);
    const res = await setPlayedWithAction(game.id, teammateId, played);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    router.refresh();
  };
  const account = game.accountId
    ? lookups.accounts.find((a) => a.id === game.accountId)
    : null;

  const remove = async () => {
    setBusy(true);
    const res = await deleteRankedGameAction(game.id);
    setBusy(false);
    setConfirming(false);
    if (!res.ok) return setError(res.error);
    toast.success("Game deleted.");
    router.refresh();
  };
  const confirmDialog = (
    <ConfirmDialog
      open={confirming}
      title={`Delete game ${index}?`}
      description={`${champion.name}, ${game.result}. This cannot be undone.`}
      confirmLabel="Delete game"
      busy={busy}
      onCancel={() => setConfirming(false)}
      onConfirm={remove}
    />
  );

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(game.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Could not copy the link.");
    }
  };

  if (editing) {
    return (
      <li className="rounded-md border border-accent/40 bg-bg-elevated p-3">
        <div className="mb-2 text-xs font-medium text-fg-muted">
          Editing game {index}
        </div>
        <GameForm
          lookups={lookups}
          synced={!!game.riotMatchId}
          initial={{
            championId: game.championId,
            enemyChampionId: game.enemyChampionId,
            result: game.result,
            mainMistake: game.mainMistake ?? "",
            notes: game.notes,
            link: game.link,
            role: game.role ?? "",
            playedOn: toDayInput(game.playedAt),
            teammatePlayerId: game.teammatePlayerId ?? "",
            accountId: game.accountId ?? "",
          }}
          submitLabel="Save changes"
          onCancel={() => setEditing(false)}
          onSubmit={async (values) => {
            const res = await updateRankedGameAction(
              game.id,
              toActionInput(values),
            );
            if (!res.ok) return res.error;
            setEditing(false);
            router.refresh();
            return null;
          }}
        />
      </li>
    );
  }

  return (
    <li className="rounded-md border border-border bg-bg-elevated p-3">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex items-center gap-1.5">
          <ChampionPortrait champion={champion} size="md" />
          {enemy ? (
            <>
              <span className="text-xs text-fg-subtle">vs</span>
              <ChampionPortrait champion={enemy} size="md" dimmed />
            </>
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 text-sm">
            <span className="text-fg-subtle">#{index}</span>
            <span className="font-medium text-fg">{champion.name}</span>
            {enemy ? (
              <span className="text-fg-muted">vs {enemy.name}</span>
            ) : null}
            <Badge tone={game.result === "win" ? "blue" : "red"}>
              {game.result === "win" ? "Win" : "Loss"}
            </Badge>
            {game.role ? (
              <span
                className="inline-flex items-center gap-1 text-xs text-fg-muted"
                title={ROLE_LABELS[game.role]}
              >
                <RoleIcon role={game.role} className="h-3.5 w-3.5" />{" "}
                {ROLE_LABELS[game.role]}
              </span>
            ) : null}
            {game.riotMatchId ? (
              <Badge
                tone="good"
                title={`Imported from your synced Riot match ${game.riotMatchId}${account ? ` (${account.riotId})` : ""}`}
              >
                Synced
              </Badge>
            ) : null}
          </div>
          {game.playedWith.length ? (
            <div
              className="mt-1 flex flex-wrap items-center gap-1.5 text-xs"
              data-testid="played-with"
            >
              <span className="inline-flex items-center gap-1 text-fg-muted">
                <Users className="h-3.5 w-3.5" aria-hidden /> Played with
              </span>
              {game.playedWith.map((p) => (
                <span
                  key={p.playerId}
                  className="inline-flex items-center gap-0.5 rounded-full border border-accent/40 bg-accent/10 py-0.5 pl-2 pr-0.5 text-fg"
                  title={
                    p.source === "detected"
                      ? "Found in the same Riot match on your team (not necessarily a duo queue)"
                      : "Tagged by you"
                  }
                >
                  {nameOf(p.playerId)}
                  {p.source === "detected" ? (
                    <span className="text-fg-subtle"> · same team</span>
                  ) : null}
                  {canEdit ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void correct(p.playerId, false)}
                      className="grid h-5 w-5 place-items-center rounded-full text-fg-subtle hover:bg-bad/15 hover:text-bad pointer-coarse:h-7 pointer-coarse:w-7"
                      aria-label={`Not played with ${nameOf(p.playerId)}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  ) : null}
                </span>
              ))}
            </div>
          ) : null}
          {canEdit && game.notPlayedWith.length ? (
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-fg-subtle">
              Removed:
              {game.notPlayedWith.map((id) => (
                <button
                  key={id}
                  type="button"
                  disabled={busy}
                  onClick={() => void correct(id, true)}
                  className="rounded-full border border-dashed border-border px-2 py-0.5 hover:border-accent hover:text-fg"
                  aria-label={`Played with ${nameOf(id)} after all`}
                >
                  {nameOf(id)} ↺
                </button>
              ))}
            </div>
          ) : null}
          <div className="mt-0.5 text-xs text-fg-muted">
            <span className="font-medium text-fg">Main mistake:</span>{" "}
            {game.mainMistake ? mistakeLabel(game.mainMistake) : "not recorded"}{" "}
            · {formatDate(game.playedAt)}
            {account && lookups.accounts.length > 1
              ? ` · ${account.riotId}`
              : ""}
          </div>
          {game.notes ? (
            <p className="mt-1 whitespace-pre-wrap text-sm text-fg">
              {game.notes}
            </p>
          ) : null}
          {game.link ? (
            <div className="mt-1 flex flex-wrap items-center gap-1">
              <a
                href={game.link}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex min-h-8 items-center gap-1 text-xs text-accent hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Open game link
              </a>
              <Button
                size="sm"
                variant="ghost"
                onClick={copyLink}
                aria-label="Copy game link"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-good" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}{" "}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          ) : null}
          {error ? (
            <p className="mt-1 text-xs text-bad" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        {canEdit ? (
          <div className="flex gap-1 max-sm:w-full max-sm:justify-end">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setEditing(true)}
              disabled={busy}
              aria-label={`Edit game ${index}`}
            >
              <Pencil className="h-3.5 w-3.5" /> Edit
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setConfirming(true)}
              disabled={busy}
              aria-label={`Delete game ${index}`}
              className="text-bad hover:text-bad"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </Button>
          </div>
        ) : null}
      </div>
      {confirmDialog}
    </li>
  );
}

export function GameList({
  games,
  lookups,
  canEdit = true,
  emptyText = "No games yet.",
}: {
  games: RankedGameView[];
  lookups: JournalLookups;
  canEdit?: boolean;
  emptyText?: string;
}) {
  if (games.length === 0)
    return <p className="text-sm text-fg-muted">{emptyText}</p>;
  return (
    <ul className="space-y-2">
      {games.map((g, i) => (
        <GameCard
          key={g.id}
          game={g}
          index={i + 1}
          lookups={lookups}
          canEdit={canEdit}
        />
      ))}
    </ul>
  );
}
