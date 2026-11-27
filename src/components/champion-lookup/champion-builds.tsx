"use client";

import * as React from "react";
import { ChevronRight } from "lucide-react";
import type { BuildChoice, BuildIcon, BuildPart, BuildQueueKey, ChampionBuildsView, ChampionBuildsViews, RoleBuilds, RunePageValue, SkillOrderValue, StartValue } from "@/domain/champion-builds";
import { BUILD_QUEUE_KEYS, hasPerformer, otherQueueOffer, shownRole } from "@/domain/champion-builds";
import {
  BUILDS_TITLE,
  CORE_ORDER_WORDS,
  DIFFERS_WORDS,
  FULL_EMPTY_WORDS,
  HIGHEST_TIP,
  HIGHEST_WIN_RATE,
  MOST_COMMON,
  MOST_COMMON_TIP,
  NO_BOOTS,
  PART_LABELS,
  MASTER_GROUP,
  MASTER_OPTION,
  MASTER_WHERE_TIP,
  QUEUE_LABELS,
  QUEUE_TIP,
  TEAM_GROUP,
  RANK_TIP,
  RUNE_PAGE_WORDS,
  SMALL_SAMPLE_WORDS,
  SOURCE_TIP,
  UNAVAILABLE_WORDS,
  WIN_RATE_TIP,
  choiceFigures,
  choiceTip,
  fewTip,
  fewWords,
  firmWinRate,
  FIRST_POINTS_WORDS,
  fullTip,
  gamesTip,
  gamesWords,
  masterFewTip,
  masterFewWords,
  masterGamesTip,
  masterGamesWords,
  masterSourceWords,
  otherQueueWords,
  partEmptyWords,
  patchTip,
  patchWords,
  queueSelectLabel,
  roleSwitchLabel,
  sourceWords,
  type BuildPartKey,
} from "@/domain/champion-builds-words";
import { ROLE_LABELS } from "@/domain/roles";
import { IconImg, iconInitials } from "@/components/match-history/icon-img";
import { RoleIcon } from "@/components/role-icon";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { RoleSegmented, segmentClass, segmentedGroupClass } from "@/components/ui/segmented";
import { Select, type SelectOption } from "@/components/ui/select";
import { formatCount } from "@/lib/format";
import { cn } from "@/lib/cn";
import { useBuildsChoice } from "./builds-choice";

/*
  CHAMPION INTEL's builds and runes for one champion (docs/CHAMPION_INTEL.md, "Builds and runes"):
  what the players of the team's stored matches chose on it in one role and one queue, on the
  current patch (or with the previous one added, said so), as compact icon rows: runes, stat
  shards, summoner spells, skill order, starting items, boots, core items and the full build, each
  with its win rate and its pick rate, and its own sample and likely range in plain words behind
  the win rate (a win rate from fewer than 30 games drawn quieter, said so). The queue is a choice
  in the heading (Ranked Solo/Duo by default; Ranked Flex, Normal Draft and Clash each on its own,
  never mixed; the page's, so both columns of Compare read the same queue), changed here with no
  request. The source line says what was counted (games, the team's matches, the patch, all ranks),
  each part behind its own ⓘ. "Most common" by default; where any part has a choice that won
  clearly more (30 games or more, 99% sure, D6), "Highest win rate" shows those instead (the rows
  that differ marked). A role choice where the champion has enough games in more than one role
  (kept in the address by the page). Fewer games than the section needs in the queue chosen: one
  honest line naming the queue, and an offer of another queue that has builds (the reader chooses;
  it never switches by itself). Factual statistics only: no advice, no verdict.

  Laid out by its own width: two groups of rows side by side where there is room (one champion on
  a desktop), one group in a column of Compare, the label over its icons on a phone. In Compare the
  section takes twelve rows of the board as its own (a subgrid, from a 22rem board where the two
  columns sit side by side): its heading, its source line, and each group's column headings and
  parts, so the same part of the two champions' builds sits on one line, whatever the other
  column's heading, switch or source line takes. A container breaks a subgrid, so there the rows'
  forms follow the board's width (FORMS.compare) instead of the group's own.
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

/** A rune page: each tree's icon (its name read out), then its runes, the keystone first; the page is the commonest of its keystone and secondary tree. */
function RunesIcons({ v }: { v: RunePageValue }) {
  return (
    <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
      <span className="sr-only">{RUNE_PAGE_WORDS}</span>
      <span className="flex flex-wrap items-center gap-0.5" data-tree="primary">
        {v.primaryTree ? (
          <span className="contents" data-testid="lookup-build-tree">
            <Icon icon={v.primaryTree} size={16} round />
          </span>
        ) : null}
        {v.keystone ? <Icon icon={v.keystone} size={26} round /> : null}
        {v.primary.map((r, i) => (
          <Icon key={i} icon={r} size={20} round />
        ))}
      </span>
      <span className="flex flex-wrap items-center gap-0.5" data-tree="secondary">
        {v.secondaryTree ? (
          <span className="contents" data-testid="lookup-build-tree">
            <Icon icon={v.secondaryTree} size={16} round />
          </span>
        ) : null}
        {v.secondary.map((r, i) => (
          <Icon key={i} icon={r} size={20} round />
        ))}
      </span>
    </span>
  );
}

function SkillKeys({ v }: { v: SkillOrderValue }) {
  return (
    <span className="flex flex-wrap items-center gap-1" role="img" aria-label={`Skill order: ${v.order.join(", then ")}. First points most often ${v.first.join(", ")}.`}>
      {v.order.map((k, i) => (
        <React.Fragment key={k}>
          {i ? <Then /> : null}
          <span aria-hidden className="grid h-6 w-6 place-items-center rounded-md border border-border-strong bg-surface-2 text-xs font-bold leading-none text-fg">
            {k}
          </span>
        </React.Fragment>
      ))}
      {/* The words wrap where the column is narrow (a phone at 200% text); the three keys stay together. In a single champion's group
          under 33rem (1366 with the sidebar open) the words take the line under the keys by design, so the board's height never depends
          on a glyph's width (Release 19: beside the keys they dropped under them with text a hair wider, and the board ran past the window). */}
      <span aria-hidden className="ml-1 text-xs text-fg-subtle @max-[33rem]/group:ml-0 @max-[33rem]/group:basis-full">
        {FIRST_POINTS_WORDS} <span className="whitespace-nowrap">{v.first.join(" ")}</span>
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

function ItemPath({ items, said }: { items: readonly BuildIcon[]; /** Words before the icons for a screen reader. */ said?: string }) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      {said ? <span className="sr-only">{said}</span> : null}
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
      return value === "none" ? <span className="text-sm text-fg-muted">{NO_BOOTS}</span> : <Icon icon={value as BuildIcon} size={22} />;
    case "core":
      return <ItemPath items={value as BuildIcon[]} said={CORE_ORDER_WORDS} />;
  }
}

/**
 * A group's grid: where the group is wide enough (24rem), the label, the choice (as wide as the
 * widest of the group's choices) and right after it the win rate and the pick rate, so the eye never
 * crosses an empty stretch; narrower (15rem), the label over its choice and its figures; narrowest
 * (a column of Compare on a phone), the figures under the choice. Each row is a subgrid of it, so
 * every row's columns line up.
 *
 * One champion's section measures its group (@container/group). In Compare the group is a subgrid
 * of the board's rows, which a container would break, so the same forms follow the board's width:
 * the group is the column's width less its padding, half the board less the slots' 2.25rem column
 * from a 22rem board (15rem of group from a 35.25rem board, 24rem from 53.25rem), the board's whole
 * width below it, where the columns stack (15rem from 16.5rem). Written out whole, so the stylesheet
 * has every class.
 */
const FORMS = {
  single: {
    group: "@container/group min-w-0",
    table: "grid grid-cols-2 gap-x-3 @min-[15rem]/group:grid-cols-[minmax(0,1fr)_3.25rem_3.25rem] @min-[24rem]/group:grid-cols-[6.5rem_minmax(0,max-content)_3.25rem_3.25rem]",
    label: "col-span-full flex min-w-0 items-center gap-1.5 text-xs text-fg-muted @min-[24rem]/group:col-span-1",
    span: "col-span-full text-xs text-fg-subtle @min-[24rem]/group:col-span-3",
    choice: "col-span-full min-w-0 @min-[15rem]/group:col-span-1",
    figure: "text-sm tabular-nums @min-[15rem]/group:text-right",
    // One line ("Pick rate" wrapped in its 3.25rem column at 1366 with text a hair wider, Release 19): at the column's end, any excess into the gap before it.
    headFigure: "label-text whitespace-nowrap @min-[15rem]/group:justify-self-end @min-[15rem]/group:text-right",
    partHead: "sr-only @min-[24rem]/group:not-sr-only",
  },
  compare: {
    group: "min-w-0 @min-[22rem]/board:row-span-5 @min-[22rem]/board:grid @min-[22rem]/board:grid-rows-subgrid",
    table:
      "grid grid-cols-2 gap-x-3 @min-[16.5rem]/board:@max-[22rem]/board:grid-cols-[minmax(0,1fr)_3.25rem_3.25rem] @min-[35.25rem]/board:grid-cols-[minmax(0,1fr)_3.25rem_3.25rem] @min-[53.25rem]/board:grid-cols-[6.5rem_minmax(0,max-content)_3.25rem_3.25rem] @min-[22rem]/board:row-span-5 @min-[22rem]/board:grid-rows-subgrid",
    label: "col-span-full flex min-w-0 items-center gap-1.5 text-xs text-fg-muted @min-[53.25rem]/board:col-span-1",
    span: "col-span-full text-xs text-fg-subtle @min-[53.25rem]/board:col-span-3",
    choice: "col-span-full min-w-0 @min-[16.5rem]/board:@max-[22rem]/board:col-span-1 @min-[35.25rem]/board:col-span-1",
    figure: "text-sm tabular-nums @min-[16.5rem]/board:@max-[22rem]/board:text-right @min-[35.25rem]/board:text-right",
    headFigure: "label-text whitespace-nowrap @min-[16.5rem]/board:@max-[22rem]/board:justify-self-end @min-[16.5rem]/board:@max-[22rem]/board:text-right @min-[35.25rem]/board:justify-self-end @min-[35.25rem]/board:text-right",
    partHead: "sr-only @min-[53.25rem]/board:not-sr-only",
  },
} as const;
type Form = (typeof FORMS)[keyof typeof FORMS];
// content-start: a row Compare makes taller (the other column's same part takes more lines) keeps its lines at its top.
const ROW_BASE = "col-span-full grid grid-cols-subgrid content-start items-center gap-y-1";
const ROW = cn(ROW_BASE, "py-1");

/** The mark of a row whose highest-win-rate choice is not its most common one: a dot, and words for a screen reader. */
function Differs() {
  return (
    <>
      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
      <span className="sr-only">{DIFFERS_WORDS}</span>
    </>
  );
}

function PartRow({ part, built, mode, form }: { part: BuildPartKey; built: BuildPart<unknown>; mode: Mode; form: Form }) {
  const label = PART_LABELS[part];
  if (built.state !== "shown")
    return (
      <div role="row" className={ROW} data-testid="lookup-build-part" data-part={part} data-state={built.state} data-total={Math.round(built.total)}>
        <span role="rowheader" className={form.label}>
          {label}
        </span>
        <span role="cell" className={form.span}>
          {partEmptyWords(built.state, built.total)}
        </span>
      </div>
    );
  const highest = mode === "highest" && built.performer !== null;
  const c: BuildChoice<unknown> = highest ? built.performer! : built.standard;
  const { win, pick } = choiceFigures(c);
  // A win rate from fewer than 30 games swings by ±17 points or more: quieter, and said so (its ⓘ gives its range).
  const firm = firmWinRate(c);
  return (
    <div
      role="row"
      className={ROW}
      data-testid="lookup-build-part"
      data-part={part}
      data-state="shown"
      data-choice={highest ? "highest" : "common"}
      data-games={Math.round(c.games)}
      data-wins={Math.round(c.wins)}
      data-total={Math.round(c.total)}
      data-key={c.key}
      data-common-games={highest ? Math.round(built.standard.games) : undefined}
      data-common-wins={highest ? Math.round(built.standard.wins) : undefined}
      data-common-key={highest ? built.standard.key : undefined}
    >
      <span role="rowheader" className={form.label}>
        {label}
        {highest ? <Differs /> : null}
      </span>
      <span role="cell" className={form.choice} data-testid="lookup-build-choice">
        <ChoiceIcons part={part} value={c.value} />
      </span>
      <span role="cell" className={cn(form.figure, firm ? "font-semibold text-fg" : "text-fg-subtle")} data-firm={firm ? "true" : "false"}>
        <InfoTip text={choiceTip(part, c)} testId="lookup-build-win">
          {win}
        </InfoTip>
        {firm ? null : <span className="sr-only"> {SMALL_SAMPLE_WORDS}</span>}
      </span>
      <span role="cell" className={cn(form.figure, "text-fg-muted")} data-testid="lookup-build-pick">
        {pick}
      </span>
    </div>
  );
}

function FullRow({ b, mode, form }: { b: RoleBuilds; mode: Mode; form: Form }) {
  // After the core the view shows: the highest win rate's where it has one (its ⓘ says which core it starts from).
  const highest = mode === "highest" && b.core.state === "shown" && b.core.performer !== null;
  const full = highest ? b.fullHighest : b.full;
  return (
    <div
      role="row"
      className={ROW}
      data-testid="lookup-build-part"
      data-part="full"
      data-state={full ? "shown" : "varied"}
      data-choice={highest ? "highest" : "common"}
      data-fourth-games={full ? Math.round(full.fourth.games) : undefined}
      data-fourth-total={full ? Math.round(full.fourth.total) : undefined}
      data-fifth-games={full?.fifth ? Math.round(full.fifth.games) : undefined}
      data-fifth-total={full?.fifth ? Math.round(full.fifth.total) : undefined}
    >
      <span role="rowheader" className={form.label}>
        {full ? (
          <InfoTip text={fullTip(full, highest)} testId="lookup-build-full">
            {PART_LABELS.full}
          </InfoTip>
        ) : (
          PART_LABELS.full
        )}
        {highest ? <Differs /> : null}
      </span>
      <span role="cell" className={full ? form.choice : form.span} data-testid="lookup-build-choice">
        {full ? <ItemPath items={full.items} /> : FULL_EMPTY_WORDS}
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
function Group({ parts, b, mode, label, full, form, className, tips = false }: { parts: BuildPartKey[]; b: RoleBuilds; mode: Mode; label: string; full?: boolean; form: Form; className?: string; /** The first group's headings carry the columns' ⓘ (the second's say the same). */ tips?: boolean }) {
  return (
    <div className={cn(form.group, className)} data-testid="lookup-build-group">
      <div role="table" aria-label={label} className={form.table}>
        <div role="row" className={cn(ROW_BASE, "pb-0.5")} data-testid="lookup-build-head">
          <span role="columnheader" className={form.partHead}>
            <span className="sr-only">Part</span>
          </span>
          <span role="columnheader" className={cn("label-text", form.choice)}>
            {mode === "highest" ? <InfoTip text={HIGHEST_TIP}>{HIGHEST_WIN_RATE}</InfoTip> : <InfoTip text={MOST_COMMON_TIP}>{MOST_COMMON}</InfoTip>}
          </span>
          <span role="columnheader" className={form.headFigure}>
            {tips ? (
              <InfoTip text={WIN_RATE_TIP} testId="lookup-build-win-head">
                Win rate
              </InfoTip>
            ) : (
              "Win rate"
            )}
          </span>
          <span role="columnheader" className={form.headFigure}>
            Pick rate
          </span>
        </div>
        {parts.map((p) => (
          <PartRow key={p} part={p} built={b[p] as BuildPart<unknown>} mode={mode} form={form} />
        ))}
        {full && b.core.state === "shown" ? <FullRow b={b} mode={mode} form={form} /> : null}
      </div>
    </div>
  );
}

const Sep = () => (
  <span aria-hidden className="text-fg-subtle">
    {" · "}
  </span>
);

function Heading({ id, children, className }: { id: string; children?: React.ReactNode; className?: string }) {
  return (
    // min-w-0: in a row of its own (the few state) it may be narrower than the queue choice's widest name, which then ends in an ellipsis.
    <div className={cn("flex min-w-0 max-w-full flex-wrap items-center gap-x-4 gap-y-1", className)} data-testid="lookup-build-heading">
      <h3 id={id} className="text-sm font-semibold text-fg">
        {BUILDS_TITLE}
      </h3>
      {children}
    </div>
  );
}

/** The queue choice: the team's four queues, each its own counts, and Master+ where the page offers it (D2). */
function QueueChoice({ championName, value, master, onChange }: { championName: string; value: BuildQueueKey | "master"; master: boolean; onChange: (v: BuildQueueKey | "master") => void }) {
  const options: SelectOption[] = [
    ...BUILD_QUEUE_KEYS.map((q) => ({ value: q, label: QUEUE_LABELS[q], ...(master ? { group: TEAM_GROUP } : {}) })),
    ...(master ? [{ value: "master", label: MASTER_OPTION, group: MASTER_GROUP }] : []),
  ];
  return (
    <span className="-my-1 inline-flex max-w-full min-w-0 items-center gap-1 pr-1 pointer-coarse:pr-3.5" data-testid="lookup-build-queue-choice">
      <Select aria-label={queueSelectLabel(championName)} value={value} options={options} onValueChange={(v) => onChange(v as BuildQueueKey | "master")} className="w-auto" data-testid="lookup-build-queue" />
      <InfoTip label="About queues" text={QUEUE_TIP} testId="lookup-build-queue-tip" />
    </span>
  );
}

/** Each champion's section its own name (Compare holds two: one landmark each). */
const sectionName = (championName: string) => `${championName}'s builds and runes`;

/**
 * The builds section of one champion. `views` come from the server (server/champion-builds): every
 * queue's on its own; the role, the queue and the source are the page's (useBuildsChoice), the
 * view of choices this section's own.
 */
export function ChampionBuilds({ views }: { views: ChampionBuildsViews }) {
  const headingId = `${React.useId()}-builds`;
  const sectionRef = React.useRef<HTMLElement>(null);
  const { role: asked, setRole, queue, setQueue, source: askedSource, setSource, compare = false, lane = null } = useBuildsChoice();
  const [mode, setMode] = React.useState<Mode>("common");
  // The other queue's offer, once pressed, hands the focus to the queue choice (the offer is gone).
  const focusQueue = React.useRef(false);
  React.useEffect(() => {
    if (!focusQueue.current) return;
    focusQueue.current = false;
    sectionRef.current?.querySelector<HTMLElement>('[data-testid="lookup-build-queue"]')?.focus({ preventScroll: true });
  });

  if (views.status !== "counted") {
    return (
      <section aria-label={sectionName(views.championName)} className="flex flex-wrap items-baseline gap-x-4 gap-y-1" data-testid="lookup-builds-view" data-status="unavailable">
        <Heading id={headingId} />
        <p className="text-sm text-fg-muted" data-testid="lookup-build-unavailable">
          {UNAVAILABLE_WORDS}
        </p>
      </section>
    );
  }

  const masterView = views.master;
  const source = askedSource === "master" && masterView ? "master" : "team";
  const view: ChampionBuildsView = source === "master" ? masterView! : views.queues[queue];
  const choose = (v: BuildQueueKey | "master") => {
    if (v === "master") setSource("master");
    else {
      setSource("team");
      setQueue(v);
    }
  };
  const queueChoice = <QueueChoice championName={views.championName} value={source === "master" ? "master" : view.queue} master={!!masterView} onChange={choose} />;
  const sectionData = { "data-queue": view.queue, "data-source": source } as const;

  if (view.status !== "shown") {
    const offer = source === "team" ? otherQueueOffer(views.queues, view.queue, asked ?? lane ?? view.role) : null;
    return (
      <section ref={sectionRef} aria-label={sectionName(views.championName)} className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2" data-testid="lookup-builds-view" data-status="few" {...sectionData}>
        <Heading id={headingId}>{queueChoice}</Heading>
        <p className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm text-fg-muted">
          {/* Room for the ⓘ's target past its mark (24px under a mouse, 44px on a touch screen) where the words fill the line. */}
          <span className="inline-flex items-center gap-1.5 pr-1 pointer-coarse:pr-3.5">
            <span data-testid="lookup-build-few">{source === "master" ? masterFewWords(view.games, view.currentPatch) : fewWords(view.queue, view.currentPatch)}</span>
            <InfoTip label="About builds" text={source === "master" ? masterFewTip(view.games, view.role) : fewTip(view.games, view.role, view.queue)} testId="lookup-build-few-tip" />
          </span>
          {offer ? (
            <Button
              variant="outline"
              size="sm"
              // The offer's words wrap wherever the line is short (a column of Compare, a large text size), the button growing with them.
              className="h-auto min-h-7 max-w-full whitespace-normal py-1 text-left"
              onClick={() => {
                focusQueue.current = true;
                setSource("team");
                setQueue(offer.queue);
                const next = views.queues[offer.queue];
                setRole(next.status === "shown" && offer.role !== next.defaultRole ? offer.role : null);
              }}
              data-testid="lookup-build-other-queue"
              data-queue={offer.queue}
            >
              {otherQueueWords(offer)}
            </Button>
          ) : null}
        </p>
      </section>
    );
  }

  // With Matchup Intel's lane, the lane's role is the default where the champion has builds in it (20 games or more: the section's own rule).
  const fallback = shownRole(view, lane);
  const role = shownRole(view, asked ?? lane);
  const b = view.builds[role]!;
  const offersHighest = hasPerformer(b);
  const shown: Mode = offersHighest ? mode : "common";
  const form = compare ? FORMS.compare : FORMS.single;
  const master = source === "master";
  const sourceLine = (
    // One champion: beside the title where the section is wide (a desktop); narrower, on a line of its own under the title, the role and the view switch. Compare: its own row.
    <p className={cn("min-w-0 text-xs text-fg-muted", compare ? undefined : "order-last basis-full @min-[52rem]/builds:order-none @min-[52rem]/builds:basis-auto")} data-testid="lookup-build-source" data-line={master ? masterSourceWords(b) : sourceWords(b)} data-games={Math.round(b.games)} data-observed={b.observed} data-patches={b.patches.join(",")} data-current-games={Math.round(b.currentGames)} data-timeline-games={Math.round(b.timelineGames)}>
      {master ? (
        <>
          <InfoTip text={masterGamesTip(b)} testId="lookup-build-games">
            {masterGamesWords(b)}
          </InfoTip>
          <Sep />
          <InfoTip text={MASTER_WHERE_TIP} testId="lookup-build-where">
            all regions
          </InfoTip>
          <Sep />
          <InfoTip text={patchTip(b)} testId="lookup-build-patch">
            <span className={cn(b.widened && "text-warn")}>{patchWords(b)}</span>
          </InfoTip>
        </>
      ) : (
        <>
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
        </>
      )}
    </p>
  );
  return (
    <section
      ref={sectionRef}
      aria-label={sectionName(views.championName)}
      // Compare: twelve rows of the board (the heading, the source line, each group's headings and parts), as a subgrid.
      className={cn("min-w-0 space-y-2", compare ? "@min-[22rem]/board:row-span-12 @min-[22rem]/board:grid @min-[22rem]/board:grid-rows-subgrid" : "@container/builds")}
      data-testid="lookup-builds-view"
      data-status="shown"
      data-role={role}
      data-roles={view.roles.map((r) => `${r.role}:${Math.round(r.games)}`).join(",")}
      data-mode={shown}
      {...sectionData}
    >
      {/* In Compare the heading measures itself for its switches (the section, a subgrid, cannot be a container). */}
      <Heading id={headingId} className={compare ? "@container/builds" : undefined}>
        {view.roles.length > 1 ? (
          <RoleSegmented label={roleSwitchLabel(view.championName)} roles={view.roles.map((r) => r.role)} value={role} onChange={(r) => r && setRole(r === fallback ? null : r)} testId="lookup-build-role" className="-my-1" />
        ) : (
          <span className="-my-1 inline-flex min-h-9 items-center gap-1.5 text-xs font-medium text-fg-muted pointer-coarse:min-h-11" data-testid="lookup-build-one-role">
            <RoleIcon role={role} className="h-3.5 w-3.5" decorative />
            {ROLE_LABELS[role]}
          </span>
        )}
        {queueChoice}
        {compare ? null : sourceLine}
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
      {compare ? sourceLine : null}
      <div className={cn("grid gap-x-8 gap-y-1", compare ? "@min-[22rem]/board:row-span-10 @min-[22rem]/board:grid-rows-subgrid @min-[22rem]/board:gap-y-0" : "@min-[52rem]/builds:grid-cols-2")}>
        <Group parts={["runes", "shards", "spells", "skills"]} b={b} mode={shown} form={form} tips label={`${view.championName}'s runes, spells and skill order (${formatCount(b.games)} games)`} />
        <Group parts={["start", "boots", "core"]} b={b} mode={shown} form={form} label={`${view.championName}'s items (${formatCount(b.timelineGames)} games with a timeline)`} full className={compare ? "@min-[22rem]/board:pt-1" : undefined} />
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
