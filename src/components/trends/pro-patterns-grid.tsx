import { ROLE_LABELS, type Role } from "@/domain/roles";
import type { ProDraftPatterns } from "@/server/pro/patterns";
import { ChampionPortrait, type PortraitChampion } from "@/components/champion-portrait";
import { RoleIcon } from "@/components/role-icon";
import { Meter, StatPanel } from "@/components/stats/stat-parts";
import { percent } from "@/lib/format";

type Champ = (id: string) => PortraitChampion;
const ROWS = 5;

/**
 * Professional draft patterns as a drafting reference (Pro Play): what professional teams do at
 * each step of the draft, in the order the draft happens, each a few rows long. Always visible;
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
      {/* In draft order, so the page reads like the draft itself: the first pick, red's answer,
          blue's second pair, the second ban phase, the last pick; flex picks alongside. */}
      <ol className="grid gap-3 sm:grid-cols-2" aria-label="Draft order">
        <Section step={1} title="First pick" code="B1" tip="What pros take with the first pick when anything is open: expect these to go first or be banned." empty={patterns.firstPicks.length === 0}>
          {patterns.firstPicks.slice(0, ROWS).map((e) => (
            <SlotRow key={e.championId} champ={champ(e.championId)} role={e.role} games={e.games} winRate={e.winRate} top={patterns.firstPicks[0]!.games} />
          ))}
        </Section>
        <Section step={2} title="Red's first pair" code="R1 · R2" tip="How red answers the first pick: the two champions red locks in together." empty={patterns.firstRotationPairs.length === 0}>
          {patterns.firstRotationPairs.slice(0, ROWS).map((p) => (
            <PairRow key={`${p.a}|${p.b}`} a={champ(p.a)} b={champ(p.b)} games={p.games} winRate={p.winRate} top={patterns.firstRotationPairs[0]!.games} />
          ))}
        </Section>
        <Section step={3} title="Blue's second pair" code="B2 · B3" tip="Blue's second rotation: the pair built around the first pick." empty={patterns.secondRotationPairs.length === 0}>
          {patterns.secondRotationPairs.slice(0, ROWS).map((p) => (
            <PairRow key={`${p.a}|${p.b}`} a={champ(p.a)} b={champ(p.b)} games={p.games} winRate={p.winRate} top={patterns.secondRotationPairs[0]!.games} />
          ))}
        </Section>
        <Section step={4} title="Second-phase bans" code="Bans 4–5" tip="Banned after the first six picks, once the shape of both drafts is visible." empty={patterns.secondPhaseBans.length === 0}>
          {patterns.secondPhaseBans.slice(0, ROWS).map((e) => (
            <SlotRow key={e.championId} champ={champ(e.championId)} role={null} games={e.games} top={patterns.secondPhaseBans[0]!.games} />
          ))}
        </Section>
        <Section step={5} title="Last-pick counters" code="R5" tip="Champions pros keep for the last pick, once the enemy draft is visible." empty={patterns.counterpicks.length === 0}>
          {patterns.counterpicks.slice(0, ROWS).map((e) => (
            <SlotRow key={e.championId} champ={champ(e.championId)} role={e.role} games={e.games} winRate={e.winRate} top={patterns.counterpicks[0]!.games} />
          ))}
        </Section>
        <Section title="Flex picks" code="Any slot" tip="Picked in more than one role in professional games: locking one early hides where it will go." empty={patterns.flexChampions.length === 0}>
          {patterns.flexChampions.slice(0, ROWS).map((f) => (
            <li key={f.championId} className="flex min-h-10 items-center gap-2.5">
              <ChampionPortrait champion={champ(f.championId)} size="sm" />
              <span className="min-w-0 flex-1 truncate text-sm text-fg">{champ(f.championId).name}</span>
              <span className="flex items-center gap-1.5 text-xs text-fg-muted">
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
      </ol>
    </section>
  );
}

function Section({ step, title, code, tip, empty, children }: { step?: number; title: string; code?: string; tip: string; empty: boolean; children: React.ReactNode }) {
  return (
    <li className="min-w-0">
      <StatPanel
        title={
          <>
            {step ? <span className="grid h-5 w-5 place-items-center rounded-full bg-accent/15 text-[11px] font-semibold tabular-nums text-accent" aria-label={`Step ${step}`}>{step}</span> : null}
            {title}
          </>
        }
        code={code}
        tip={tip}
        className="h-full"
      >
        {empty ? <p className="px-3.5 py-3 text-sm text-fg-subtle">Not enough games yet.</p> : <ol className="divide-y divide-border/60 px-3.5 py-1">{children}</ol>}
      </StatPanel>
    </li>
  );
}

/** Games and win rate on the right; a bar shows each row's games against the list's most played. */
function Figures({ games, winRate, top }: { games: number; winRate?: number; top: number }) {
  return (
    <span className="flex shrink-0 items-center gap-3">
      <span className="w-20 text-right">
        <span className="block whitespace-nowrap text-xs tabular-nums text-fg-muted">
          {games} game{games === 1 ? "" : "s"}
        </span>
        <Meter value={top > 0 ? games / top : 0} className="mt-1" />
      </span>
      {winRate !== undefined ? (
        <span className="w-10 text-right text-xs tabular-nums text-fg-muted" title="Win rate in those games">
          {percent(winRate, 0)}
        </span>
      ) : null}
    </span>
  );
}

function SlotRow({ champ, role, games, winRate, top }: { champ: PortraitChampion; role: Role | null; games: number; winRate?: number; top: number }) {
  return (
    <li className="flex min-h-11 items-center gap-2.5">
      <ChampionPortrait champion={champ} size="sm" />
      <span className="min-w-0 flex-1 truncate text-sm text-fg">{champ.name}</span>
      {role ? <RoleIcon role={role} className="h-3.5 w-3.5 shrink-0 text-fg-subtle" title={ROLE_LABELS[role]} /> : null}
      <Figures games={games} winRate={winRate} top={top} />
    </li>
  );
}

function PairRow({ a, b, games, winRate, top }: { a: PortraitChampion; b: PortraitChampion; games: number; winRate: number; top: number }) {
  return (
    <li className="flex min-h-11 items-center gap-2.5">
      <span className="flex shrink-0 gap-0.5">
        <ChampionPortrait champion={a} size="sm" />
        <ChampionPortrait champion={b} size="sm" />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm text-fg" title={`${a.name} + ${b.name}`}>
        {a.name} <span className="text-fg-subtle">+</span> {b.name}
      </span>
      <Figures games={games} winRate={winRate} top={top} />
    </li>
  );
}
