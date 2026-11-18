import { Crosshair, History, Swords, TriangleAlert } from "lucide-react";
import type { ChampionChoice, ChampionIntelView } from "@/domain/matchup-intel/types";
import { SIDE_GROUPS, kitOf, type Kit, type KitItem } from "@/domain/matchup-intel/kit";
import { Panel } from "@/components/ui/panel";
import { cn } from "@/lib/cn";
import { AbilityRefLink } from "./ability-ref-link";
import { CuratedLinks } from "./briefing";
import { FactChipView, GROUP_LOOK } from "./fact-chip";
import { ASSEMBLED_TITLE, KIND_GROUP_WORDS, SLOT_NAMES, abilityAnchor, assembledWords, dangerSideWords, hiddenRiotTextWords, missingAbilitiesWords, noFactsWords, noneRecordedWords, tightCooldownWords, toolsSideWords } from "./wording";

/*
  The assembled reference (L5; docs/MATCHUP_INTEL.md, "The assembled reference"), for a pair with no
  curated briefing: each champion's own facts set side by side, grouped by kind, the enemy's as the
  danger side and yours as the opportunity side (the owner's decision, 18 Nov 2026). Group, never
  judge: no threat or opportunity is chosen by code, nothing is ranked, and no sentence joins the
  two kits. Each group lists the abilities with a fact of its kind in slot order, each with its
  chips (which open the clause or source they rest on) and its base cooldown from the tile's own
  line; a group with none says so in fixed words, never "none". Its label says every time that it
  was put together from each champion's facts and that no person has checked the pair.
*/

/** One ability's line in a group: its key (a link to its tile), its chips of that kind, and its base cooldown when there is a number. */
function KitLine({ item, champion, rows }: { item: KitItem; champion: ChampionChoice; rows: ReadonlySet<string> }) {
  const cd = tightCooldownWords(item.cooldown);
  const key = (
    <>
      <span aria-hidden>{SLOT_NAMES[item.slot]}</span>
      <span className="sr-only">{`${SLOT_NAMES[item.slot]}: ${item.ability} (${champion.name})`}</span>
    </>
  );
  return (
    // One line where it fits; where it does not (a phone at a large text size) the cooldown moves to
    // the next line, rather than squeezing the chips to nothing.
    <li className="flex flex-wrap items-start gap-x-1.5 gap-y-0.5" data-testid="assembled-item" data-slot={item.slot}>
      {rows.has(champion.id) ? (
        <AbilityRefLink anchor={abilityAnchor(champion.id, item.slot)} size="sm">
          {key}
        </AbilityRefLink>
      ) : (
        <span className="inline-flex min-h-6 items-center rounded-full border border-border-strong bg-surface-2 px-2 text-xs font-medium text-fg-muted">{key}</span>
      )}
      <span className="flex min-w-0 flex-[1_1_8rem] flex-wrap gap-1">
        {item.chips.map((c, i) => (
          <FactChipView key={i} chip={c} champion={champion.name} ability={item.ability} testId="assembled-chip" />
        ))}
      </span>
      {cd ? (
        // The ability's own base cooldown per rank (Riot's numbers or the checked ones, as its tile's line).
        <span className="ml-auto pt-0.5 text-xs tabular-nums text-fg-muted" data-testid="assembled-cooldown">
          {cd}
        </span>
      ) : null}
    </li>
  );
}

/** One side: its kit by kind, or what is missing in words. */
function KitSide({ side, kit, champion, title, subtitle, rows }: { side: "danger" | "opportunity" | "both"; kit: Kit; champion: ChampionChoice; title: string; subtitle: string; rows: ReadonlySet<string> }) {
  const Icon = side === "danger" ? TriangleAlert : side === "opportunity" ? Crosshair : Swords;
  const missing = kit.noAbilities ? missingAbilitiesWords(kit.name, false).title : null;
  const recorded: "checked" | "riot-text" = kit.from === "checked" ? "checked" : "riot-text";
  return (
    <section className={cn("min-w-0 px-3 py-2.5", side === "danger" ? "bg-warn/5" : side === "opportunity" ? "bg-good/5" : "")} aria-label={`${title}: ${subtitle}`} data-testid={`assembled-${side}`} data-from={kit.from}>
      <h3 className={cn("label-caps flex items-center gap-1.5", side === "danger" ? "text-warn" : side === "opportunity" ? "text-good" : "text-fg-muted")}>
        <Icon className="h-4 w-4 shrink-0" aria-hidden />
        {title}
      </h3>
      <p className="text-xs text-fg-muted">{subtitle}</p>
      {missing ? (
        <p className="mt-1.5 text-sm text-fg-muted">{missing}</p>
      ) : kit.from === "none" ? (
        <p className="mt-1.5 text-sm text-fg-muted" data-testid="assembled-no-facts">
          {noFactsWords(kit.name)}
        </p>
      ) : (
        <ul className="mt-1.5 space-y-1">
          {SIDE_GROUPS.map((g) => {
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
                  <ul className="mt-0.5 space-y-0.5 pl-5">
                    {group.items.map((item) => (
                      <KitLine key={item.slot} item={item} champion={champion} rows={rows} />
                    ))}
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
              <span>{hiddenRiotTextWords(h.count, h.because, SLOT_NAMES[h.slot])}</span>
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
 * curated matchups that do exist for your champion, linked.
 */
export function AssembledReference({ you, enemy, enemyIntel, yourIntel, curatedForYou, rows }: { you: ChampionChoice; enemy: ChampionChoice; enemyIntel: ChampionIntelView; yourIntel: ChampionIntelView | null; curatedForYou: readonly ChampionChoice[]; rows: ReadonlySet<string> }) {
  const mirror = you.id === enemy.id;
  const enemyKit = kitOf(enemyIntel);
  const yourKit = yourIntel && !mirror ? kitOf(yourIntel) : null;
  return (
    <Panel className="overflow-hidden" data-testid="matchup-assembled">
      <header className="space-y-0.5 border-b border-border px-3 py-2" data-testid="matchup-no-briefing">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className="text-sm font-semibold text-fg">
            {ASSEMBLED_TITLE}
            <span className="sr-only">: {`${you.name} vs ${enemy.name}`}</span>
          </h2>
          <CuratedLinks you={you} enemies={curatedForYou} label={`Curated for ${you.name}:`} className="text-xs" />
        </div>
        <p className="text-xs text-fg-muted">
          <span>
            No curated briefing for {you.name} vs {enemy.name} yet.
          </span>{" "}
          <span data-testid="matchup-assembled-label">{assembledWords(you.name, enemy.name)}</span>
        </p>
      </header>
      <div className="@container/kits">
        <div className={cn("grid divide-y divide-border", yourKit && "@min-[40rem]/kits:grid-cols-2 @min-[40rem]/kits:divide-x @min-[40rem]/kits:divide-y-0")}>
          <KitSide side={mirror ? "both" : "danger"} kit={enemyKit} champion={enemy} title={mirror ? "Both sides" : "Danger"} subtitle={dangerSideWords(enemy.name)} rows={rows} />
          {yourKit ? <KitSide side="opportunity" kit={yourKit} champion={you} title="Opportunity" subtitle={toolsSideWords(you.name)} rows={rows} /> : null}
        </div>
      </div>
    </Panel>
  );
}
