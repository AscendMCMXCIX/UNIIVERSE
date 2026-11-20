import { TierLabel } from "./evidence-panel";
import type * as React from "react";
import { Crosshair, History, TriangleAlert, Waypoints } from "lucide-react";
import { Fold } from "@/components/ui/fold";
import type { AbilityRef, BriefingPointView, ChampionChoice, MatchupIntelView, Slot } from "@/domain/matchup-intel/types";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import { cn } from "@/lib/cn";
import { AbilityRefLink } from "./ability-ref-link";
import { MeansLine } from "./haste-line";
import type { MeansAbility } from "@/domain/matchup-intel/haste";
import { PairLink } from "./matchup-frame";
import { abilityAnchor, abilityName, expiredBriefingWords, freshnessWords, hiddenBriefingWords, hiddenPartWords, hiddenPointsWords, moreWords, notRecheckedWords } from "./wording";

/*
  The matchup's curated layer (L1; docs/MATCHUP_INTEL.md): the briefing for your champion against
  this enemy only, as the owner approved it, word for word. The threat and the opportunity side by
  side, coloured and named apart (warn and a warning sign for the threat, good and a crosshair for
  the opportunity, never colour alone), then the lane points: the first two shown, the rest folded
  behind their count ("2 more"), one press away, never cut. Each part has chips naming the abilities
  it rests on, which jump to their tiles. When it was checked, and once a later patch is out, that
  nobody has checked it again since. A point that rests on an ability Riot changed after the check
  is hidden, and the page says so where it was, naming the ability (view.ts decides): never
  silently. More than two patches after its check, the whole briefing is hidden, and says why. A
  briefing points at what matters and leaves the decisions to the player.
*/

const REF = /^([A-Za-z0-9]{1,40})\.(P|Q|W|E|R)$/;

/** How many lane points show before the rest fold behind their count. */
export const LANE_SHOWN = 2;

/** The names of the abilities `refs` point to ("Renekton W"), of the two champions only. */
export function abilityNames(refs: readonly AbilityRef[], names: ReadonlyMap<string, string>): string[] {
  return refs.flatMap((r) => {
    const m = REF.exec(r);
    return m && names.has(m[1]!) ? [abilityName(names.get(m[1]!)!, m[2] as Slot)] : [];
  });
}

/** Why a part is hidden, in its place: the words, and the changed abilities as chips to their tiles. */
export function HiddenNote({ words, changed, names, rows, testId }: { words: string; changed: readonly AbilityRef[]; names: ReadonlyMap<string, string>; rows?: ReadonlySet<string>; testId: string }) {
  return (
    // The chips follow the words on their last line, as a point's chips do (a line of their own made
    // the briefing a row taller, which the Production check's pair could not spare at 1440 × 900).
    <div className="flex items-start gap-1.5 text-sm text-fg-muted" data-testid={testId}>
      {/* Under 9rem (a 320px phone at twice the text size) the icon steps aside, as a point's does, so a chip keeps whole. */}
      <History className="mt-0.5 h-4 w-4 shrink-0 text-warn @max-[9rem]/brief:hidden" aria-hidden />
      <div className="min-w-0">
        {words}
        <AbilityChips refs={changed} names={names} rows={rows} label="Changed since the check" inline />
      </div>
    </div>
  );
}

/** A chip's look as a plain label, where there is no tile to jump to. */
const CHIP = "inline-flex min-h-6 items-center rounded-full border border-border-strong bg-surface-2 px-2 text-xs font-medium leading-tight text-fg-muted";

/**
 * The chips of a part: one per ability it rests on, named "<Champion> <key>", each a link to its
 * tile. `rows`: the champions whose tiles are on the page; a champion with none (no abilities
 * stored yet) gets plain labels, never links that lead nowhere. Absent: every tile is there.
 * `inline`: the chips follow the words on their last line, rather than a line of their own.
 */
export function AbilityChips({ refs, names, rows, label, inline = false }: { refs: readonly AbilityRef[]; names: ReadonlyMap<string, string>; rows?: ReadonlySet<string>; label: string; inline?: boolean }) {
  const chips = refs.flatMap((r) => {
    const m = REF.exec(r);
    return m && names.has(m[1]!) ? [{ ref: r, id: m[1]!, slot: m[2] as Slot }] : [];
  });
  if (!chips.length) return null;
  return (
    // On a touch screen far enough apart that no chip's 44px area (touch-target) covers another's box.
    <ul className={cn("flex-wrap gap-1 pointer-coarse:gap-x-1.5 pointer-coarse:gap-y-3", inline ? "ml-1 inline-flex align-[0.0625rem]" : "flex")} aria-label={label}>
      {chips.map((c) => (
        <li key={c.ref}>
          {!rows || rows.has(c.id) ? (
            <AbilityRefLink anchor={abilityAnchor(c.id, c.slot)} size="sm">
              {abilityName(names.get(c.id)!, c.slot)}
            </AbilityRefLink>
          ) : (
            <span className={CHIP} data-testid="briefing-ability-label">
              {abilityName(names.get(c.id)!, c.slot)}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

type Means = Readonly<Partial<Record<AbilityRef, MeansAbility>>>;

function Point({ kind, point, names, rows, means }: { kind: "threat" | "opportunity"; point: BriefingPointView; names: ReadonlyMap<string, string>; rows?: ReadonlySet<string>; means?: Means }) {
  const threat = kind === "threat";
  const Icon = threat ? TriangleAlert : Crosshair;
  return (
    // Under 9rem (a 320px phone at twice the text size) a narrower padding and no icon before the
    // label, so the longest label (Opportunity) and the words keep whole.
    <div className={cn("min-w-0 px-3 py-2.5 @max-[9rem]/brief:px-2", threat ? "bg-warn/5" : "bg-good/5")} data-testid={`briefing-${kind}`} data-hidden={point.kind === "hidden" ? "" : undefined}>
      <h3 className={cn("label-caps flex items-center gap-1.5 [overflow-wrap:anywhere]", threat ? "text-warn" : "text-good")}>
        <Icon className="h-4 w-4 shrink-0 @max-[9rem]/brief:hidden" aria-hidden />
        {threat ? "Threat" : "Opportunity"}
      </h3>
      {point.kind === "point" ? (
        <div className="mt-1 text-sm leading-snug text-fg">
          <span>{point.text}</span>
          <AbilityChips refs={point.basedOn} names={names} rows={rows} label={threat ? "The threat rests on" : "The opportunity rests on"} inline />
          <MeansLine refs={point.basedOn} means={means} />
        </div>
      ) : (
        <div className="mt-1">
          <HiddenNote words={hiddenPartWords(abilityNames(point.changed, names))} changed={point.changed} names={names} rows={rows} testId={`briefing-${kind}-hidden`} />
        </div>
      )}
    </div>
  );
}

/** How much of the row the threat takes beside the opportunity, in percent: by the length of their words, between 40 and 62. */
export function threatShare(threat: BriefingPointView, opportunity: BriefingPointView): number {
  const size = (p: BriefingPointView) => (p.kind === "point" ? p.text.length : 80);
  const share = size(threat) / Math.max(1, size(threat) + size(opportunity));
  return Math.round(Math.min(0.62, Math.max(0.4, share)) * 100);
}

/** Every changed ability of the hidden points, each once, in the order they appear. */
export function changedOf(points: readonly BriefingPointView[]): AbilityRef[] {
  const out: AbilityRef[] = [];
  for (const p of points) if (p.kind === "hidden") for (const r of p.changed) if (!out.includes(r)) out.push(r);
  return out;
}

/** Whether a briefing shows anything of its own: a point, the threat or the opportunity (not when its check is too old, or every part is hidden). */
export function briefingShows(matchup: MatchupIntelView | null): boolean {
  const b = matchup?.briefing;
  return !!b && [b.threat, b.opportunity, ...b.lane].some((p) => p.kind === "point");
}

/**
 * How much of a curated matchup is hidden because Riot changed an ability it rests on after its
 * check: its parts (the threat, the opportunity, each lane point and each interaction) hidden so, and
 * whether nothing of the briefing is left to show (`whole`). None for a matchup hidden as too old,
 * which says so on its own.
 */
export function hiddenPartsOf(matchup: MatchupIntelView | null): { count: number; whole: boolean } {
  const b = matchup?.briefing;
  if (!matchup || !b) return { count: 0, whole: false };
  const count = [b.threat, b.opportunity, ...b.lane, ...matchup.interactions].filter((p) => p.kind === "hidden").length;
  return { count, whole: count > 0 && !briefingShows(matchup) };
}

/** A lane point: its words and the chips of what it rests on. */
function LanePoint({ point, names, rows, means }: { point: Extract<BriefingPointView, { kind: "point" }>; names: ReadonlyMap<string, string>; rows?: ReadonlySet<string>; means?: Means }) {
  return (
    <li className="min-w-0 border-l-2 border-border pl-2.5 text-sm leading-snug text-fg @max-[9rem]/brief:pl-1.5" data-testid="briefing-lane-point">
      <span>{point.text}</span>
      <AbilityChips refs={point.basedOn} names={names} rows={rows} label="This point rests on" inline />
      <MeansLine refs={point.basedOn} means={means} />
    </li>
  );
}

/**
 * The curated briefing for your champion against the enemy. Its title names the layer; the pair is
 * in the slots above it, and a screen reader hears it in the heading. `rows`: the champions whose
 * tiles are on the page, for the chips.
 */
/** The tier of the curated notes (docs/MATCHUP_INTEL.md, "Evidence tiers"). */
export const CHECKED_TIER = "Checked notes (AI reviewers)";

/**
 * `means`: the enemy's abilities by their ref, for each row's "what it means" line (MeansLine); only
 * the enemy's, so a row resting on your own champion's abilities alone has none.
 */
export function Briefing({ matchup, you, enemy, rows, means }: { matchup: MatchupIntelView; you: ChampionChoice; enemy: ChampionChoice; rows?: ReadonlySet<string>; means?: Means }) {
  const names = new Map([
    [you.id, you.name],
    [enemy.id, enemy.name],
  ]);
  const f = freshnessWords(matchup.freshness, matchup.verified.patch);
  const recheck = matchup.recheck;
  const header = (
    // One row where it fits (at 1440 × 900 too, with production's "Not re-checked"): the title and its
    // tier, then when it was checked, its badges as tall as its words.
    <header className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 border-b border-border px-3 py-1.5">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
        <h2 className="text-sm font-semibold text-fg">
          Curated briefing<span className="sr-only">: {`${you.name} vs ${enemy.name}`}</span>
        </h2>
        <TierLabel>{CHECKED_TIER}</TierLabel>
      </div>
      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-fg-muted" data-testid="matchup-briefing-checked">
        <span>{f.checked}</span>
        {recheck && !recheck.expired ? (
          <span className="inline-flex max-w-full" data-testid="matchup-not-rechecked">
            <Badge tone="neutral" size="line">
              <History className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {notRecheckedWords(recheck.patch)}
            </Badge>
          </span>
        ) : null}
        {f.warning ? (
          <Badge tone="warn" size="line">
            <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {f.warning}
          </Badge>
        ) : null}
      </p>
    </header>
  );
  if (!matchup.briefing) {
    // Its check is more than two patches old: hidden as a whole, and said, whatever Riot's records show.
    return (
      <Panel className="overflow-hidden" data-testid="matchup-briefing" data-expired="">
        {header}
        <div className="px-3 py-2.5">
          <p className="flex items-start gap-1.5 text-sm text-fg-muted" data-testid="briefing-expired">
            <History className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden />
            <span>{expiredBriefingWords(matchup.verified.patch, recheck?.patches ?? 0)}</span>
          </p>
        </div>
      </Panel>
    );
  }
  const { threat, opportunity, lane } = matchup.briefing;
  const shownLane = lane.filter((p): p is Extract<BriefingPointView, { kind: "point" }> => p.kind === "point");
  const hiddenLane = lane.filter((p) => p.kind === "hidden");
  const first = shownLane.slice(0, LANE_SHOWN);
  const rest = shownLane.slice(LANE_SHOWN);
  const all = [threat, opportunity, ...lane];
  const nothingShown = all.every((p) => p.kind === "hidden");
  return (
    <Panel className="overflow-hidden" data-testid="matchup-briefing">
      {header}
      {nothingShown ? (
        // Every part rests on something Riot changed since: one line says so, with the abilities.
        <div className="px-3 py-2.5">
          <HiddenNote words={hiddenBriefingWords(abilityNames(changedOf(all), names))} changed={changedOf(all)} names={names} rows={rows} testId="briefing-hidden" />
        </div>
      ) : (
        <div className="@container/brief">
          {/* Side by side from 34rem, each as wide as its words need against the other's (between 40%
              and 62% of the row), so the longer one is not left twice as tall. */}
          <div className="grid divide-y divide-border @min-[34rem]/brief:grid-cols-[minmax(0,var(--threat-share))_minmax(0,1fr)] @min-[34rem]/brief:divide-x @min-[34rem]/brief:divide-y-0" style={{ "--threat-share": `${threatShare(threat, opportunity)}%` } as React.CSSProperties}>
            <Point kind="threat" point={threat} names={names} rows={rows} means={means} />
            <Point kind="opportunity" point={opportunity} names={names} rows={rows} means={means} />
          </div>
          {lane.length ? (
            <section className="border-t border-border px-3 py-2.5 @max-[9rem]/brief:px-2" aria-labelledby="briefing-lane-title" data-testid="briefing-lane">
              <h3 id="briefing-lane-title" className="label-caps flex items-center gap-1.5 [overflow-wrap:anywhere]">
                <Waypoints className="h-4 w-4 shrink-0 @max-[9rem]/brief:hidden" aria-hidden />
                In lane
              </h3>
              {first.length ? (
                <ul className="mt-1.5 grid gap-x-5 gap-y-2 @min-[34rem]/brief:grid-cols-2">
                  {first.map((p, i) => (
                    <LanePoint key={i} point={p} names={names} rows={rows} means={means} />
                  ))}
                </ul>
              ) : null}
              {rest.length ? (
                // The rest, word for word, one press away: never cut to fit.
                // On a touch screen 12px under the chips above, so neither's 44px area covers the other.
                <Fold variant="inline" tone="accent" className="mt-1.5 pointer-coarse:mt-3" testId="briefing-lane-more" summary={<>{moreWords(rest.length)}<span className="sr-only"> in lane</span></>}>
                  <ul className="grid gap-x-5 gap-y-2 @min-[34rem]/brief:grid-cols-2">
                    {rest.map((p, i) => (
                      <LanePoint key={i} point={p} names={names} rows={rows} means={means} />
                    ))}
                  </ul>
                </Fold>
              ) : null}
              {hiddenLane.length ? (
                <div className={shownLane.length ? "mt-2" : "mt-1.5"}>
                  <HiddenNote words={hiddenPointsWords(hiddenLane.length, abilityNames(changedOf(hiddenLane), names))} changed={changedOf(hiddenLane)} names={names} rows={rows} testId="briefing-lane-hidden" />
                </div>
              ) : null}
            </section>
          ) : null}
        </div>
      )}
    </Panel>
  );
}

/** A link to a curated pair, as a chip (the curated links, and the pairs listed with nothing chosen). */
export const PAIR_CHIP = "touch-target inline-flex min-h-7 items-center rounded-full border border-border-strong bg-surface-2 px-2.5 text-xs font-medium text-fg-muted transition-colors hover:border-accent/60 hover:text-fg";

/**
 * The links to the curated matchups that exist for your champion; `centered` in a centred empty
 * state, so a wrapped row stays under the words above it. Each goes through the frame (PairLink):
 * the slots show the pair at once and the page dims until it arrives, as a pick does.
 */
export function CuratedLinks({ you, enemies, current, label, centered = false, className }: { you: ChampionChoice; enemies: readonly ChampionChoice[]; current?: string | null; label: string; centered?: boolean; className?: string }) {
  if (!enemies.length) return null;
  return (
    <p className={cn("flex flex-wrap items-center gap-1.5 text-sm pointer-coarse:gap-y-2", centered && "justify-center", className)} data-testid="matchup-curated-links">
      <span className="text-fg-muted">{label}</span>
      {enemies.map((e) => (
        <PairLink key={e.id} you={you.id} enemy={e.id} current={e.id === current} className={PAIR_CHIP} testId="matchup-curated-link" champion={e.id}>
          {you.name} vs {e.name}
        </PairLink>
      ))}
    </p>
  );
}
