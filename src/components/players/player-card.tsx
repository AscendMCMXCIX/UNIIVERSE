import * as React from "react";
import type { Role } from "@/domain/roles";
import type { CardLook } from "@/domain/card-style";
import type { ProficiencyTier } from "@/domain/proficiency";
import { WIN_RATE_MIN_GAMES, WIN_RATE_TONE_CLASS, winRateSampleNote, winRateTone } from "@/domain/stats/win-rate";
import { ChampionPortrait, type PortraitChampion } from "@/components/champion-portrait";
import { RoleIcon } from "@/components/role-icon";
import { InfoTip } from "@/components/ui/info-tip";
import { cn } from "@/lib/cn";
import { CardAvatar, CardName, CardTagline } from "./card-look";
import { RankInline, type CompactRank } from "./rank-emblem";
import { RoleStatusBadge } from "./role-status-badge";
import { TierBadge } from "./tier-badge";
import { formatCount, formatCompactCount } from "@/lib/format";

/*
  The pieces every player card is made of, so the Team card, its detail panel, the Players
  directory and the Card Studio preview read as one object: the role chip, the identity block
  (avatar, tagline, name, rank, role status), the season figures, a small pool preview and the
  full pool rows. Each page arranges them for its purpose; the pieces themselves look the same.
*/

/** The role chip in the card's top-left corner. */
export function CardRoleChip({ role, label, className }: { role: Role | null; label: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full bg-bg/85 px-3 py-1 text-sm font-semibold uppercase tracking-label text-fg", className)} data-testid="assigned-role">
      {role ? (
        <span style={{ color: "var(--card-accent)" }} className="inline-flex">
          <RoleIcon role={role} className="h-4 w-4" decorative />
        </span>
      ) : (
        <span style={{ color: "var(--card-accent)" }} aria-hidden>
          ●
        </span>
      )}{" "}
      {label}
    </span>
  );
}

// The name's size on a card: one step up from a 17rem card.
const NAME_SIZE = "text-lg leading-tight @min-[17rem]/card:text-xl";
// A slot sized by its own content and by its row-mates' (align), stacked in one cell: the row-mates
// count only where cards stand side by side (the lineup from @xl), up to two lines.
const SLOT = "grid min-w-0 [&>*]:col-start-1 [&>*]:row-start-1";
const SIZERS = "invisible hidden max-h-[2lh] overflow-hidden @xl/lineup:grid [&>*]:col-start-1 [&>*]:row-start-1";

/**
 * The player's identity at the foot of a card's artwork, the same block on every card (Team, its
 * substitutes, the public page, Players, the Studio and setup previews), in a fixed order:
 * 1. the picture ("You" as a tag on it), with the player's social links on the same row at its far
 *    end: their own place, on a row the name never shares;
 * 2. the name, across the card's whole width, never cut (CardName);
 * 3. the rank, the role status and any other label (the back's "Sub"), wrapping as a group, so no
 *    label is ever cut or drawn over another;
 * 4. the tagline, wrapping (CardTagline).
 * Every row takes the room it needs and the block grows upward into the artwork, shaded by
 * CardArtLayer's `foot` scrim, so it stays readable whatever darkness the player chose. Sizes follow
 * the card's own width (its `@container/card`), not the screen: a narrow card (five across on a
 * desktop) keeps the same order at a smaller size, and from 17rem the name, tagline, labels and
 * icons each take a step up. Nothing is shrunk to fit: a long name or tagline takes another line.
 *
 * `align` (the Team lineup): everyone who can appear in the lineup, starters and substitutes. Where
 * the cards stand side by side, each card's name and tagline take as much height as the tallest
 * of theirs (up to two lines each; drawn invisibly behind its own), so a name that wraps or a
 * tagline that one player has never lifts that card's picture, name and labels above the others'.
 * No room is kept that nobody needs: with every name on one line, names take one line. The tagline
 * comes last, so room kept for one sits at the block's foot, not between the name and its rank.
 *
 * `layout="side"` (the Team player window's header, not a card): the picture beside the same rows.
 * `showRank={false}` leaves the rank out entirely (not "Unranked"): for viewers who may not see the
 * player's statistics.
 */
export function CardIdentity({ look, name, avatarUrl, rank, showRank = true, isYou = false, status, role, size = "lg", nameClassName, tag, social, layout = "stack", align }: { look: CardLook | null | undefined; name: string; avatarUrl: string | null; rank: CompactRank | null; showRank?: boolean; isYou?: boolean; status?: "main" | "off" | null; role?: Role | null; size?: "md" | "lg"; nameClassName?: string; /** One more label after the role status (the Team card's substitute side). */ tag?: React.ReactNode; /** The player's social icons (CardSocialIcons), on the picture's row. */ social?: React.ReactNode; layout?: "stack" | "side"; /** Everyone the lineup can show, to keep cards side by side level. */ align?: ReadonlyArray<{ name: string; look: CardLook }> }) {
  const avatar = (
    <span className="relative shrink-0">
      <CardAvatar look={look} name={name} src={avatarUrl} size={size} />
      {isYou ? (
        <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 rounded-full bg-accent px-1.5 text-2xs font-bold uppercase leading-4 tracking-wide text-bg shadow-sm shadow-black/40" data-testid="card-you">
          You
        </span>
      ) : null}
    </span>
  );
  const shade = "[text-shadow:0_1px_2px_rgb(0_0_0/0.75),0_0_10px_rgb(0_0_0/0.45)]";
  const nameLine = <CardName look={look} name={name} className={cn(NAME_SIZE, "text-fg", shade, nameClassName)} />;
  const taglineShade = "mt-1.5 [text-shadow:0_1px_2px_rgb(0_0_0/0.7)]";
  const labels =
    showRank || (status && role) || tag ? (
      <span className="mt-2 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-fg-muted @min-[17rem]/card:gap-x-2 @min-[17rem]/card:text-sm" data-testid="card-fit">
        {showRank ? <RankInline rank={rank} /> : null}
        {status && role ? <RoleStatusBadge status={status} role={role} className="@min-[17rem]/card:text-xs" /> : null}
        {tag}
      </span>
    ) : null;
  // Drawn over the card's own link or button, so the Team card's turn fades it with the face (data-card-overlay).
  const links = social ? (
    <span className="ml-auto flex min-w-0 justify-end" data-testid="card-identity-social" data-card-overlay>
      {social}
    </span>
  ) : null;
  const taglines = align?.some((m) => m.look.style.identity.tagline) ?? false;
  const nameSlot = align?.length ? (
    <span className={SLOT}>
      {nameLine}
      <span aria-hidden className={cn(SIZERS, NAME_SIZE)}>
        {align.map((m, i) => (
          <CardName key={i} look={m.look} name={m.name} decorative />
        ))}
      </span>
    </span>
  ) : (
    nameLine
  );
  const taglineSlot = taglines ? (
    <span className={SLOT}>
      <CardTagline look={look} className={taglineShade} />
      <span aria-hidden className={cn(SIZERS, "mt-1.5 text-xs leading-snug @min-[17rem]/card:text-sm")}>
        {align!.map((m, i) => (
          <CardTagline key={i} look={m.look} decorative />
        ))}
      </span>
    </span>
  ) : (
    <CardTagline look={look} className={taglineShade} />
  );
  if (layout === "side")
    return (
      <span className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 sm:gap-x-4" data-testid="card-identity" data-layout="side">
        {avatar}
        <span className="flex min-w-0 flex-col">
          {nameLine}
          {labels}
          <CardTagline look={look} className={taglineShade} />
          {links ? <span className="mt-2 flex">{links}</span> : null}
        </span>
      </span>
    );
  return (
    <span className="flex min-w-0 flex-col" data-testid="card-identity" data-layout="stack">
      {/* The links wrap under the picture only where the two cannot share the row. */}
      <span className="mb-2.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-2">
        {avatar}
        {links}
      </span>
      {nameSlot}
      {labels}
      {taglineSlot}
    </span>
  );
}

export interface SeasonFigures {
  games: number;
  winRate: number | null;
  kda: number | null;
  csPerMinute: number | null;
  visionPerGame: number | null;
}

/** Games, win rate, KDA and CS/min (average vision for Support): the card's four figures. */
export function SeasonTiles({ season, support, placeholder = false }: { season: SeasonFigures | null; support: boolean; placeholder?: boolean }) {
  const dash = "—";
  const tile = "rounded-lg bg-bg-elevated px-1 py-1.5";
  return (
    <dl className="grid grid-cols-4 gap-1.5 text-center" data-testid="card-season">
      <div className={tile}>
        <dt className="text-xs text-fg-subtle">Games</dt>
        <dd className="text-base font-semibold tabular-nums text-fg">{placeholder ? dash : (season?.games ?? 0)}</dd>
      </div>
      <div className={tile}>
        <dt className="whitespace-nowrap text-xs tracking-tight text-fg-subtle">Win rate</dt>
        <dd className={cn("text-base font-semibold tabular-nums", WIN_RATE_TONE_CLASS[winRateTone(season?.winRate, season?.games, WIN_RATE_MIN_GAMES.season)])} title={winRateSampleNote(season?.winRate, season?.games, WIN_RATE_MIN_GAMES.season) ?? undefined}>
          {placeholder || season?.winRate == null ? dash : `${Math.round(season.winRate * 100)}%`}
        </dd>
      </div>
      <div className={tile}>
        <dt className="text-xs text-fg-subtle">KDA</dt>
        <dd className="text-base font-semibold tabular-nums text-fg">{placeholder || season?.kda == null ? dash : season.kda.toFixed(2)}</dd>
      </div>
      {support ? (
        <div className={tile} title="Average vision score per game in Support games this season (per game, not per minute)">
          <dt className="whitespace-nowrap text-2xs leading-4 tracking-tight text-fg-subtle">Avg vision</dt>
          <dd className="text-base font-semibold tabular-nums text-fg" data-testid="card-vision">
            {placeholder || season?.visionPerGame == null ? dash : season.visionPerGame.toFixed(1)}
          </dd>
        </div>
      ) : (
        <div className={tile} title="Creep score per minute: lane minions plus monsters, over the games with both recorded">
          <dt className="text-xs text-fg-subtle">CS/min</dt>
          <dd className="text-base font-semibold tabular-nums text-fg" data-testid="card-cs">
            {placeholder || season?.csPerMinute == null ? dash : season.csPerMinute.toFixed(1)}
          </dd>
        </div>
      )}
    </dl>
  );
}

/** The season figures a card can show (Team cards have the record and per-game K/D/A too). */
export interface CardSeason extends SeasonFigures {
  wins?: number | null;
  losses?: number | null;
  kills?: number | null;
  deaths?: number | null;
  assists?: number | null;
}

/**
 * The card's season in its role, as one block that continues the artwork: the win rate leads (with
 * the record and a win/loss bar), then KDA (with kills / deaths / assists per game) and CS per minute
 * (average vision for Support). A player with no game in the role this season gets a short, plain
 * note instead of a row of dashes; nothing is estimated. `placeholder` (Card Studio, where the
 * opener did not load figures) keeps the shape with dashes.
 */
export function CardPerformance({ season, support, roleLabel, placeholder = false }: { season: CardSeason | null; support: boolean; roleLabel: string; placeholder?: boolean }) {
  const games = season?.games ?? 0;
  if (!placeholder && games === 0)
    return (
      <div className="flex min-h-[5.5rem] flex-col items-center justify-center rounded-lg border border-dashed border-border-strong/60 bg-bg/40 px-3 py-3 text-center" data-testid="card-season" data-empty="true">
        <p className="text-sm font-medium text-fg-muted">No {roleLabel} games this season</p>
        <p className="mt-0.5 text-xs text-fg-subtle">Figures appear after their first {roleLabel} game.</p>
      </div>
    );
  const dash = "—";
  const wr = placeholder || season?.winRate == null ? null : season.winRate;
  const tone = WIN_RATE_TONE_CLASS[winRateTone(season?.winRate, games, WIN_RATE_MIN_GAMES.season)];
  const wins = season?.wins ?? null;
  const losses = season?.losses ?? null;
  const decided = (wins ?? 0) + (losses ?? 0);
  const per = (n: number | null | undefined) => (n == null ? "–" : n.toFixed(1));
  const kdaLine = season && season.kills != null && season.deaths != null && season.assists != null ? `${per(season.kills)} / ${per(season.deaths)} / ${per(season.assists)}` : null;
  const label = "block whitespace-nowrap text-2xs md:text-3xs font-medium uppercase tracking-label text-fg-subtle @max-[15rem]/card:tracking-[0.04em]";
  const sub = "block truncate text-2xs tabular-nums text-fg-subtle";
  return (
    <div className="rounded-lg bg-bg/55 px-3 pb-2.5 pt-2 ring-1 ring-inset ring-white/[0.06]" data-testid="card-season">
      {/* One row, read left to right: how often they win, how they fight, how they farm (vision for
          Support). The outer figures take the room they need and KDA the rest, so nothing is cut off. */}
      <dl className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-end gap-x-2.5">
        <div className="min-w-0">
          <dt className={label}>Win rate</dt>
          <dd className={cn("text-2xl font-bold leading-tight tabular-nums", wr === null ? "text-fg-muted" : tone)} title={winRateSampleNote(season?.winRate, games, WIN_RATE_MIN_GAMES.season) ?? undefined} data-testid="card-winrate">
            {wr === null ? dash : `${Math.round(wr * 100)}%`}
          </dd>
          <dd className={sub}>{!placeholder && wins !== null && losses !== null ? `${wins}W ${losses}L` : "\u00a0"}</dd>
        </div>
        <div className="min-w-0">
          <dt className={label}>KDA</dt>
          <dd className="text-lg font-semibold leading-tight tabular-nums text-fg">{placeholder || season?.kda == null ? dash : season.kda.toFixed(2)}</dd>
          {/* Kills / deaths / assists per game need about 4.5rem: on a card too narrow for them (five
              across a laptop screen) they stay in the hover text, for screen readers and in the
              player's window, instead of showing cut off. */}
          <dd className={sub} title={kdaLine ? `Kills / deaths / assists per game: ${kdaLine}` : undefined}>
            {placeholder || !kdaLine ? (
              "\u00a0"
            ) : (
              <>
                <span className="@max-[14.5rem]/card:sr-only">{kdaLine}</span>
                <span aria-hidden className="hidden @max-[14.5rem]/card:inline">
                  {"\u00a0"}
                </span>
              </>
            )}
          </dd>
        </div>
        {support ? (
          <div className="min-w-0 text-right" title="Average vision score per game in Support games this season (per game, not per minute)">
            <dt className={label}>Vision</dt>
            <dd className="text-lg font-semibold leading-tight tabular-nums text-fg" data-testid="card-vision">
              {placeholder || season?.visionPerGame == null ? dash : season.visionPerGame.toFixed(1)}
            </dd>
            <dd className={sub}>per game</dd>
          </div>
        ) : (
          <div className="min-w-0 text-right" title="Creep score per minute: lane minions plus monsters, over the games with both recorded">
            <dt className={label}>CS/min</dt>
            <dd className="text-lg font-semibold leading-tight tabular-nums text-fg" data-testid="card-cs">
              {placeholder || season?.csPerMinute == null ? dash : season.csPerMinute.toFixed(1)}
            </dd>
            <dd className={sub}>&nbsp;</dd>
          </div>
        )}
      </dl>
      {/* Wins against losses (the proportion only, no target line) and the sample beside it. */}
      <div className="mt-1.5 flex items-center gap-2">
        <span className="flex h-1 flex-1 overflow-hidden rounded-full bg-bad/25" aria-hidden>
          {decided > 0 ? <span className="h-full rounded-full bg-good/80" style={{ width: `${((wins ?? 0) / decided) * 100}%` }} /> : null}
        </span>
        <span className="shrink-0 text-2xs tabular-nums text-fg-muted">
          <span className="font-semibold text-fg">{placeholder ? dash : games}</span> game{games === 1 ? "" : "s"}
        </span>
      </div>
    </div>
  );
}

/** A pool champion as a card shows it: the champion, and its season in the role when the viewer may see it. */
export interface CardPoolChampion extends PortraitChampion {
  games?: number | null;
  winRate?: number | null;
  tierLabel?: string | null;
}

/**
 * The card's champion pool for its role: the first choice featured (portrait, name and its season
 * in the role), then the rest of the pool in order, as many as fit, with the pool's size. A role
 * without champions says so plainly.
 */
export function CardPool({ champions, roleLabel, showFigures = true, testId = "pool-preview" }: { champions: CardPoolChampion[]; roleLabel: string; showFigures?: boolean; testId?: string }) {
  const [first, ...rest] = champions;
  if (!first)
    return (
      <div className="rounded-lg border border-dashed border-border-strong/60 px-3 py-2.5 text-center text-xs text-warn" aria-label={`${roleLabel} champion pool`} data-testid={testId}>
        No {roleLabel} champions chosen yet
      </div>
    );
  const games = first.games ?? 0;
  const firstLine = !showFigures ? "First choice" : games > 0 ? `${games} game${games === 1 ? "" : "s"}${first.winRate != null ? ` · ${Math.round(first.winRate * 100)}%` : ""}` : (first.tierLabel ?? "No games this season");
  return (
    <div className="flex min-w-0 items-center gap-2.5" aria-label={`${roleLabel} champion pool, in order of preference`} data-testid={testId}>
      <span className="flex min-w-0 shrink-0 items-center gap-2" data-testid="pool-first">
        <ChampionPortrait champion={first} size="md" className="ring-1 ring-[color:var(--card-accent)]/50" />
        <span className="min-w-0 max-w-[7.5rem]">
          <span className="block truncate text-sm font-semibold leading-tight text-fg">{first.name}</span>
          <span className="block truncate text-2xs text-fg-subtle tabular-nums">{firstLine}</span>
        </span>
      </span>
      {rest.length ? (
        <span className="@container ml-auto flex min-w-0 flex-1 justify-end">
          <span className="flex min-w-0 items-center gap-1">
            {rest.slice(0, 5).map((c, i) => (
              <span key={c.id} className={cn("shrink-0", REST_HIDDEN[i])}>
                <ChampionPortrait champion={c} size="xs" />
              </span>
            ))}
          </span>
        </span>
      ) : null}
    </div>
  );
}

// The rest of the pool beside the first choice: portrait i (1.75rem each, 0.25rem apart) is dropped whole when it no longer fits.
const REST_HIDDEN = ["@max-[1.75rem]:hidden", "@max-[3.75rem]:hidden", "@max-[5.75rem]:hidden", "@max-[7.75rem]:hidden", "@max-[9.75rem]:hidden"];

// With `fit`, portrait i (2.25rem each, 0.25rem apart) is dropped whole when the preview is narrower than i + 1 portraits.
const FIT_HIDDEN = ["", "@max-[4.75rem]:hidden", "@max-[7.25rem]:hidden", "@max-[9.75rem]:hidden", "@max-[12.25rem]:hidden", "@max-[14.75rem]:hidden", "@max-[17.25rem]:hidden"];

/**
 * A few pool champions as portraits, in the player's order, with the rest counted ("+3"): enough to
 * recognise a pool at a glance. The full pool lives in the detail panel and on the profile.
 *
 * `fit` (Team cards): the preview takes the room beside the pool label and shows only the
 * portraits that fit there, without a "+N" count, because the label already gives the pool's size.
 * Nothing overlaps the label at any card width.
 */
export function PoolPreview({ champions, total, label, max = 4, fit = false, testId = "pool-preview" }: { champions: PortraitChampion[]; total: number; label: string; max?: number; fit?: boolean; testId?: string }) {
  const shown = champions.slice(0, fit ? Math.min(max, FIT_HIDDEN.length) : max);
  const more = total - shown.length;
  const row = (
    <div className="flex min-w-0 items-center gap-1" aria-label={label} data-testid={testId}>
      {shown.length === 0 ? <span className="text-xs text-warn">No champions yet</span> : null}
      {shown.map((c, i) =>
        fit ? (
          <span key={c.id} className={cn("shrink-0", FIT_HIDDEN[i])}>
            <ChampionPortrait champion={c} size="sm" />
          </span>
        ) : (
          <ChampionPortrait key={c.id} champion={c} size="sm" />
        ),
      )}
      {more > 0 && !fit ? <span className="grid h-9 min-w-9 place-items-center rounded-md border border-border px-1.5 text-xs text-fg-muted">+{more}</span> : null}
    </div>
  );
  return fit ? <div className="@container min-w-0 flex-1">{row}</div> : row;
}

/** One champion of a role pool with its figures in that role. */
export interface PoolRowChampion {
  championId: string;
  tier: string;
  tierLabel: string;
  tierWhy: string;
  evidence: React.ComponentProps<typeof TierBadge>["evidence"];
  games: number;
  winRate: number | null;
  kdaRatio: number | null;
  perfectKda: boolean;
  csPerMinute: number | null;
  visionPerGame: number | null;
  masteryPoints: number | null;
}


/**
 * The full row for a pool champion: order, portrait, name and proficiency on the left; win rate,
 * games and KDA with CS/min (vision for Support) on the right. With no games this season, the
 * mastery points stand in, labelled as mastery so they are never read as a result. With
 * `withStats={false}` only the champion is shown (order and name), for viewers who may not see
 * the player's statistics.
 */
export function PoolChampionRow({ index, champion, row, support, withStats = true }: { index: number; champion: PortraitChampion; row: PoolRowChampion; support: boolean; withStats?: boolean }) {
  return (
    <li className="flex min-h-12 items-center gap-2.5 py-1.5" data-testid="pool-champion" data-champion={row.championId}>
      <span className="w-4 shrink-0 text-right text-2xs font-semibold tabular-nums text-fg-subtle" aria-hidden>
        {index + 1}
      </span>
      <ChampionPortrait champion={champion} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-fg">{champion.name}</span>
        {withStats ? (
          <span className="mt-0.5 block">
            <TierBadge tier={row.tier as ProficiencyTier} label={row.tierLabel} why={row.tierWhy} evidence={row.evidence} compact />
          </span>
        ) : null}
      </span>
      {withStats ? (
        <span className="shrink-0 text-right leading-tight" data-testid="pool-champion-stats">
          {row.games ? (
            <>
              <span className={cn("block text-sm font-semibold tabular-nums", WIN_RATE_TONE_CLASS[winRateTone(row.winRate, row.games, WIN_RATE_MIN_GAMES.champion)])}>{row.winRate === null ? "—" : `${Math.round(row.winRate * 100)}%`}</span>
              <span className="block text-2xs tabular-nums text-fg-subtle">
                {row.games} game{row.games === 1 ? "" : "s"}
              </span>
              <span className="block text-2xs tabular-nums text-fg-muted" data-testid={support ? "pool-champion-kda-vision" : "pool-champion-kda-cs"}>
                {row.perfectKda ? "Perfect" : row.kdaRatio === null ? "—" : row.kdaRatio.toFixed(1)} KDA · {support ? `${row.visionPerGame === null ? "—" : Math.round(row.visionPerGame)} vis` : `${row.csPerMinute === null ? "—" : row.csPerMinute.toFixed(1)} CS`}
              </span>
            </>
          ) : row.masteryPoints ? (
            <span className="inline-flex items-center gap-1">
              <span className="block text-right">
                <span className="block text-sm font-semibold tabular-nums text-fg-muted">{formatCompactCount(row.masteryPoints)}</span>
                <span className="block text-2xs text-fg-subtle">mastery</span>
              </span>
              <InfoTip label="About mastery points" text={`${formatCount(row.masteryPoints)} mastery points: lifetime experience on the champion, not this season's results. No games in this role this season.`} />
            </span>
          ) : (
            <span className="block text-2xs text-fg-subtle">No games</span>
          )}
        </span>
      ) : null}
    </li>
  );
}

/**
 * One champion of a pool as a tile (the Team player window): portrait, name, place in the order,
 * the experience label and the season's figures in this role. The first choice is a wider tile in
 * the card's own colour. Same data and test ids as PoolChampionRow.
 */
export function PoolChampionTile({ index, champion, row, support, withStats = true }: { index: number; champion: PortraitChampion; row: PoolRowChampion; support: boolean; withStats?: boolean }) {
  const first = index === 0;
  return (
    <li className={cn("flex min-w-0 items-center gap-3 rounded-panel border p-2.5", first ? "border-[color-mix(in_srgb,var(--card-accent)_45%,transparent)] bg-[color-mix(in_srgb,var(--card-accent)_10%,transparent)] sm:col-span-2" : "border-border/70 bg-surface/60")} data-testid="pool-champion" data-champion={row.championId} data-first={first || undefined}>
      <span className="relative shrink-0">
        <ChampionPortrait champion={champion} size={first ? "lg" : "md"} className="rounded-lg" />
        <span className="absolute -left-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full border border-border bg-bg-elevated px-1 text-2xs font-semibold tabular-nums text-fg-muted" aria-hidden>
          {index + 1}
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate font-semibold text-fg", first ? "text-base" : "text-sm")}>{champion.name}</span>
        {first ? <span className="block text-2xs font-medium uppercase tracking-label text-[var(--card-accent)]">First choice</span> : null}
        {withStats ? (
          <span className="mt-0.5 block">
            <TierBadge tier={row.tier as ProficiencyTier} label={row.tierLabel} why={row.tierWhy} evidence={row.evidence} quiet />
          </span>
        ) : null}
      </span>
      {withStats ? (
        <span className="shrink-0 text-right leading-tight" data-testid="pool-champion-stats">
          {row.games ? (
            <>
              <span className={cn("block font-semibold tabular-nums", first ? "text-lg" : "text-sm", WIN_RATE_TONE_CLASS[winRateTone(row.winRate, row.games, WIN_RATE_MIN_GAMES.champion)])}>{row.winRate === null ? "—" : `${Math.round(row.winRate * 100)}%`}</span>
              <span className="block text-2xs tabular-nums text-fg-subtle">
                {row.games} game{row.games === 1 ? "" : "s"}
              </span>
              <span className="block text-2xs tabular-nums text-fg-muted" data-testid={support ? "pool-champion-kda-vision" : "pool-champion-kda-cs"}>
                {row.perfectKda ? "Perfect" : row.kdaRatio === null ? "—" : row.kdaRatio.toFixed(1)} KDA · {support ? `${row.visionPerGame === null ? "—" : Math.round(row.visionPerGame)} vis` : `${row.csPerMinute === null ? "—" : row.csPerMinute.toFixed(1)} CS`}
              </span>
            </>
          ) : row.masteryPoints ? (
            <span className="inline-flex items-center gap-1">
              <span className="block text-right">
                <span className="block text-sm font-semibold tabular-nums text-fg-muted">{formatCompactCount(row.masteryPoints)}</span>
                <span className="block text-2xs text-fg-subtle">mastery</span>
              </span>
              <InfoTip label="About mastery points" text={`${formatCount(row.masteryPoints)} mastery points: lifetime experience on the champion, not this season's results. No games in this role this season.`} />
            </span>
          ) : (
            <span className="block text-2xs text-fg-subtle">No games this season</span>
          )}
        </span>
      ) : null}
    </li>
  );
}
