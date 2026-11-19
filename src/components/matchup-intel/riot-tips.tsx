import { ChevronDown, Quote } from "lucide-react";
import type { ChampionIntelView } from "@/domain/matchup-intel/types";
import { Panel } from "@/components/ui/panel";
import { formatCount } from "@/lib/format";

/*
  Riot's own tips (docs/MATCHUP_INTEL.md, "Riot's tips"): each enemy's Data Dragon `enemytips` and
  your side's `allytips`, verbatim, in quotation marks, attributed "Riot's tip (may predate later
  changes)". They are Riot's words, not the page's: exempt from the refused-words list as
  attributed quotes, and held byte-equal to Data Dragon by abilities.test.ts. The first tip per
  enemy shows; the rest, and your side's, fold. A champion Riot gives none says so; a record stored
  before the tips were read says that instead, never that Riot publishes none.

  Under them, the evidence this page does not have, said as such ("No high-elo evidence (not
  collected)"): no build, rune or skill order is ever suggested without it.
*/

export const TIP_LABEL = "Riot's tip (may predate later changes)";
export const NO_HIGH_ELO = "No high-elo evidence (not collected)";

function TipQuote({ text }: { text: string }) {
  return (
    <blockquote className="text-sm leading-snug text-fg" data-testid="riot-tip">
      {/* Riot's words between the quotation marks, untouched. */}
      <span aria-hidden>“</span>
      <span data-testid="riot-tip-text">{text}</span>
      <span aria-hidden>”</span>
    </blockquote>
  );
}

function Fold({ summary, children, testId }: { summary: string; children: React.ReactNode; testId: string }) {
  return (
    <details className="group/tips" data-testid={testId}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-xs font-medium text-fg-muted hover:text-fg pointer-fine:min-h-7 [&::-webkit-details-marker]:hidden">
        <span>{summary}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 transition-transform group-open/tips:rotate-180 motion-reduce:transition-none" aria-hidden />
      </summary>
      <div className="space-y-1.5 pb-1">{children}</div>
    </details>
  );
}

/** One champion's tips of one kind: the first shown (`firstShown`), the rest folded; or why there are none. */
function ChampionTips({ intel, kind, firstShown }: { intel: ChampionIntelView; kind: "enemy" | "ally"; firstShown: boolean }) {
  const name = intel.champion.name;
  const tips = intel.tips ? intel.tips[kind] : null;
  const heading = kind === "enemy" ? `Against ${name}` : `Playing ${name}`;
  if (!tips) {
    return (
      <p className="text-xs text-fg-muted" data-testid="riot-tips-none" data-champion={intel.champion.id}>
        {`${heading}: Riot's tips are not stored yet; the next game-data update reads them.`}
      </p>
    );
  }
  if (!tips.length) {
    return (
      <p className="text-xs text-fg-muted" data-testid="riot-tips-none" data-champion={intel.champion.id}>
        {`Riot publishes no tip ${kind === "enemy" ? "for playing against" : "for playing"} ${name}.`}
      </p>
    );
  }
  const [first, ...rest] = tips;
  const all = firstShown ? rest : tips;
  return (
    <div className="space-y-1.5" data-testid={`riot-tips-${kind}`} data-champion={intel.champion.id}>
      <p className="text-xs font-semibold text-fg-muted">{heading}</p>
      {firstShown ? <TipQuote text={first!} /> : null}
      {all.length ? (
        <Fold summary={`${firstShown ? "More of Riot's tips" : "Riot's tips"} (${formatCount(all.length)})`} testId={`riot-tips-${kind}-more`}>
          {all.map((t, i) => (
            <TipQuote key={i} text={t} />
          ))}
        </Fold>
      ) : null}
    </div>
  );
}

/** Riot's tips for the enemies (the first of each shown) and your side (folded), with the evidence the page has not collected. */
export function RiotTipsPanel({ enemies, yours, duo }: { enemies: readonly ChampionIntelView[]; yours: readonly ChampionIntelView[]; duo: boolean }) {
  if (!enemies.length && !yours.length) return null;
  return (
    <Panel className="space-y-2 px-3 py-2" data-testid="matchup-riot-tips">
      <header className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-fg">
          <Quote className="h-3.5 w-3.5 text-fg-subtle" aria-hidden />
          Riot&apos;s tips
        </h2>
        <p className="text-2xs text-fg-subtle" data-testid="riot-tips-label">
          {TIP_LABEL}
        </p>
      </header>
      {enemies.map((i) => (
        <ChampionTips key={`e-${i.champion.id}`} intel={i} kind="enemy" firstShown />
      ))}
      {yours.map((i) => (
        <ChampionTips key={`a-${i.champion.id}`} intel={i} kind="ally" firstShown={false} />
      ))}
      <ul className="space-y-0.5 border-t border-border pt-1.5 text-xs text-fg-muted" data-testid="matchup-evidence">
        <li data-testid="matchup-evidence-high-elo">
          <span className="font-medium text-fg">Runes, items and skill order:</span> {NO_HIGH_ELO}
        </li>
        {duo ? <li data-testid="matchup-evidence-duo">No curated notes for this 2v2</li> : null}
      </ul>
    </Panel>
  );
}
