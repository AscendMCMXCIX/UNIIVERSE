import { Fragment } from "react";
import { Crosshair, History, Swords, TriangleAlert } from "lucide-react";
import type { ChampionChoice, ChampionIntelView } from "@/domain/matchup-intel/types";
import { SIDE_GROUPS, kitOf, type Kit, type KitItem } from "@/domain/matchup-intel/kit";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import { cn } from "@/lib/cn";
import { CuratedLine, publicPatchOf } from "./ability-list";
import { AbilityRefLink } from "./ability-ref-link";
import { CuratedLinks } from "./briefing";
import { CHIP_ROWS, ConditionalNote, FactChipView, GROUP_LOOK } from "./fact-chip";
import { ASSEMBLED_IN_PLACE_WORDS, ASSEMBLED_TITLE, KIND_GROUP_WORDS, RIOT_TEXT_LABEL, SLOT_NAMES, abilityAnchor, assembledWords, briefingHiddenAboveWords, cooldownSourceWords, cooldownsFromWords, dangerSideWords, hiddenRiotTextWords, missingAbilitiesWords, noBriefingWords, noFactsWords, noneRecordedWords, tightCooldownWords, toolsSideWords } from "./wording";

/*
  The assembled reference (L5; docs/MATCHUP_INTEL.md, "The assembled reference"), for a pair whose
  curated briefing does not show (none exists, or it is hidden): each champion's own facts set side
  by side, grouped by kind, the enemy's as the danger side and yours as the opportunity side (the
  owner's decision, 18 Nov 2026). Group, never judge: no threat or opportunity is chosen by code,
  nothing is ranked, and no sentence joins the two kits. Each group lists the abilities with a fact
  of its kind in slot order, each with its chips (which open the clause or source they rest on) and,
  the first time the ability appears on its side, its base cooldown from the tile's own line; a
  group with none says so in fixed words, never "none". Its label says every time that it was put
  together from each champion's facts and that no person has checked the pair; above it, whether
  the pair has no curated briefing yet or has one that is hidden. Each side names its layer under its
  subtitle, as the ability panels do: the checked notes' line (when they were checked, not re-checked
  for a later patch, changed or too old), or the label of the facts from Riot's text, and once for the
  side where its cooldown numbers are Riot's ("Cooldowns: Riot's data, not reviewed"). A line whose
  ability Riot changed after its notes were checked is flagged, as its tile is, and a number from
  elsewhere than the side's says where it is from. A fact from Riot's text keeps its qualifier and its
  conditional marker on its chip here too, and where Riot's two texts differ the ability's line in that
  group says so ("Riot's texts differ"), opening both quotes.

  On a touch screen each chip and key reaches 44px (touch-target): the lines and the rows of chips
  stand far enough apart that no one's area covers another's box (12px between rows, 6px between
  chips), so a tap lands on what was tapped.
*/

/**
 * A cooldown per rank, tight ("13/12.5/12/11.5/11 s"), that breaks only after a slash: a break
 * allowed after each slash (wbr), and none anywhere else (its line sets overflow-wrap back to normal,
 * where the page's container lets a long word break anywhere), so a narrow line never splits "11"
 * into "1" and "1 s"; the last number keeps its unit by a no-break space.
 */
function TightCooldown({ words }: { words: string }) {
  const values = words.split("/");
  return (
    <>
      {values.map((v, i) => (
        <Fragment key={i}>
          {v}
          {i < values.length - 1 ? (
            <>
              /<wbr />
            </>
          ) : null}
        </Fragment>
      ))}
    </>
  );
}

/** Where one of a champion's cooldown lines comes from, as its tile says it (cooldownSourceWords). */
function sourceOf(intel: ChampionIntelView, item: Pick<KitItem, "cooldown" | "freshness">): string | null {
  return cooldownSourceWords(item.cooldown, { freshness: item.freshness, checkedPatch: intel.curated?.verified.patch ?? null, dataPatch: publicPatchOf(intel.dataVersion), notRecheckedFor: intel.curated?.recheck?.patch ?? null });
}

/** What a line taken from a champion's checked notes says of its source ("Checked on patch 26.22 · not re-checked for 26.23"): its side's line already says it. */
const checkedSourceOf = (intel: ChampionIntelView) => sourceOf(intel, { cooldown: { kind: "per-rank", seconds: [1], starts: null, from: "curated" }, freshness: null });

/**
 * One ability's line in a group: its key (a link to its tile), its chips of that kind, its base
 * cooldown when there is a number and `withCooldown` (its first line on its side), and where that
 * number is from when it is not the side's (`ownSource`); flagged when Riot changed the ability after
 * its notes were checked.
 */
function KitLine({ item, champion, rows, withCooldown, ownSource }: { item: KitItem; champion: ChampionChoice; rows: ReadonlySet<string>; withCooldown: boolean; ownSource: string | null }) {
  const cd = withCooldown ? tightCooldownWords(item.cooldown) : null;
  const key = (
    <>
      <span aria-hidden>{SLOT_NAMES[item.slot]}</span>
      <span className="sr-only">{`${SLOT_NAMES[item.slot]}: ${item.ability} (${champion.name})`}</span>
    </>
  );
  return (
    // The key, then the chips and the cooldown flowing beside it: one line where they fit; where they
    // do not, a chip or the cooldown moves to the next line whole (the cooldown at its end), rather
    // than squeezing the chips' words into a narrow column. Under 16rem (a phone at a large text
    // size) the chips go under the key unless 8rem are left beside it. The key is as tall as the
    // chips (21px, its target 25px), so a line is the chips' height and a long side keeps one screen.
    <li className="flex flex-wrap items-start gap-x-1.5 gap-y-0.5 pointer-coarse:gap-y-3 @min-[16rem]/kits:grid @min-[16rem]/kits:grid-cols-[auto_minmax(0,1fr)]" data-testid="assembled-item" data-slot={item.slot} data-flagged={item.flagged ? "" : undefined}>
      {rows.has(champion.id) ? (
        <AbilityRefLink anchor={abilityAnchor(champion.id, item.slot)} size="chip">
          {key}
        </AbilityRefLink>
      ) : (
        <span className="inline-flex items-center rounded-full border border-border-strong bg-surface-2 px-2 py-0.5 text-xs font-medium leading-tight text-fg-muted">{key}</span>
      )}
      <span className={cn("flex min-w-0 flex-[1_1_8rem] flex-wrap items-start", CHIP_ROWS)}>
        {item.chips.map((c, i) => (
          <FactChipView key={i} chip={c} champion={champion.name} ability={item.ability} testId="assembled-chip" />
        ))}
        {item.flagged ? (
          <Badge tone="warn" title="Riot's data for this ability changed after the curated notes were checked: they may be out of date">
            <span data-testid="assembled-flagged">Changed since the check</span>
          </Badge>
        ) : null}
        {cd ? (
          // The ability's own base cooldown per rank (Riot's numbers or the checked ones, as its tile's line).
          <span className="ml-auto pl-1 pt-0.5 text-xs tabular-nums text-fg-muted [overflow-wrap:normal]" data-testid="assembled-cooldown">
            <TightCooldown words={cd} />
            {ownSource ? (
              <span className="text-2xs text-fg-subtle" data-testid="assembled-cooldown-source">
                {" · "}
                {ownSource}
              </span>
            ) : null}
          </span>
        ) : null}
        {/* Where any of these facts is conditional: the owner's marker, once, on a row of its own, naming the chips it marks. */}
        <ConditionalNote chips={item.chips} testId="assembled-conditional" className="basis-full" />
      </span>
    </li>
  );
}

/** The index in SIDE_GROUPS of the first group that lists an ability: its cooldown is given there, once for its side. */
function firstGroupOf(kit: Kit, slot: KitItem["slot"]): number {
  return SIDE_GROUPS.findIndex((g) => kit.groups.find((x) => x.group === g)?.items.some((i) => i.slot === slot));
}

/**
 * Where a side's facts come from, under its subtitle: the checked notes' line (CuratedLine: when they
 * were checked, not re-checked, changed, too old), or the label of the facts from Riot's text. Null
 * for a champion with neither (the side says so in its place).
 */
function SideSource({ intel, kit }: { intel: ChampionIntelView; kit: Kit }) {
  if (kit.from === "none") return null;
  return (
    <p className="mt-0.5 text-xs text-fg-muted" data-testid="assembled-source">
      {kit.from === "checked" ? <CuratedLine intel={intel} /> : <span data-testid="assembled-riot-text-label">{RIOT_TEXT_LABEL}</span>}
    </p>
  );
}

/** One side: its kit by kind, or what is missing in words. */
function KitSide({ side, kit, intel, champion, title, subtitle, rows }: { side: "danger" | "opportunity" | "both"; kit: Kit; intel: ChampionIntelView; champion: ChampionChoice; title: string; subtitle: string; rows: ReadonlySet<string> }) {
  const Icon = side === "danger" ? TriangleAlert : side === "opportunity" ? Crosshair : Swords;
  const missing = kit.noAbilities ? missingAbilitiesWords(kit.name, kit.unreadable).title : null;
  const recorded: "checked" | "riot-text" = kit.from === "checked" ? "checked" : "riot-text";
  // The numbers the side shows (each ability's on its first line), and the source they share: said
  // once for the side; a number from elsewhere says its own (a checked champion's ability whose line
  // is Riot's, once Riot changed it after the check).
  const shown = SIDE_GROUPS.flatMap((g, gi) => (kit.groups.find((x) => x.group === g)?.items ?? []).filter((item) => firstGroupOf(kit, item.slot) === gi && tightCooldownWords(item.cooldown) !== null));
  const sources = shown.map((item) => sourceOf(intel, item));
  // A checked side's line names its notes' check: a number taken from them needs no word of its own.
  const common = kit.from === "checked" ? checkedSourceOf(intel) : sources.length && sources.every((s) => s !== null && s === sources[0]) ? sources[0]! : null;
  return (
    // Under 9rem (a 320px phone at twice the text size) a narrower padding and no icon before the
    // label, so the longest label (Opportunity) and chip words keep whole.
    <section className={cn("min-w-0 px-3 py-2.5 @max-[9rem]/kits:px-2", side === "danger" ? "bg-warn/5" : side === "opportunity" ? "bg-good/5" : "")} aria-label={`${title}: ${subtitle}`} data-testid={`assembled-${side}`} data-from={kit.from}>
      <h3 className={cn("label-caps flex items-center gap-1.5 [overflow-wrap:anywhere]", side === "danger" ? "text-warn" : side === "opportunity" ? "text-good" : "text-fg-muted")}>
        <Icon className="h-4 w-4 shrink-0 @max-[9rem]/kits:hidden" aria-hidden />
        {title}
      </h3>
      {/* The subtitle, and at the row's end, over the cooldown numbers' column, where they come from
          where the side's notes do not date them ("Cooldowns: Riot's data, not reviewed"), once. */}
      <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs text-fg-muted">
        <span>{subtitle}</span>
        {!missing && kit.from !== "checked" && common ? <span data-testid="assembled-cooldowns-source">{cooldownsFromWords(common)}</span> : null}
      </p>
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
        // The groups 2px apart, and their lines indented under their label only where a side is wide
        // (the panel 44rem or more: 1920 x 950 and up); in a narrower one (1440 x 900, a phone) the lines
        // take the side's whole width, so a long side (K'Sante's 15 facts from Riot's text) keeps one screen.
        <ul className="mt-1.5 space-y-0.5 pointer-coarse:space-y-1.5">
          {SIDE_GROUPS.map((g, gi) => {
            const group = kit.groups.find((x) => x.group === g)!;
            const GroupIcon = GROUP_LOOK[g].icon;
            return (
              <li key={g} data-testid="assembled-group" data-group={g}>
                <p className="flex flex-wrap items-center gap-x-1.5 text-xs font-medium text-fg-muted">
                  <GroupIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  {KIND_GROUP_WORDS[g]}
                  {group.items.length ? null : (
                    <span className="font-normal text-fg-subtle" data-testid="assembled-none">
                      · {noneRecordedWords(recorded)}
                    </span>
                  )}
                </p>
                {group.items.length ? (
                  <ul className="mt-0.5 space-y-0.5 pl-5 pointer-coarse:mt-1.5 pointer-coarse:space-y-3 @max-[44rem]/kits:pl-0">
                    {group.items.map((item) => {
                      const withCooldown = firstGroupOf(kit, item.slot) === gi;
                      const own = withCooldown ? sourceOf(intel, item) : null;
                      return <KitLine key={item.slot} item={item} champion={champion} rows={rows} withCooldown={withCooldown} ownSource={own !== null && own !== common ? own : null} />;
                    })}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
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

/**
 * The assembled reference for your champion against the enemy, when no curated briefing shows.
 * `rows`: the champions whose tiles are on the page, for the keys' links. `curatedForYou`: the
 * curated matchups that do exist for your champion, linked (the pair on the page left out).
 * `briefingHidden`: the pair has a curated briefing, hidden above (too old, or every part resting on
 * an ability Riot changed): said as that, never as "no curated briefing".
 */
export function AssembledReference({ you, enemy, enemyIntel, yourIntel, curatedForYou, rows, briefingHidden = false }: { you: ChampionChoice; enemy: ChampionChoice; enemyIntel: ChampionIntelView; yourIntel: ChampionIntelView | null; curatedForYou: readonly ChampionChoice[]; rows: ReadonlySet<string>; briefingHidden?: boolean }) {
  const mirror = you.id === enemy.id;
  const enemyKit = kitOf(enemyIntel);
  const yourKit = yourIntel && !mirror ? kitOf(yourIntel) : null;
  // The other curated pairs for your champion: a link to the pair already on the page leads nowhere.
  const others = curatedForYou.filter((c) => c.id !== enemy.id);
  return (
    <Panel className="overflow-hidden" data-testid="matchup-assembled" data-briefing-hidden={briefingHidden ? "" : undefined}>
      {/* The title, with the curated pairs of your champion at its row's end where there are any, and
          the sentence under them; with none, the sentence beside the title where 20rem are left for
          it, so a long side keeps one screen. */}
      <header className={cn("border-b border-border px-3 py-2", others.length ? "space-y-0.5" : "flex flex-wrap items-baseline gap-x-3 gap-y-0.5")} data-testid="matchup-no-briefing">
        <div className={cn("flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1", !others.length && "shrink-0")}>
          <h2 className="text-sm font-semibold text-fg">
            {ASSEMBLED_TITLE}
            <span className="sr-only">: {`${you.name} vs ${enemy.name}`}</span>
          </h2>
          <CuratedLinks you={you} enemies={others} label={`Curated for ${you.name}:`} className="text-xs" />
        </div>
        <p className={cn("text-xs text-fg-muted", !others.length && "min-w-0 flex-[1_1_20rem]")}>
          <span data-testid="matchup-assembled-why">{briefingHidden ? briefingHiddenAboveWords(you.name, enemy.name) : noBriefingWords(you.name, enemy.name)}</span>{" "}
          <span data-testid="matchup-assembled-label">{briefingHidden ? ASSEMBLED_IN_PLACE_WORDS : assembledWords(you.name, enemy.name)}</span>
        </p>
      </header>
      <div className="@container/kits">
        <div className={cn("grid divide-y divide-border", yourKit && "@min-[40rem]/kits:grid-cols-2 @min-[40rem]/kits:divide-x @min-[40rem]/kits:divide-y-0")}>
          <KitSide side={mirror ? "both" : "danger"} kit={enemyKit} intel={enemyIntel} champion={enemy} title={mirror ? "Both sides" : "Danger"} subtitle={dangerSideWords(enemy.name)} rows={rows} />
          {yourKit && yourIntel ? <KitSide side="opportunity" kit={yourKit} intel={yourIntel} champion={you} title="Opportunity" subtitle={toolsSideWords(you.name)} rows={rows} /> : null}
        </div>
      </div>
    </Panel>
  );
}
