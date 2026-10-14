"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, Zap } from "lucide-react";
import { MAIN_MISTAKES } from "@/domain/ranked-improvement";
import { ROLE_LABELS } from "@/domain/roles";
import { importRankedMatchAction } from "@/server/actions/ranked";
import type { ImportableMatch } from "@/server/ranked/repository";
import { ChampionPortrait } from "@/components/champion-portrait";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { JournalLookups } from "./types";

export interface ImportPanelProps {
  matches: ImportableMatch[];
  lookups: JournalLookups;
  /** How the owner's Riot accounts stand: none linked, linked but not synced yet, or synced. */
  accountState: "none" | "pending" | "synced";
}

/** One recent game: tap it, tap the main mistake, optionally a note, Save. Riot fills in the facts and who played with you. */
function QuickRow({
  m,
  lookups,
  open,
  onOpen,
  busy,
  onSave,
}: {
  m: ImportableMatch;
  lookups: JournalLookups;
  open: boolean;
  onOpen: () => void;
  busy: boolean;
  onSave: (extra: { mainMistake: string | null; notes: string }) => void;
}) {
  const [mistake, setMistake] = React.useState<string | null>(null);
  const [note, setNote] = React.useState("");
  const champion = lookups.championsById[m.championId] ?? {
    id: m.championId,
    name: m.championId,
    portraitUrl: "",
  };
  const enemy = m.enemyChampionId
    ? (lookups.championsById[m.enemyChampionId] ?? {
        id: m.enemyChampionId,
        name: m.enemyChampionId,
        portraitUrl: "",
      })
    : null;
  return (
    <li
      className={cn(
        "rounded-xl border bg-surface transition-colors",
        open ? "border-accent/50" : "border-border hover:border-border-strong",
      )}
      data-testid="quick-game"
    >
      <button
        type="button"
        onClick={onOpen}
        aria-expanded={open}
        className="flex w-full items-center gap-3 p-2.5 text-left"
      >
        <span
          className={cn(
            "h-10 w-1 shrink-0 rounded-full",
            m.win ? "bg-blue" : "bg-red",
          )}
          aria-hidden
        />
        <ChampionPortrait champion={champion} size="md" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-fg">
            {champion.name}
            {enemy ? (
              <span className="font-normal text-fg-muted">
                {" "}
                vs {enemy.name}
              </span>
            ) : null}
          </span>
          <span className="block truncate text-xs text-fg-muted">
            <span
              className={
                m.win ? "font-medium text-blue" : "font-medium text-red"
              }
            >
              {m.win ? "Win" : "Loss"}
            </span>
            {m.kda ? ` · ${m.kda.kills}/${m.kda.deaths}/${m.kda.assists}` : ""}
            {m.role ? ` · ${ROLE_LABELS[m.role]}` : ""}
            {m.gameDuration
              ? ` · ${Math.round(m.gameDuration / 60)} min`
              : ""}{" "}
            · {timeAgo(m.playedAt)}
            {lookups.accounts.length > 1 ? ` · ${m.riotId}` : ""}
          </span>
        </span>
        <ChevronRight
          className={cn(
            "h-4 w-4 shrink-0 text-fg-subtle transition-transform",
            open && "rotate-90",
          )}
          aria-hidden
        />
      </button>
      {open ? (
        <div className="rise-in space-y-2.5 border-t border-border p-3">
          <div>
            <div className="mb-1.5 text-xs font-medium text-fg-muted">
              Main mistake
            </div>
            <div
              role="radiogroup"
              aria-label="Main mistake"
              className="flex flex-wrap gap-1.5"
            >
              {MAIN_MISTAKES.map((x) => (
                <button
                  key={x.key}
                  type="button"
                  role="radio"
                  aria-checked={mistake === x.key}
                  onClick={() => setMistake(mistake === x.key ? null : x.key)}
                  className={cn(
                    "min-h-11 rounded-full border px-3 text-sm transition-colors md:min-h-9",
                    mistake === x.key
                      ? "border-accent bg-accent/15 text-fg"
                      : "border-border text-fg-muted hover:border-border-strong hover:text-fg",
                  )}
                >
                  {x.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Note (optional)"
              aria-label="Note"
              maxLength={2000}
              className="sm:flex-1"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onSave({ mainMistake: mistake, notes: note });
                }
              }}
            />
            <Button
              variant="primary"
              disabled={busy}
              onClick={() => onSave({ mainMistake: mistake, notes: note })}
              data-testid="quick-save"
            >
              <Check className="h-4 w-4" /> {busy ? "Saving…" : "Save game"}
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

/**
 * QUICK ADD: recent Solo/Duo games from the owner's synced Riot accounts. Riot fills in the
 * champion, opponent, result and date; the player taps the main mistake, adds a note if they
 * like, and saves (about thirty seconds). A game already in the journal never appears twice.
 * Manual entry always works for games Riot has not synced yet.
 */
export function ImportPanel({
  matches,
  lookups,
  accountState,
  blockActive,
}: ImportPanelProps & { blockActive: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState<string | null>(
    matches[0]?.matchId ?? null,
  );

  const save = async (
    m: ImportableMatch,
    extra: { mainMistake: string | null; notes: string },
  ) => {
    setBusy(m.matchId);
    const res = await importRankedMatchAction(m.matchId, extra);
    setBusy(null);
    if (!res.ok)
      return void toast.error("Game not saved", { description: res.error });
    toast.success(
      res.data.targetReached
        ? `Saved: ${res.data.block.label} has reached its target (${res.data.block.games} games). Finish it, or keep playing.`
        : `Saved to ${res.data.block.label}.`,
    );
    setOpen(null);
    router.refresh();
  };

  return (
    <section
      className="space-y-2.5"
      aria-labelledby="quick-add"
      data-testid="quick-add"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2
          id="quick-add"
          className="flex items-center gap-1.5 text-base font-semibold text-fg"
        >
          <Zap className="h-4 w-4 text-accent" aria-hidden /> Recent games
        </h2>
        {matches.length ? (
          <span className="text-xs text-fg-subtle">
            From Riot · tap a game to log it
          </span>
        ) : null}
      </div>
      {!blockActive && matches.length ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-3 text-sm text-fg-muted">
          Start a block first; these games are then one tap each.
        </p>
      ) : matches.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-3 text-sm text-fg-muted">
          {accountState === "none" ? (
            <>
              Link a Riot account in{" "}
              <Link
                href="/overview/accounts"
                className="text-accent hover:underline"
              >
                Settings
              </Link>{" "}
              and your recent Solo/Duo games appear here, ready to log in a tap.
              Manual entry always works.
            </>
          ) : accountState === "pending" ? (
            "Your Riot account is waiting for its first sync. Recent games appear here afterwards; manual entry works meanwhile."
          ) : (
            "All caught up: every synced Solo/Duo game is already logged."
          )}
        </p>
      ) : (
        <ul className="space-y-2">
          {matches.slice(0, 6).map((m) => (
            <QuickRow
              key={m.matchId}
              m={m}
              lookups={lookups}
              open={open === m.matchId}
              onOpen={() => setOpen(open === m.matchId ? null : m.matchId)}
              busy={busy === m.matchId}
              onSave={(extra) => save(m, extra)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
