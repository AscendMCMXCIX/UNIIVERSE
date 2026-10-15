import { ROLE_LABELS, type Role } from "@/domain/roles";
import type { ProDraftPatterns } from "@/server/pro/patterns";
import { ChampionPortrait, type PortraitChampion } from "@/components/champion-portrait";
import { RoleIcon } from "@/components/role-icon";
import { InfoTip } from "@/components/ui/info-tip";
import { percent } from "@/lib/format";

type Champ = (id: string) => PortraitChampion;
const ROWS = 5;

/**
 * Professional draft patterns, laid out for reading at a glance (Pro Play): six small lists of
 * what professional teams do with each phase of the draft, each a few rows long. Always visible;
 * the one-line explanation of each list sits in its ⓘ.
 */
export function ProPatternsGrid({ patterns, championsById }: { patterns: ProDraftPatterns; championsById: Record<string, PortraitChampion> }) {
  const champ: Champ = (id) => championsById[id] ?? { id, name: id, portraitUrl: "" };
  return (
    <section className="space-y-2" aria-labelledby="pro-patterns" data-testid="pro-patterns">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 id="pro-patterns" className="text-base font-semibold text-fg">
          Professional draft patterns
        </h2>
        <p className="text-xs text-fg-subtle">
          {patterns.games} games with pick order · patch {patterns.patches.join(", ")}
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Section title="B1 priority" tip="What pros take with the first pick when anything is open: expect these to go first or be banned." empty={patterns.firstPicks.length === 0}>
          {patterns.firstPicks.slice(0, ROWS).map((e) => (
            <SlotRow key={e.championId} champ={champ(e.championId)} role={e.role} games={e.games} winRate={e.winRate} />
          ))}
        </Section>
        <Section title="R5 counterpicks" tip="Champions pros keep for the last pick, once the enemy draft is visible." empty={patterns.counterpicks.length === 0}>
          {patterns.counterpicks.slice(0, ROWS).map((e) => (
            <SlotRow key={e.championId} champ={champ(e.championId)} role={e.role} games={e.games} winRate={e.winRate} />
          ))}
        </Section>
        <Section title="R1 / R2 pairs" tip="How red answers the first pick: the two champions red locks in together." empty={patterns.firstRotationPairs.length === 0}>
          {patterns.firstRotationPairs.slice(0, ROWS).map((p) => (
            <PairRow key={`${p.a}|${p.b}`} a={champ(p.a)} b={champ(p.b)} games={p.games} winRate={p.winRate} />
          ))}
        </Section>
        <Section title="B2 / B3 pairs" tip="Blue's second rotation: the pair built around the first pick." empty={patterns.secondRotationPairs.length === 0}>
          {patterns.secondRotationPairs.slice(0, ROWS).map((p) => (
            <PairRow key={`${p.a}|${p.b}`} a={champ(p.a)} b={champ(p.b)} games={p.games} winRate={p.winRate} />
          ))}
        </Section>
        <Section title="Second-phase bans" tip="Banned after the first six picks, once the shape of both drafts is visible." empty={patterns.secondPhaseBans.length === 0}>
          {patterns.secondPhaseBans.slice(0, ROWS).map((e) => (
            <SlotRow key={e.championId} champ={champ(e.championId)} role={null} games={e.games} />
          ))}
        </Section>
        <Section title="Flex picks" tip="Picked in more than one role in professional games: locking one early hides where it will go." empty={patterns.flexChampions.length === 0}>
          {patterns.flexChampions.slice(0, ROWS).map((f) => (
            <li key={f.championId} className="flex min-h-9 items-center gap-2.5">
              <ChampionPortrait champion={champ(f.championId)} size="xs" />
              <span className="min-w-0 flex-1 truncate text-sm text-fg">{champ(f.championId).name}</span>
              <span className="flex items-center gap-1 text-xs text-fg-muted">
                {f.roles.map((r) => (
                  <span key={r.role} className="inline-flex items-center gap-0.5" title={`${ROLE_LABELS[r.role]}: ${r.games} games`}>
                    <RoleIcon role={r.role} className="h-3.5 w-3.5" />
                    <span className="tabular-nums">{r.games}</span>
                  </span>
                ))}
              </span>
            </li>
          ))}
        </Section>
      </div>
    </section>
  );
}

function Section({ title, tip, empty, children }: { title: string; tip: string; empty: boolean; children: React.ReactNode }) {
  return (
    <div className="rounded-panel border border-border bg-surface px-3 py-2.5">
      <h3 className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-fg-muted">
        {title}
        <InfoTip label={`About ${title}`} text={tip} />
      </h3>
      {empty ? <p className="py-2 text-sm text-fg-subtle">Not enough games yet.</p> : <ol className="divide-y divide-border/60">{children}</ol>}
    </div>
  );
}

function SlotRow({ champ, role, games, winRate }: { champ: PortraitChampion; role: Role | null; games: number; winRate?: number }) {
  return (
    <li className="flex min-h-9 items-center gap-2.5">
      <ChampionPortrait champion={champ} size="xs" />
      <span className="min-w-0 flex-1 truncate text-sm text-fg">{champ.name}</span>
      {role ? <RoleIcon role={role} className="h-3.5 w-3.5 shrink-0 text-fg-subtle" title={ROLE_LABELS[role]} /> : null}
      <span className="shrink-0 whitespace-nowrap text-right text-xs tabular-nums text-fg-muted">{games} game{games === 1 ? "" : "s"}</span>
      {winRate !== undefined ? <span className="w-9 shrink-0 text-right text-xs tabular-nums text-fg-subtle" title="Win rate in those games">{percent(winRate, 0)}</span> : null}
    </li>
  );
}

function PairRow({ a, b, games, winRate }: { a: PortraitChampion; b: PortraitChampion; games: number; winRate: number }) {
  return (
    <li className="flex min-h-9 items-center gap-2.5">
      <span className="flex shrink-0 gap-0.5">
        <ChampionPortrait champion={a} size="xs" />
        <ChampionPortrait champion={b} size="xs" />
      </span>
      <span className="min-w-0 flex-1 text-xs leading-tight text-fg" title={`${a.name} + ${b.name}`}>
        <span className="block truncate">{a.name}</span>
        <span className="block truncate text-fg-muted">+ {b.name}</span>
      </span>
      <span className="shrink-0 whitespace-nowrap text-right text-xs tabular-nums text-fg-muted">{games} game{games === 1 ? "" : "s"}</span>
      <span className="w-9 shrink-0 text-right text-xs tabular-nums text-fg-subtle" title="Win rate in those games">{percent(winRate, 0)}</span>
    </li>
  );
}
