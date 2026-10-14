"use client";

import * as React from "react";
import Link from "next/link";
import { ClipboardCopy } from "lucide-react";
import { ROLES, ROLE_LABELS } from "@/domain/roles";
import { shortJobText, type Playbook } from "@/domain/playbook";
import { ChampionPortrait, type PortraitChampion } from "@/components/champion-portrait";
import { RoleIcon } from "@/components/role-icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

function Block({ label, text, strong = false, tone = "accent", testId }: { label: string; text: string; strong?: boolean; tone?: "accent" | "bad"; testId?: string }) {
  return (
    <section className="rounded-md border border-border bg-bg-elevated px-3 py-2" data-testid={testId}>
      <h3 className={cn("text-[11px] font-semibold uppercase tracking-[0.18em]", tone === "bad" ? "text-bad" : "text-accent")}>{label}</h3>
      <p className={cn("mt-0.5 leading-snug text-fg", strong ? "text-base font-semibold" : "text-sm")}>{text}</p>
    </section>
  );
}

/**
 * QUICK PLAYBOOK: what to read in the 20–30 seconds between champion select and loading in.
 * Desktop: one screen (win condition, early game, teamfights, objectives, the main threat and
 * one short job per player), no scrolling at common laptop sizes. Phone: the essentials first
 * (win condition, your job, the main threat, the early plan), the rest one tap away.
 * Detailed analysis lives on its own view.
 */
export function QuickPlaybook({ playbook, championsById, ourPicks, enemyPicks, myPlayerId = null, detailHref, headerExtra }: { playbook: Playbook; championsById: Record<string, PortraitChampion>; ourPicks: string[]; enemyPicks: string[]; myPlayerId?: string | null; detailHref?: string; headerExtra?: React.ReactNode }) {
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

  const jobList = (
    <ul className="space-y-1.5" data-testid="quick-jobs">
      {jobs.map((j) => (
        <li key={j.playerId} className={cn("flex items-center gap-2 rounded-md border px-2 py-1.5", j.playerId === myPlayerId ? "border-accent/60 bg-accent/5" : "border-border bg-bg-elevated")}>
          <RoleIcon role={j.role} className="h-4 w-4 shrink-0 text-accent" />
          <ChampionPortrait champion={champ(j.championId)} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs text-fg-muted">
              {ROLE_LABELS[j.role]} · {j.playerName} · {champ(j.championId).name}
            </div>
            <div className="text-sm font-semibold text-fg">{shortJobText(j)}</div>
          </div>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="space-y-3" data-testid="quick-playbook">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-good">Quick Playbook</h2>
        <div className="flex items-center gap-1" aria-label="Our champions">
          {ourPicks.map((id) => (
            <ChampionPortrait key={id} champion={champ(id)} size="xs" />
          ))}
        </div>
        {enemyPicks.length ? <span className="text-xs text-fg-subtle">vs</span> : null}
        <div className="flex items-center gap-1" aria-label="Enemy champions">
          {enemyPicks.map((id) => (
            <ChampionPortrait key={id} champion={champ(id)} size="xs" />
          ))}
        </div>
        <span className="flex-1" />
        {headerExtra}
        {detailHref ? (
          <Link href={detailHref} className="text-xs text-accent hover:underline" data-testid="detail-link">
            Detailed analysis →
          </Link>
        ) : null}
        <Button size="sm" variant="ghost" onClick={copy}>
          <ClipboardCopy className="h-3.5 w-3.5" /> {copied ? "Copied" : "Copy"}
        </Button>
      </div>

      {/* Phone: tabs, essentials first. */}
      <div className="md:hidden">
        <div className="mb-2 grid grid-cols-3 gap-1" role="tablist">
          {(
            [
              ["essentials", "Essentials"],
              ["fights", "Fights & objectives"],
              ["team", "Team jobs"],
            ] as const
          ).map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={cn("min-h-11 rounded-md border px-2 text-xs font-medium", tab === key ? "border-accent bg-accent/10 text-fg" : "border-border text-fg-muted")}>
              {label}
            </button>
          ))}
        </div>
        {tab === "essentials" ? (
          <div className="space-y-2">
            <Block label="Win condition" text={q.winCondition} strong />
            {mine ? <Block label={`Your job · ${champ(mine.championId).name}`} text={`${shortJobText(mine)}. ${mine.job}`} /> : null}
            <Block label="Watch out" text={q.watchFor} tone="bad" />
            <Block label="Early game" text={q.earlyPlan} />
          </div>
        ) : tab === "fights" ? (
          <div className="space-y-2">
            <Block label="Teamfights" text={q.fights} />
            <Block label="Objectives" text={q.objectives} />
          </div>
        ) : (
          jobList
        )}
      </div>

      {/* Desktop: everything on one screen. */}
      <div className="hidden gap-3 md:grid md:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="space-y-2">
          <Block label="Win condition" text={q.winCondition} strong testId="quick-win" />
          <div className="grid gap-2 lg:grid-cols-2">
            <Block label="Early game" text={q.earlyPlan} />
            <Block label="Teamfights" text={q.fights} />
            <Block label="Objectives" text={q.objectives} />
            <Block label="Watch out" text={q.watchFor} tone="bad" />
          </div>
          {playbook.coachNote ? <Block label="Coach" text={playbook.coachNote} /> : null}
        </div>
        <div>
          <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">Player jobs</h3>
          {jobList}
        </div>
      </div>
    </div>
  );
}
