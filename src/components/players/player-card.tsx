import * as React from "react";
import { ROLE_LABELS, type Role } from "@/domain/roles";
import type { CardLook } from "@/domain/card-style";
import type { ProficiencyTier } from "@/domain/proficiency";
import { WIN_RATE_MIN_GAMES, WIN_RATE_TONE_CLASS, winRateSampleNote, winRateTone } from "@/domain/stats/win-rate";
import { ChampionPortrait, type PortraitChampion } from "@/components/champion-portrait";
import { RoleIcon } from "@/components/role-icon";
import { InfoTip } from "@/components/ui/info-tip";
import { Badge } from "@/components/ui/badge";
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
 * No room is kept that nobody needs: with every name on one line, names take one line. A shorter
 * name sits at the foot of the room kept for it, on its rank, so the room sits between it and the
 * picture, in the art, never between the name and its rank. The tagline comes last, so room kept for
 * one sits at the block's foot.
 *
 * `layout="side"` (the Team player window's header, not a card): the picture beside the same rows.
 * `layout="rows"` (the Players directory): the same four parts, each placed on its own row of a
 * parent grid with four rows (DirectoryCardLayout), so cards side by side line up part by part. The
 * labels stay on one line there: the rank whole, a tag after it shortened with an ellipsis.
 * `reserveTagline` (with `rows`): a player without a tagline keeps one line's room for it, so their
 * card is as tall as a card with one wherever cards with taglines are listed.
 * `showRank={false}` leaves the rank out entirely (not "Unranked"): for viewers who may not see the
 * player's statistics.
 */
export function CardIdentity({ look, name, avatarUrl, rank, showRank = true, isYou = false, status, role, size = "lg", nameClassName, tag, social, layout = "stack", align, reserveTagline = false }: { look: CardLook | null | undefined; name: string; avatarUrl: string | null; rank: CompactRank | null; showRank?: boolean; isYou?: boolean; status?: "main" | "off" | null; role?: Role | null; size?: "md" | "lg"; nameClassName?: string; /** One more label after the role status (the Team card's substitute side). */ tag?: React.ReactNode; /** The player's social icons (CardSocialIcons), on the picture's row. */ social?: React.ReactNode; layout?: "stack" | "side" | "rows"; /** Everyone the lineup can show, to keep cards side by side level. */ align?: ReadonlyArray<{ name: string; look: CardLook }>; /** With `rows`: keep a tagline's line when the player has none. */ reserveTagline?: boolean }) {
  const rows = layout === "rows";
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
      <span className={cn("mt-2 flex min-w-0 items-center gap-x-1.5 gap-y-1 text-xs text-fg-muted @min-[17rem]/card:gap-x-2 @min-[17rem]/card:text-sm", !rows && "flex-wrap")} data-testid="card-fit">
        {showRank ? <RankInline rank={rank} className={rows ? "shrink-0" : undefined} /> : null}
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
      {/* At the foot of its room: the line kept for a longer name stays above it, in the art. */}
      <span className="min-w-0 self-end">{nameLine}</span>
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
  if (rows) {
    const tagline = look?.style.identity.tagline ? <CardTagline look={look} className={taglineShade} /> : reserveTagline ? <span aria-hidden className="mt-1.5 block min-h-[1lh] text-xs leading-snug @min-[17rem]/card:text-sm" data-testid="card-tagline-room" /> : null;
    // No box of its own: each part is an item of the parent's four rows.
    return (
      <span className="contents" data-testid="card-identity" data-layout="rows">
        <span className="row-start-1 flex min-w-0 flex-wrap items-center gap-2">
          {avatar}
          {links}
        </span>
        {/* At least a line of the standard name size: a smaller name style keeps the same room. */}
        <span className={cn("row-start-2 mt-2.5 min-h-[1lh] min-w-0", NAME_SIZE)}>{nameLine}</span>
        <span className="row-start-3 min-w-0">{labels}</span>
        <span className="row-start-4 min-w-0">{tagline}</span>
      </span>
    );
  }
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

/**
 * A member's identity as a list row shows it (the Players list on phones, the Studio's row preview):
 * their picture in its frame, their name in its style with its emblem, the primary role (its icon in
 * the card's colour) and the rank where this viewer may see it (never "Unranked" otherwise; `note`
 * takes the rank's place, as "No Riot account"), then their tagline on one line. `children` follow
 * in the same column (the pool, a status). The row's own element carries `cardColourVars(look)`.
 */
export function RowIdentity({ look, name, avatarUrl, role, rank, showRank = true, isYou = false, note, children }: { look: CardLook | null | undefined; name: string; avatarUrl: string | null; role: Role | null; rank: CompactRank | null; showRank?: boolean; isYou?: boolean; /** In the rank's place (the rank is then left out). */ note?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <>
      <CardAvatar look={look} name={name} src={avatarUrl} size="md" />
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5">
          {/* The name as on the card (its style, its emblem), never cut: a long one takes another line. */}
          <CardName look={look} name={name} className="text-md leading-snug text-fg" />
          {isYou ? <Badge tone="accent" className="shrink-0">You</Badge> : null}
        </span>
        <span className="mt-0.5 flex min-w-0 items-center gap-x-2 text-xs text-fg-muted">
          {role ? (
            <span className="inline-flex shrink-0 items-center gap-1">
              <span style={{ color: "var(--card-accent)" }} className="inline-flex">
                <RoleIcon role={role} className="h-3.5 w-3.5" />
              </span>
              {ROLE_LABELS[role]}
            </span>
          ) : (
            <span className="shrink-0 text-fg-subtle">Roles not set</span>
          )}
          {note ? (
            <>
              <span className="text-fg-subtle" aria-hidden>
                ·
              </span>
              {note}
            </>
          ) : showRank ? (
            <>
              <span className="text-fg-subtle" aria-hidden>
                ·
              </span>
              <RankInline rank={rank} />
            </>
          ) : null}
        </span>
        <CardTagline look={look} lines={1} className="mt-0.5" />
        {children}
      </span>
    </>
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
 *
 * On a card narrower than 12.5rem (five across a 1280px laptop with the sidebar open) one row of
 * three cannot hold the figures (its middle column shrank to a few pixels and drew "KDACS/MIN"):
 * there the win rate keeps the left with its record, and KDA and CS/min (vision) stand one above
 * the other on the right, each its label over its figure. Same figures, same order.
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
  const label = "block whitespace-nowrap text-2xs font-medium uppercase tracking-label text-fg-subtle @max-[15rem]/card:tracking-[0.04em]";
  const sub = "block truncate text-2xs tabular-nums text-fg-subtle";
  // KDA and CS/min (vision) on a narrow card: one above the other in the right-hand column, each its
  // label over its figure, right-aligned (a label and figure side by side did not fit "VISION 79.3").
  const pair = "min-w-0 @max-[12.5rem]/card:col-start-2 @max-[12.5rem]/card:text-right";
  const figure = "text-lg font-semibold leading-tight tabular-nums text-fg @max-[12.5rem]/card:text-base";
  const narrowHidden = "@max-[12.5rem]/card:hidden";
  return (
    <div className="rounded-lg bg-bg/55 px-3 pb-2.5 pt-2 ring-1 ring-inset ring-white/[0.06] @max-[12.5rem]/card:px-2.5" data-testid="card-season">
      {/* One row, read left to right: how often they win, how they fight, how they farm (vision for
          Support). The outer figures take the room they need and KDA the rest, so nothing is cut off.
          A narrow card: the win rate on the left, KDA over CS/min (vision) on the right. */}
      <dl className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-end gap-x-2.5 @max-[12.5rem]/card:grid-cols-[auto_minmax(0,1fr)] @max-[12.5rem]/card:items-center @max-[12.5rem]/card:gap-x-2 @max-[12.5rem]/card:gap-y-1">
        <div className="min-w-0 @max-[12.5rem]/card:row-span-2">
          <dt className={label}>Win rate</dt>
          <dd className={cn("text-2xl font-bold leading-tight tabular-nums", wr === null ? "text-fg-muted" : tone)} title={winRateSampleNote(season?.winRate, games, WIN_RATE_MIN_GAMES.season) ?? undefined} data-testid="card-winrate">
            {wr === null ? dash : `${Math.round(wr * 100)}%`}
          </dd>
          <dd className={sub}>{!placeholder && wins !== null && losses !== null ? `${wins}W ${losses}L` : "\u00a0"}</dd>
        </div>
        <div className={pair}>
          <dt className={label}>KDA</dt>
          <dd className={figure}>{placeholder || season?.kda == null ? dash : season.kda.toFixed(2)}</dd>
          {/* Kills / deaths / assists per game need about 4.5rem beside the other two figures, which
              a card has from 16.5rem: on a narrower card among others side by side (five across a
              desktop, three across a tablet) they stay in the hover text, for screen readers and in
              the player's window, instead of showing cut off. A phone's single card (a lineup under
              36rem, about 16.4rem wide on a 320px phone) always shows them, as it always has. */}
          <dd className={cn(sub, narrowHidden)} title={kdaLine ? `Kills / deaths / assists per game: ${kdaLine}` : undefined}>
            {placeholder || !kdaLine ? (
              "\u00a0"
            ) : (
              <>
                <span className="@xl/lineup:@max-[16.5rem]/card:sr-only">{kdaLine}</span>
                <span aria-hidden className="hidden @xl/lineup:@max-[16.5rem]/card:inline">
                  {"\u00a0"}
                </span>
              </>
            )}
          </dd>
        </div>
        {support ? (
          <div className={cn(pair, "text-right")} title="Average vision score per game in Support games this season (per game, not per minute)">
            <dt className={label}>Vision</dt>
            <dd className={figure} data-testid="card-vision">
              {placeholder || season?.visionPerGame == null ? dash : season.visionPerGame.toFixed(1)}
            </dd>
            <dd className={cn(sub, narrowHidden)}>per game</dd>
          </div>
        ) : (
          <div className={cn(pair, "text-right")} title="Creep score per minute: lane minions plus monsters, over the games with both recorded">
            <dt className={label}>CS/min</dt>
            <dd className={figure} data-testid="card-cs">
              {placeholder || season?.csPerMinute == null ? dash : season.csPerMinute.toFixed(1)}
            </dd>
            <dd className={cn(sub, narrowHidden)}>&nbsp;</dd>
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
 * without champions says so plainly. On a card narrower than 16.5rem among others side by side (a
 * lineup of 36rem or more: five across a desktop up to about 2000px wide, three across a tablet) the
 * rest of the pool takes a row of its own under the first choice, where five portraits fit, instead
 * of the one or two that fitted beside it. A phone's single card keeps the pool on one row.
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
    <div className="flex min-w-0 items-center gap-2.5 @xl/lineup:@max-[16.5rem]/card:flex-wrap @xl/lineup:@max-[16.5rem]/card:gap-y-1.5" aria-label={`${roleLabel} champion pool, in order of preference`} data-testid={testId} data-card-pool>
      <span className="flex min-w-0 shrink-0 items-center gap-2 @xl/lineup:@max-[16.5rem]/card:shrink" data-testid="pool-first">
        <ChampionPortrait champion={first} size="md" className="ring-1 ring-[color:var(--card-accent)]/50" />
        <span className="min-w-0 max-w-[7.5rem]">
          <span className="block truncate text-sm font-semibold leading-tight text-fg">{first.name}</span>
          <span className="block truncate text-2xs text-fg-subtle tabular-nums">{firstLine}</span>
        </span>
      </span>
      {rest.length ? (
        <span className="@container ml-auto flex min-w-0 flex-1 justify-end @xl/lineup:@max-[16.5rem]/card:ml-0 @xl/lineup:@max-[16.5rem]/card:basis-full @xl/lineup:@max-[16.5rem]/card:justify-start" data-testid="pool-rest">
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

// With `fit="count"`, portraits (2.25rem, 0.25rem apart) and a count of the same size: k portraits and
// the count need 2.5k + 2.25rem, a whole pool of n needs 2.5n - 0.25rem. Portrait j (from 0) shows from
// 2.5j + 4.75rem wide, so it always leaves room for the count; the count after k portraits shows from
// 2.5k + 2.25rem until the next portrait fits. A pool's last portrait shows with the one before it,
// once the whole pool fits: a count would take its place, so "+1" never shows.
const PORTRAIT_FROM = ["@max-[4.75rem]/pool:hidden", "@max-[7.25rem]/pool:hidden", "@max-[9.75rem]/pool:hidden", "@max-[12.25rem]/pool:hidden", "@max-[14.75rem]/pool:hidden", "@max-[17.25rem]/pool:hidden", "@max-[19.75rem]/pool:hidden", "@max-[22.25rem]/pool:hidden", "@max-[24.75rem]/pool:hidden", "@max-[27.25rem]/pool:hidden", "@max-[29.75rem]/pool:hidden", "@max-[32.25rem]/pool:hidden", "@max-[34.75rem]/pool:hidden", "@max-[37.25rem]/pool:hidden"];
// The count after k portraits; after the last one drawn (a pool longer than PORTRAIT_FROM), at any width beyond.
const COUNT_AFTER = ["@max-[4.75rem]/pool:grid", "@min-[4.75rem]/pool:@max-[7.25rem]/pool:grid", "@min-[7.25rem]/pool:@max-[9.75rem]/pool:grid", "@min-[9.75rem]/pool:@max-[12.25rem]/pool:grid", "@min-[12.25rem]/pool:@max-[14.75rem]/pool:grid", "@min-[14.75rem]/pool:@max-[17.25rem]/pool:grid", "@min-[17.25rem]/pool:@max-[19.75rem]/pool:grid", "@min-[19.75rem]/pool:@max-[22.25rem]/pool:grid", "@min-[22.25rem]/pool:@max-[24.75rem]/pool:grid", "@min-[24.75rem]/pool:@max-[27.25rem]/pool:grid", "@min-[27.25rem]/pool:@max-[29.75rem]/pool:grid", "@min-[29.75rem]/pool:@max-[32.25rem]/pool:grid", "@min-[32.25rem]/pool:@max-[34.75rem]/pool:grid", "@min-[34.75rem]/pool:@max-[37.25rem]/pool:grid", "@min-[37.25rem]/pool:grid"];

/** Which portraits and which count a `fit="count"` row draws for a pool of `n` (see PORTRAIT_FROM). */
export function countFit(n: number): { portraits: string[]; counts: Array<{ shown: number; className: string }> } {
  // A pool one longer than the table still shows whole: its last portrait takes the table's last width.
  const whole = n <= PORTRAIT_FROM.length + 1;
  const drawn = whole ? n : PORTRAIT_FROM.length;
  const portraits = Array.from({ length: drawn }, (_, j) => (whole && j === n - 1 ? (j === 0 ? "" : PORTRAIT_FROM[j - 1]!) : PORTRAIT_FROM[j]!));
  const counts = Array.from({ length: whole ? Math.max(0, n - 1) : drawn + 1 }, (_, k) => ({ shown: k, className: COUNT_AFTER[k]! }));
  return { portraits, counts };
}

/**
 * A few pool champions as portraits, in the player's order, with the rest counted ("+3"): enough to
 * recognise a pool at a glance. The full pool lives in the detail panel and on the profile.
 *
 * `fit` (Team cards): the preview takes the room beside the pool label and shows only the
 * portraits that fit there, without a "+N" count, because the label already gives the pool's size.
 * Nothing overlaps the label at any card width.
 *
 * `fit="count"` (Players; pass the whole pool): a row of its own, with as many whole portraits as its
 * width holds and the rest counted at its end, the count the size of a portrait. A pool that fits
 * shows whole without a count; a portrait is never cut. Decided by the row's own width (a container
 * query), so it is right from the first paint, at any card width.
 */
export function PoolPreview({ champions, total, label, max = 4, fit = false, testId = "pool-preview" }: { champions: PortraitChampion[]; total: number; label: string; max?: number; fit?: boolean | "count"; testId?: string }) {
  if (fit === "count") {
    const { portraits, counts } = countFit(champions.length);
    return (
      <div className="@container/pool min-w-0">
        <div className="flex min-h-9 min-w-0 items-center gap-1" aria-label={label} data-testid={testId}>
          {champions.length === 0 ? <span className="text-xs text-warn">No champions yet</span> : null}
          {portraits.map((hide, j) => (
            <span key={champions[j]!.id} className={cn("shrink-0", hide)} data-testid="pool-portrait">
              <ChampionPortrait champion={champions[j]} size="sm" />
            </span>
          ))}
          {counts.map(({ shown, className }) => (
            <span key={shown} className={cn("hidden h-9 w-9 shrink-0 place-items-center rounded-md border border-border text-xs tabular-nums text-fg-muted", className)} title={`${champions.length - shown} more on the profile`} data-testid={`${testId}-more`}>
              {`+${champions.length - shown}`}
              <span className="sr-only"> more champions</span>
            </span>
          ))}
        </div>
      </div>
    );
  }
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

/** The pool list's columns (Team player window): the champion, then its figures, right-aligned. */
const POOL_TILE_GRID = "grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 sm:grid-cols-[auto_minmax(0,1fr)_4.75rem_3.5rem_3.25rem_4rem]";

/** The column names over the pool list, from small tablets up (phones put each champion's figures in a short block). */
export function PoolColumnNames({ support }: { support: boolean }) {
  const head = "whitespace-nowrap text-right text-2xs font-semibold uppercase tracking-label text-fg-subtle";
  return (
    <div className={cn(POOL_TILE_GRID, "hidden border-b border-border/70 bg-bg/30 px-3 py-1.5 sm:grid")} aria-hidden data-testid="pool-columns">
      <span className="w-10" />
      <span className="text-2xs font-semibold uppercase tracking-label text-fg-subtle">Champion</span>
      <span className={head}>Win rate</span>
      <span className={head}>Games</span>
      <span className={head}>KDA</span>
      <span className={head}>{support ? "Vision" : "CS/min"}</span>
    </div>
  );
}

/**
 * One champion of a pool as a row of the Team player window's list: its place, portrait, name and
 * experience label, then the season's figures in this role in aligned columns (a short block on
 * phones). The first choice is marked in its row in the card's own colour, never set apart, so the
 * pool reads as one list. Same data and test ids as PoolChampionRow.
 */
export function PoolChampionTile({ index, champion, row, support, withStats = true }: { index: number; champion: PortraitChampion; row: PoolRowChampion; support: boolean; withStats?: boolean }) {
  const first = index === 0;
  const rate = row.winRate === null ? "—" : `${Math.round(row.winRate * 100)}%`;
  const kda = row.perfectKda ? "Perfect" : row.kdaRatio === null ? "—" : row.kdaRatio.toFixed(1);
  const third = support ? (row.visionPerGame === null ? "—" : String(Math.round(row.visionPerGame))) : row.csPerMinute === null ? "—" : row.csPerMinute.toFixed(1);
  const tone = WIN_RATE_TONE_CLASS[winRateTone(row.winRate, row.games, WIN_RATE_MIN_GAMES.champion)];
  return (
    <li className={cn(POOL_TILE_GRID, "relative px-3 py-2", first && "bg-[color-mix(in_srgb,var(--card-accent)_8%,transparent)]")} data-testid="pool-champion" data-champion={row.championId} data-first={first || undefined}>
      {first ? <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-r-full bg-[var(--card-accent)]" aria-hidden /> : null}
      <span className="relative shrink-0">
        <ChampionPortrait champion={champion} size="md" className="h-10 w-10 rounded-lg" />
        <span className="absolute -left-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full border border-border bg-bg-elevated px-1 text-2xs font-semibold tabular-nums text-fg-muted" aria-hidden>
          {index + 1}
        </span>
      </span>
      <span className="min-w-0">
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="truncate text-sm font-semibold text-fg" data-testid="pool-champion-name">{champion.name}</span>
          {first ? <span className="shrink-0 text-2xs font-semibold uppercase tracking-label text-[var(--card-accent)]">First choice</span> : null}
        </span>
        {withStats ? (
          <span className="mt-0.5 block">
            <TierBadge tier={row.tier as ProficiencyTier} label={row.tierLabel} why={row.tierWhy} evidence={row.evidence} quiet />
          </span>
        ) : null}
      </span>
      {withStats ? (
        row.games ? (
          <>
            {/* Phones: the win rate and games, then KDA and CS (vision for supports), in one short block. */}
            <span className="text-right leading-tight sm:hidden" data-testid="pool-champion-stats">
              <span className={cn("block text-sm font-semibold tabular-nums", tone)}>{rate}</span>
              <span className="block text-2xs tabular-nums text-fg-subtle">
                {row.games} game{row.games === 1 ? "" : "s"}
              </span>
              <span className="block text-2xs tabular-nums text-fg-muted" data-testid={support ? "pool-champion-kda-vision" : "pool-champion-kda-cs"}>
                {kda} KDA · {third} {support ? "vis" : "CS"}
              </span>
            </span>
            <span className={cn("hidden text-right text-sm font-semibold tabular-nums sm:block", tone)}>{rate}</span>
            <span className="hidden text-right text-sm tabular-nums text-fg-muted sm:block">{row.games}</span>
            <span className="hidden text-right text-sm tabular-nums text-fg-muted sm:block">{kda}</span>
            <span className="hidden text-right text-sm tabular-nums text-fg-muted sm:block">{third}</span>
          </>
        ) : (
          // A note too long for a phone's figure column ("189K mastery · no games this season") would
          // leave the name one letter: there it takes a line of its own under the name instead.
          <span className="min-w-0 text-right max-sm:col-span-2 max-sm:col-start-2 max-sm:row-start-2 max-sm:pt-1 max-sm:text-left sm:col-span-4" data-testid="pool-champion-stats">
            {row.masteryPoints ? (
              <span className="inline-flex items-center gap-1">
                <span className="text-xs tabular-nums text-fg-muted">
                  <span className="font-semibold">{formatCompactCount(row.masteryPoints)}</span> mastery · no games this season
                </span>
                <InfoTip label="About mastery points" text={`${formatCount(row.masteryPoints)} mastery points: lifetime experience on the champion, not this season's results. No games in this role this season.`} />
              </span>
            ) : (
              <span className="text-xs text-fg-subtle">No games this season</span>
            )}
          </span>
        )
      ) : null}
    </li>
  );
}
