import { TierLabel } from "./evidence-panel";
import { ChangedBadge } from "./changed-badge";
import { Crosshair, History, Layers, Quote, Swords, TriangleAlert } from "lucide-react";
import type { ChampionChoice, ChampionIntelView } from "@/domain/matchup-intel/types";
import { SIDE_GROUPS, kitOf, type Kit, type KitItem } from "@/domain/matchup-intel/kit";
import { Fold } from "@/components/ui/fold";
import { Panel } from "@/components/ui/panel";
import { cn } from "@/lib/cn";
import { CuratedLine } from "./ability-list";
import { AbilityRefLink } from "./ability-ref-link";
import { CuratedLinks } from "./briefing";
import { CHIP_ROWS, ConditionalNote, FactChipView, GROUP_LOOK } from "./fact-chip";
import { TIP_LABEL } from "./riot-tips";
import { ASSEMBLED_IN_PLACE_WORDS, ASSEMBLED_TITLE, KIND_GROUP_WORDS, LANE_REFERENCE_TITLE, RIOT_TEXT_LABEL, SLOT_NAMES, abilityAnchor, assembledWords, briefingHiddenAboveWords, dangerSideWords, duoToolsWords, emptyGroupsWords, hiddenRiotTextWords, missingAbilitiesWords, noBriefingWords, noFactsWords, riotTipHeadingWords, toolsSideWords } from "./wording";

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
        {/* Where any of these facts is conditional: the owner's marker, once, on a row of its own, naming the chips it marks. */}
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

type Side = "danger" | "opportunity" | "both";

const SIDE_LOOK: Record<Side, { icon: typeof TriangleAlert; text: string; box: string }> = {
  danger: { icon: TriangleAlert, text: "text-warn", box: "border-warn/70 bg-warn/5" },
  opportunity: { icon: Crosshair, text: "text-good", box: "border-good/70 bg-good/5" },
  both: { icon: Swords, text: "text-fg-muted", box: "border-border-strong" },
};

/** One side: its kit by kind, or what is missing in words. */
function KitSide({ side, kit, intel, champion, title, subtitle, rows }: { side: Side; kit: Kit; intel: ChampionIntelView; champion: ChampionChoice; title: string; subtitle: string; rows: ReadonlySet<string> }) {
  const look = SIDE_LOOK[side];
  const Icon = look.icon;
  const missing = kit.noAbilities ? missingAbilitiesWords(kit.name, kit.unreadable).title : null;
  const groups = SIDE_GROUPS.map((g) => kit.groups.find((x) => x.group === g)!).filter((g) => !!g);
  const filled = groups.filter((g) => g.items.length);
  const empty = groups.filter((g) => !g.items.length).map((g) => g.group);
  return (
    // A tint and a bar at its start in the side's colour; under 9rem (a 320px phone at twice the text
    // size) a narrower padding and no icon before the label, so the label and the chips keep whole.
    <section className={cn("min-w-0 border-l-2 px-3 py-2.5 @max-[9rem]/kits:px-2", look.box)} aria-label={`${title}: ${subtitle}`} data-testid={`assembled-${side}`} data-from={kit.from}>
      <h3 className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm [overflow-wrap:anywhere]">
        <Icon className={cn("h-4 w-4 shrink-0 @max-[9rem]/kits:hidden", look.text)} aria-hidden />
        <span className={cn("font-semibold", look.text)}>{title}</span>
        <span className="font-normal text-fg-muted">{subtitle}</span>
      </h3>
      {missing ? null : <SideSource intel={intel} kit={kit} />}
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
            <ul className="mt-2 space-y-2 pointer-coarse:space-y-3">
              {filled.map((group) => {
                const GroupIcon = GROUP_LOOK[group.group].icon;
                return (
                  <li key={group.group} data-testid="assembled-group" data-group={group.group}>
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-fg-muted">
                      <GroupIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      {KIND_GROUP_WORDS[group.group]}
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
            <p className="mt-2 text-xs text-fg-subtle" data-testid="assembled-none">
              {emptyGroupsWords(
                empty,
                kit.from,
                kit.hidden.map((h) => SLOT_NAMES[h.slot]),
              )}
            </p>
          ) : null}
        </>
      )}
      {kit.hidden.length ? (
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

/** One side of the card: whose kit, and how it is named. */
export interface AssembledSide {
  side: Side;
  intel: ChampionIntelView;
}

/**
 * The lane reference for your champion against the enemy, when no curated briefing shows.
 * `rows`: the champions whose tiles are on the page, for the keys' links. `curatedForYou`: the
 * curated matchups that do exist for your champion, linked (the pair on the page left out).
 * `briefingHidden`: the pair has a curated briefing, hidden above (too old, or every part resting on
 * an ability Riot changed): said as that, never as "no curated briefing". In the bot lane
 * (`enemy2Intel`, `allyIntel`) both enemies' kits are danger sides and both of your duo's opportunity
 * sides: the enemies' first, two to four side by side as the card has room.
 */
export function AssembledReference({ you, enemy, enemyIntel, yourIntel, enemy2Intel = null, allyIntel = null, curatedForYou, rows, briefingHidden = false }: { you: ChampionChoice; enemy: ChampionChoice; enemyIntel: ChampionIntelView; yourIntel: ChampionIntelView | null; enemy2Intel?: ChampionIntelView | null; allyIntel?: ChampionIntelView | null; curatedForYou: readonly ChampionChoice[]; rows: ReadonlySet<string>; briefingHidden?: boolean; /** Kept for callers of the bot lane's earlier layout: the card lays its sides out by its own width. */ duo?: boolean }) {
  const mirror = you.id === enemy.id;
  // The other curated pairs for your champion: a link to the pair already on the page leads nowhere.
  const others = curatedForYou.filter((c) => c.id !== enemy.id);
  const sides: Array<{ side: Side; intel: ChampionIntelView; title: string; subtitle: string }> = [
    { side: mirror ? "both" : "danger", intel: enemyIntel, title: mirror ? "Both sides" : "Danger", subtitle: dangerSideWords(enemy.name) },
    ...(enemy2Intel ? [{ side: "danger" as const, intel: enemy2Intel, title: "Danger", subtitle: dangerSideWords(enemy2Intel.champion.name) }] : []),
    ...(yourIntel && !mirror ? [{ side: "opportunity" as const, intel: yourIntel, title: "Opportunity", subtitle: toolsSideWords(you.name) }] : []),
    ...(allyIntel ? [{ side: "opportunity" as const, intel: allyIntel, title: "Opportunity", subtitle: toolsSideWords(allyIntel.champion.name) }] : []),
  ];
  const tips = [enemyIntel, ...(enemy2Intel ? [enemy2Intel] : [])].filter((i) => i.tips?.enemy.length);
  // In the bot lane the card leads with both enemies' kits; your duo's tools are one press away under
  // them (the owner's "your duo folded"), side by side as the enemies' are.
  const duo = !!enemy2Intel || !!allyIntel;
  const shown = duo ? sides.filter((s) => s.side !== "opportunity") : sides;
  const folded = duo ? sides.filter((s) => s.side === "opportunity") : [];
  const side = (s: (typeof sides)[number]) => <KitSide key={`${s.side}-${s.intel.champion.id}`} side={s.side} kit={kitOf(s.intel)} intel={s.intel} champion={s.intel.champion} title={s.title} subtitle={s.subtitle} rows={rows} />;
  return (
    <Panel className="overflow-hidden" data-testid="matchup-assembled" data-briefing-hidden={briefingHidden ? "" : undefined}>
      {/* The title, where the card comes from in one quiet line (the layer and its tier, the curated
          pairs of your champion where there are any), then the sentences that say what it is. */}
      <header className="space-y-1 border-b border-border px-3 py-2 sm:px-4" data-testid="matchup-no-briefing">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-lg font-semibold leading-tight text-fg">
            {LANE_REFERENCE_TITLE}
            <span className="sr-only">: {`${you.name} vs ${enemy.name}`}</span>
          </h2>
          <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-fg-muted">
            <span className="inline-flex items-center gap-1">
              <Layers className="h-3.5 w-3.5 shrink-0 text-fg-subtle" aria-hidden />
              {ASSEMBLED_TITLE}
            </span>
            <span aria-hidden>·</span>
            {/* Riot's data: each side whose facts are a champion's checked notes says so under its own title. */}
            <TierLabel className="text-xs">Riot&apos;s data</TierLabel>
          </p>
          <CuratedLinks you={you} enemies={others} label={`Curated for ${you.name}:`} className="text-xs" />
        </div>
        <p className="text-sm text-fg-muted">
          <span className="font-medium text-fg" data-testid="matchup-assembled-why">
            {briefingHidden ? briefingHiddenAboveWords(you.name, enemy.name) : noBriefingWords(you.name, enemy.name)}
          </span>{" "}
          <span data-testid="matchup-assembled-label">{briefingHidden ? ASSEMBLED_IN_PLACE_WORDS : assembledWords(you.name, enemy.name)}</span>
        </p>
      </header>
      <div className="@container/kits space-y-3 p-3 sm:px-4">
        {/* Two sides side by side from 36rem. */}
        <div className={cn("grid gap-3", shown.length > 1 && "@min-[36rem]/kits:grid-cols-2")} data-sides={shown.length}>
          {shown.map(side)}
        </div>
        {folded.length ? (
          <Fold variant="inline" tone="fg" testId="assembled-duo-tools" summary={<span>{duoToolsWords(folded.map((s) => s.intel.champion.name))}</span>}>
            <div className={cn("grid gap-3", folded.length > 1 && "@min-[36rem]/kits:grid-cols-2")}>{folded.map(side)}</div>
          </Fold>
        ) : null}
        {tips.length ? (
          <div className={cn("grid gap-3 border-t border-border pt-3", tips.length > 1 && "@min-[36rem]/kits:grid-cols-2")} data-testid="assembled-riot-tips">
            {tips.map((i) => (
              <RiotTip key={i.champion.id} intel={i} />
            ))}
          </div>
        ) : null}
      </div>
    </Panel>
  );
}
