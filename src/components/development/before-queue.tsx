"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Pencil, Play, Plus, Target } from "lucide-react";
import { categoryLabel } from "@/domain/development/categories";
import { OBJECTIVE_STATUS_LABELS } from "@/domain/development/objectives";
import { planSentence } from "@/domain/development/plans";
import { sessionLimitText, type SessionLimit } from "@/domain/development/sessions";
import { MAX_BLOCK_SIZE, MIN_BLOCK_SIZE } from "@/domain/ranked-improvement";
import { ROLE_LABELS } from "@/domain/roles";
import { accountShortNames } from "@/domain/account-names";
import { startSessionAction } from "@/server/actions/development";
import type { ObjectiveView } from "@/server/development/repository";
import type { RankedBlockView } from "@/server/ranked/repository";
import { ChampionPortrait } from "@/components/champion-portrait";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClass } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { RelativeTime } from "@/components/ui/relative-time";
import { segmentClass, segmentedGroupClass } from "@/components/ui/segmented";
import type { JournalLookups } from "@/components/ranked/types";
import { ObjectiveEditorDialog } from "./objective-editor";
import { PlanEditorDialog } from "./plan-editor";
import { useAction } from "./use-action";

const LIMITS: Array<{ key: SessionLimit; label: string; help: string }> = [
  { key: "none", label: "No limit", help: "Play as many games as you like and end the session yourself." },
  { key: "games", label: "Game limit", help: "Reaching it suggests a break to review; it never stops you." },
  { key: "two-losses", label: "Stop after 2 losses", help: "The session ends by itself with its second loss (in total, not in a row)." },
];

/** The objective as the player wrote it: title, why, area, role and champions. */
export function ObjectiveHeading({ objective, lookups, size = "lg" }: { objective: Pick<ObjectiveView, "title" | "detail" | "category" | "customCategory" | "role" | "championIds" | "status">; lookups: Pick<JournalLookups, "championsById">; size?: "lg" | "md" }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <h2 className={size === "lg" ? "text-xl font-semibold tracking-tight text-fg sm:text-2xl" : "text-base font-semibold text-fg"} data-testid="objective-title">
        {objective.title}
      </h2>
      {objective.detail ? <p className="text-sm text-fg-muted">{objective.detail}</p> : null}
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone="accent">{categoryLabel(objective.category, objective.customCategory)}</Badge>
        <Badge>{OBJECTIVE_STATUS_LABELS[objective.status]}</Badge>
        <Badge>{objective.role ? ROLE_LABELS[objective.role] : "Any role"}</Badge>
        {objective.championIds.length ? (
          <span className="inline-flex items-center gap-1">
            {objective.championIds.map((id) => (
              <ChampionPortrait key={id} champion={lookups.championsById[id] ?? { id, name: id, portraitUrl: "" }} size="xs" className="h-6 w-6 rounded-full" title={lookups.championsById[id]?.name ?? id} />
            ))}
          </span>
        ) : (
          <span className="text-xs text-fg-subtle">Any champion</span>
        )}
      </div>
    </div>
  );
}

/** "If I recall, then I buy a Control Ward." as the card shows it between games. */
export function PlanCallout({ plan, onEdit }: { plan: { ifText: string; thenText: string } | null; onEdit?: () => void }) {
  if (!plan)
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed border-border px-3 py-2.5 text-sm text-fg-muted">
        <span>No If–Then plan yet: one situation and what you will do then makes the objective easier to apply.</span>
        {onEdit ? (
          <Button size="sm" variant="outline" onClick={onEdit} data-testid="plan-add">
            <Plus className="h-4 w-4" aria-hidden /> Add a plan
          </Button>
        ) : null}
      </div>
    );
  return (
    <div className="rounded-md border border-accent/30 bg-accent/5 px-3 py-2.5" data-testid="plan-callout">
      <div className="flex items-start justify-between gap-2">
        <p className="text-2xs font-semibold uppercase tracking-label text-accent">Your If–Then plan</p>
        {onEdit ? (
          <button type="button" onClick={onEdit} className="-m-1 inline-flex min-h-8 items-center gap-1 rounded-md px-1 text-xs text-fg-muted hover:text-fg pointer-coarse:min-h-11" data-testid="plan-edit">
            <Pencil className="h-3.5 w-3.5" aria-hidden /> Edit
          </button>
        ) : null}
      </div>
      <p className="mt-1 text-base text-fg">{planSentence(plan)}</p>
    </div>
  );
}

/**
 * BEFORE YOU QUEUE: the objective, why it matters and its If–Then plan, then Start (or Continue
 * while a session runs). Starting asks only what it needs: which objective when there are several,
 * which account when there are several, and how the session ends (no limit by default).
 */
export function BeforeYouQueue({ primary, library, active, lookups }: { primary: ObjectiveView | null; library: ObjectiveView[]; active: RankedBlockView | null; lookups: JournalLookups }) {
  const { busy, run } = useAction();
  const [creating, setCreating] = React.useState(false);
  const [planning, setPlanning] = React.useState(false);
  const [objectiveId, setObjectiveId] = React.useState<string>(primary?.id ?? "");
  const [accountId, setAccountId] = React.useState("");
  const [limit, setLimit] = React.useState<SessionLimit>("none");
  const [games, setGames] = React.useState("5");
  const chosen = library.find((o) => o.id === objectiveId) ?? primary;
  const uid = React.useId();
  const names = accountShortNames(lookups.accounts);
  const target = Number(games);
  const targetValid = Number.isInteger(target) && target >= MIN_BLOCK_SIZE && target <= MAX_BLOCK_SIZE;

  const start = () =>
    void run(() => startSessionAction({ objectiveId: chosen?.id ?? null, accountId: accountId || null, rule: limit === "two-losses" ? "two-losses" : "target", target: limit === "games" ? target : "open" }), { success: (s) => `${s.label} started. Your games join it as they sync.` });

  if (active) {
    return (
      <section className="overflow-hidden rounded-card border border-accent/40 bg-surface" data-testid="before-queue" data-state="active">
        <div className="bg-gradient-to-r from-accent/15 via-accent/5 to-transparent px-4 py-4 sm:px-5">
          <p className="flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-label text-accent">
            <span className="h-2 w-2 rounded-full bg-accent motion-safe:animate-pulse" aria-hidden /> {active.label} in progress
          </p>
          <p className="mt-1 text-sm text-fg-muted">
            Started <RelativeTime date={active.startedAt} /> · {active.games} game{active.games === 1 ? "" : "s"} ·{" "}
            <span className="text-blue">{active.wins}W</span> <span className="text-red">{active.losses}L</span> · {sessionLimitText(active)}
          </p>
        </div>
        <div className="space-y-3 px-4 py-4 sm:px-5">
          {primary && active.objectiveId === primary.id ? <ObjectiveHeading objective={primary} lookups={lookups} /> : active.focus ? <h2 className="text-xl font-semibold text-fg">{active.focus}</h2> : <p className="text-sm text-fg-muted">This session has no objective.</p>}
          {primary && active.objectiveId === primary.id ? <PlanCallout plan={primary.plan} onEdit={() => setPlanning(true)} /> : null}
          <p className="text-sm text-fg-muted">Nothing to log while you play: finished games join this session as your account syncs. Between games, read your plan; after one, a short review helps.</p>
          <Link href="/overview/development/sessions" className={buttonClass("primary", "md")} data-testid="session-continue">
            Continue session <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
        {primary ? <PlanEditorDialog open={planning} onClose={() => setPlanning(false)} objective={primary} /> : null}
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-card border border-border bg-surface" data-testid="before-queue" data-state={chosen ? "ready" : "empty"}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-gradient-to-r from-accent/10 via-transparent to-transparent px-4 py-3 sm:px-5">
        <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-label text-accent">
          <Target className="h-4 w-4" aria-hidden /> Before you queue
        </p>
        {chosen ? (
          <Link href="/overview/development/library" className="text-xs text-accent hover:underline">
            Your library →
          </Link>
        ) : null}
      </div>
      <div className="space-y-4 px-4 py-4 sm:px-5">
        {chosen ? (
          <>
            <ObjectiveHeading objective={chosen} lookups={lookups} />
            <PlanCallout plan={chosen.plan} onEdit={() => setPlanning(true)} />
          </>
        ) : (
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-fg">Choose one thing to practise</h2>
            <p className="text-sm text-fg-muted">An objective is a habit you can apply in every game (“Track the enemy jungler before crossing the river”), not a result such as a rank. Pick one, give it an If–Then plan, and review a game or two after you play.</p>
            <Button variant="primary" onClick={() => setCreating(true)} data-testid="objective-create">
              <Plus className="h-4 w-4" aria-hidden /> Choose an objective
            </Button>
          </div>
        )}
        <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
          {library.length > 1 ? (
            <div>
              <Label htmlFor={`${uid}-objective`}>Objective for this session</Label>
              <Select id={`${uid}-objective`} value={chosen?.id ?? ""} onChange={(e) => setObjectiveId(e.target.value)} data-testid="session-objective">
                {library.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.isPrimary ? "★ " : ""}
                    {o.title}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
          {lookups.accounts.length > 1 ? (
            <div>
              <Label htmlFor={`${uid}-account`}>Account</Label>
              <Select id={`${uid}-account`} value={accountId} onChange={(e) => setAccountId(e.target.value)} data-testid="session-account">
                <option value="">Any of my accounts</option>
                {lookups.accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {names.get(a.id)}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
          <div className="sm:col-span-2">
            <span className="mb-1 block text-xs font-medium text-fg-muted" id={`${uid}-limit`}>
              How the session ends
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <div role="radiogroup" aria-labelledby={`${uid}-limit`} className={segmentedGroupClass()} data-testid="session-limit">
                {LIMITS.map((l) => (
                  <button key={l.key} type="button" role="radio" aria-checked={limit === l.key} onClick={() => setLimit(l.key)} className={segmentClass(limit === l.key)} data-testid={`session-limit-${l.key}`}>
                    {l.label}
                  </button>
                ))}
              </div>
              {limit === "games" ? <Input type="number" inputMode="numeric" min={MIN_BLOCK_SIZE} max={MAX_BLOCK_SIZE} value={games} onChange={(e) => setGames(e.target.value)} aria-label="Games before a break" className="w-24" data-testid="session-limit-games" /> : null}
            </div>
            <p className="mt-1 text-xs text-fg-muted">{LIMITS.find((l) => l.key === limit)!.help} Solo/Duo games only.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" size="lg" disabled={busy || (limit === "games" && !targetValid)} onClick={start} data-testid="session-start">
            <Play className="h-4 w-4" aria-hidden /> {busy ? "Starting…" : "Start session"}
          </Button>
          {!chosen ? <span className="text-xs text-fg-muted">You can also start without an objective.</span> : null}
        </div>
      </div>
      <ObjectiveEditorDialog open={creating} onClose={() => setCreating(false)} lookups={lookups} hasPrimary={!!primary} onSaved={(o) => setObjectiveId(o.id)} />
      {chosen ? <PlanEditorDialog open={planning} onClose={() => setPlanning(false)} objective={chosen} /> : null}
    </section>
  );
}
