"use client";

import * as React from "react";
import { ChevronRight } from "lucide-react";
import type { BuildChoice, BuildIcon, BuildPart, ChampionBuildsView, RoleBuilds, RunePageValue, SkillOrderValue, StartValue } from "@/domain/champion-builds";
import { hasPerformer, shownRole } from "@/domain/champion-builds";
import {
  BUILDS_TITLE,
  HIGHEST_TIP,
  HIGHEST_WIN_RATE,
  MOST_COMMON,
  MOST_COMMON_TIP,
  PART_LABELS,
  QUEUE_TIP,
  RANK_TIP,
  SOURCE_TIP,
  UNAVAILABLE_WORDS,
  choiceFigures,
  choiceTip,
  fewTip,
  fewWords,
  fullTip,
  gamesTip,
  gamesWords,
  partEmptyWords,
  patchTip,
  patchWords,
  queueWords,
  roleSwitchLabel,
  sourceWords,
  type BuildPartKey,
} from "@/domain/champion-builds-words";
import { ROLE_LABELS } from "@/domain/roles";
import { IconImg, iconInitials } from "@/components/match-history/icon-img";
import { RoleIcon } from "@/components/role-icon";
import { InfoTip } from "@/components/ui/info-tip";
import { RoleSegmented, segmentClass, segmentedGroupClass } from "@/components/ui/segmented";
import { formatCount } from "@/lib/format";
import { cn } from "@/lib/cn";
import { useBuildsRole } from "./builds-role";

/*
  CHAMPION INTEL's builds and runes for one champion (docs/CHAMPION_INTEL.md, "Builds and runes"):
  what the players of the team's stored matches chose on it in one role, on the current patch (or
  with the previous one added, said so), as compact icon rows: runes, stat shards, summoner spells,
  skill order, starting items, boots, core items and the full build, each with its win rate and its
  pick rate, and its own sample in plain words behind the win rate. The source line says what was
  counted (games, the team's matches, the patch, all ranks, the queues), each part behind its own ⓘ.
  "Most common" by default; where any part has a choice with a clearly higher win rate among common
  ones, "Highest win rate" shows those instead (the rows that differ marked). A role choice where
  the champion has enough games in more than one role (kept in the address by the page). Fewer
  games than the section needs: one honest line. Factual statistics only: no advice, no verdict.

  Laid out by its own width: two groups of rows side by side where there is room (one champion on
  a desktop), one group in a column of Compare, the label over its icons on a phone.
*/

type Mode = "common" | "highest";

/** A Riot icon at a size in px; one the static data could not name (no URL) is a tile with its initials. */
function Icon({ icon, size, round = false }: { icon: BuildIcon; size: number; round?: boolean }) {
  if (icon.url) return <IconImg icon={icon} size={size} rounded={round ? "rounded-full" : "rounded"} />;
  const side = `${size / 16}rem`;
  return (
    <span role="img" aria-label={icon.name} title={icon.name} className={cn("grid shrink-0 place-items-center bg-surface-3 text-4xs font-semibold leading-none text-fg-muted", round ? "rounded-full" : "rounded")} style={{ width: side, height: side }}>
      <span aria-hidden>{iconInitials(icon.name)}</span>
    </span>
  );
}

const Then = () => <ChevronRight className="h-3 w-3 shrink-0 text-fg-subtle" aria-hidden />;

function RunesIcons({ v }: { v: RunePageValue }) {
  return (
    <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
      <span className="flex flex-wrap items-center gap-0.5">
        {v.keystone ? <Icon icon={v.keystone} size={26} round /> : null}
        {v.primary.map((r, i) => (
          <Icon key={i} icon={r} size={20} round />
        ))}
      </span>
      <span className="flex flex-wrap items-center gap-0.5">
        {v.secondaryTree ? <Icon icon={v.secondaryTree} size={16} round /> : null}
        {v.secondary.map((r, i) => (
          <Icon key={i} icon={r} size={20} round />
        ))}
      </span>
    </span>
  );
}

function SkillKeys({ v }: { v: SkillOrderValue }) {
  return (
    <span className="flex flex-wrap items-center gap-1" role="img" aria-label={`Skill order: ${v.order.join(", then ")}. First points ${v.first.join(", ")}.`}>
      {v.order.map((k, i) => (
        <React.Fragment key={k}>
          {i ? <Then /> : null}
          <span aria-hidden className="grid h-6 w-6 place-items-center rounded-md border border-border-strong bg-surface-2 text-xs font-bold leading-none text-fg">
            {k}
          </span>
        </React.Fragment>
      ))}
      <span aria-hidden className="ml-1 whitespace-nowrap text-xs text-fg-subtle">
        first {v.first.join(" ")}
      </span>
    </span>
  );
}

function StartIcons({ v }: { v: StartValue }) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      {v.map((s, i) => (
        <span key={i} className="flex items-center gap-0.5">
          <Icon icon={s.icon} size={22} />
          {s.count > 1 ? <span className="text-xs tabular-nums text-fg-muted">×{s.count}</span> : null}
        </span>
      ))}
    </span>
  );
}

function ItemPath({ items }: { items: readonly BuildIcon[] }) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      {items.map((it, i) => (
        <React.Fragment key={i}>
          {i ? <Then /> : null}
          <Icon icon={it} size={22} />
        </React.Fragment>
      ))}
    </span>
  );
}

/** What a part's choice looks like. */
function ChoiceIcons({ part, value }: { part: BuildPartKey; value: unknown }) {
  switch (part) {
    case "runes":
      return <RunesIcons v={value as RunePageValue} />;
    case "shards":
      return (
        <span className="flex items-center gap-0.5">
          {(value as BuildIcon[]).map((s, i) => (
            <Icon key={i} icon={s} size={18} round />
          ))}
        </span>
      );
    case "spells":
      return (
        <span className="flex items-center gap-0.5">
          {(value as BuildIcon[]).map((s, i) => (
            <Icon key={i} icon={s} size={22} />
          ))}
        </span>
      );
    case "skills":
      return <SkillKeys v={value as SkillOrderValue} />;
    case "start":
      return <StartIcons v={value as StartValue} />;
    case "boots":
      return value === "none" ? <span className="text-sm text-fg-muted">No boots</span> : <Icon icon={value as BuildIcon} size={22} />;
    case "core":
      return <ItemPath items={value as BuildIcon[]} />;
  }
}

/**
 * A group's grid: where the group is wide enough, the label, the choice (as wide as the widest of
 * the group's choices) and right after it the win rate and the pick rate, so the eye never crosses
 * an empty stretch; narrower, the label over its choice and its figures; narrowest (a column of
 * Compare on a small phone), the figures under the choice. Each row is a subgrid of it, so every
 * row's columns line up.
 */
const TABLE = "grid grid-cols-2 gap-x-3 @min-[15rem]/group:grid-cols-[minmax(0,1fr)_3.25rem_3.25rem] @min-[24rem]/group:grid-cols-[6.5rem_minmax(0,max-content)_3.25rem_3.25rem]";
const ROW_BASE = "col-span-full grid grid-cols-subgrid items-center gap-y-1";
const ROW = cn(ROW_BASE, "py-1");
const LABEL = "col-span-full flex min-w-0 items-center gap-1.5 text-xs text-fg-muted @min-[24rem]/group:col-span-1";
/** A row's text in place of its choice and figures: under its label, or beside it across the three columns. */
const SPAN = "col-span-full text-xs text-fg-subtle @min-[24rem]/group:col-span-3";
const CHOICE = "col-span-full min-w-0 @min-[15rem]/group:col-span-1";
const FIGURE = "text-sm tabular-nums @min-[15rem]/group:text-right";
const HEAD_FIGURE = "label-text @min-[15rem]/group:text-right";

function PartRow({ part, built, mode }: { part: BuildPartKey; built: BuildPart<unknown>; mode: Mode }) {
  const label = PART_LABELS[part];
  if (built.state !== "shown")
    return (
      <div role="row" className={ROW} data-testid="lookup-build-part" data-part={part} data-state={built.state}>
        <span role="rowheader" className={LABEL}>
          {label}
        </span>
        <span role="cell" className={SPAN}>
          {partEmptyWords(built.state, built.total)}
        </span>
      </div>
    );
  const highest = mode === "highest" && built.performer !== null;
  const c: BuildChoice<unknown> = highest ? built.performer! : built.standard;
  const { win, pick } = choiceFigures(c);
  return (
    <div role="row" className={ROW} data-testid="lookup-build-part" data-part={part} data-state="shown" data-choice={highest ? "highest" : "common"} data-games={c.games}>
      <span role="rowheader" className={LABEL}>
        {label}
        {highest ? (
          <>
            <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
            <span className="sr-only">(not the most common)</span>
          </>
        ) : null}
      </span>
      <span role="cell" className={CHOICE} data-testid="lookup-build-choice">
        <ChoiceIcons part={part} value={c.value} />
      </span>
      <span role="cell" className={cn(FIGURE, "font-semibold text-fg")}>
        <InfoTip text={choiceTip(part, c)} testId="lookup-build-win">
          {win}
        </InfoTip>
      </span>
      <span role="cell" className={cn(FIGURE, "text-fg-muted")} data-testid="lookup-build-pick">
        {pick}
      </span>
    </div>
  );
}

function FullRow({ b, mode }: { b: RoleBuilds; mode: Mode }) {
  // After the core the view shows: the highest win rate's where it has one.
  const highest = mode === "highest" && b.core.state === "shown" && b.core.performer !== null;
  const full = highest ? b.fullHighest : b.full;
  return (
    <div role="row" className={ROW} data-testid="lookup-build-part" data-part="full" data-state={full ? "shown" : "varied"} data-choice={highest ? "highest" : "common"}>
      <span role="rowheader" className={LABEL}>
        {full ? <InfoTip text={fullTip(full)}>{PART_LABELS.full}</InfoTip> : PART_LABELS.full}
        {highest ? (
          <>
            <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
            <span className="sr-only">(not the most common)</span>
          </>
        ) : null}
      </span>
      <span role="cell" className={full ? CHOICE : SPAN} data-testid="lookup-build-choice">
        {full ? <ItemPath items={full.items} /> : "No common fourth item yet"}
      </span>
      {full ? (
        <>
          <span role="cell" />
          <span role="cell" />
        </>
      ) : null}
    </div>
  );
}

/** One group of rows with its column headings: what the choices are, their win rate and pick rate. */
function Group({ parts, b, mode, label, full }: { parts: BuildPartKey[]; b: RoleBuilds; mode: Mode; label: string; full?: boolean }) {
  return (
    <div className="@container/group min-w-0">
      <div role="table" aria-label={label} className={TABLE}>
        <div role="row" className={cn(ROW_BASE, "pb-0.5")}>
          <span role="columnheader" className="sr-only @min-[24rem]/group:not-sr-only">
            <span className="sr-only">Part</span>
          </span>
          <span role="columnheader" className={cn("label-text", CHOICE)}>
            {mode === "highest" ? <InfoTip text={HIGHEST_TIP}>{HIGHEST_WIN_RATE}</InfoTip> : <InfoTip text={MOST_COMMON_TIP}>{MOST_COMMON}</InfoTip>}
          </span>
          <span role="columnheader" className={HEAD_FIGURE}>
            Win rate
          </span>
          <span role="columnheader" className={HEAD_FIGURE}>
            Pick rate
          </span>
        </div>
        {parts.map((p) => (
          <PartRow key={p} part={p} built={b[p] as BuildPart<unknown>} mode={mode} />
        ))}
        {full && b.core.state === "shown" ? <FullRow b={b} mode={mode} /> : null}
      </div>
    </div>
  );
}

const Sep = () => (
  <span aria-hidden className="text-fg-subtle">
    {" · "}
  </span>
);

function Heading({ id, children }: { id: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      <h3 id={id} className="text-sm font-semibold text-fg">
        {BUILDS_TITLE}
      </h3>
      {children}
    </div>
  );
}

/**
 * The builds section of one champion. `view` comes from the server (server/champion-builds); the
 * role is the page's (useBuildsRole), the view of choices this section's own.
 */
export function ChampionBuilds({ view }: { view: ChampionBuildsView }) {
  const headingId = `${React.useId()}-builds`;
  const { role: asked, setRole } = useBuildsRole();
  const [mode, setMode] = React.useState<Mode>("common");

  if (view.status !== "shown") {
    return (
      <section aria-labelledby={headingId} className="flex flex-wrap items-baseline gap-x-4 gap-y-1" data-testid="lookup-builds-view" data-status={view.status}>
        <Heading id={headingId} />
        {view.status === "few" ? (
          <p className="flex items-center gap-1.5 text-sm text-fg-muted">
            <span data-testid="lookup-build-few">{fewWords(view.currentPatch)}</span>
            <InfoTip label="About builds" text={fewTip(view.games, view.role)} testId="lookup-build-few-tip" />
          </p>
        ) : (
          <p className="text-sm text-fg-muted" data-testid="lookup-build-unavailable">
            {UNAVAILABLE_WORDS}
          </p>
        )}
      </section>
    );
  }

  const role = shownRole(view, asked);
  const b = view.builds[role]!;
  const offersHighest = hasPerformer(b);
  const shown: Mode = offersHighest ? mode : "common";
  return (
    <section aria-labelledby={headingId} className="@container/builds min-w-0 space-y-2" data-testid="lookup-builds-view" data-status="shown" data-role={role} data-mode={shown}>
      <Heading id={headingId}>
        {view.roles.length > 1 ? (
          <RoleSegmented label={roleSwitchLabel(view.championName)} roles={view.roles.map((r) => r.role)} value={role} onChange={(r) => r && setRole(r === view.defaultRole ? null : r)} testId="lookup-build-role" className="-my-1" />
        ) : (
          <span className="inline-flex min-h-9 items-center gap-1.5 text-xs font-medium text-fg-muted pointer-coarse:min-h-11" data-testid="lookup-build-one-role">
            <RoleIcon role={role} className="h-3.5 w-3.5" decorative />
            {ROLE_LABELS[role]}
          </span>
        )}
        {offersHighest ? (
          <div role="radiogroup" aria-label={`${view.championName}'s choices`} className={segmentedGroupClass("-my-1 @min-[30rem]/builds:ml-auto")} data-testid="lookup-build-mode">
            {(["common", "highest"] as const).map((m) => (
              <button key={m} type="button" role="radio" aria-checked={shown === m} onClick={() => setMode(m)} className={segmentClass(shown === m, { className: "@max-[16rem]/builds:shrink @max-[16rem]/builds:whitespace-normal" })} data-value={m}>
                {m === "common" ? MOST_COMMON : HIGHEST_WIN_RATE}
              </button>
            ))}
          </div>
        ) : null}
      </Heading>
      <p className="text-xs text-fg-muted" data-testid="lookup-build-source" data-line={sourceWords(b)} data-games={b.games} data-patches={b.patches.join(",")}>
        <InfoTip text={gamesTip(b)} testId="lookup-build-games">
          {gamesWords(b)}
        </InfoTip>{" "}
        <InfoTip text={SOURCE_TIP} testId="lookup-build-where">
          in the team&apos;s matches
        </InfoTip>
        <Sep />
        <InfoTip text={patchTip(b)} testId="lookup-build-patch">
          <span className={cn(b.widened && "text-warn")}>{patchWords(b)}</span>
        </InfoTip>
        <Sep />
        <InfoTip text={RANK_TIP} testId="lookup-build-ranks">
          all ranks
        </InfoTip>
        <Sep />
        <InfoTip text={QUEUE_TIP} testId="lookup-build-queues">
          {queueWords(b.queues)}
        </InfoTip>
      </p>
      <div className="grid gap-x-8 gap-y-1 @min-[52rem]/builds:grid-cols-2">
        <Group parts={["runes", "shards", "spells", "skills"]} b={b} mode={shown} label={`${view.championName}'s runes, spells and skill order (${formatCount(b.games)} games)`} />
        <Group parts={["start", "boots", "core"]} b={b} mode={shown} label={`${view.championName}'s items (${formatCount(b.timelineGames)} games with a timeline)`} full />
      </div>
    </section>
  );
}

/** The section while its counts are read: its heading and the shape of its rows, so nothing above it moves. */
export function ChampionBuildsLoading() {
  const block = "animate-pulse rounded-md bg-surface-2";
  return (
    <div role="status" aria-live="polite" className="space-y-2" data-testid="lookup-builds-loading">
      <span className="sr-only">Loading builds</span>
      <div aria-hidden className="flex items-center gap-4">
        <span className="text-sm font-semibold text-fg">{BUILDS_TITLE}</span>
        <span className={cn(block, "h-4 w-56 max-w-full")} />
      </div>
      <div aria-hidden className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <span key={i} className={cn(block, "h-6 w-full")} />
        ))}
      </div>
    </div>
  );
}
