import Link from "next/link";
import { Glossary } from "@/components/ui/glossary";
import { MobileSection } from "@/components/ui/mobile-section";
import { RoleSegmentContent, segmentClass, segmentedGroupClass } from "@/components/ui/segmented";
import { ArrowLeftRight } from "lucide-react";
import { getAppDb } from "@/server/bootstrap";
import { requirePageAccess } from "@/server/auth/page-access";
import { listChampions } from "@/server/repositories/champions";
import { buildDuoReport, DUO_ROLES, lineupPools, pairKey, parseDuoRoles } from "@/server/duo-synergies";
import { getOrCreateTeam } from "@/server/repositories/team";
import { DUO_PRIOR_GAMES, MIN_DUO_GAMES, type DuoConfidence, type DuoSort } from "@/domain/duo-synergy";
import { ROLE_LABELS, type Role } from "@/domain/roles";
import { ChampionPortrait } from "@/components/champion-portrait";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { Panel, PanelBody } from "@/components/ui/panel";
import { cn } from "@/lib/cn";
import { DivergingMeter, RankNumber } from "@/components/stats/stat-parts";

export const dynamic = "force-dynamic";

const SORTS: Array<{ value: DuoSort; label: string }> = [
  { value: "synergy", label: "Best together" },
  { value: "games", label: "Most played" },
  { value: "winrate", label: "Win rate" },
];
const CONFIDENCE: Record<DuoConfidence, { label: string; tone: "good" | "info" | "neutral"; hint: string }> = {
  high: { label: "Solid sample", tone: "good", hint: "200+ games together" },
  medium: { label: "Fair sample", tone: "info", hint: "80–199 games together" },
  low: { label: "Small sample", tone: "neutral", hint: `${MIN_DUO_GAMES}–79 games together: read with care` },
};
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const pts = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(1)}`;

/**
 * META & TRENDS → DUO SYNERGIES: which champion pairs win together, on the same team in two given
 * roles, from global ranked games (the Solo Queue Meta's evidence).
 */
export default async function DuoSynergiesPage({ searchParams }: { searchParams: Promise<{ a?: string; b?: string; pair?: string; patch?: string; sort?: string; scope?: string; limit?: string }> }) {
  await requirePageAccess("view-trends");
  const sp = await searchParams;
  const sort: DuoSort = SORTS.some((s) => s.value === sp.sort) ? (sp.sort as DuoSort) : "synergy";
  const db = await getAppDb();
  // All champions by default; "Our Synergies" narrows to the two lineup players' pools for these roles.
  const wantLineup = sp.scope === "lineup";
  const [first, second] = parseDuoRoles({ a: sp.a ?? null, b: sp.b ?? null, pair: sp.pair ?? null });
  const pools = wantLineup ? await lineupPools(db, (await getOrCreateTeam(db)).id, first, second) : null;
  const scope: "lineup" | "all" = pools ? "lineup" : "all";
  const limit = Math.min(200, Math.max(15, Number(sp.limit) || (scope === "lineup" ? 15 : 40)));
  const [report, champions] = await Promise.all([buildDuoReport(db, { a: sp.a ?? null, b: sp.b ?? null, pair: sp.pair ?? null, patch: sp.patch ?? null, sort, pools, limit: limit + 1 }), listChampions(db)]);
  const hasMore = report.rows.length > limit;
  const rows = report.rows.slice(0, limit);
  // The "Together" bars share one scale: the largest gap on the page, at least 5 points.
  const spread = Math.max(0.05, ...rows.map((r) => Math.abs(r.synergy)));
  const byId = new Map(champions.map((c) => [c.id, { id: c.id, name: c.name, portraitUrl: c.portraitUrl }]));
  const champ = (id: string) => byId.get(id) ?? { id, name: id, portraitUrl: "" };
  const [roleA, roleB] = report.pair.roles;
  const href = (over: Partial<{ a: string; b: string; patch: string; sort: string; scope: string; limit: string }>) => {
    const q = new URLSearchParams({ a: roleA, b: roleB, patch: report.patchValue, sort, scope: wantLineup ? "lineup" : "all", ...over });
    if (q.get("patch") === "recent") q.delete("patch");
    if (q.get("sort") === "synergy") q.delete("sort");
    if (q.get("scope") === "all") q.delete("scope");
    return `/trends/duos?${q}`;
  };

  return (
    <div className="mx-auto max-w-[var(--content-max)] space-y-4">
      <PageHeader
        title="Duo Synergies"
        description={
          report.source === "none" ? (
            "Champion pairs that win together."
          ) : (
            <>
              Champion pairs on the same team · {report.games.toLocaleString()} games · {report.source === "demo" ? "demo statistics (synthetic, not real games)" : "Ranked Solo/Duo games of Emerald+ players"} · {report.patches.length > 1 ? `patches ${report.patches.join(", ")}` : `patch ${report.patches[0]}`}
            </>
          )
        }
        actions={report.source === "demo" ? <Badge tone="warn">Demo data — synthetic</Badge> : null}
      />

      {report.source === "none" ? (
        <Panel>
          <PanelBody className="text-sm text-fg-muted">No statistics yet. Pairs appear once ranked games have been collected.</PanelBody>
        </Panel>
      ) : (
        <>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <nav aria-label="Which champions" className={segmentedGroupClass()} data-testid="duo-scope">
              <Link href={href({ scope: "all" })} aria-current={!wantLineup ? "page" : undefined} className={segmentClass(!wantLineup)} data-testid="duo-scope-all">
                All Champions
              </Link>
              <Link href={href({ scope: "lineup" })} aria-current={wantLineup ? "page" : undefined} className={segmentClass(wantLineup)} data-testid="duo-scope-lineup">
                Our Synergies
              </Link>
            </nav>
            {report.lineup ? (
              <p className="text-xs text-fg-muted" data-testid="duo-lineup-note">
                {report.lineup.a.name}&apos;s {ROLE_LABELS[roleA]} pool × {report.lineup.b.name}&apos;s {ROLE_LABELS[roleB]} pool: {report.lineup.withGames} of {report.lineup.poolPairs} pairs have {MIN_DUO_GAMES}+ games{report.lineup.poolPairs - report.lineup.withGames > 0 ? `; ${report.lineup.poolPairs - report.lineup.withGames} don't yet` : ""}.
              </p>
            ) : wantLineup ? (
              <p className="text-xs text-warn" data-testid="duo-lineup-missing">
                The active lineup has no player in {ROLE_LABELS[roleA]} or {ROLE_LABELS[roleB]}: showing all champions.
              </p>
            ) : null}
          </div>
          <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
            {/* Any two different roles: Role one, Role two, and a swap. The evidence of a pairing is
                the same whichever role is chosen first; rows follow the order chosen. */}
            <div className="flex flex-wrap items-center gap-2" data-testid="duo-roles">
              <RolePicker label="Role one" testId="duo-role-a" value={roleA} other={roleB} hrefFor={(r) => (r === roleB ? href({ a: r, b: roleA }) : href({ a: r }))} />
              <Link href={href({ a: roleB, b: roleA })} className="grid h-10 w-10 place-items-center rounded-full border border-border text-fg-muted hover:border-accent hover:text-accent pointer-coarse:h-11 pointer-coarse:w-11" aria-label={`Swap roles: ${ROLE_LABELS[roleB]} first`} title="Swap roles" data-testid="duo-swap">
                <ArrowLeftRight className="h-4 w-4" />
              </Link>
              <RolePicker label="Role two" testId="duo-role-b" value={roleB} other={roleA} hrefFor={(r) => href({ b: r })} listed={(r) => report.listedByPair[pairKey(roleA, r)] ?? 0} />
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {report.patchOptions.length > 1 ? (
              <nav aria-label="Patches" className={segmentedGroupClass()} data-testid="duo-patches">
                {report.patchOptions.map((o) => (
                  <Link key={o.value} href={href({ patch: o.value })} aria-current={o.value === report.patchValue ? "page" : undefined} title={`${o.games.toLocaleString()} games`} className={segmentClass(o.value === report.patchValue)}>
                    {o.value === "recent" ? "Recent patches" : o.value}
                  </Link>
                ))}
              </nav>
              ) : null}
              <nav aria-label="Sort" className={segmentedGroupClass()} data-testid="duo-sorts">
                {SORTS.map((s) => (
                  <Link key={s.value} href={href({ sort: s.value })} aria-current={s.value === sort ? "page" : undefined} className={segmentClass(s.value === sort)}>
                    {s.label}
                  </Link>
                ))}
              </nav>
            </div>
          </div>

          <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_17rem]">
            <section className="min-w-0 overflow-hidden rounded-card border border-border bg-surface" aria-label={`${report.pair.label} pairs`}>
              <header className="flex items-center justify-between gap-2 border-b border-border px-3.5 py-2.5 text-xs text-fg-muted">
                <span>
                  {report.pairsListed.toLocaleString()} of {report.pairsSeen.toLocaleString()} {report.pair.label} pairs have {MIN_DUO_GAMES}+ games together
                </span>
                <span className="hidden sm:inline">{report.pairGames.toLocaleString()} pair games</span>
              </header>
              {rows.length === 0 && report.lineup ? (
                <p className="px-3.5 py-6 text-sm text-fg-muted" data-testid="duo-empty">
                  None of our {report.pair.label} pool pairs has {MIN_DUO_GAMES} games together yet in {report.patches.length > 1 ? "these patches" : "this patch"}, so nothing is ranked. <Link href={href({ scope: "all" })} className="text-accent hover:underline">See all champions</Link>.
                </p>
              ) : rows.length === 0 ? (
                <p className="px-3.5 py-6 text-sm text-fg-muted" data-testid="duo-empty">
                  Not enough evidence yet: no {report.pair.label} pair has {MIN_DUO_GAMES} games together in {report.patches.length > 1 ? "these patches" : "this patch"}. Rankings appear once pairs reach that many games; until then nothing is ranked, so nothing misleads. {report.patchValue !== "recent" ? "Try Recent patches, which pools the last three." : ""}
                </p>
              ) : (
                <ol className="divide-y divide-border/70" data-testid="duo-list">
                  <li className="hidden grid-cols-[2rem_minmax(0,1fr)_5rem_6rem_6rem_6.5rem] items-center gap-3 px-3.5 py-2 text-xs text-fg-subtle md:grid" aria-hidden>
                    <span>#</span>
                    <span>
                      {ROLE_LABELS[roleA]} + {ROLE_LABELS[roleB]}
                    </span>
                    <span className="text-right">Games</span>
                    <span className="text-right">Win rate</span>
                    <span className="text-right">Expected</span>
                    <span className="text-right">Together</span>
                  </li>
                  {rows.map((r, i) => {
                    const a = champ(r.championA);
                    const b = champ(r.championB);
                    const who = report.lineup ? `${report.lineup.a.name} + ${report.lineup.b.name}` : null;
                    const conf = CONFIDENCE[r.confidence];
                    return (
                      <li key={`${r.championA}|${r.championB}`} className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-3.5 py-2.5 transition-colors hover:bg-surface-2/40 md:grid-cols-[2rem_minmax(0,1fr)_5rem_6rem_6rem_6.5rem]" data-testid="duo-row" data-pair={`${r.championA}+${r.championB}`} data-games={r.games} data-wins={r.wins}>
                        <RankNumber rank={i + 1} />
                        <span className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                          <span className="flex shrink-0 items-center gap-1.5">
                            <ChampionPortrait champion={a} size="sm" />
                            <span className="text-fg-subtle" aria-hidden>
                              +
                            </span>
                            <ChampionPortrait champion={b} size="sm" />
                          </span>
                          <span className="min-w-0">
                            <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                              <span className="truncate text-sm font-medium text-fg">
                                {a.name} + {b.name}
                              </span>
                              <Badge tone={conf.tone} title={conf.hint} className="whitespace-nowrap">
                                {conf.label}
                              </Badge>
                            </span>
                            {who ? <span className="block truncate text-xs text-fg-subtle" data-testid="duo-players">{who}</span> : null}
                          </span>
                        </span>
                        <span className="text-right text-sm font-semibold tabular-nums text-fg md:hidden">
                          {pts(r.synergy)}
                          <span className="block text-xs font-normal text-fg-subtle">
                            {r.games} games · {pct(r.winRate)}
                          </span>
                        </span>
                        <span className="hidden text-right text-sm tabular-nums text-fg md:block">{r.games.toLocaleString()}</span>
                        <span className="hidden text-right text-sm tabular-nums md:block" title={`95% range ${pct(r.interval[0])}–${pct(r.interval[1])}`}>
                          <span className={r.winRate >= 0.5 ? "text-good" : "text-fg"}>{pct(r.winRate)}</span>
                        </span>
                        <span className="hidden text-right text-sm tabular-nums text-fg-muted md:block">{pct(r.expected)}</span>
                        <span className="hidden text-right md:block">
                          <span className={cn("block text-sm font-semibold tabular-nums", r.synergy > 0.005 ? "text-good" : r.synergy < -0.005 ? "text-bad" : "text-fg-muted")} data-testid="duo-synergy">
                            {pts(r.synergy)} pts
                          </span>
                          <DivergingMeter value={r.synergy} max={spread} className="mt-1" />
                        </span>
                      </li>
                    );
                  })}
                </ol>
              )}
              {hasMore ? (
                <Link href={href({ limit: String(limit + (scope === "lineup" ? 15 : 40)) })} scroll={false} className="block border-t border-border py-2.5 text-center text-sm text-fg-muted hover:text-fg" data-testid="duo-more">
                  Show more
                </Link>
              ) : null}
            </section>
            <aside aria-label="Reading the numbers" className="min-w-0">
              {/* Below wide screens the board comes first and the glossary folds away. */}
              <MobileSection title="Reading the numbers" openFrom="xl" className="xl:border-l xl:border-border xl:pl-4">
                <Glossary
                  testId="duo-definitions"
                  className="max-xl:rounded-card max-xl:border max-xl:border-border max-xl:bg-surface max-xl:p-3"
                  terms={[
                    { term: "Games", short: "both on one team, in these two roles.", long: "games in which both champions were on one team, in these two roles (as Riot assigned positions)." },
                    { term: "Win rate", short: "their raw win rate together.", long: "their raw win rate together; hover for its 95% range." },
                    { term: "Expected", short: "what their separate records predict.", long: "what the two would win if each simply brought its own record in its role over the same games." },
                    { term: "Together", short: "win rate minus expected, in points.", long: <>win rate together minus expected, in percentage points, after pulling small samples towards the expectation (as if {DUO_PRIOR_GAMES} extra games played exactly as expected). Positive: the pair has won more than their separate records predict.</> },
                  ]}
                  note={<>Only pairs with {MIN_DUO_GAMES}+ games together are ranked. This shows what happened, not proof that the pair causes wins: who picks a pair, and the games it lands in, matter too. Professional games are not counted here.</>}
                />
              </MobileSection>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * One role selector: the five roles as compact icon buttons (links, so the choice is in the URL).
 * The role chosen in the other selector is unavailable here (two different roles). With `listed`,
 * each role shows how many pairs with that role reach the listing minimum.
 */
function RolePicker({ label, testId, value, other, hrefFor, listed }: { label: string; testId: string; value: Role; other: Role; hrefFor: (r: Role) => string; listed?: (r: Role) => number }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs font-medium text-fg-subtle">{label}</span>
      <div role="radiogroup" aria-label={label} className={segmentedGroupClass()} data-testid={testId}>
        {DUO_ROLES.map((r) => {
          const on = r === value;
          const blocked = listed !== undefined && r === other;
          // A role with no listed pairs shows no count (a row of zeros reads as noise).
          const count = listed && !blocked && !on ? listed(r) || null : null;
          const cls = segmentClass(on, { disabled: blocked, className: "relative" });
          const inner = <RoleSegmentContent role={r} active={on} count={count} countTitle={count ? `${count} pairs with ${MIN_DUO_GAMES}+ games together` : "Not enough games together yet"} />;
          return blocked ? (
            <span key={r} role="radio" aria-checked={false} aria-disabled="true" title={`${ROLE_LABELS[r]} is already chosen as the other role`} className={cls} data-value={r}>
              {inner}
            </span>
          ) : (
            <Link key={r} href={hrefFor(r)} role="radio" aria-checked={on} className={cls} data-value={r}>
              {inner}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
