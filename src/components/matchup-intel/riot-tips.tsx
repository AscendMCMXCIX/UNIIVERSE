import { ChevronDown, Quote } from "lucide-react";
import type { ChampionIntelView } from "@/domain/matchup-intel/types";
import { Panel } from "@/components/ui/panel";
import { formatCount } from "@/lib/format";
import { TipsDisclosure } from "./tips-disclosure";

/*
  Riot's own tips (docs/MATCHUP_INTEL.md, "Riot's tips"): each enemy's Data Dragon `enemytips` and
  your side's `allytips`, verbatim, in quotation marks, attributed "Riot's tip (may predate later
  changes)". They are Riot's words, not the page's: exempt from the refused-words list as
  attributed quotes, and held byte-equal to Data Dragon by abilities.test.ts. The first tip per
  enemy shows; the rest, and your side's, fold. A champion Riot gives none says so; a record stored
  before the tips were read says that instead, never that Riot publishes none.

  The evidence from the team's games, and what the page does not have, follow in their own fold
  (evidence-panel.tsx).
*/

export const TIP_LABEL = "Riot's tip (may predate later changes)";

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

function Fold({
  summary,
  children,
  testId,
}: {
  summary: string;
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <details className="group/tips" data-testid={testId}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-xs font-medium text-fg-muted hover:text-fg pointer-fine:min-h-7 [&::-webkit-details-marker]:hidden">
        <span>{summary}</span>
        <ChevronDown
          className="h-3.5 w-3.5 shrink-0 transition-transform group-open/tips:rotate-180 motion-reduce:transition-none"
          aria-hidden
        />
      </summary>
      <div className="space-y-1.5 pb-1">{children}</div>
    </details>
  );
}

/** Why a champion shows no tip of a kind, or null when it has some. */
function noTipWords(
  intel: ChampionIntelView,
  kind: "enemy" | "ally",
): string | null {
  const name = intel.champion.name;
  if (!intel.tips)
    return `${name}: Riot's tips are not stored yet; the next game-data update reads them.`;
  if (!intel.tips[kind].length)
    return `Riot publishes no tip ${kind === "enemy" ? "for playing against" : "for playing"} ${name}.`;
  return null;
}

/** A champion's tips with its name before them: "Against Darius" or "Playing Riven". */
function TipGroup({
  intel,
  kind,
  tips,
}: {
  intel: ChampionIntelView;
  kind: "enemy" | "ally";
  tips: readonly string[];
}) {
  return (
    <div
      className="space-y-1"
      data-testid={`riot-tips-${kind}`}
      data-champion={intel.champion.id}
    >
      <p className="text-xs font-semibold text-fg-muted">{`${kind === "enemy" ? "Against" : "Playing"} ${intel.champion.name}`}</p>
      {tips.map((t, i) => (
        <TipQuote key={i} text={t} />
      ))}
    </div>
  );
}

/**
 * Riot's tips for the enemies (the first of each shown, the rest in one fold) and your side (one
 * fold). Compact, so it fits the one-screen dashboard.
 */
export function RiotTipsPanel({
  enemies,
  yours,
}: {
  enemies: readonly ChampionIntelView[];
  yours: readonly ChampionIntelView[];
}) {
  if (!enemies.length && !yours.length) return null;
  const none = [
    ...enemies.map((i) => noTipWords(i, "enemy")),
    ...yours.map((i) => noTipWords(i, "ally")),
  ].filter((w): w is string => !!w);
  const withEnemyTips = enemies.filter((i) => i.tips?.enemy.length);
  const moreEnemy = withEnemyTips.filter((i) => i.tips!.enemy.length > 1);
  const moreCount = moreEnemy.reduce((n, i) => n + i.tips!.enemy.length - 1, 0);
  const withAllyTips = yours.filter((i) => i.tips?.ally.length);
  const allyCount = withAllyTips.reduce((n, i) => n + i.tips!.ally.length, 0);
  const count =
    enemies.reduce((n, i) => n + (i.tips?.enemy.length ?? 0), 0) + allyCount;
  return (
    <Panel className="px-3 py-1.5" data-testid="matchup-riot-tips">
      <TipsDisclosure
        summary={
          <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
            <span className="flex items-center gap-1.5 text-sm font-semibold text-fg">
              <Quote className="h-3.5 w-3.5 text-fg-subtle" aria-hidden />
              {count ? `Riot's tips (${formatCount(count)})` : "Riot's tips"}
            </span>
            <span className="text-2xs text-fg-subtle" data-testid="riot-tips-label">
              {TIP_LABEL}
            </span>
          </span>
        }
      >
        <div className="space-y-1.5 pb-1">
          {withEnemyTips.map((i) => (
            <TipGroup
              key={`e-${i.champion.id}`}
              intel={i}
              kind="enemy"
              tips={i.tips!.enemy.slice(0, 1)}
            />
          ))}
          {moreCount ? (
            <Fold
              summary={`More of Riot's tips against ${moreEnemy.map((i) => i.champion.name).join(" and ")} (${formatCount(moreCount)})`}
              testId="riot-tips-enemy-more"
            >
              {moreEnemy.map((i) => (
                <TipGroup
                  key={`m-${i.champion.id}`}
                  intel={i}
                  kind="enemy"
                  tips={i.tips!.enemy.slice(1)}
                />
              ))}
            </Fold>
          ) : null}
          {allyCount ? (
            <Fold
              summary={`Riot's tips for playing ${withAllyTips.map((i) => i.champion.name).join(" and ")} (${formatCount(allyCount)})`}
              testId="riot-tips-ally-more"
            >
              {withAllyTips.map((i) => (
                <TipGroup
                  key={`a-${i.champion.id}`}
                  intel={i}
                  kind="ally"
                  tips={i.tips!.ally}
                />
              ))}
            </Fold>
          ) : null}
          {none.map((w) => (
            <p
              key={w}
              className="text-xs text-fg-muted"
              data-testid="riot-tips-none"
            >
              {w}
            </p>
          ))}
        </div>
      </TipsDisclosure>
    </Panel>
  );
}
