"use client";

import * as React from "react";
import Link from "next/link";
import { ClipboardCopy, Flag, Swords, Timer, TriangleAlert, Trophy, type LucideIcon } from "lucide-react";
import { ROLES, ROLE_LABELS } from "@/domain/roles";
import { shortJobText, type Playbook } from "@/domain/playbook";
import { ChampionPortrait, type PortraitChampion } from "@/components/champion-portrait";
import { RoleIcon } from "@/components/role-icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

function Block({ label, icon: Icon, children, tone = "accent", testId, className }: { label: string; icon: LucideIcon; children: React.ReactNode; tone?: "accent" | "bad"; testId?: string; className?: string }) {
  return (
    <section className={cn("rounded-panel border bg-bg-elevated px-4 py-3", tone === "bad" ? "border-bad/40" : "border-border", className)} data-testid={testId}>
      <h3 className={cn("flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-[0.12em]", tone === "bad" ? "text-bad" : "text-accent")}>
        <Icon className="h-4 w-4" aria-hidden /> {label}
      </h3>
      <div className="mt-1 text-[15px] leading-relaxed text-fg">{children}</div>
    </section>
  );
}

/**
 * QUICK PLAYBOOK: what to read in the 20–30 seconds between champion select and loading in.
 * Wide containers: the win condition on top, early game / teamfights / objectives / watch out
 * beside one short job per player, about one screen at common laptop sizes with 15px body text.
 * Narrow containers (phones, side panels): tabs with the essentials first. The detailed analysis
 * lives on its own view.
 */
export function QuickPlaybook({ playbook, championsById, ourPicks, enemyPicks, myPlayerId = null, detailHref, headerExtra, showMatchup = true }: { playbook: Playbook; championsById: Record<string, PortraitChampion>; ourPicks: string[]; enemyPicks: string[]; myPlayerId?: string | null; detailHref?: string; headerExtra?: React.ReactNode; /** The draft room shows the board above, so it hides the matchup strip. */ showMatchup?: boolean }) {
  const [tab, setTab] = React.useState<"essentials" | "fights" | "team">("essentials");
  const [copied, setCopied] = React.useState(false);
  const champ = (id: string) => championsById[id] ?? { id, name: id, portraitUrl: "" };
  const jobs = [...playbook.playerJobs].sort((a, b) => ROLES.indexOf(a.role) - ROLES.indexOf(b.role));
  const mine = myPlayerId ? jobs.find((j) => j.playerId === myPlayerId) ?? null : null;
  const q = playbook.quick;
  const copy = async () => {
    try {
      await navigator.clipboard?.writeText(playbook.summaryLines.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  const win = (
    <section className="rounded-panel border border-accent/40 bg-gradient-to-r from-accent/15 via-accent-2/5 to-transparent px-4 py-3" data-testid="quick-win">
      <h3 className="flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-[0.12em] text-accent">
        <Trophy className="h-4 w-4" aria-hidden /> Win condition
      </h3>
      <p className="mt-1 text-lg font-semibold leading-snug text-fg">{q.winCondition}</p>
      {q.playFor ? <p className="mt-0.5 text-[15px] text-fg-muted">{q.playFor}</p> : null}
    </section>
  );
  const early = (
    <Block label="Early game" icon={Timer}>
      {q.earlyPlan}
    </Block>
  );
  const fights = (
    <Block label="Teamfights" icon={Swords}>
      {q.fights}
    </Block>
  );
  const objectives = (
    <Block label="Objectives" icon={Flag}>
      {q.objectives}
    </Block>
  );
  const watch = (
    <Block label="Watch out" icon={TriangleAlert} tone="bad">
      <p>{q.watchFor}</p>
      {q.avoid ? <p className="mt-1 text-fg-muted">{q.avoid}</p> : null}
    </Block>
  );
  const jobList = (
    <ul className="space-y-2" data-testid="quick-jobs">
      {jobs.map((j) => (
        <li key={j.playerId} className={cn("flex items-center gap-3 rounded-panel border px-3 py-2", j.playerId === myPlayerId ? "border-accent/60 bg-accent/5" : "border-border bg-bg-elevated")}>
          <ChampionPortrait champion={champ(j.championId)} size="md" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-[13px] text-fg-muted">
              <RoleIcon role={j.role} className="h-4 w-4 shrink-0 text-accent" />
              <span className="truncate">
                <span className="font-semibold text-fg">{champ(j.championId).name}</span> · {j.playerName} · {ROLE_LABELS[j.role]}
              </span>
            </div>
            <div className="text-[15px] font-semibold leading-snug text-fg">{shortJobText(j)}</div>
          </div>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="@container space-y-4" data-testid="quick-playbook">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 className="text-lg font-bold text-fg">Quick Playbook</h2>
        {showMatchup ? (
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <div className="flex items-center gap-1" role="group" aria-label="Our champions">
              {ourPicks.map((id) => (
                <ChampionPortrait key={id} champion={champ(id)} size="xs" className="@2xl:h-9 @2xl:w-9" />
              ))}
            </div>
            {enemyPicks.length ? <span className="text-sm font-semibold text-fg-subtle">vs</span> : null}
            <div className="flex items-center gap-1" role="group" aria-label="Enemy champions">
              {enemyPicks.map((id) => (
                <ChampionPortrait key={id} champion={champ(id)} size="xs" className="@2xl:h-9 @2xl:w-9" />
              ))}
            </div>
          </div>
        ) : null}
        <span className="flex-1" />
        {headerExtra}
        {detailHref ? (
          <Link href={detailHref} className="text-sm font-medium text-accent hover:underline" data-testid="detail-link">
            Detailed analysis →
          </Link>
        ) : null}
        <Button size="sm" variant="ghost" onClick={copy}>
          <ClipboardCopy className="h-3.5 w-3.5" /> {copied ? "Copied" : "Copy"}
        </Button>
      </header>

      {/* Narrow: tabs, essentials first. */}
      <div className="space-y-3 @3xl:hidden">
        <div className="grid grid-cols-3 gap-1 rounded-panel border border-border bg-bg-elevated p-1" role="tablist" aria-label="Playbook sections">
          {(
            [
              ["essentials", "Essentials"],
              ["fights", "Fights"],
              ["team", "Player jobs"],
            ] as const
          ).map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={cn("min-h-11 rounded-lg px-2 text-sm font-medium transition-colors", tab === key ? "bg-accent/15 text-accent" : "text-fg-muted hover:text-fg")}>
              {label}
            </button>
          ))}
        </div>
        {tab === "essentials" ? (
          <div className="space-y-2.5">
            {win}
            {mine ? (
              <Block label={`Your job · ${champ(mine.championId).name}`} icon={Trophy}>
                <span className="font-semibold">{shortJobText(mine)}.</span> {mine.job}
              </Block>
            ) : null}
            {watch}
            {early}
          </div>
        ) : tab === "fights" ? (
          <div className="space-y-2.5">
            {fights}
            {objectives}
          </div>
        ) : (
          jobList
        )}
      </div>

      {/* Wide: everything at once. */}
      <div className="hidden gap-4 @3xl:grid @3xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-3">
          {win}
          <div className="grid gap-3 @4xl:grid-cols-2">
            {early}
            {fights}
            {objectives}
            {watch}
          </div>
          {playbook.coachNote ? (
            <p className="rounded-panel border border-border px-4 py-2.5 text-[15px] text-fg-muted">
              <span className="font-semibold text-fg">Strategy note:</span> {playbook.coachNote}
            </p>
          ) : null}
        </div>
        <div>
          <h3 className="mb-2 text-[13px] font-semibold uppercase tracking-[0.12em] text-accent">Player jobs</h3>
          {jobList}
        </div>
      </div>
    </div>
  );
}
