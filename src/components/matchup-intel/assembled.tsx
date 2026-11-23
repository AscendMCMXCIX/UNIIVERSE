import { TierLabel } from "./evidence-panel";
import { ChangedBadge } from "./changed-badge";
import type * as React from "react";
import { History, Layers, Quote, Swords, TriangleAlert, Wrench } from "lucide-react";
import type { ChampionChoice, ChampionIntelView, KindGroup } from "@/domain/matchup-intel/types";
import { SIDE_GROUPS, kitOf, type Kit, type KitItem } from "@/domain/matchup-intel/kit";
import { Fold } from "@/components/ui/fold";
import { Panel } from "@/components/ui/panel";
import { cn } from "@/lib/cn";
import { CuratedLine } from "./ability-list";
import { AbilityRefLink } from "./ability-ref-link";
import { CuratedLinks } from "./briefing";
import { CHIP_ROWS, ConditionalNote, FactChipView, GROUP_LOOK, QualifierNote } from "./fact-chip";
import { TIP_LABEL } from "./riot-tips";
import { ASSEMBLED_IN_PLACE_WORDS, ASSEMBLED_TITLE, DAMAGE_GROUP_WORDS, DANGER_TITLE, EMPOWER_GROUP_WORDS, KIND_GROUP_WORDS, LANE_REFERENCE_TITLE, OTHER_TOOLS_TITLE, RIOT_TEXT_LABEL, SLOT_NAMES, abilityAnchor, assembledWords, briefingHiddenAboveWords, dangerLineWords, dangerSideWords, duoToolsWords, emptyGroupsWords, hiddenRiotTextWords, lineupWords, missingAbilitiesWords, noBriefingWords, noFactsWords, otherToolsWords, riotTipHeadingWords, yourToolsTitleWords } from "./wording";

/*
  The lane reference (L5, the assembled reference; docs/MATCHUP_INTEL.md, "The lane plan" and "The
  assembled reference"), the page's first card for a pair whose curated briefing does not show (none
  exists, or it is hidden): each champion's own facts set side by side, grouped by kind, the enemy's
  as the danger side and yours as the opportunity side (the owner's decision, 18 Nov 2026); in the
  bot lane both enemies' kits and both of your duo's. Group, never judge: no threat or opportunity is
  chosen by code, nothing is ranked, and no sentence joins the kits. Each group lists the abilities
  with a fact of its kind in slot order, each by its key and name with its chips (which open the
  clause or source they rest on); the groups with nothing in them are named once, in fixed words,
  never "none". The cooldowns are the strip's, right under the card. Its quiet line says every time
  that it was put together from each champion's facts and that no person has checked the pair; above
  that, whether the pair has no curated briefing yet or has one that is hidden. Each side names its
  layer in one quiet line under its title: the checked notes' line (when they were checked, not
  re-checked for a later patch, changed or too old), or the label of the facts from Riot's text. A
  line whose ability Riot changed after its notes were checked is flagged, as its tile is. A fact from
  Riot's text keeps its qualifier and its conditional marker on its chip here too, and where Riot's two
  texts differ the ability's line says so ("Riot's texts differ"), opening both quotes. Under the sides,
  Riot's own first tip against each enemy, verbatim and attributed: Riot's words, never the page's.

  On a touch screen each chip and key reaches 44px (touch-target): the lines and the rows of chips
  stand far enough apart that no one's area covers another's box (12px between rows, 6px between
  chips), so a tap lands on what was tapped.
*/

/**
 * One ability's line in a group: its key (a link to its tile in the strip, or in your kit's fold), its
 * name, and its chips of that kind; flagged when Riot changed the ability after its notes were checked.
 */
function KitLine({ item, champion, rows }: { item: KitItem; champion: ChampionChoice; rows: ReadonlySet<string> }) {
  const key = (
    <>
      <span aria-hidden>{SLOT_NAMES[item.slot]}</span>
      <span className="sr-only">{`${SLOT_NAMES[item.slot]}: ${item.ability} (${champion.name})`}</span>
    </>
  );
  return (
    // The key and the name, then the chips flowing beside them where they fit; where they do not, the
    // chips move to the next line whole, rather than squeezing their words into a narrow column.
    <li className="flex flex-wrap items-start gap-x-2 gap-y-0.5 pointer-coarse:gap-y-3" data-testid="assembled-item" data-slot={item.slot} data-flagged={item.flagged ? "" : undefined}>
      <span className="flex min-w-0 items-center gap-1.5">
        {rows.has(champion.id) ? (
          <AbilityRefLink anchor={abilityAnchor(champion.id, item.slot)} size="chip">
            {key}
          </AbilityRefLink>
        ) : (
          <span className="inline-flex items-center rounded-full border border-border-strong bg-surface-2 px-2 py-0.5 text-xs font-medium leading-tight text-fg-muted">{key}</span>
        )}
        <span aria-hidden className="text-sm leading-snug text-fg" data-testid="assembled-ability">
          {item.ability}
        </span>
      </span>
      <span className={cn("flex min-w-0 flex-wrap items-start", CHIP_ROWS)}>
        {item.chips.map((c, i) => (
          <FactChipView key={i} chip={c} champion={champion.name} ability={item.ability} testId="assembled-chip" />
        ))}
        {item.flagged ? <ChangedBadge testId="assembled-flagged" /> : null}
        {/* What a fact holds only with, in Riot's words, and where any is conditional the owner's marker: each once, on a row of its own. */}
        <QualifierNote chips={item.chips} testId="assembled-qualifiers" className="basis-full" />
        <ConditionalNote chips={item.chips} testId="assembled-conditional" className="basis-full" />
      </span>
    </li>
  );
}

/**
 * Where a side's facts come from, under its title: the checked notes' line (CuratedLine: when they
 * were checked, not re-checked, changed, too old), or the label of the facts from Riot's text. Null
 * for a champion with neither (the side says so in its place).
 */
function SideSource({ intel, kit }: { intel: ChampionIntelView; kit: Kit }) {
  if (kit.from === "none") return null;
  return (
    <p className="mt-0.5 text-xs text-fg-subtle" data-testid="assembled-source">
      {kit.from === "checked" ? (
        <>
          <TierLabel className="text-xs">Checked notes (AI reviewers)</TierLabel>
          {" · "}
          <CuratedLine intel={intel} />
        </>
      ) : (
        <span data-testid="assembled-riot-text-label">{RIOT_TEXT_LABEL}</span>
      )}
    </p>
  );
}

type Side = "danger" | "tools" | "yours" | "both";

const SIDE_LOOK: Record<Side, { icon: typeof TriangleAlert; text: string; box: string }> = {
  danger: { icon: TriangleAlert, text: "text-warn", box: "border-warn/70 bg-warn/5" },
  tools: { icon: Wrench, text: "text-fg-muted", box: "border-border-strong" },
  yours: { icon: Wrench, text: "text-blue", box: "border-blue/60 bg-blue/5" },
  both: { icon: Swords, text: "text-fg-muted", box: "border-border-strong" },
};

/** One group of a side as it is listed: its group (for its icon), its label and its abilities' lines. */
interface SideGroup {
  group: KindGroup;
  label: string;
  items: KitItem[];
}

/** An item with only the chips that pass `keep`, or null when none do. */
const only = (item: KitItem, keep: (c: KitItem["chips"][number]) => boolean): KitItem | null => {
  const chips = item.chips.filter(keep);
  return chips.length ? { ...item, chips } : null;
};
const isDamage = (c: KitItem["chips"][number]) => c.layer === "checked" && c.kind === "damage";

/**
 * A kit's groups, sorted for the side they are listed on (the UX review of Release 13: a self or ally
 * shield, heal or buff is never a "danger"):
 * - `danger`: the enemy's crowd control, and the damage its checked notes record;
 * - `tools`: the enemy's mobility, defence, sustain and empowerments (what it does for itself or its allies);
 * - `all`: every group, in SIDE_GROUPS' order (your champion, a mirror).
 * Facts from Riot's text record no damage kind, so a side from them lists no damage group.
 */
function sideGroups(kit: Kit, part: "danger" | "tools" | "all"): SideGroup[] {
  const items = (g: KindGroup) => kit.groups.find((x) => x.group === g)?.items ?? [];
  const checked = kit.from === "checked";
  if (part === "all") return SIDE_GROUPS.map((g) => ({ group: g, label: KIND_GROUP_WORDS[g], items: items(g) }));
  if (part === "danger")
    return [
      { group: "crowd-control" as const, label: KIND_GROUP_WORDS["crowd-control"], items: items("crowd-control") },
      ...(checked ? [{ group: "power" as const, label: DAMAGE_GROUP_WORDS, items: items("power").map((i) => only(i, isDamage)).filter((i): i is KitItem => !!i) }] : []),
    ];
  return [
    { group: "mobility", label: KIND_GROUP_WORDS.mobility, items: items("mobility") },
    { group: "defence", label: KIND_GROUP_WORDS.defence, items: items("defence") },
    { group: "sustain", label: KIND_GROUP_WORDS.sustain, items: items("sustain") },
    { group: "power", label: EMPOWER_GROUP_WORDS, items: items("power").map((i) => only(i, (c) => !isDamage(c))).filter((i): i is KitItem => !!i) },
  ];
}

/** One side: its groups by kind, or what is missing in words. `source`: whether its layer's line is said under its title (once per champion). */
function KitSide({ side, part, kit, intel, champion, title, subtitle, rows, source = true }: { side: Side; part: "danger" | "tools" | "all"; kit: Kit; intel: ChampionIntelView; champion: ChampionChoice; title: string; subtitle: string; rows: ReadonlySet<string>; source?: boolean }) {
  const look = SIDE_LOOK[side];
  const Icon = look.icon;
  const missing = kit.noAbilities ? missingAbilitiesWords(kit.name, kit.unreadable).title : null;
  const groups = sideGroups(kit, part);
  const filled = groups.filter((g) => g.items.length);
  const empty = groups.filter((g) => !g.items.length).map((g) => g.label);
  return (
    // A tint and a bar at its start in the side's colour; under 9rem (a 320px phone at twice the text
    // size) a narrower padding and no icon before the label, so the label and the chips keep whole.
    <section className={cn("min-w-0 border-l-2 px-3 py-2 @max-[9rem]/kits:px-2", look.box)} aria-label={`${title}: ${subtitle}`} data-testid={`assembled-${side}`} data-from={kit.from} data-champion={champion.id}>
      <h3 className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm [overflow-wrap:anywhere]">
        <Icon className={cn("h-4 w-4 shrink-0 @max-[9rem]/kits:hidden", look.text)} aria-hidden />
        <span className={cn("font-semibold", look.text)}>{title}</span>
        <span className="font-normal text-fg-muted">{subtitle}</span>
      </h3>
      {missing || !source ? null : <SideSource intel={intel} kit={kit} />}
      {missing ? (
        <p className="mt-1.5 text-sm text-fg-muted" data-testid="assembled-missing">
          {missing}
        </p>
      ) : kit.from === "none" ? (
        <p className="mt-1.5 text-sm text-fg-muted" data-testid="assembled-no-facts">
          {noFactsWords(kit.name)}
        </p>
      ) : (
        <>
          {filled.length ? (
            <ul className="mt-1.5 space-y-1.5 pointer-coarse:space-y-3">
              {filled.map((group) => {
                const GroupIcon = GROUP_LOOK[group.group].icon;
                return (
                  <li key={group.label} data-testid="assembled-group" data-group={group.group}>
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-fg-muted">
                      <GroupIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      {group.label}
                    </p>
                    <ul className="mt-1 space-y-1 pointer-coarse:mt-1.5 pointer-coarse:space-y-3">
                      {group.items.map((item) => (
                        <KitLine key={item.slot} item={item} champion={champion} rows={rows} />
                      ))}
                    </ul>
                  </li>
                );
              })}
            </ul>
          ) : null}
          {/* The groups with nothing in them, named once: beside abilities whose facts are hidden, only
              what holds outside them (a hidden fact may be of these kinds). */}
          {empty.length ? (
            <p className="mt-1.5 text-xs text-fg-subtle" data-testid="assembled-none">
              {emptyGroupsWords(
                empty,
                kit.from,
                kit.hidden.map((h) => SLOT_NAMES[h.slot]),
              )}
            </p>
          ) : null}
        </>
      )}
      {kit.hidden.length && source ? (
        <ul className="mt-1.5 space-y-0.5" data-testid="assembled-hidden">
          {kit.hidden.map((h) => (
            <li key={h.slot} className="flex items-start gap-1.5 text-xs text-fg-muted">
              <History className="mt-px h-3.5 w-3.5 shrink-0 text-warn" aria-hidden />
              <span>{hiddenRiotTextWords(h.count, h.because, SLOT_NAMES[h.slot], h.disagreements)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/** Riot's own first tip against an enemy, verbatim and attributed; nothing where Riot publishes none or the tips are not stored yet (the full reference says which). */
function RiotTip({ intel }: { intel: ChampionIntelView }) {
  const tip = intel.tips?.enemy[0];
  if (!tip) return null;
  return (
    <figure className="min-w-0" data-testid="assembled-riot-tip" data-champion={intel.champion.id}>
      <figcaption className="flex flex-wrap items-baseline gap-x-2 text-xs">
        <span className="inline-flex items-center gap-1.5 font-semibold text-fg-muted">
          <Quote className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {riotTipHeadingWords(intel.champion.name, 1)}
        </span>
        <span className="text-fg-subtle" data-testid="riot-tips-label">
          {TIP_LABEL}
        </span>
      </figcaption>
      <blockquote className="mt-1 text-sm leading-snug text-fg" data-testid="riot-tip">
        <span aria-hidden>“</span>
        <span data-testid="riot-tip-text">{tip}</span>
        <span aria-hidden>”</span>
      </blockquote>
    </figure>
  );
}

/**
 * The lane reference for your champion against the enemy, when no curated briefing shows.
 * `rows`: the champions whose tiles are on the page, for the keys' links. `curatedForYou`: the
 * curated matchups that do exist for your champion, linked (the pair on the page left out).
 * `briefingHidden`: the pair has a curated briefing, hidden above (too old, or every part resting on
 * an ability Riot changed): said as that, never as "no curated briefing". `levels`: the level
 * changes recorded for the champions on the page, first in the card. In the bot lane
 * (`enemy2Intel`, `allyIntel`) the card names all four, leads with both enemies' dangers, and keeps
 * every champion's other tools one press away.
 */
export function AssembledReference({ you, enemy, enemyIntel, yourIntel, enemy2Intel = null, allyIntel = null, curatedForYou, rows, briefingHidden = false, levels }: { you: ChampionChoice; enemy: ChampionChoice; enemyIntel: ChampionIntelView; yourIntel: ChampionIntelView | null; enemy2Intel?: ChampionIntelView | null; allyIntel?: ChampionIntelView | null; curatedForYou: readonly ChampionChoice[]; rows: ReadonlySet<string>; briefingHidden?: boolean; levels?: React.ReactNode }) {
  const mirror = you.id === enemy.id;
  // The other curated pairs for your champion: a link to the pair already on the page leads nowhere.
  const others = curatedForYou.filter((c) => c.id !== enemy.id);
  const duo = !!enemy2Intel || !!allyIntel;
  const yours = lineupWords([you.name, ...(allyIntel ? [allyIntel.champion.name] : [])]);
  const theirs = lineupWords([enemy.name, ...(enemy2Intel ? [enemy2Intel.champion.name] : [])]);
  const enemies = [enemyIntel, ...(enemy2Intel ? [enemy2Intel] : [])];
  const allies = [...(yourIntel && !mirror ? [yourIntel] : []), ...(allyIntel ? [allyIntel] : [])];
  const tips = enemies.filter((i) => i.tips?.enemy.length);
  const danger = (i: ChampionIntelView) => <KitSide key={`danger-${i.champion.id}`} side="danger" part="danger" kit={kitOf(i)} intel={i} champion={i.champion} title={DANGER_TITLE} subtitle={dangerLineWords(i.champion.name)} rows={rows} />;
  // A champion with no facts, or no abilities stored, says so once, on its danger or tools side: no second side repeats it.
  const listed = (i: ChampionIntelView) => kitOf(i).from !== "none" && !kitOf(i).noAbilities;
  const tools = (i: ChampionIntelView) => <KitSide key={`tools-${i.champion.id}`} side="tools" part="tools" kit={kitOf(i)} intel={i} champion={i.champion} title={OTHER_TOOLS_TITLE} subtitle={otherToolsWords(i.champion.name)} rows={rows} source={false} />;
  const mine = (i: ChampionIntelView) => <KitSide key={`yours-${i.champion.id}`} side="yours" part="all" kit={kitOf(i)} intel={i} champion={i.champion} title={yourToolsTitleWords(i.champion.name)} subtitle="by kind" rows={rows} />;
  return (
    <Panel className="panel-featured overflow-hidden" data-testid="matchup-assembled" data-briefing-hidden={briefingHidden ? "" : undefined}>
      {/* The title, where the card comes from in one quiet line (the layer and its tier, the curated
          pairs of your champion where there are any), then the sentences that say what it is. */}
      <header className="space-y-1 border-b border-border px-3 py-1.5 sm:px-4" data-testid="matchup-no-briefing">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-lg font-semibold leading-tight text-fg">
            {LANE_REFERENCE_TITLE}
            <span className="sr-only">: {`${yours} vs ${theirs}`}</span>
          </h2>
          <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-fg-muted">
            <span className="inline-flex items-center gap-1" data-testid="matchup-layer" data-layer="assembled">
              <Layers className="h-3.5 w-3.5 shrink-0 text-fg-subtle" aria-hidden />
              {ASSEMBLED_TITLE}
            </span>
            <span aria-hidden>·</span>
            {/* Riot's data: each side whose facts are a champion's checked notes says so under its own title. */}
            <TierLabel className="text-xs text-fg-muted">Riot&apos;s data</TierLabel>
          </p>
          <CuratedLinks you={you} enemies={others} label={`Curated for ${you.name}:`} className="text-xs" />
        </div>
        <p className="text-sm text-fg-muted">
          <span className="font-medium text-fg" data-testid="matchup-assembled-why">
            {briefingHidden ? briefingHiddenAboveWords(you.name, enemy.name) : noBriefingWords(yours, theirs)}
          </span>{" "}
          <span data-testid="matchup-assembled-label">{briefingHidden ? ASSEMBLED_IN_PLACE_WORDS : assembledWords(yours, theirs, duo)}</span>
        </p>
      </header>
      <div className="@container/kits space-y-2.5 px-3 py-2.5 sm:px-4">
        {levels}
        {mirror ? (
          <KitSide side="both" part="all" kit={kitOf(enemyIntel)} intel={enemyIntel} champion={enemy} title="Both sides" subtitle={dangerSideWords(enemy.name)} rows={rows} />
        ) : duo ? (
          <>
            {/* The bot lane: both enemies' dangers side by side; every champion's other tools one press away. */}
            <div className={cn("grid gap-3", enemies.length > 1 && "@min-[36rem]/kits:grid-cols-2")} data-sides={enemies.length}>
              {enemies.map(danger)}
            </div>
            <Fold variant="inline" tone="fg" testId="assembled-duo-tools" summary={<span>{duoToolsWords([...enemies, ...allies].map((i) => i.champion.name))}</span>}>
              <div className="grid gap-3 @min-[36rem]/kits:grid-cols-2">
                {enemies.filter(listed).map(tools)}
                {allies.map(mine)}
              </div>
            </Fold>
          </>
        ) : (
          // The enemy's danger and its other tools in one column, your champion's tools beside them from 36rem.
          <div className={cn("grid gap-3", allies.length && "@min-[36rem]/kits:grid-cols-2")} data-sides={1 + allies.length}>
            <div className="min-w-0 space-y-2.5">
              {danger(enemyIntel)}
              {listed(enemyIntel) ? tools(enemyIntel) : null}
            </div>
            {allies.map(mine)}
          </div>
        )}
        {tips.length ? (
          <div className={cn("grid gap-3 border-t border-border pt-2.5", tips.length > 1 && "@min-[36rem]/kits:grid-cols-2")} data-testid="assembled-riot-tips">
            {tips.map((i) => (
              <RiotTip key={i.champion.id} intel={i} />
            ))}
          </div>
        ) : null}
      </div>
    </Panel>
  );
}
