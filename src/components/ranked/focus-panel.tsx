"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { saveRankedFocusAction } from "@/server/actions/ranked";
import type { RankedProfileView } from "@/server/ranked/repository";
import { ChampionSlot } from "@/components/champion-slot";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Info } from "@/components/ui/metric";
import { metricTooltip } from "@/domain/metrics";
import type { JournalLookups } from "./types";

const EXTRA = [
  { key: "champion2", label: "Also playing" },
  { key: "champion3", label: "Also playing" },
  { key: "counterPick", label: "Counter pick" },
] as const;
const KEYS = ["champion1", ...EXTRA.map((s) => s.key)] as const;

/**
 * Ranked Focus, one card: the featured champion you are committing to, the one thing you are
 * working on, and (optionally) the champions around it. Saved with one click; the block in
 * progress follows it, and finished blocks keep the focus they were played with.
 */
export function FocusPanel({ profile, lookups }: { profile: RankedProfileView; lookups: JournalLookups }) {
  const router = useRouter();
  const [draft, setDraft] = React.useState(profile);
  const [busy, setBusy] = React.useState(false);
  const championsById = React.useMemo(() => new Map(Object.entries(lookups.championsById)), [lookups.championsById]);
  const dirty = KEYS.some((k) => draft[k] !== profile[k]) || draft.focus !== profile.focus;
  const chosen = new Set(KEYS.map((k) => draft[k]).filter((id): id is string => !!id));
  const others = (k: (typeof KEYS)[number]) => new Set([...chosen].filter((id) => id !== draft[k]));
  const featured = draft.champion1 ? (lookups.championsById[draft.champion1]?.name ?? draft.champion1) : null;
  // The player's Primary Role pool, in their order: offered first in every picker here, and its
  // first champion suggested (never saved without Save) when no featured champion is chosen.
  const pool = lookups.mainPool;
  const poolLabel = pool.roleLabel ? `in your ${pool.roleLabel} pool` : "in your pool";
  const suggestion = !draft.champion1 ? pool.ids.find((id) => !chosen.has(id) && lookups.championsById[id]) : undefined;

  const save = async () => {
    setBusy(true);
    const res = await saveRankedFocusAction({ champion1: draft.champion1, champion2: draft.champion2, champion3: draft.champion3, counterPick: draft.counterPick, focus: draft.focus });
    setBusy(false);
    if (!res.ok) return void toast.error("Focus not saved", { description: res.error });
    toast.success("Focus saved.");
    router.refresh();
  };

  return (
    <section className="@container rounded-card border border-border bg-surface p-3 sm:p-4" aria-labelledby="ranked-focus-title" data-testid="ranked-focus">
      <div className="flex flex-col gap-3 @2xl:flex-row @2xl:items-center @2xl:gap-4">
        <div className="flex items-center gap-3">
          <ChampionSlot championId={draft.champion1} champions={lookups.champions} championsById={championsById} disabledIds={others("champion1")} onChange={(id) => setDraft({ ...draft, champion1: id })} label="Choose your featured champion" preferredIds={pool.ids} preferredLabel={poolLabel} />
          <div className="min-w-0 @2xl:hidden">
            <h2 id="ranked-focus-title" className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
              Focus for your blocks
            </h2>
            <p className="truncate text-sm font-semibold text-fg">{featured ?? "Choose a featured champion"}</p>
          </div>
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="hidden items-baseline gap-2 @2xl:flex">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-fg-subtle" aria-hidden>
              Focus for your blocks
            </h2>
            <span className="truncate text-sm font-semibold text-fg">{featured ?? "Choose a featured champion"}</span>
          </div>
          {suggestion ? (
            <div className="flex flex-wrap items-center gap-2 text-xs text-fg-muted" data-testid="featured-suggestion" data-champion={suggestion}>
              <span>
                Suggested: <strong className="text-fg">{lookups.championsById[suggestion]!.name}</strong>, first {poolLabel}
              </span>
              <Button size="sm" variant="outline" onClick={() => setDraft({ ...draft, champion1: suggestion })} data-testid="use-suggestion">
                Use {lookups.championsById[suggestion]!.name}
              </Button>
              <span className="text-fg-subtle">or tap the slot to choose any champion.</span>
            </div>
          ) : null}
          <div className="flex items-center gap-2">
            <label htmlFor="ranked-focus" className="sr-only">
              Current improvement focus
            </label>
            <Input
              id="ranked-focus"
              value={draft.focus}
              onChange={(e) => setDraft({ ...draft, focus: e.target.value })}
              maxLength={200}
              placeholder="What are you working on? e.g. “Track the enemy jungler before every trade.”"
              className="min-w-0 flex-1"
              onKeyDown={(e) => {
                if (e.key === "Enter" && dirty) {
                  e.preventDefault();
                  void save();
                }
              }}
            />
            <Info text={metricTooltip("journal-focus")} />
          </div>
        </div>
        <div className="flex items-center gap-2" aria-label="Other champions">
          {EXTRA.map((s) => (
            <div key={s.key} className="flex flex-col items-center gap-0.5">
              <ChampionSlot size="md" championId={draft[s.key]} champions={lookups.champions} championsById={championsById} disabledIds={others(s.key)} onChange={(id) => setDraft({ ...draft, [s.key]: id })} label={`Choose ${s.label.toLowerCase()}`} preferredIds={s.key === "counterPick" ? undefined : pool.ids} preferredLabel={poolLabel} />
              <span className="text-xs text-fg-subtle">{s.label}</span>
            </div>
          ))}
          {dirty ? (
            <Button size="sm" variant="primary" disabled={busy} onClick={save} className="ml-1 self-center" data-testid="focus-save">
              {busy ? "Saving…" : "Save"}
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
