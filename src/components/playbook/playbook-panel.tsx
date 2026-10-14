"use client";

import * as React from "react";
import { ClipboardCopy, UserRound } from "lucide-react";
import { ROLES } from "@/domain/roles";
import type { Playbook } from "@/domain/playbook";
import { ChampionPortrait, type PortraitChampion } from "@/components/champion-portrait";
import { RoleIcon } from "@/components/role-icon";
import { ThreatList } from "@/components/draft/insight-panels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel, PanelBody, PanelHeader, SectionLabel } from "@/components/ui/panel";
import { cn } from "@/lib/cn";

const QUICK_ROWS: Array<[keyof Playbook["quick"], string]> = [
  ["winCondition", "WIN CONDITION"],
  ["earlyPlan", "EARLY PLAN"],
  ["playFor", "PLAY FOR"],
  ["fights", "FIGHTS"],
  ["sideLane", "SIDE LANE"],
  ["objectives", "OBJECTIVES"],
  ["watchFor", "WATCH FOR"],
  ["avoid", "AVOID"],
];

/** Match Playbook v2: quick card first, detail on demand. Shared by the draft room and the match archive. */
export function PlaybookPanel({ playbook, championsById, actions, title = "MATCH PLAYBOOK", myPlayerId = null }: { playbook: Playbook; championsById: Record<string, PortraitChampion>; actions?: React.ReactNode; title?: string; /** The viewer's own player: their job is shown first with a "My job" shortcut. */ myPlayerId?: string | null }) {
  const [copied, setCopied] = React.useState(false);
  const myJobRef = React.useRef<HTMLDivElement>(null);
  const champion = (id: string | null | undefined) => (id ? championsById[id] ?? { id, name: id, portraitUrl: "" } : null);
  const jobs = [...playbook.playerJobs].sort((a, b) => Number(b.playerId === myPlayerId) - Number(a.playerId === myPlayerId) || ROLES.indexOf(a.role) - ROLES.indexOf(b.role));
  const myJob = myPlayerId ? jobs.find((j) => j.playerId === myPlayerId) ?? null : null;
  const copy = async () => {
    try {
      await navigator.clipboard?.writeText(playbook.summaryLines.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };
  return (
    <Panel className="border-good/40">
      <PanelHeader
        title={title}
        subtitle={playbook.plan.identity.summary}
        actions={
          <span className="flex flex-wrap items-center gap-1.5">
            {actions}
            {myJob ? (
              <Button size="sm" variant="outline" onClick={() => myJobRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })} title="Jump to your own job">
                <UserRound className="h-3.5 w-3.5" /> My job
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" onClick={copy}>
              <ClipboardCopy className="h-3.5 w-3.5" /> {copied ? "Copied" : "Copy for Discord"}
            </Button>
          </span>
        }
      />
      <PanelBody className="space-y-4">
        <dl className="grid gap-x-3 gap-y-1 text-sm sm:grid-cols-[120px_minmax(0,1fr)]">
          {QUICK_ROWS.map(([key, label]) => (
            <React.Fragment key={key}>
              <dt className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">{label}</dt>
              <dd className="text-fg">{playbook.quick[key]}</dd>
            </React.Fragment>
          ))}
          {playbook.coachNote ? (
            <>
              <dt className="text-xs font-semibold uppercase tracking-[0.2em] text-warn">COACH</dt>
              <dd className="text-fg">{playbook.coachNote}</dd>
            </>
          ) : null}
        </dl>

        <div>
          <SectionLabel className="mb-1">Per-player jobs</SectionLabel>
          <div className="space-y-1.5">
            {jobs.map((j) => {
              const mine = j.playerId === myPlayerId;
              return (
                <div key={j.playerId} ref={mine ? myJobRef : undefined} className={cn("flex items-start gap-2 rounded-md border px-2 py-1.5 text-xs", mine ? "border-accent/60 bg-accent/5" : "border-border")}>
                  <ChampionPortrait champion={champion(j.championId)} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
                      <RoleIcon role={j.role} className="h-3.5 w-3.5 text-accent" /> {j.playerName} <span className="font-normal text-fg-subtle">· {champion(j.championId)?.name}</span>
                      {mine ? <Badge tone="accent">My job</Badge> : null}
                    </div>
                    <div className="text-fg">{j.job}</div>
                    <div className="text-fg-muted">Lane: {j.laning}</div>
                    <div className="text-fg-muted">Fights: {j.fights}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <SectionLabel className="mb-1">If → then</SectionLabel>
            <ul className="space-y-1 text-xs">
              {playbook.rules.map((r, i) => (
                <li key={i}>
                  <span className="font-semibold text-accent">IF</span> {r.if} <span className="font-semibold text-accent">→</span> {r.then}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <SectionLabel className="mb-1">Deny their plan</SectionLabel>
            <p className="mb-1 text-xs text-fg-muted">Their win condition: {playbook.denial.theirWinCondition}</p>
            <ul className="space-y-0.5 text-xs">
              {playbook.denial.deny.map((d, i) => (
                <li key={i}>• {d}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {(["ahead", "even", "behind"] as const).map((k) => (
            <div key={k} className="rounded-md border border-border p-2">
              <Badge tone={k === "ahead" ? "good" : k === "behind" ? "warn" : "neutral"}>{k.toUpperCase()}</Badge>
              <ul className="mt-1 space-y-0.5 text-xs text-fg-muted">
                {playbook.scenarios[k].map((line, i) => (
                  <li key={i}>• {line}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <SectionLabel className="mb-1">Self-critique</SectionLabel>
            <ul className="space-y-0.5 text-xs text-warn">
              {playbook.critique.map((c, i) => (
                <li key={i}>• {c}</li>
              ))}
            </ul>
          </div>
          <ThreatList threats={playbook.threats} champion={champion} />
        </div>

        <details className="text-xs">
          <summary className="cursor-pointer text-fg-subtle">Detailed plan (lanes, teamfight, side lane, objectives)</summary>
          <div className="mt-2 grid gap-3 md:grid-cols-2">
            <Section title="Lane priorities" items={playbook.plan.lanePriorities} />
            <Section title="Teamfight" items={playbook.plan.teamfight.plan} />
            <Section title={`Side lane · ${playbook.plan.sideLane.formation}`} items={playbook.plan.sideLane.notes} />
            <Section title="Objectives" items={[`Early: ${playbook.plan.objectives.early}`, `Dragon: ${playbook.plan.objectives.dragon}`, `Baron: ${playbook.plan.objectives.baron}`]} />
            <Section title="Key enemy threats" items={playbook.plan.threats} />
            <Section title="Avoid" items={playbook.plan.avoid} />
          </div>
        </details>
      </PanelBody>
    </Panel>
  );
}

function Section({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <SectionLabel className="mb-1">{title}</SectionLabel>
      <ul className="space-y-0.5 text-xs text-fg-muted">
        {items.map((t, i) => (
          <li key={i}>• {t}</li>
        ))}
      </ul>
    </div>
  );
}

