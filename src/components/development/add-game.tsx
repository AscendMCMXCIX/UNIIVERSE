"use client";

import * as React from "react";
import Link from "next/link";
import { Pencil, Plus, RefreshCw } from "lucide-react";
import { ROLE_LABELS } from "@/domain/roles";
import { addRankedGameAction, importRankedMatchAction } from "@/server/actions/ranked";
import type { PlanView } from "@/server/development/repository";
import type { SessionGame } from "@/server/development/page-data";
import type { ImportableMatch, RankedGameView } from "@/server/ranked/repository";
import { ChampionPortrait } from "@/components/champion-portrait";
import { Button } from "@/components/ui/button";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { RelativeTime } from "@/components/ui/relative-time";
import { segmentClass, segmentedGroupClass } from "@/components/ui/segmented";
import { GameForm, toActionInput } from "@/components/ranked/game-form";
import type { JournalLookups } from "@/components/ranked/types";
import { cn } from "@/lib/cn";
import { ReviewDialog } from "./review-dialog";
import { useAction } from "./use-action";

function SyncedRow({ m, lookups, busy, onAdd }: { m: ImportableMatch; lookups: JournalLookups; busy: boolean; onAdd: () => void }) {
  const champion = lookups.championsById[m.championId] ?? { id: m.championId, name: m.championId, portraitUrl: "" };
  const enemy = m.enemyChampionId ? (lookups.championsById[m.enemyChampionId]?.name ?? m.enemyChampionId) : null;
  return (
    <li className="flex items-center gap-3 rounded-panel border border-border bg-surface p-2.5" data-testid="synced-game">
      <span className={cn("h-10 w-1 shrink-0 rounded-full", m.win ? "bg-blue" : "bg-red")} aria-hidden />
      <ChampionPortrait champion={champion} size="md" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-fg">
          {champion.name}
          {enemy ? <span className="font-normal text-fg-muted"> vs {enemy}</span> : null}
        </span>
        <span className="block truncate text-xs text-fg-muted">
          <span className={m.win ? "font-medium text-blue" : "font-medium text-red"}>{m.win ? "Win" : "Loss"}</span>
          {m.kda ? ` · ${m.kda.kills}/${m.kda.deaths}/${m.kda.assists}` : ""}
          {m.role ? ` · ${ROLE_LABELS[m.role]}` : ""}
          {m.gameDuration ? ` · ${Math.round(m.gameDuration / 60)} min` : ""} · <RelativeTime date={m.playedAt} />
          {lookups.accounts.length > 1 ? ` · ${m.riotId}` : ""}
        </span>
      </span>
      <Button size="sm" variant="outline" disabled={busy} onClick={onAdd} data-testid="synced-game-add">
        <Plus className="h-4 w-4" aria-hidden /> Add
      </Button>
    </li>
  );
}

/**
 * ADD A GAME to the session in progress (or start one with it): a synced Solo/Duo game that is not
 * in any session yet, in one tap, or a game typed in by hand when Riot has not handed it over (it is
 * linked to the synced match later instead of being counted twice). The review opens right after,
 * and can be skipped.
 */
export function AddGamePanel({ matches, accountState, lookups, target, review }: { matches: ImportableMatch[]; accountState: "none" | "pending" | "synced"; lookups: JournalLookups; target: { active: boolean; label: string }; review: { objectiveTitle: string | null; plan: Pick<PlanView, "ifText" | "thenText"> | null } }) {
  const { run } = useAction();
  const [mode, setMode] = React.useState<"synced" | "manual">(matches.length || accountState === "synced" ? "synced" : "manual");
  const [adding, setAdding] = React.useState<string | null>(null);
  const [added, setAdded] = React.useState<SessionGame | null>(null);
  const afterAdd = (game: RankedGameView, label: string) => {
    setAdded({ ...game, figures: null });
    return `Added to ${label}.`;
  };
  return (
    <Panel id="add-game" className="scroll-mt-20" data-testid="add-game">
      <PanelHeader
        title="Add a game"
        subtitle={target.active ? `Goes into ${target.label}. Games played during a session join it by themselves; add one here only if it is missing.` : `Starts ${target.label}.`}
        actions={
          <div role="radiogroup" aria-label="How to add a game" className={segmentedGroupClass()}>
            <button type="button" role="radio" aria-checked={mode === "synced"} onClick={() => setMode("synced")} className={segmentClass(mode === "synced")} data-testid="add-game-synced">
              <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Synced
            </button>
            <button type="button" role="radio" aria-checked={mode === "manual"} onClick={() => setMode("manual")} className={segmentClass(mode === "manual")} data-testid="add-game-manual">
              <Pencil className="h-3.5 w-3.5" aria-hidden /> By hand
            </button>
          </div>
        }
      />
      <PanelBody>
        {mode === "synced" ? (
          matches.length ? (
            <ul className="space-y-2">
              {matches.map((m) => (
                <SyncedRow
                  key={m.matchId}
                  m={m}
                  lookups={lookups}
                  busy={adding === m.matchId}
                  onAdd={async () => {
                    setAdding(m.matchId);
                    await run(() => importRankedMatchAction(m.matchId), { success: (d) => afterAdd(d.game, d.block.label) });
                    setAdding(null);
                  }}
                />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-fg-muted" data-testid="add-game-none">
              {accountState === "none" ? (
                <>
                  Link a Riot account in{" "}
                  <Link href="/overview/accounts" className="text-accent hover:underline">
                    Riot Accounts
                  </Link>{" "}
                  and your Solo/Duo games join your sessions by themselves.
                </>
              ) : accountState === "pending" ? (
                "Your Riot account is waiting for its first sync. You can add a game by hand meanwhile."
              ) : (
                "Every synced Solo/Duo game is already in a session."
              )}
            </p>
          )
        ) : (
          <GameForm
            lookups={lookups}
            reflection={false}
            submitLabel="Save game"
            onSubmit={async (values) => {
              const r = await run(() => addRankedGameAction(toActionInput(values)), { success: (d) => afterAdd(d.game, d.block.label) });
              return r ? null : "The game was not saved.";
            }}
          />
        )}
      </PanelBody>
      {added ? <ReviewDialog open onClose={() => setAdded(null)} game={added} objectiveTitle={review.objectiveTitle} plan={review.plan} lookups={lookups} /> : null}
    </Panel>
  );
}
