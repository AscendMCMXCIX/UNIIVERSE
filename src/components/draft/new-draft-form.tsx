"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, Flame } from "lucide-react";
import { COMPETITION_MODE_INFO, DRAFT_MODE_OPTIONS, type CompetitionMode } from "@/domain/competition";
import type { DraftFormat } from "@/domain/draft";
import { enemySlotsFromList } from "@/domain/scouting/enemy-slots";
import { SERIES_LENGTHS, seriesLabel, type SeriesLength } from "@/domain/series";
import { DRAFT_RULES, type DraftRules } from "@/domain/fearless";
import type { SetupSlot } from "@/server/team/setup-lineup";
import { createDraftAction } from "@/server/actions/drafts";
import { setLineupSlotAction } from "@/server/actions/players";
import { EnemyNamesInput } from "./enemy-names-input";
import { RoleIcon } from "@/components/role-icon";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";

export interface NextGameContext {
  seriesId: string;
  mode: CompetitionMode;
  eventName: string;
  opponentName: string;
  bestOf: number;
  gameNumber: number;
  draftRules: DraftRules;
  /** Fearless: champions earlier games of the series already locked for this game. */
  fearlessLocked: number;
}

export interface NewDraftFormProps {
  lineup: SetupSlot[];
  lineupReady: boolean;
  /** May swap players in the lineup from here (manage-lineup); the server checks again. */
  canManageLineup: boolean;
  formats: DraftFormat[];
  defaultMode?: CompetitionMode;
  /** When set, the form starts the next game of this series: mode and opponent are inherited. */
  nextGame?: NextGameContext | null;
  /** Enemy players entered for the previous game of the series, offered again. */
  reuseEnemies?: string[];
}

/** Card titles where the full mode name is long. */
const MODE_TITLE: Partial<Record<CompetitionMode, string>> = { scrim: "Scrim", custom: "Custom" };

/** One line under each mode card: what makes it different. */
const MODE_TAGLINE: Partial<Record<CompetitionMode, string>> = {
  "ranked-flex": "Flex queue · bans at the same time",
  "ranked-5s": "Premade five · tournament draft",
  clash: "Clash bracket · tournament draft",
  scrim: "Organised practice · Bo1 / Bo3 / Bo5",
  tournament: "Organised competition · Bo1 / Bo3 / Bo5",
  custom: "Custom game · any draft format",
  other: "Anything else",
};

function Step({ n, title, hint, children, className }: { n: number; title: string; hint?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("space-y-3", className)} aria-labelledby={`setup-step-${n}`}>
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <h2 id={`setup-step-${n}`} className="flex items-center gap-2 text-base font-semibold text-fg">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-accent/15 text-xs font-bold text-accent" aria-hidden>
            {n}
          </span>
          {title}
        </h2>
        {hint ? <p className="text-sm text-fg-muted">{hint}</p> : null}
      </header>
      {children}
    </section>
  );
}

/** The five lineup slots: picture, name and fit; a swap menu for those who may change the lineup. */
function LineupStep({ slots, canManage }: { slots: SetupSlot[]; canManage: boolean }) {
  const router = useRouter();
  const [busyRole, setBusyRole] = React.useState<string | null>(null);
  const assign = async (slot: SetupSlot, playerId: string) => {
    setBusyRole(slot.role);
    const r = await setLineupSlotAction(slot.role, playerId || null);
    setBusyRole(null);
    if (!r.ok) return toast.error(r.error);
    toast.success(`${slot.roleLabel} updated.`);
    router.refresh();
  };
  return (
    <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5" data-testid="setup-lineup">
      {slots.map((s) => {
        const p = s.player;
        const warn = !p ? "Empty slot" : p.poolSize === 0 ? `No ${s.roleLabel} champions` : null;
        return (
          <li key={s.role} className={cn("flex min-w-0 items-center gap-3 rounded-xl border bg-bg-elevated p-2.5 lg:flex-col lg:items-stretch lg:gap-2 lg:text-center", warn ? "border-warn/50" : "border-border")} data-testid={`setup-slot-${s.role}`}>
            <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-fg-muted lg:justify-center">
              <RoleIcon role={s.role} className="h-4 w-4 text-accent" />
              <span className="sr-only lg:not-sr-only">{s.roleLabel}</span>
            </span>
            {p ? (
              <span className="flex min-w-0 flex-1 items-center gap-2.5 lg:flex-col lg:gap-1.5">
                <Avatar name={p.name} src={p.avatarUrl} size="md" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-fg">{p.name}</span>
                  <span className={cn("block truncate text-xs", warn ? "text-warn" : "text-fg-subtle")}>{warn ?? (p.fit === "primary" ? `${p.poolSize} champion${p.poolSize === 1 ? "" : "s"}` : p.fit === "secondary" ? "Secondary role" : p.fit === "additional" ? "Additional role" : "Out of role")}</span>
                </span>
              </span>
            ) : (
              <span className="flex-1 text-sm text-warn">No player</span>
            )}
            {canManage ? (
              <Select aria-label={`${s.roleLabel} player`} value={p?.id ?? ""} disabled={busyRole !== null} onChange={(e) => void assign(s, e.target.value)} className="w-32 shrink-0 lg:w-full md:h-8 md:text-xs">
                {!p ? <option value="">Choose…</option> : null}
                {s.candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.substitute ? " (sub)" : c.fit === "secondary" ? " (2nd role)" : c.fit === "additional" ? " (extra role)" : ""}
                  </option>
                ))}
              </Select>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Starting a draft: competition mode, the active lineup, optional enemy Riot IDs, start. Only
 * what the chosen mode needs is added (series length, opponent and draft format for organised
 * play); our side is chosen next to Start.
 */
export function NewDraftForm({ lineup, lineupReady, canManageLineup, formats, defaultMode = "ranked-flex", nextGame = null, reuseEnemies = [] }: NewDraftFormProps) {
  const router = useRouter();
  const [mode, setMode] = React.useState<CompetitionMode>(nextGame?.mode ?? defaultMode);
  const [opponent, setOpponent] = React.useState(nextGame?.opponentName ?? "");
  const [side, setSide] = React.useState<"blue" | "red">("blue");
  const [formatId, setFormatId] = React.useState<string>(COMPETITION_MODE_INFO[nextGame?.mode ?? defaultMode].defaultFormatId);
  const [bestOf, setBestOf] = React.useState<SeriesLength>(1);
  const [draftRules, setDraftRules] = React.useState<DraftRules>("standard");
  const [theorycraft, setTheorycraft] = React.useState(false);
  const [enemies, setEnemies] = React.useState<string[]>(reuseEnemies);
  const [busy, setBusy] = React.useState(false);
  const info = COMPETITION_MODE_INFO[mode];
  const organised = info.seriesAllowed;
  const seriesPossible = organised && !theorycraft && !nextGame;
  const enemyRiotIds = enemies.filter((e) => e.includes("#")).length;
  const warnings = lineup.filter((s) => s.player && s.player.poolSize === 0);

  const chooseMode = (m: CompetitionMode) => {
    setMode(m);
    setFormatId(COMPETITION_MODE_INFO[m].defaultFormatId);
    if (!COMPETITION_MODE_INFO[m].seriesAllowed) setBestOf(1);
  };

  const start = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await createDraftAction({ opponentName: organised || nextGame ? opponent : "", side, mode, formatId, isTheorycraft: theorycraft, eventName: nextGame?.eventName ?? "", seriesBestOf: seriesPossible ? bestOf : null, draftRules: seriesPossible && bestOf > 1 ? draftRules : "standard", seriesId: nextGame?.seriesId ?? null, enemyPlayers: theorycraft ? {} : enemySlotsFromList(enemies) });
    if (!res.ok) {
      setBusy(false);
      toast.error("Could not start the draft", { description: res.error });
      return;
    }
    // Scouted or organised games open the pre-draft plan first; queue games go straight in.
    router.push(theorycraft || (info.scouting === "none" && enemyRiotIds === 0) ? `/draft/${res.data.id}` : `/draft/${res.data.id}/prepare`);
  };

  const modeOptions = DRAFT_MODE_OPTIONS.includes(mode) ? DRAFT_MODE_OPTIONS : [...DRAFT_MODE_OPTIONS, mode];
  let n = 0;

  return (
    <form onSubmit={start} className="space-y-6 rounded-2xl border border-border bg-surface p-4 sm:p-6" data-testid="draft-setup">
      {nextGame ? (
        <div className="rounded-xl border border-accent/40 bg-accent/5 px-4 py-3">
          <div className="text-sm font-semibold text-fg">
            Game {nextGame.gameNumber} · {seriesLabel(nextGame.bestOf)}
            {nextGame.opponentName ? ` vs ${nextGame.opponentName}` : ""}
          </div>
          <p className="text-sm text-fg-muted">
            {COMPETITION_MODE_INFO[nextGame.mode].label}
            {nextGame.eventName ? ` · ${nextGame.eventName}` : ""}. A fresh board, bans and playbook; the series score carries on.
          </p>
          {nextGame.draftRules === "fearless" ? (
            <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-md bg-warn/10 px-2 py-1 text-sm text-warn" data-testid="fearless-next">
              <Flame className="h-4 w-4" aria-hidden /> Fearless: {nextGame.fearlessLocked} champion{nextGame.fearlessLocked === 1 ? "" : "s"} picked in earlier games {nextGame.fearlessLocked === 1 ? "is" : "are"} unavailable to both teams.
            </p>
          ) : null}
        </div>
      ) : (
        <Step n={++n} title="Competition mode" hint={info.description.split(". ")[0] + "."}>
          <div role="radiogroup" aria-label="Competition mode" className="grid grid-cols-2 gap-2 md:grid-cols-4 2xl:grid-cols-7" data-testid="mode-options">
            {modeOptions.map((m) => {
              const active = m === mode;
              return (
                <label key={m} className={cn("relative flex min-h-16 cursor-pointer flex-col justify-center rounded-xl border px-3 py-2.5 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent", active ? "border-accent bg-accent/10" : "border-border bg-bg-elevated hover:border-border-strong")}>
                  <input type="radio" name="mode" value={m} checked={active} onChange={() => chooseMode(m)} className="sr-only" />
                  <span className={cn("text-sm font-semibold", active ? "text-accent" : "text-fg")}>{MODE_TITLE[m] ?? COMPETITION_MODE_INFO[m].label}</span>
                  <span className="mt-0.5 text-xs leading-snug text-fg-muted">{MODE_TAGLINE[m] ?? COMPETITION_MODE_INFO[m].shortLabel}</span>
                </label>
              );
            })}
          </div>
          {organised && !nextGame ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {seriesPossible ? (
                <div>
                  <Label htmlFor="series">Series</Label>
                  <Select id="series" value={String(bestOf)} onChange={(e) => setBestOf(Number(e.target.value) as SeriesLength)}>
                    {SERIES_LENGTHS.map((len) => (
                      <option key={len} value={len}>
                        {len === 1 ? "Single game" : seriesLabel(len)}
                      </option>
                    ))}
                  </Select>
                </div>
              ) : null}
              {seriesPossible && bestOf > 1 ? (
                <div>
                  <Label htmlFor="draft-rules">Draft rules</Label>
                  <Select id="draft-rules" value={draftRules} onChange={(e) => setDraftRules(e.target.value as DraftRules)} data-testid="draft-rules">
                    {DRAFT_RULES.map((r) => (
                      <option key={r.key} value={r.key}>
                        {r.label}
                      </option>
                    ))}
                  </Select>
                  <p className="mt-1 text-xs text-fg-subtle">{DRAFT_RULES.find((r) => r.key === draftRules)!.description}</p>
                </div>
              ) : null}
              <div>
                <Label htmlFor="opponent">Opponent (optional)</Label>
                <Input id="opponent" value={opponent} onChange={(e) => setOpponent(e.target.value)} placeholder="Team name" maxLength={60} />
              </div>
              {info.formatSelectable ? (
                <div>
                  <Label htmlFor="format">Draft format</Label>
                  <Select id="format" value={formatId} onChange={(e) => setFormatId(e.target.value)}>
                    {formats.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </Select>
                </div>
              ) : null}
            </div>
          ) : null}
        </Step>
      )}

      <Step
        n={++n}
        title="Lineup"
        hint={
          <>
            The active five for this draft.{" "}
            {canManageLineup ? "Swap a player here or on the " : "Changed on the "}
            <Link href="/team" className="text-accent hover:underline">
              Team page
            </Link>
            .
          </>
        }
      >
        <LineupStep slots={lineup} canManage={canManageLineup} />
        {warnings.length > 0 ? (
          <p className="flex items-start gap-2 text-sm text-warn">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {warnings.map((w) => `${w.player!.name} has no ${w.roleLabel} champions`).join("; ")}. The draft still works, but recommendations for that role fall back to emergency picks until a pool is set.
            </span>
          </p>
        ) : null}
      </Step>

      {!theorycraft ? (
        <Step n={++n} title="Enemy players" hint="Optional. Riot IDs (GameName#Tag) in any order; roles are worked out from their games.">
          <EnemyNamesInput value={enemies} onChange={setEnemies} compact />
          {reuseEnemies.length > 0 ? <p className="text-xs text-fg-subtle">Carried over from the previous game of this series. Change anyone who was substituted: only this game uses the new names; earlier games keep theirs.</p> : null}
        </Step>
      ) : null}

      <footer className="flex flex-col gap-4 border-t border-border pt-5 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-fg-muted" id="side-label">
            Our side
          </span>
          <div role="radiogroup" aria-labelledby="side-label" className="flex gap-1 rounded-lg border border-border bg-bg-elevated p-1">
            {(["blue", "red"] as const).map((s) => (
              <label key={s} className={cn("flex min-h-10 cursor-pointer items-center rounded-md px-5 text-sm font-semibold capitalize transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent", side === s ? (s === "blue" ? "bg-blue/30 text-white ring-1 ring-blue/70" : "bg-red/30 text-white ring-1 ring-red/70") : "text-fg-muted hover:text-fg")}>
                <input type="radio" name="side" value={s} checked={side === s} onChange={() => setSide(s)} className="sr-only" />
                {s}
              </label>
            ))}
          </div>
        </div>
        {!nextGame ? (
          <div className="sm:max-w-xs">
            <Switch id="theorycraft" checked={theorycraft} onChange={setTheorycraft} label="Theorycraft" description="Hypothetical draft, not saved as a match" />
          </div>
        ) : null}
        <span className="hidden flex-1 sm:block" />
        <div className="flex flex-col items-stretch gap-1.5 sm:items-end">
          <Button type="submit" variant="primary" size="lg" disabled={busy || !lineupReady} className="w-full sm:w-auto sm:min-w-44">
            {busy ? "Starting…" : nextGame ? `Start game ${nextGame.gameNumber}` : theorycraft ? "Start theorycraft" : bestOf > 1 ? `Start ${seriesLabel(bestOf).toLowerCase()}` : "Start draft"}
            {!busy ? <ArrowRight className="h-4 w-4" /> : null}
          </Button>
          {!lineupReady ? <p className="text-xs text-warn">Fill all five roles first.</p> : null}
        </div>
      </footer>
    </form>
  );
}
