import Link from "next/link";
import { getAppDb } from "@/server/bootstrap";
import { requirePageAccess } from "@/server/auth/page-access";
import { listChampions } from "@/server/repositories/champions";
import { buildDuoReport, ROLE_PAIRS } from "@/server/duo-synergies";
import { DUO_PRIOR_GAMES, MIN_DUO_GAMES, type DuoConfidence, type DuoSort } from "@/domain/duo-synergy";
import { ROLE_LABELS } from "@/domain/roles";
import { ChampionPortrait } from "@/components/champion-portrait";
import { RoleIcon } from "@/components/role-icon";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { Panel, PanelBody } from "@/components/ui/panel";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

const SORTS: Array<{ value: DuoSort; label: string }> = [
  { value: "synergy", label: "Best together" },
  { value: "games", label: "Most played" },
  { value: "winrate", label: "Highest win rate" },
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
export default async function DuoSynergiesPage({ searchParams }: { searchParams: Promise<{ pair?: string; patch?: string; sort?: string }> }) {
  await requirePageAccess("view-trends");
  const sp = await searchParams;
  const sort: DuoSort = SORTS.some((s) => s.value === sp.sort) ? (sp.sort as DuoSort) : "synergy";
  const db = await getAppDb();
  const [report, champions] = await Promise.all([buildDuoReport(db, { pair: sp.pair ?? null, patch: sp.patch ?? null, sort }), listChampions(db)]);
  const byId = new Map(champions.map((c) => [c.id, { id: c.id, name: c.name, portraitUrl: c.portraitUrl }]));
  const champ = (id: string) => byId.get(id) ?? { id, name: id, portraitUrl: "" };
  const href = (over: Partial<{ pair: string; patch: string; sort: string }>) => {
    const q = new URLSearchParams({ pair: report.pair.key, patch: report.patchValue, sort, ...over });
    if (q.get("patch") === "recent") q.delete("patch");
    if (q.get("sort") === "synergy") q.delete("sort");
    return `/trends/duos?${q}`;
  };
  const chip = (active: boolean) => cn("inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors pointer-coarse:min-h-11", active ? "border-accent bg-accent/15 text-fg" : "border-border text-fg-muted hover:border-border-strong hover:text-fg");
  const [roleA, roleB] = report.pair.roles;

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
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <nav aria-label="Role pair" className="flex flex-wrap gap-2" data-testid="duo-pairs">
              {ROLE_PAIRS.map((p) => {
                const listed = report.listedByPair[p.key] ?? 0;
                return (
                  <Link key={p.key} href={href({ pair: p.key })} aria-current={p.key === report.pair.key ? "page" : undefined} className={cn(chip(p.key === report.pair.key), listed === 0 && p.key !== report.pair.key && "opacity-60")} title={listed ? `${listed} pairs with ${MIN_DUO_GAMES}+ games together` : `Not enough games together yet for any ${p.label} pair`}>
                    <RoleIcon role={p.roles[0]} className="h-4 w-4" />
                    <RoleIcon role={p.roles[1]} className="h-4 w-4" />
                    {p.label}
                  </Link>
                );
              })}
            </nav>
            <div className="flex flex-wrap items-center gap-2">
              {report.patchOptions.length > 1 ? (
              <nav aria-label="Patches" className="flex flex-wrap gap-0.5 rounded-lg border border-border bg-bg-elevated p-0.5" data-testid="duo-patches">
                {report.patchOptions.map((o) => (
                  <Link key={o.value} href={href({ patch: o.value })} aria-current={o.value === report.patchValue ? "page" : undefined} title={`${o.games.toLocaleString()} games`} className={cn("inline-flex min-h-8 items-center rounded-md px-2.5 text-xs font-medium pointer-coarse:min-h-10", o.value === report.patchValue ? "bg-surface-3 text-fg" : "text-fg-muted hover:text-fg")}>
                    {o.value === "recent" ? "Recent patches" : o.value}
                  </Link>
                ))}
              </nav>
              ) : null}
              <nav aria-label="Sort" className="flex gap-0.5 rounded-lg border border-border bg-bg-elevated p-0.5" data-testid="duo-sorts">
                {SORTS.map((s) => (
                  <Link key={s.value} href={href({ sort: s.value })} aria-current={s.value === sort ? "page" : undefined} className={cn("inline-flex min-h-8 items-center rounded-md px-2.5 text-xs font-medium pointer-coarse:min-h-10", s.value === sort ? "bg-surface-3 text-fg" : "text-fg-muted hover:text-fg")}>
                    {s.label}
                  </Link>
                ))}
              </nav>
            </div>
          </div>

          <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_20rem]">
            <section className="rounded-2xl border border-border bg-surface" aria-label={`${report.pair.label} pairs`}>
              <header className="flex items-center justify-between gap-2 border-b border-border px-3.5 py-2.5 text-xs text-fg-muted">
                <span>
                  {report.pairsListed.toLocaleString()} of {report.pairsSeen.toLocaleString()} {report.pair.label} pairs have {MIN_DUO_GAMES}+ games together
                </span>
                <span className="hidden sm:inline">{report.pairGames.toLocaleString()} pair games</span>
              </header>
              {report.rows.length === 0 ? (
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
                  {report.rows.map((r, i) => {
                    const a = champ(r.championA);
                    const b = champ(r.championB);
                    const conf = CONFIDENCE[r.confidence];
                    return (
                      <li key={`${r.championA}|${r.championB}`} className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-3.5 py-2.5 md:grid-cols-[2rem_minmax(0,1fr)_5rem_6rem_6rem_6.5rem]" data-testid="duo-row" data-pair={`${r.championA}+${r.championB}`} data-games={r.games} data-wins={r.wins}>
                        <span className="text-xs font-semibold tabular-nums text-fg-subtle">{i + 1}</span>
                        <span className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                          <span className="flex shrink-0 items-center gap-1.5">
                            <ChampionPortrait champion={a} size="sm" />
                            <span className="text-fg-subtle" aria-hidden>
                              +
                            </span>
                            <ChampionPortrait champion={b} size="sm" />
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-fg">
                              {a.name} + {b.name}
                            </span>
                            <Badge tone={conf.tone} title={conf.hint} className="mt-0.5 whitespace-nowrap">
                              {conf.label}
                            </Badge>
                          </span>
                        </span>
                        <span className="text-right text-sm font-semibold tabular-nums text-fg md:hidden">
                          {pts(r.synergy)}
                          <span className="block text-[11px] font-normal text-fg-subtle">
                            {r.games} games · {pct(r.winRate)}
                          </span>
                        </span>
                        <span className="hidden text-right text-sm tabular-nums text-fg md:block">{r.games.toLocaleString()}</span>
                        <span className="hidden text-right text-sm tabular-nums md:block" title={`95% range ${pct(r.interval[0])}–${pct(r.interval[1])}`}>
                          <span className={r.winRate >= 0.5 ? "text-good" : "text-fg"}>{pct(r.winRate)}</span>
                        </span>
                        <span className="hidden text-right text-sm tabular-nums text-fg-muted md:block">{pct(r.expected)}</span>
                        <span className={cn("hidden text-right text-sm font-semibold tabular-nums md:block", r.synergy > 0.005 ? "text-good" : r.synergy < -0.005 ? "text-bad" : "text-fg-muted")} data-testid="duo-synergy">
                          {pts(r.synergy)} pts
                        </span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
            <aside className="rounded-2xl border border-border bg-surface px-3.5 py-3 text-xs text-fg-muted" data-testid="duo-definitions">
              <h2 className="text-sm font-semibold text-fg">What the numbers mean</h2>
              <dl className="mt-1.5 space-y-1.5">
                <div>
                  <dt className="inline font-medium text-fg">Games</dt> <dd className="inline">games in which both champions were on one team, in these two roles (as Riot assigned positions).</dd>
                </div>
                <div>
                  <dt className="inline font-medium text-fg">Win rate</dt> <dd className="inline">their raw win rate together; hover for its 95% range.</dd>
                </div>
                <div>
                  <dt className="inline font-medium text-fg">Expected</dt> <dd className="inline">what the two would win if each simply brought its own record in its role over the same games.</dd>
                </div>
                <div>
                  <dt className="inline font-medium text-fg">Together</dt>{" "}
                  <dd className="inline">
                    win rate together minus expected, in percentage points, after pulling small samples towards the expectation (as if {DUO_PRIOR_GAMES} extra games played exactly as expected). Positive: the pair has won more than their separate records predict.
                  </dd>
                </div>
              </dl>
              <p className="mt-2">Only pairs with {MIN_DUO_GAMES}+ games together are ranked. This shows what happened, not proof that the pair causes wins: who picks a pair, and the games it lands in, matter too. Professional games are not counted here.</p>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
