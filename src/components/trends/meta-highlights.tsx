import { championArtUrl } from "@/domain/player-card";
import { ROLE_LABELS, type Role } from "@/domain/roles";
import { ChampionPortrait, type PortraitChampion } from "@/components/champion-portrait";
import { RoleIcon } from "@/components/role-icon";
import { cn } from "@/lib/cn";

/**
 * The head of a Meta & Trends page: up to three leaders of the board below (the champion most
 * present, most banned and winning most), each over the champion's own splash art. Static art
 * (lazy, no motion) under a dark gradient, so the figures stay readable whatever the artwork.
 * A tile states its value and the sample behind it; a statistic with no qualifying champion says
 * so instead of naming one. Solo Queue Meta and Pro Play share it, so the pages read alike.
 */
export interface MetaHighlight {
  key: string;
  label: string;
  /** Null when no champion qualifies (e.g. none has enough games for a win rate yet). */
  champion: PortraitChampion | null;
  role?: Role | null;
  value?: string;
  /** The evidence: games, pick and ban shares, the minimum that applied. */
  sample: string;
  tone?: "accent" | "bad" | "good";
}

const TONE = { accent: "text-accent", bad: "text-bad", good: "text-good" } as const;

/** `rail`: on wide screens the tiles stack in the page's right column (beside the board) instead of a row above it. */
export function MetaHighlights({ items, rail = false, className, testId = "meta-highlights" }: { items: MetaHighlight[]; rail?: boolean; className?: string; testId?: string }) {
  if (items.length === 0) return null;
  return (
    <ul className={cn("grid gap-2 sm:grid-cols-3 sm:gap-3", rail && "xl:grid-cols-1 xl:gap-2", className)} data-testid={testId}>
      {items.map((h) => (
        <li key={h.key} className="relative isolate min-w-0 overflow-hidden rounded-card border border-border bg-surface" data-testid="meta-highlight" data-key={h.key} data-champion={h.champion?.id}>
          {h.champion ? (
            <span aria-hidden className="pointer-events-none absolute inset-0 -z-10">
              {/* eslint-disable-next-line @next/next/no-img-element -- Riot's static art, sized by CSS */}
              <img src={championArtUrl({ championId: h.champion.id, skinNum: 0 }, "splash")} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover object-[70%_20%] opacity-50" />
              <span className="absolute inset-0 bg-gradient-to-r from-surface via-surface/85 to-surface/25" />
              <span className="absolute inset-0 bg-gradient-to-t from-bg/70 via-transparent to-transparent" />
            </span>
          ) : null}
          <div className={cn("flex min-h-[5.5rem] items-center gap-3 px-3.5 py-3 sm:min-h-[6.5rem]", rail && "xl:min-h-0 xl:py-2.5")}>
            {h.champion ? <ChampionPortrait champion={h.champion} size="lg" className="rounded-lg shadow-md shadow-black/30" /> : null}
            <div className="min-w-0 flex-1">
              <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-fg-muted">{h.label}</p>
              {h.champion ? (
                <>
                  <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-base font-semibold leading-tight text-fg">
                    <span className="truncate">{h.champion.name}</span>
                    {h.role ? <RoleIcon role={h.role} className="h-3.5 w-3.5 shrink-0 text-fg-subtle" title={ROLE_LABELS[h.role]} /> : null}
                  </p>
                  <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
                    <span className={cn("text-xl font-bold tabular-nums leading-none", TONE[h.tone ?? "accent"])} data-testid="meta-highlight-value">
                      {h.value}
                    </span>
                    <span className="text-xs text-fg-subtle">{h.sample}</span>
                  </p>
                </>
              ) : (
                <p className="mt-1 text-sm text-fg-muted">{h.sample}</p>
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

/**
 * The three leaders of a trends report's overall view: most present, most banned, and the best
 * win rate among champions with enough games (the board's own minimum, stated on the tile).
 */
export function trendHighlights(
  views: { ALL: { bySort: Record<"presence" | "pick" | "ban" | "win", Array<{ championId: string; role: Role | null; pickRate: number; banRate: number; presence: number; winRate: number; games: number }>> } },
  champ: (id: string) => PortraitChampion,
  minWinGames: number,
  unit = "games",
): MetaHighlight[] {
  const { presence, ban, win } = views.ALL.bySort;
  const p = presence[0];
  const b = ban[0];
  const w = win[0];
  return [
    p
      ? { key: "presence", label: "Highest presence", champion: champ(p.championId), role: p.role, value: pct(p.presence), sample: `${pct(p.pickRate)} pick · ${pct(p.banRate)} ban` }
      : { key: "presence", label: "Highest presence", champion: null, sample: `No ${unit} on this patch yet.` },
    b
      ? { key: "ban", label: "Most banned", champion: champ(b.championId), role: b.role, value: pct(b.banRate), sample: `of ${unit} · ${pct(b.presence)} presence`, tone: "bad" as const }
      : { key: "ban", label: "Most banned", champion: null, sample: `No bans recorded on this patch yet.` },
    w
      ? { key: "win", label: "Best win rate", champion: champ(w.championId), role: w.role, value: pct(w.winRate), sample: `${w.games.toLocaleString()} ${unit} · ${minWinGames}+ to rank`, tone: "good" as const }
      : { key: "win", label: "Best win rate", champion: null, sample: `No champion has ${minWinGames}+ ${unit} yet, so none is ranked by win rate.` },
  ];
}
