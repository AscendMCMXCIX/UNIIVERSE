import { ROLE_LABELS, type Role } from "@/domain/roles";
import type { ProDraftPatterns } from "@/server/pro/patterns";
import { ChampionPortrait, type PortraitChampion } from "@/components/champion-portrait";
import { RoleIcon } from "@/components/role-icon";
import { Panel, PanelBody, PanelHeader, SectionLabel } from "@/components/ui/panel";
import { percent } from "@/lib/format";

/** Professional draft patterns: what pros do with the slots we are about to face. Server-renderable. */
export function ProPatternsPanel({ patterns, championsById, compact = false }: { patterns: ProDraftPatterns; championsById: Record<string, PortraitChampion>; compact?: boolean }) {
  const champ = (id: string) => championsById[id] ?? { id, name: id, portraitUrl: "" };
  if (patterns.games === 0) {
    return (
      <Panel>
        <PanelHeader title="Pro draft patterns" subtitle="No professional games with pick order yet. Patterns appear once the pro sync has imported games (Leaguepedia or an Oracle's Elixir export)." />
      </Panel>
    );
  }
  return (
    <Panel>
      <PanelHeader title="Pro draft patterns" subtitle={`${patterns.games} professional games with pick order on patch ${patterns.patches.join(", ")}. Patterns, not instructions: our pools decide.`} />
      <PanelBody className="grid gap-4 md:grid-cols-2">
        <SlotList title="B1 priority" hint="What pros take when they can take anything: expect these to go first (or be banned)." items={patterns.firstPicks} champ={champ} compact={compact} />
        <PairList title="R1 / R2 pairs" hint="How red answers a first pick: two-pick combinations locked together." items={patterns.firstRotationPairs} champ={champ} compact={compact} />
        <PairList title="B2 / B3 pairs" hint="Blue's second rotation: the structure pros build around their first pick." items={patterns.secondRotationPairs} champ={champ} compact={compact} />
        <SlotList title="R5 counterpicks" hint="Champions pros hold for the last pick: good targets for our second-ban phase when they fit the enemy." items={patterns.counterpicks} champ={champ} compact={compact} />
        <SlotList title="Second-ban targets" hint="Banned after the first six picks: targeted bans pros use once the shape is visible." items={patterns.secondPhaseBans} champ={champ} compact={compact} />
        <div>
          <SectionLabel className="mb-1">Flex retention</SectionLabel>
          <p className="mb-1 text-xs text-fg-subtle">Picked in several roles in pro play; locking one early keeps the enemy guessing.</p>
          {patterns.flexChampions.length === 0 ? <p className="text-xs text-fg-muted">None identified.</p> : null}
          <div className="flex flex-wrap gap-1.5">
            {patterns.flexChampions.slice(0, compact ? 5 : 8).map((f) => (
              <div key={f.championId} className="flex items-center gap-1.5 rounded-md border border-border px-1.5 py-1 text-xs">
                <ChampionPortrait champion={champ(f.championId)} size="xs" />
                <span>{champ(f.championId).name}</span>
                <span className="text-fg-subtle">{f.roles.map((r) => ROLE_LABELS[r.role]).join(" / ")}</span>
              </div>
            ))}
          </div>
        </div>
      </PanelBody>
    </Panel>
  );
}

type Champ = (id: string) => PortraitChampion;

function SlotList({ title, hint, items, champ, compact }: { title: string; hint: string; items: Array<{ championId: string; role?: Role | null; games: number; winRate?: number }>; champ: Champ; compact: boolean }) {
  return (
    <div>
      <SectionLabel className="mb-1">{title}</SectionLabel>
      <p className="mb-1 text-xs text-fg-subtle">{hint}</p>
      {items.length === 0 ? <p className="text-xs text-fg-muted">Not enough games.</p> : null}
      <div className="flex flex-wrap gap-1.5">
        {items.slice(0, compact ? 5 : 8).map((it) => (
          <div key={it.championId} className="flex items-center gap-1.5 rounded-md border border-border px-1.5 py-1 text-xs" title={`${champ(it.championId).name}: ${it.games} games${it.winRate !== undefined ? ` · ${percent(it.winRate, 0)} win` : ""}`}>
            <ChampionPortrait champion={champ(it.championId)} size="xs" />
            <span>{champ(it.championId).name}</span>
            {it.role ? <RoleIcon role={it.role} className="h-3 w-3 text-fg-subtle" /> : null}
            <span className="text-fg-subtle">×{it.games}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PairList({ title, hint, items, champ, compact }: { title: string; hint: string; items: ProDraftPatterns["firstRotationPairs"]; champ: Champ; compact: boolean }) {
  return (
    <div>
      <SectionLabel className="mb-1">{title}</SectionLabel>
      <p className="mb-1 text-xs text-fg-subtle">{hint}</p>
      {items.length === 0 ? <p className="text-xs text-fg-muted">Not enough games.</p> : null}
      <div className="flex flex-wrap gap-1.5">
        {items.slice(0, compact ? 4 : 8).map((p) => (
          <div key={`${p.a}|${p.b}`} className="flex items-center gap-1 rounded-md border border-border px-1.5 py-1 text-xs" title={`${p.games} games · ${percent(p.winRate, 0)} win`}>
            <ChampionPortrait champion={champ(p.a)} size="xs" />
            <ChampionPortrait champion={champ(p.b)} size="xs" />
            <span className="text-fg-subtle">×{p.games}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
