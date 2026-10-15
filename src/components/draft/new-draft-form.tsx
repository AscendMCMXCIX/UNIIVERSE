"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, Check, CircleDashed, Dumbbell, Flame, Shuffle, Swords, Trophy, Users, Wrench } from "lucide-react";
import { COMPETITION_MODE_INFO, DRAFT_MODE_OPTIONS, type CompetitionMode } from "@/domain/competition";
import type { DraftFormat } from "@/domain/draft";
import { SERIES_LENGTHS, seriesLabel, type SeriesLength } from "@/domain/series";
import { DRAFT_RULES, type DraftRules } from "@/domain/fearless";
import type { SetupSlot } from "@/server/team/setup-lineup";
import { createDraftAction } from "@/server/actions/drafts";
import { setLineupSlotAction } from "@/server/actions/players";
import { DraftStepper } from "./draft-stepper";
import { ACCENT_COLOR } from "@/domain/player-card";
import { CardArtLayer } from "@/components/players/card-art";
import { CardAvatar, CardName, cardShellStyle } from "@/components/players/card-look";
import { accentCss } from "@/domain/card-style";
import { ChampionPortrait, type PortraitChampion } from "@/components/champion-portrait";
import { RoleIcon } from "@/components/role-icon";
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
  /** Portraits for the lineup cards' champion previews. */
  championsById: Record<string, PortraitChampion>;
}

/** Card titles where the full mode name is long. */
const MODE_TITLE: Partial<Record<CompetitionMode, string>> = { scrim: "Scrim", custom: "Custom" };

/** One line under each mode card: what makes it different. */
const MODE_TAGLINE: Partial<Record<CompetitionMode, string>> = {
  "ranked-flex": "Flex queue · simultaneous bans",
  "ranked-5s": "Premade five · tournament draft",
  clash: "Clash bracket · tournament draft",
  scrim: "Practice · Bo1 / Bo3 / Bo5",
  tournament: "Competition · Bo1 / Bo3 / Bo5",
  custom: "Custom game · any format",
  other: "Anything else",
};

const MODE_ICON: Record<CompetitionMode, React.ComponentType<{ className?: string }>> = {
  "ranked-5s": Users,
  "ranked-flex": Shuffle,
  clash: Swords,
  scrim: Dumbbell,
  tournament: Trophy,
  custom: Wrench,
  practice: Wrench,
  other: CircleDashed,
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

const FIT_TEXT: Record<string, string> = { primary: "Primary role", secondary: "Off role", additional: "Off role", other: "Out of role" };

/** The five lineup slots as compact player cards (the Team card's look); lineup managers swap players here. */
function LineupStep({ slots, canManage, championsById }: { slots: SetupSlot[]; canManage: boolean; championsById: Record<string, PortraitChampion> }) {
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
    <ul className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5" data-testid="setup-lineup">
      {slots.map((s) => {
        const p = s.player;
        const warn = !p ? "Empty slot" : p.poolSize === 0 ? `No ${s.roleLabel} champions` : null;
        const accent = p ? accentCss(p.look.style) : ACCENT_COLOR.default;
        // The player's card look, simplified: colours, artwork and avatar frame; no frame or animated effects here.
        const shell = p ? cardShellStyle(p.look, { glow: false }) : {};
        return (
          <li key={s.role} className={cn("relative flex min-w-0 flex-col overflow-hidden rounded-panel border bg-surface", warn ? "border-warn/50" : "border-border")} style={warn ? { ...shell, borderColor: undefined } : shell} data-testid={`setup-slot-${s.role}`}>
            <div className="relative h-20 shrink-0">
              <CardArtLayer art={p?.art ?? null} accent={accent} kind="splash" position="center 22%" strength="strong" look={p?.look} decorate={false} />
              <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-bg/70 px-2 py-0.5 text-xs font-semibold uppercase tracking-[0.14em] text-fg backdrop-blur-sm">
                <RoleIcon role={s.role} className="h-3.5 w-3.5" /> {s.roleLabel}
              </span>
              {p ? (
                <span className="absolute inset-x-2 bottom-1.5 flex items-center gap-2">
                  <CardAvatar look={p.look} name={p.name} src={p.avatarUrl} size="md" />
                  <span className="min-w-0">
                    <CardName look={p.look} name={p.name} className="text-sm text-fg drop-shadow" />
                    <span className={cn("block truncate text-xs", warn ? "text-warn" : p.fit === "primary" ? "text-fg-muted" : "text-warn")}>{warn ?? FIT_TEXT[p.fit]}</span>
                  </span>
                </span>
              ) : (
                <span className="absolute inset-x-2 bottom-2 text-sm text-warn">No player</span>
              )}
            </div>
            <div className="flex flex-1 flex-col gap-2 p-2">
              {p && p.topChampions.length ? (
                <span className="flex items-center gap-1" aria-label={`${p.name}'s first ${s.roleLabel} champions`}>
                  {p.topChampions.map((id) => (
                    <ChampionPortrait key={id} champion={championsById[id] ?? { id, name: id, portraitUrl: "" }} size="xs" />
                  ))}
                  {p.poolSize > p.topChampions.length ? <span className="ml-1 text-xs text-fg-subtle">+{p.poolSize - p.topChampions.length}</span> : null}
                </span>
              ) : null}
              {canManage ? (
                <Select aria-label={`${s.roleLabel} player`} value={p?.id ?? ""} disabled={busyRole !== null} onChange={(e) => void assign(s, e.target.value)} className="mt-auto w-full md:h-8 md:text-xs">
                  {!p ? <option value="">Choose…</option> : null}
                  {s.candidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.fit === "secondary" || c.fit === "additional" ? " (off role)" : ""}
                    </option>
                  ))}
                </Select>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Step one of a draft: competition mode and the active lineup, then Start draft. Enemy players
 * are added on the next page (opponent scouting) and our side is picked when pick/ban begins,
 * because it is often only known then. Organised modes reveal series length, draft rules
 * (Fearless), opponent and draft format; queue modes keep it to two choices.
 */
export function NewDraftForm({ lineup, lineupReady, canManageLineup, formats, championsById, defaultMode = "ranked-flex", nextGame = null }: NewDraftFormProps) {
  const router = useRouter();
  const [mode, setMode] = React.useState<CompetitionMode>(nextGame?.mode ?? defaultMode);
  const [opponent, setOpponent] = React.useState(nextGame?.opponentName ?? "");
  const [formatId, setFormatId] = React.useState<string>(COMPETITION_MODE_INFO[nextGame?.mode ?? defaultMode].defaultFormatId);
  const [bestOf, setBestOf] = React.useState<SeriesLength>(1);
  const [draftRules, setDraftRules] = React.useState<DraftRules>("standard");
  const [theorycraft, setTheorycraft] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const info = COMPETITION_MODE_INFO[mode];
  const organised = info.seriesAllowed;
  const seriesPossible = organised && !theorycraft && !nextGame;
  const warnings = lineup.filter((s) => s.player && s.player.poolSize === 0);

  const chooseMode = (m: CompetitionMode) => {
    setMode(m);
    setFormatId(COMPETITION_MODE_INFO[m].defaultFormatId);
    if (!COMPETITION_MODE_INFO[m].seriesAllowed) setBestOf(1);
  };

  const start = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await createDraftAction({ opponentName: organised || nextGame ? opponent : "", mode, formatId, isTheorycraft: theorycraft, eventName: nextGame?.eventName ?? "", seriesBestOf: seriesPossible ? bestOf : null, draftRules: seriesPossible && bestOf > 1 ? draftRules : "standard", seriesId: nextGame?.seriesId ?? null });
    if (!res.ok) {
      setBusy(false);
      toast.error("Could not start the draft", { description: res.error });
      return;
    }
    // Real games prepare their opponent first; a theorycraft goes straight to pick/ban.
    router.push(theorycraft ? `/draft/${res.data.id}` : `/draft/${res.data.id}/scout`);
  };

  const modeOptions = DRAFT_MODE_OPTIONS.includes(mode) ? DRAFT_MODE_OPTIONS : [...DRAFT_MODE_OPTIONS, mode];
  let n = 0;

  return (
    <form onSubmit={start} className="space-y-6 rounded-card border border-border bg-surface p-4 sm:p-6" data-testid="draft-setup">
      <DraftStepper current={1} />
      {nextGame ? (
        <div className="rounded-panel border border-accent/40 bg-accent/5 px-4 py-3">
          <div className="text-sm font-semibold text-fg">
            Game {nextGame.gameNumber} · {seriesLabel(nextGame.bestOf)}
            {nextGame.opponentName ? ` vs ${nextGame.opponentName}` : ""}
          </div>
          <p className="text-sm text-fg-muted">
            {COMPETITION_MODE_INFO[nextGame.mode].label}
            {nextGame.eventName ? ` · ${nextGame.eventName}` : ""}. A fresh board, bans and playbook; the series score carries on. The enemy roster of the last game is carried over to the scouting step, where you can change anyone who was substituted.
          </p>
          {nextGame.draftRules === "fearless" ? (
            <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-md bg-warn/10 px-2 py-1 text-sm text-warn" data-testid="fearless-next">
              <Flame className="h-4 w-4" aria-hidden /> Fearless: {nextGame.fearlessLocked} champion{nextGame.fearlessLocked === 1 ? "" : "s"} picked in earlier games {nextGame.fearlessLocked === 1 ? "is" : "are"} unavailable to both teams.
            </p>
          ) : null}
        </div>
      ) : (
        <Step n={++n} title="Competition mode">
          <div role="radiogroup" aria-label="Competition mode" className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7" data-testid="mode-options">
            {modeOptions.map((m) => {
              const active = m === mode;
              const Icon = MODE_ICON[m];
              return (
                <label key={m} className={cn("relative flex min-h-[4.5rem] cursor-pointer flex-col gap-1 rounded-panel border px-3 py-2.5 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent", active ? "border-accent bg-accent/10 shadow-[inset_0_0_0_1px_var(--color-accent)]" : "border-border bg-bg-elevated hover:border-border-strong hover:bg-surface-2")}>
                  <input type="radio" name="mode" value={m} checked={active} onChange={() => chooseMode(m)} className="sr-only" />
                  <span className="flex items-center gap-1.5">
                    <Icon className={cn("h-4 w-4 shrink-0", active ? "text-accent" : "text-fg-subtle")} />
                    <span className={cn("text-sm font-semibold", active ? "text-fg" : "text-fg")}>{MODE_TITLE[m] ?? COMPETITION_MODE_INFO[m].label}</span>
                    {active ? <Check className="ml-auto h-4 w-4 text-accent" aria-hidden /> : null}
                  </span>
                  <span className="text-xs leading-snug text-fg-muted">{MODE_TAGLINE[m] ?? COMPETITION_MODE_INFO[m].shortLabel}</span>
                </label>
              );
            })}
          </div>
          <p className="text-sm text-fg-muted" data-testid="mode-description">
            <span className="font-medium text-fg">{info.label}:</span> {info.description}
          </p>
          {organised ? (
            <div className="grid gap-3 rounded-panel border border-border bg-bg-elevated/60 p-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="organised-options">
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
        <LineupStep slots={lineup} canManage={canManageLineup} championsById={championsById} />
        {warnings.length > 0 ? (
          <p className="flex items-start gap-2 text-sm text-warn">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {warnings.map((w) => `${w.player!.name} has no ${w.roleLabel} champions`).join("; ")}. The draft still works, but recommendations for that role fall back to emergency picks until a pool is set.
            </span>
          </p>
        ) : null}
      </Step>

      <footer className="flex flex-col gap-4 border-t border-border pt-5 sm:flex-row sm:flex-wrap sm:items-center">
        {!nextGame ? (
          <div className="sm:max-w-xs">
            <Switch id="theorycraft" checked={theorycraft} onChange={setTheorycraft} label="Theorycraft" description="Hypothetical draft, not saved as a match" />
          </div>
        ) : null}
        <span className="hidden flex-1 sm:block" />
        <div className="flex flex-col items-stretch gap-1.5 sm:items-end">
          <Button type="submit" variant="primary" size="lg" disabled={busy || !lineupReady} className="w-full sm:w-auto sm:min-w-44" data-testid="start-draft">
            {busy ? "Starting…" : nextGame ? `Start game ${nextGame.gameNumber}` : theorycraft ? "Start theorycraft" : bestOf > 1 ? `Start ${seriesLabel(bestOf).toLowerCase()}` : "Start draft"}
            {!busy ? <ArrowRight className="h-4 w-4" /> : null}
          </Button>
          <p className={cn("text-xs", lineupReady ? "text-fg-subtle" : "text-warn")}>{!lineupReady ? "Fill all five roles first." : theorycraft ? "Next: choose your side and draft." : "Next: enemy players (optional), then choose your side."}</p>
        </div>
      </footer>
    </form>
  );
}
