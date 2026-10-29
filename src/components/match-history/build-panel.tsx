"use client";

import { ChevronRight } from "lucide-react";
import type { MatchTimelineResult } from "@/server/accounts/match-timeline";
import type { DetailParticipant, RunePage } from "@/server/players/match-history";
import { cn } from "@/lib/cn";
import { IconImg } from "./icon-img";

const SKILL_TONE: Record<string, string> = { Q: "bg-blue/20 text-blue", W: "bg-good/20 text-good", E: "bg-warn/20 text-warn", R: "bg-red/20 text-red" };

/**
 * Build order (items bought, minute by minute), skill order and the full rune page. The build comes
 * from Riot's match timeline, requested once per match the first time a section that needs it opens
 * and then kept; without a timeline it says so rather than guessing from the final items.
 */
export function BuildPanel({ result, runePage, player }: { result: MatchTimelineResult | null; runePage: RunePage | null; player: DetailParticipant }) {
  const build = result?.status === "ok" ? result.timeline.build : null;
  const message = !result ? null : result.status !== "ok" ? result.message : !build ? "This player is not in the stored timeline of this game." : null;
  return (
    <div className="space-y-4" data-testid="match-build">
      <section aria-labelledby="build-order-title" className="space-y-2">
        <h3 id="build-order-title" className="text-sm font-semibold text-fg">
          Build order
        </h3>
        {!result ? (
          <div className="h-16 animate-pulse rounded-lg bg-surface-2 motion-reduce:animate-none" aria-busy="true" aria-label="Loading the build order" />
        ) : message || !build ? (
          <p className="rounded-panel border border-dashed border-border p-3 text-sm text-fg-muted" data-testid="build-message">
            {message}
          </p>
        ) : build.steps.length === 0 ? (
          <p className="text-sm text-fg-muted">No purchases recorded.</p>
        ) : (
          <ol className="flex flex-wrap items-start gap-x-1 gap-y-3" data-testid="build-steps">
            {build.steps.map((step, i) => (
              <li key={i} className="flex items-start gap-1">
                <span className="flex flex-col items-center gap-1">
                  <span className="flex gap-0.5 rounded-lg bg-surface p-1">
                    {step.items.map((it) => (
                      <span key={it.id} className="relative">
                        <IconImg icon={it.url ? { url: it.url, name: it.name } : null} size={28} />
                        {it.count > 1 ? <span className="absolute -bottom-1 -right-1 rounded bg-bg px-0.5 text-3xs font-semibold tabular-nums text-fg">{it.count}</span> : null}
                      </span>
                    ))}
                  </span>
                  <span className="text-2xs tabular-nums text-fg-subtle">{step.minute} min</span>
                </span>
                {i < build.steps.length - 1 ? <ChevronRight className="mt-2.5 h-3.5 w-3.5 shrink-0 text-fg-subtle" aria-hidden /> : null}
              </li>
            ))}
          </ol>
        )}
      </section>
      {build && build.skills.length ? (
        <section aria-labelledby="skill-order-title" className="space-y-2">
          <h3 id="skill-order-title" className="flex flex-wrap items-baseline gap-2 text-sm font-semibold text-fg">
            Skill order
            {build.maxOrder.length ? <span className="text-xs font-normal text-fg-muted">Max {build.maxOrder.join(" → ")}</span> : null}
          </h3>
          <ol className="flex flex-wrap gap-1" data-testid="skill-order">
            {build.skills.map((k, i) => (
              <li key={i} className="flex w-7 flex-col items-center gap-0.5" title={`Level ${i + 1}: ${k}`}>
                <span className={cn("grid h-7 w-7 place-items-center rounded-md text-xs font-bold", SKILL_TONE[k])}>{k}</span>
                <span className="text-3xs tabular-nums text-fg-subtle">{i + 1}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
      <section aria-labelledby="runes-title" className="space-y-2">
        <h3 id="runes-title" className="text-sm font-semibold text-fg">
          Runes and summoner spells
        </h3>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3" data-testid="rune-page">
          {runePage ? (
            <>
              <RuneLine tree={runePage.primaryTree} runes={runePage.primary} />
              <RuneLine tree={runePage.secondaryTree} runes={runePage.secondary} />
            </>
          ) : (
            <span className="flex items-center gap-2 text-sm text-fg-muted">
              <IconImg icon={player.keystone} size={28} rounded="rounded-full" />
              <IconImg icon={player.secondary} size={20} rounded="rounded-full" />
              <span className="text-xs text-fg-subtle">Keystone and secondary path (the full page is kept for games stored from now on).</span>
            </span>
          )}
          <span className="flex items-center gap-1">
            {player.spells?.map((s, i) => (
              <span key={i} className="flex items-center gap-1.5 text-xs text-fg-muted">
                <IconImg icon={s} size={24} />
                <span className="pr-2">{s.name}</span>
              </span>
            ))}
          </span>
        </div>
      </section>
    </div>
  );
}

function RuneLine({ tree, runes }: { tree: { url: string; name: string } | null; runes: Array<{ url: string; name: string }> }) {
  return (
    <span className="flex items-center gap-1.5">
      <IconImg icon={tree} size={20} rounded="rounded-full" className="opacity-80" />
      {runes.map((r, i) => (
        <IconImg key={i} icon={r} size={i === 0 && runes.length === 4 ? 32 : 24} rounded="rounded-full" />
      ))}
    </span>
  );
}
