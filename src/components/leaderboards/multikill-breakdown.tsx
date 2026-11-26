import type { ReactNode } from "react";
import { ChampionPortrait, type PortraitChampion } from "@/components/champion-portrait";
import { RoleIcon } from "@/components/role-icon";
import { MULTIKILL_CUSHION } from "@/domain/multikill-score";
import { cn } from "@/lib/cn";
import type { MultikillBreakdown, MultikillRole, MultikillsView } from "@/server/leaderboards/recent-view";

/*
  How a member's multikill score was worked out (docs/TEAM_LEADERBOARDS.md, "The Score breakdown"):
  the Score button's breakdown on the board (BreakdownPopover, the shared detailed breakdown) and,
  short, the top of the player Peek. Every number is the score's own (scoreMember's parts, formatted
  on the server: recent-view.ts); this component works nothing out. Plain markup, no state, nothing
  from src/server at run time: drawn in the board's server component and in the Peek's client tree.

    the score       the score, the place among the ranked players, the games behind it (and, when some
                    season games carry no counts, how many are left out);
    who played      the most-played role over those games with every position's share, and the
                    most-played champions with the position played on them (context: the score
                    compares each game with its own champion and role);
    the arithmetic  points per kind ("Double kills 27 × 2 = 54"), the total earned, the points typical
                    for those games, the +40 adjustment to both with its plain reason, and the final
                    line 100 × (E + 40) ÷ (X + 40) = S, whose terms reproduce the score shown;
    the comparison  where typical comes from and how big it is, how the games were compared (by
                    champion and role, by role, every position, or the team's own games: then said
                    plainly not to be champion- or role-adjusted), the limits (the counting rule,
                    luck, the queues compared together), and why placements differ (two players:
                    above typical for their champions and roles, or, on the team-wide fallback, above
                    the team's typical results; no line claims an adjustment the score has not made).
*/

/** The final line, `100 × (89 + 40) ÷ (71.3 + 40) = 116`: its terms as data attributes too (the Production check recomputes it). */
export function CalculationLine({ calculation, className }: { calculation: MultikillBreakdown["calculation"]; className?: string }) {
  const { earned, expected, cushion, score } = calculation;
  return (
    <p className={cn("text-sm tabular-nums text-fg", className)} data-testid="breakdown-calculation" data-earned={earned} data-expected={expected} data-cushion={cushion} data-score={score}>
      <span aria-hidden>
        100 × ({earned} + {cushion}) ÷ ({expected} + {cushion}) = <span className="text-base font-semibold">{score}</span>
      </span>
      <span className="sr-only">
        100 times {earned} plus {cushion}, divided by {expected} plus {cushion}, makes {score}
      </span>
    </p>
  );
}

/** The points per kind and their total: "Double kills  27 × 2  54". */
export function PointsTable({ breakdown }: { breakdown: MultikillBreakdown }) {
  return (
    <table className="w-full text-sm tabular-nums" data-testid="breakdown-points">
      <caption className="sr-only">Points per multikill</caption>
      <thead className="sr-only">
        <tr>
          <th scope="col">Kind</th>
          <th scope="col">Made × points each</th>
          <th scope="col">Points</th>
        </tr>
      </thead>
      <tbody>
        {breakdown.kinds.map((k) => (
          <tr key={k.key} data-kind={k.key}>
            <th scope="row" className="py-0.5 pr-2 text-left font-normal text-fg-muted">
              {k.label}
            </th>
            <td className="py-0.5 pr-2 text-right text-fg-muted">
              {k.made} × {k.weight}
            </td>
            <td className="py-0.5 text-right text-fg">{k.points}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="border-t border-border/70">
          <th scope="row" colSpan={2} className="pt-1 text-left font-semibold text-fg">
            Earned
          </th>
          <td className="pt-1 text-right font-semibold text-fg" data-testid="breakdown-earned">
            {breakdown.calculation.earned}
          </td>
        </tr>
      </tfoot>
    </table>
  );
}

/** A role's icon, or the tied roles' icons side by side ("Split"), or nothing when no game recorded one; named by `label`. */
export function RoleMark({ role, className }: { role: MultikillRole; className?: string }) {
  if (role.kind === "unknown") return null;
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-px text-fg-muted", className)} data-role-kind={role.kind} data-roles={role.roles.join(" ")}>
      {role.roles.slice(0, 2).map((r) => (
        <RoleIcon key={r} role={r} decorative className={role.kind === "split" ? "size-3.5" : undefined} />
      ))}
      {role.roles.length > 2 ? <span className="text-2xs text-fg-subtle">+{role.roles.length - 2}</span> : null}
    </span>
  );
}

/** Each position played over the score's games: "Top — 85% (51 games)", the games without one last. */
export function RoleRows({ role, className }: { role: MultikillRole; className?: string }) {
  return (
    <ul className={cn("flex flex-col gap-0.5", className)} data-testid="breakdown-roles">
      {role.rows.map((r) => (
        <li key={r.role ?? "unknown"} className="flex min-w-0 items-center gap-2 text-sm">
          <span aria-hidden className="grid size-4 shrink-0 place-items-center text-fg-muted">
            {r.role ? <RoleIcon role={r.role} decorative /> : <span className="text-xs text-fg-subtle">?</span>}
          </span>
          <span className="min-w-0 flex-1 text-fg">{r.label}</span>
          <span className="tabular-nums text-fg">{r.share}</span>
          <span className="w-16 text-right text-xs tabular-nums text-fg-muted">{r.games}</span>
        </li>
      ))}
    </ul>
  );
}

function Section({ title, children, className, testId }: { title: string; children: ReactNode; className?: string; testId?: string }) {
  return (
    <section className={cn("min-w-0", className)} data-testid={testId}>
      <h3 className="mb-1 text-xs font-semibold text-fg">{title}</h3>
      {children}
    </section>
  );
}

/** The score, its place and its games: the breakdown's first line. */
function Summary({ breakdown }: { breakdown: MultikillBreakdown }) {
  return (
    <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5" data-testid="breakdown-summary">
      <p className="text-2xl font-semibold leading-none tabular-nums text-fg" data-testid="breakdown-score">
        {breakdown.score}
        <span className="sr-only"> multikill score</span>
      </p>
      <p className="text-sm text-fg">
        <span data-testid="breakdown-place">{breakdown.place}</span>
        <span aria-hidden className="text-fg-subtle"> · </span>
        <span className="text-fg-muted" data-testid="breakdown-games">
          {breakdown.games}
        </span>
      </p>
      {breakdown.coverage ? (
        <p className="basis-full text-xs text-fg-muted" data-testid="breakdown-coverage">
          {breakdown.coverage}
        </p>
      ) : null}
    </div>
  );
}

/** The arithmetic: points per kind, the typical points, the +40 to both, and the final line. */
function Arithmetic({ breakdown, source }: { breakdown: MultikillBreakdown; source: MultikillsView["source"] }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Section title="Points">
        <PointsTable breakdown={breakdown} />
      </Section>
      <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 text-sm tabular-nums">
        <dt className="text-fg-muted">{source === "team" ? "Typical at the team's rate" : "Typical for these champions and roles"}</dt>
        <dd className="text-right text-fg" data-testid="breakdown-expected">
          {breakdown.calculation.expected}
        </dd>
        <dt className="text-fg-muted">Small-sample adjustment</dt>
        <dd className="text-right text-fg">+{MULTIKILL_CUSHION} to both</dd>
      </dl>
      <p className="text-xs text-fg-muted">Players with fewer games are kept closer to 100 so a few unusually good or bad games have less influence.</p>
      <CalculationLine calculation={breakdown.calculation} className="border-t border-border/70 pt-2" />
    </div>
  );
}

/**
 * The whole breakdown (the Score button's): two columns from a 36rem panel (who played, then the
 * arithmetic), one under the other on a phone's sheet; the comparison and the limits across the foot.
 */
export function MultikillBreakdownBody({ breakdown, board, champions }: { breakdown: MultikillBreakdown; board: Pick<MultikillsView, "source" | "sourceText" | "ruleText">; champions: Readonly<Record<string, PortraitChampion>> }) {
  const champ = (id: string): PortraitChampion => champions[id] ?? { id, name: id, portraitUrl: "" };
  return (
    <div className="@container/bd flex min-w-0 flex-col gap-3" data-testid="multikill-breakdown-body" data-source={board.source}>
      <Summary breakdown={breakdown} />
      <div className="grid min-w-0 grid-cols-1 gap-x-6 gap-y-3 @min-[36rem]/bd:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-3">
          <Section title="Most played role" testId="breakdown-role">
            <p className="mb-1 flex min-w-0 items-center gap-1.5 text-sm text-fg" data-testid="breakdown-role-label">
              <RoleMark role={breakdown.role} />
              {breakdown.role.label}
            </p>
            {breakdown.role.rows.length > 1 ? <RoleRows role={breakdown.role} /> : null}
          </Section>
          {breakdown.champions.length ? (
            <Section title="Most played champions" testId="breakdown-champions">
              <ul className="flex flex-col gap-1">
                {breakdown.champions.map((c) => (
                  <li key={`${c.championId}|${c.role ?? ""}`} className="flex min-w-0 items-center gap-2 text-sm">
                    <ChampionPortrait champion={champ(c.championId)} size="xs" className="size-6!" />
                    <span className="min-w-0 flex-1 text-fg">{champ(c.championId).name}</span>
                    {c.role ? <RoleIcon role={c.role} className="size-3.5 text-fg-muted" /> : <span className="sr-only">Role not recorded</span>}
                    <span className="w-16 text-right text-xs tabular-nums text-fg-muted">{c.games}</span>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}
        </div>
        <Arithmetic breakdown={breakdown} source={board.source} />
      </div>
      <div className="flex min-w-0 flex-col gap-2 border-t border-border/70 pt-3 text-xs text-fg-muted">
        <Section title="Compared with" testId="breakdown-comparison">
          <p>{board.sourceText}</p>
          {breakdown.comparison.length ? (
            <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5" data-testid="breakdown-levels">
              {breakdown.comparison.map((c) => (
                <li key={c.basis} data-basis={c.basis}>
                  {c.label}: <span className="tabular-nums text-fg">{c.games}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {breakdown.notAdjusted ? (
            <p className="mt-1 font-medium text-fg" data-testid="breakdown-not-adjusted">
              This score is not champion- or role-adjusted.
            </p>
          ) : null}
        </Section>
        <Section title="Limits">
          <p>
            {board.ruleText} Luck still matters: by chance alone a score like this moves about <span className="tabular-nums text-fg">{breakdown.chance}</span>. All supported Summoner&apos;s Rift queues are compared together, per game.
          </p>
        </Section>
        <Section title="Why placements differ" testId="breakdown-example">
          <p>
            Player A earns 80 points where 60 are typical: 100 × (80 + 40) ÷ (60 + 40) = 120. Player B earns 160 where 150 are typical: 100 × (160 + 40) ÷ (150 + 40) = 105. A places higher with fewer points: what counts is how far each is above {board.source === "team" ? "the team's typical results" : "typical for their champions and roles"}.
          </p>
        </Section>
      </div>
    </div>
  );
}

/** The player Peek's short form (the same parts, the same words): the score and its place, the points and the final line. */
export function MultikillPeekBreakdown({ breakdown, seasonLabel }: { breakdown: MultikillBreakdown; seasonLabel: string }) {
  return (
    <section aria-labelledby="peek-multikills-title" className="mb-3 flex flex-col gap-2 border-b border-border/70 pb-3" data-testid="peek-multikills">
      <h3 id="peek-multikills-title" className="text-xs font-semibold text-fg">
        Multikills · {seasonLabel}
      </h3>
      <Summary breakdown={breakdown} />
      <p className="flex min-w-0 items-center gap-1.5 text-sm text-fg-muted" data-testid="peek-multikills-role">
        <RoleMark role={breakdown.role} />
        {breakdown.role.label}
      </p>
      <PointsTable breakdown={breakdown} />
      <CalculationLine calculation={breakdown.calculation} className="border-t border-border/70 pt-2" />
    </section>
  );
}
