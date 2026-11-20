import * as React from "react";
import { IntentLink } from "@/components/ui/intent-link";
import { ChevronRight } from "lucide-react";
import type { CardArt } from "@/domain/player-card";
import type { CardLook } from "@/domain/card-style";
import { ROLE_LABELS, type Role } from "@/domain/roles";
import type { SocialLinkView } from "@/domain/social-links";
import type { PortraitChampion } from "@/components/champion-portrait";
import { RoleIcon } from "@/components/role-icon";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { RowArtStrip } from "./card-art";
import { CardAvatar, CardName, CardTagline, cardColourVars } from "./card-look";
import { PoolPreview } from "./player-card";
import { RankInline, type CompactRank } from "./rank-emblem";
import { SetupIncompleteBadge } from "./setup-incomplete";
import { CardSocialIcons } from "./social-links";

/** How current a player's Riot data is, as the Players roster receives it (summariseAccounts). */
export interface RiotState {
  state: "synced" | "pending" | "verified" | "syncing" | "stale" | "error" | "none";
  label: string;
}

// A few words for a state other than up to date, on the row's last line; the whole sentence is what a screen reader reads.
const RIOT_SHORT: Record<RiotState["state"], string> = { synced: "up to date", syncing: "catching up", verified: "updating", pending: "updating", stale: "delayed", error: "needs attention", none: "no account" };
// Their colour, as the account badges elsewhere: delayed in the warning colour, needs attention in the error colour, the rest quiet.
const RIOT_BADGE: Record<RiotState["state"], "neutral" | "warn" | "bad"> = { synced: "neutral", syncing: "neutral", verified: "neutral", pending: "neutral", stale: "warn", error: "bad", none: "neutral" };
const RIOT_TONE: Record<RiotState["state"], string> = { synced: "text-fg-subtle", syncing: "text-fg-subtle", verified: "text-fg-subtle", pending: "text-fg-subtle", stale: "text-warn", error: "text-bad", none: "text-fg-subtle" };

export interface RosterRowProps {
  look: CardLook | null;
  art: CardArt | null;
  name: string;
  avatarUrl: string | null;
  /** Their main (primary) role; null: not chosen yet. */
  role: Role | null;
  /** Their other roles, in order (secondary, then further roles). */
  offRoles: readonly Role[];
  /** The role the list is narrowed to, where they play it as an off role: the pool shown is that role's. */
  offRoleShown?: Role | null;
  rank: CompactRank | null;
  /** False: this viewer may not see their rank, which is then left out (never "Unranked"). */
  showRank: boolean;
  riot: RiotState | null;
  /** The pool shown, in the player's order, and its accessible name ("Mid champions, off role"). */
  pool: PortraitChampion[];
  poolLabel: string;
  lineupRole?: Role | null;
  setupPending?: boolean;
  archived?: boolean;
  isYou?: boolean;
  social?: readonly SocialLinkView[];
  /** The profile the row opens. None in a preview, which also draws the social icons without actions. */
  href?: string;
  /**
   * The player Peek (PLAN S8a): the row opens a quick look at `href` (the page's own address with
   * `?player=`), its press handled by the page's Peek, and the name stays a link to the profile
   * (`href` above). `selected`: this row's player is the one open.
   */
  peek?: { id: string; href: string; onClick: (e: React.MouseEvent<HTMLAnchorElement>) => void; selected: boolean };
  /**
   * Which screen the row is drawn for: "any" follows the screen (the art strip and the links from
   * tablets up, as on Players); a preview shows one look whatever the screen: "wide" (tablets and
   * desktops) or "phone" (no art and no links, as on a phone).
   */
  screen?: "any" | "wide" | "phone";
}

const ART: Record<NonNullable<RosterRowProps["screen"]>, string | null> = { any: "max-md:hidden", wide: "", phone: null };
const LINKS: Record<NonNullable<RosterRowProps["screen"]>, string | null> = { any: "hidden md:@min-[20rem]/row:flex", wide: "hidden @min-[20rem]/row:flex", phone: null };

/*
  STACKED, larger text only (see RosterRow): a row under 9.625rem, where the text beside the picture
  (its 2.5rem and the 0.625rem gap) would have less than 6.5rem. The row wraps: the picture alone on
  the first line (no longer centred on two lines), the text under it. A row cannot query its own
  width (it is that container), so these read the roster's: wherever the roster lays its rows one
  across (under 38rem) a row is the roster's width less its 1.5rem of padding, so 11.125rem of
  roster is 9.625rem of row; two across, a row is 17.5rem or more. A row drawn outside the roster
  (the Card Studio's previews) keeps its one layout. Written out whole, for Tailwind to find them.
*/
const STACKED_ROW = "@max-[11.125rem]/roster:flex-wrap @max-[11.125rem]/roster:gap-y-1";

/*
  The "·" before the rank (or "No Riot account") shows where the two share a line with the role, and
  never starts a line. Larger text wraps the rank under the role in a narrow row, where the line
  started with the "·" ("· Emerald III" at 200% on a 320px phone; "· No Riot account"). The dot sits
  between parts of the line (the role's icon, the rank's crest), not inside a run of words, so a
  no-break space (Recent form's way) has nothing to hold it to; Records' way does it (records.tsx):
  the role keeps the dot's room on its right (`before`), the rank's group gives it back on its left
  (`group`), so beside the role nothing moves (the two cancel exactly, and the line wraps where it
  did), and at the start of a line the dot and its gap sit past the line's clipped left edge
  (`line`) while the crest or the words start at the edge. The room is the dot (0.289em of Inter at
  the line's text size) and the 0.375rem gap after it. Only in a row under 16rem, read on the roster
  as STACKED reads it (17.5rem of roster, its rows one across): a row on Players at the usual text
  size is 16.375rem or more (a 320px phone's), where the longest role and rank ("Roles not set · No
  Riot account", "· Grandmaster") fit beside each other with room to spare, and the clip alone would
  change how the line's portraits are drawn there (by a shade). The roster, not the row: the Card
  Studio's previews draw rows outside the roster, about 9rem wide at the usual size beside the
  controls on a 320 × 480 screen (15rem at 480 × 320), and they keep their one layout, as with
  STACKED.
*/
const SEPARATOR = { line: "@max-[17.5rem]/roster:overflow-x-clip", before: "@max-[17.5rem]/roster:mr-[calc(0.289em+0.375rem)]", group: "@max-[17.5rem]/roster:-ml-[calc(0.289em+0.375rem)]" };
const STACKED_PICTURE = "@max-[11.125rem]/roster:h-auto";
const STACKED_TEXT = "@max-[11.125rem]/roster:basis-full";

/**
 * One player on the Players roster, the same row at every width (docs/MOBILE.md: a row per player
 * in one panel), 64px tall unless a name, a tagline or Riot's state needs another line:
 * - their picture in its frame, under the card's colours (cardColourVars), so the emblem and the role
 *   icon take the player's colour as on their card; from tablets up a faint strip of their chosen art
 *   behind the picture and name, faded out before the rank and pool (RowArtStrip);
 * - first line: the name in its style with its emblem, never cut ("You" after it), the tagline on the
 *   same line where the row has room for all of it (a line of its own otherwise: under the name on
 *   wide rows, under the second line on narrower ones), then the status at the line's end (Lineup,
 *   Setup incomplete, shortened to "Setup" on narrow rows, Archived) and, from tablets up, the social
 *   links as icons, each its own control above the row's link. On a narrow row, or one without a
 *   tagline, a long name wraps in its own column beside the status rather than pushing it down, and
 *   the status stays beside its first line;
 * - second line: the main role (its icon in the card's colour, then its name where there is room),
 *   the off roles as quiet icons on wide rows or the off role the list is narrowed to, the rank ("No
 *   Riot account" in its place without one; nothing where this viewer may not see it), then the pool
 *   as whole portraits with the rest counted (PoolPreview fit="count"). Larger text wraps this line
 *   rather than cutting it: the pool moves under the role and rank once it cannot keep a portrait
 *   and its count beside them, and the rank under the role, without its "·" (SEPARATOR), once it
 *   cannot stay beside it;
 * - a last line only for Riot data that is not up to date (delayed and needs attention in their tone).
 * The row's content starts at its top, the picture centred on the first two lines, so rows side by
 * side, one taller than the other, keep their names and second lines level.
 * What a row shows follows its own width (the `row` container: its content box, without its 1.5rem
 * of padding): the links from 20rem, the role's name and the tagline beside the name from 24rem, the
 * off roles from 26rem; under 19.5rem (360px phones and narrower) the word "Off" gives its room to
 * the pool, and under 18rem (the smallest phones, or two rows side by side on a phone held sideways)
 * the chevron too.
 * Larger text makes a row narrower in rem than at 100% on any phone (a 320px phone's row is 16.4rem
 * at 100%, 9.75rem at 150%, 7.9rem at 175% and 6.4rem at 200%), and beside the picture's 3.1rem the
 * text kept 3.3rem at 200% on a 320px phone: names ("Halfway"), "No Riot account" and the rank
 * ("Emerald" over three lines) broke inside their words. So where the text beside the picture would
 * have less than 6.5rem, which the longest rank with its crest takes ("· Grandmaster", 6.44rem) and
 * an eight-letter name with its emblem ("Newcomer", 6.1rem), the picture takes the row's first line
 * and the text the row's whole width under it (STACKED). Nothing changes at 100% text.
 * The whole row opens the profile through one link laid over it, named after the player, so the
 * social icons drawn above it stay links of their own.
 */
export function RosterRow({ look, art, name, avatarUrl, role, offRoles, offRoleShown = null, rank, showRank, riot, pool, poolLabel, lineupRole = null, setupPending = false, archived = false, isYou = false, social = [], href, peek, screen = "any" }: RosterRowProps) {
  const tagline = look?.style.identity.tagline;
  const status = !!lineupRole || setupPending || archived;
  const links = social.length > 0 && LINKS[screen] !== null;
  const riotNote = riot && riot.state !== "synced" && riot.state !== "none" ? riot : null;
  // A "·" and the rank (or "No Riot account") follow the role on its line (SEPARATOR).
  const separated = riot?.state === "none" || showRank;
  // The name's first line 2px down its 1.5rem line (where one line of it sits centred), so a name of two lines starts level with its neighbour's.
  const nameLine = (
    <span className={cn("flex min-h-6 items-start gap-1.5 pt-0.5", tagline ? "min-w-0 @max-[24rem]/row:min-w-[min(100%,6rem)] @max-[24rem]/row:basis-0 @max-[24rem]/row:grow" : "min-w-[min(100%,6rem)] basis-0 grow")}>
      {peek && href ? (
        // Over the row's own link (the Peek): the name opens the full profile, one tap as before (J3).
        <IntentLink href={href} className="touch-target relative z-[2] rounded-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-accent" data-testid="player-card" data-player-name={name}>
          <CardName look={look} name={name} className="text-md leading-snug text-fg" />
        </IntentLink>
      ) : (
        <CardName look={look} name={name} className="text-md leading-snug text-fg" />
      )}
      {isYou ? (
        <span className="inline-flex shrink-0" data-testid="card-you">
          <Badge tone="accent">You</Badge>
        </span>
      ) : null}
    </span>
  );
  return (
    <li
      className={cn(
        "group/row @container/row relative isolate flex min-h-16 items-start gap-x-2.5 border-b border-r border-border/60 px-3 py-1 transition-colors duration-150",
        STACKED_ROW,
        // Pressed: surface-3 as on every list row; on phones (no hover) surface-2, the pressed shade of the phone row checked on 5 Nov 2026.
        href && "hover:bg-surface-2 has-[[data-row-link]:active]:bg-surface-3 max-md:has-[[data-row-link]:active]:bg-surface-2",
        isYou && "bg-accent/5",
        peek?.selected && "bg-surface-3 before:absolute before:inset-y-0 before:left-0 before:z-[2] before:w-0.5 before:bg-accent",
      )}
      style={cardColourVars(look)}
      data-testid={href ? "player-card-item" : "roster-row-preview"}
      data-player-name={name}
      data-frame={look?.style.frame}
    >
      {ART[screen] !== null ? <RowArtStrip art={art} look={look} className={ART[screen] || undefined} /> : null}
      {/* Yours (an administrator sees their own row): marked as on Recent form. */}
      {isYou ? <span className="absolute inset-y-0 left-0 w-0.5 bg-accent" aria-hidden /> : null}
      {peek ? (
        // The row's press: the player Peek over the list (its address for a new tab, or before the page's code has run).
        <a href={peek.href} onClick={peek.onClick} aria-current={peek.selected ? "true" : undefined} data-peek-row={peek.id} className="absolute inset-0 z-[1] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent" data-testid="player-peek-open" data-player-name={name} data-row-link="">
          <span className="sr-only">Quick look: {name}</span>
        </a>
      ) : href ? (
        <IntentLink href={href} className="absolute inset-0 z-[1] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent" data-testid="player-card" data-player-name={name} data-row-link="">
          <span className="sr-only">{name}</span>
        </IntentLink>
      ) : null}
      {/* Centred on the first two lines (the name's 1.5rem, the gap, the second line's 1.75rem), wherever the row grows; alone on the first line where the row is stacked. */}
      <span className={cn("flex h-[3.375rem] shrink-0 items-center", STACKED_PICTURE)}>
        <CardAvatar look={look} name={name} src={avatarUrl} size="md" />
      </span>
      {/* One wrapping line of parts: the name's line, then the second line and the last ones, each a whole line (basis-full). Under the picture, across the row, where the row is stacked. */}
      <div className={cn("flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-0.5", STACKED_TEXT)}>
        {tagline ? (
          // From 24rem the name and the tagline share one column that wraps inside itself, beside the
          // badges and links, so those stay at the end of the name's line: the tagline beside the
          // name when it fits whole (its own width, at least 9rem), otherwise under the name. On a
          // narrower row the column steps aside (contents): the tagline takes a line of its own under
          // the second line.
          <span className="flex min-w-[min(100%,6rem)] basis-0 grow flex-wrap items-center gap-x-1.5 gap-y-0.5 @max-[24rem]/row:contents" data-testid="roster-name-line">
            {nameLine}
            <CardTagline look={look} lines={1} className="order-3 basis-full @min-[24rem]/row:order-none @min-[24rem]/row:min-w-[min(100%,9rem)] @min-[24rem]/row:grow @min-[24rem]/row:basis-[max-content]" />
          </span>
        ) : (
          nameLine
        )}
        {status || links || riotNote ? (
          <span className="ml-auto flex min-h-6 max-w-full shrink-0 flex-wrap items-center justify-end gap-1.5 self-start" data-testid="roster-status">
            {/* Riot data not up to date: a badge on the name's line (a line of its own made the row 80px, UD.P2); its words from 24rem, the state's dot alone on narrower rows, the whole read out. */}
            {riotNote ? (
              <span className="inline-flex max-w-full" data-testid="directory-riot" data-state={riotNote.state}>
                <Badge tone={RIOT_BADGE[riotNote.state]} className="whitespace-nowrap">
                  <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full bg-current", RIOT_TONE[riotNote.state])} aria-hidden />
                  <span aria-hidden className="@max-[24rem]/row:hidden">
                    Riot: {RIOT_SHORT[riotNote.state]}
                  </span>
                  <span className="sr-only">Riot data: {riotNote.label}</span>
                </Badge>
              </span>
            ) : null}
            {lineupRole ? (
              <span className="inline-flex max-w-full" data-testid="directory-lineup">
                <Badge tone="good">
                  {lineupRole === role ? "Lineup" : `Lineup · ${ROLE_LABELS[lineupRole]}`}
                </Badge>
              </span>
            ) : null}
            {setupPending ? <SetupIncompleteBadge wordClassName="@max-[24rem]/row:sr-only" /> : null}
            {archived ? <Badge tone="warn">Archived</Badge> : null}
            {links ? (
              <span className={cn("relative z-[2]", LINKS[screen])}>
                <CardSocialIcons links={social} owner={name} size="row" mode={href ? "interactive" : "static"} />
              </span>
            ) : null}
          </span>
        ) : null}
        {/* Wraps, never cuts: each part moves whole to the next line when it no longer fits (larger text,
            the narrowest rows), and only a part wider than a whole line wraps its own words. The pool
            keeps at least a portrait and its count (one portrait for a pool of one) and takes the rest
            of its line. */}
        <span className={cn("order-2 flex min-h-7 min-w-0 basis-full flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-fg-muted", SEPARATOR.line)} data-testid="roster-meta">
          <RoleCluster role={role} offRoles={offRoles} shown={offRoleShown} className={separated ? SEPARATOR.before : undefined} />
          {/* Without a Riot account no rank was read, so none is claimed ("Unranked" means a check found no placement). Its "·" never starts a line (SEPARATOR). */}
          {riot?.state === "none" ? (
            <span className={cn("inline-flex min-w-0 items-center gap-x-1.5", SEPARATOR.group)}>
              <Dot />
              <span className="min-w-0 text-fg-subtle [overflow-wrap:anywhere]">No Riot account</span>
            </span>
          ) : showRank ? (
            <span className={cn("inline-flex min-w-0 items-center gap-x-1.5", SEPARATOR.group)}>
              <Dot />
              <RankInline rank={rank} wrap />
            </span>
          ) : null}
          {role ? <PoolPreview champions={pool} total={pool.length} label={poolLabel} fit="count" size="xs" testId="directory-pool" className={pool.length ? cn("ml-0.5 basis-0 grow", pool.length > 1 ? "min-w-15" : "min-w-7") : "ml-0.5 min-w-0"} /> : null}
        </span>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 self-center text-fg-subtle @max-[18rem]/row:hidden" aria-hidden />
    </li>
  );
}

function Dot() {
  return (
    <span className="text-fg-subtle" aria-hidden>
      ·
    </span>
  );
}

/**
 * The main role (its icon in the card's colour; its name from 24rem, read out on narrower rows), then
 * either the off role the list is narrowed to ("· [icon] Off role", "Off" on narrower rows, the icon
 * alone under 19.5rem) or the other off roles as quiet icons from 26rem, always read out. "Roles not
 * set" for a member who has chosen none.
 */
function RoleCluster({ role, offRoles, shown, className }: { role: Role | null; offRoles: readonly Role[]; shown: Role | null; className?: string }) {
  if (!role)
    return (
      <span className={cn("min-w-0 text-fg-subtle [overflow-wrap:anywhere]", className)} data-testid="directory-no-roles">
        Roles not set
      </span>
    );
  return (
    <span className={cn("flex shrink-0 items-center gap-1.5", className)} data-testid="roster-roles" data-role={role}>
      <span className="inline-flex items-center gap-1">
        <span style={{ color: "var(--card-accent)" }} className="inline-flex">
          <RoleIcon role={role} className="h-3.5 w-3.5" decorative />
        </span>
        <span className="sr-only @min-[24rem]/row:not-sr-only">{ROLE_LABELS[role]}</span>
      </span>
      {shown ? (
        <span className="inline-flex items-center gap-1" data-testid="roster-off-role" data-role={shown}>
          <Dot />
          <RoleIcon role={shown} className="h-3.5 w-3.5 text-fg-muted" decorative />
          <span className="sr-only">{ROLE_LABELS[shown]}, </span>
          {/* Under 19.5rem (360px phones and narrower) the word gives its room to the pool, which keeps
              the row to two lines: the icon, the active filter and the pool's name still say it. */}
          <span className="@max-[19.5rem]/row:sr-only">
            Off<span className="@max-[24rem]/row:sr-only"> role</span>
          </span>
        </span>
      ) : offRoles.length ? (
        <>
          {/* "also Top": said in words where the row has room (UD.P1: quiet icons alone read as decoration); the names from 30rem. */}
          <span className="hidden items-center gap-1 text-fg-subtle @min-[26rem]/row:inline-flex" aria-hidden data-testid="roster-off-roles">
            <span>also</span>
            {offRoles.map((r) => (
              <span key={r} className="inline-flex items-center gap-0.5">
                <RoleIcon role={r} className="h-3.5 w-3.5" decorative />
                <span className="hidden @min-[30rem]/row:inline">{ROLE_LABELS[r]}</span>
              </span>
            ))}
          </span>
          <span className="sr-only">, off roles: {offRoles.map((r) => ROLE_LABELS[r]).join(", ")}</span>
        </>
      ) : null}
    </span>
  );
}
