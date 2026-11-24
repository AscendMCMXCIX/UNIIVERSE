"use client";

import * as React from "react";
import Link from "next/link";
import { IntentLink } from "@/components/ui/intent-link";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, ArrowUpFromLine, Check, ChevronRight, Pencil, Repeat2, Undo2, UserPlus, Users, X } from "lucide-react";
import type { Role } from "@/domain/roles";
import type { RosterSlot, RosterSubstitute } from "@/server/team/roster";
import { ACCENT_COLOR } from "@/domain/player-card";
import { accentCss } from "@/domain/card-style";
import { CardFrame, cardColourVars, cardShellStyle } from "@/components/players/card-look";
import { setLineupSlotAction, setLineupSubstituteAction } from "@/server/actions/players";
import type { PickerChampion } from "@/components/champions/types";
import { Button, buttonClass } from "@/components/ui/button";
import { RoleIcon } from "@/components/role-icon";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { CardArtLayer } from "@/components/players/card-art";
import { CustomiseCardButton } from "@/components/players/customise-card-button";
import { CardIdentity, CardPerformance, CardPool, CardRoleChip, PoolChampionTile, PoolColumnNames } from "@/components/players/player-card";
import { BELOW_CONTROLS, DetailModal } from "@/components/ui/detail-modal";
import { Peek, usePeek } from "@/components/ui/peek";
import { InfoTip } from "@/components/ui/info-tip";
import { BrandMark } from "@/components/brand-mark";
import { toast } from "@/components/ui/toast";
import { useLoopTrack, useSnapIndex, type SnapIndex } from "@/components/ui/use-loop-track";
import { cn } from "@/lib/cn";
import { assignmentStatus } from "@/domain/roster";
import { WIN_RATE_MIN_GAMES, WIN_RATE_TONE_CLASS, winRateTone } from "@/domain/stats/win-rate";
import { CardSocialIcons, SocialLinks } from "@/components/players/social-links";
import { formatCount, formatDayMonth } from "@/lib/format";

export type ChampionsById = Map<string, { id: string; name: string; portraitUrl: string }>;
const lookup = (championsById: ChampionsById, id: string) => championsById.get(id) ?? { id, name: id, portraitUrl: "" };
const noopSubscribe = () => () => {};

/** The front of a filled card whose role has a designated substitute: the control that turns it over. */
type FlipControl = { substituteName: string; onFlip: () => void; onIntent: () => void };

/** The back of a card: the role's substitute shown with the starter's card parts, and the way back. */
type BenchFace = {
  onBack: () => void;
  backLabel: string;
  /** Edit lineup (lineup managers only): saves this substitute as the starter. */
  start: { label: string; onStart: () => void; busy: boolean } | null;
};

// The round controls on the artwork (the same size as the card's Customise button).
const ART_BUTTON = "grid h-8 w-8 place-items-center rounded-full bg-bg/80 text-fg-muted shadow-sm shadow-black/30 transition-colors hover:bg-bg/90 hover:text-accent focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-11 pointer-coarse:w-11";

/*
  The role chip and the card's own controls share the artwork's top row. With larger text a phone's
  card is narrow for what that row holds (8rem wide at 200% on a 320px phone, 6.5rem before the
  carousel of 23 Nov 2026, where "SUPPORT" ran past the card under the turn control and read
  "SUPPO"), so the chip has a lane of its own: from the
  role's corner to the controls (0, 1 or 2 of them, by count), or to the card's own edge where there
  are none (its clip: what a chip fitted inside before it had a lane, so a chip that fitted there
  keeps its name). A control is a 2.75rem touch target 0.625rem from the edge (2rem with a mouse;
  the lane keeps the touch size), and two stand side by side, or one above the other five across and
  on a card under 9.25rem, where side by side they left the chip no room; the lane ends 0.125rem
  short of them. Where the lane is narrower than the role's threshold (CHIP_FIT), the chip shows the
  icon alone, as a round badge of the same height, and the name stays its text for screen readers.
  Each threshold is the role's chip (its name in the chip's capitals beside its icon) plus a margin
  for the browsers' text, rounded up to the next 0.01rem. Measured in Inter from 100% to 200% text,
  every 2.5%, the chips are the same in Chromium and in WebKit within 0.1px: Mid 4.872rem, Top 4.978,
  Jungle 7.001, Bottom 7.335 and Support 7.773 at most, each within 0.008rem at every size. Text drawn
  with hinting differs: the Chromium headless shell the browser tests run in on GitHub rounds each
  letter's advance to whole pixels, which makes a chip up to 0.12rem wider or narrower, by size.
  Support's chip is 7.818rem there at 150% (1.1px wider), and without a margin it ran past its
  7.79rem lane on a 375px phone. The margin is at least 0.036rem (0.6px at the usual size, 0.9px at
  150%, 1.2px at 200%): a name that shows has that much room beyond its chip in Chromium and WebKit
  at every size. In the headless shell, at the sizes the tests check (150, 175, 200%), every chip is
  within its threshold but Support's at 150%, 0.2px over, inside the tests' half-pixel allowance.
  The margin can be no larger: every card at the usual size is 12.2rem wide or more, its narrowest
  lane (beside a control, five across) is 125.19px, and WebKit tests a container's width in whole
  pixels (it took lanes of 125.2 to 125.8px for narrower than 125.12px), so Support's threshold must
  be 125px or less (7.81rem is 124.96px) for every chip there to keep its name, as it did before it
  had a lane. So at the usual size nothing changes.
*/
const CHIP_LANE = ["right-0", "right-14", "right-26.5 @4xl/lineup:right-14 @max-[9.25rem]/card:right-14"] as const;
const CHIP_FIT: Record<Role, { chip: string; label: string }> = {
  TOP: { chip: "@max-[5.02rem]/chip:p-1.5", label: "@max-[5.02rem]/chip:sr-only" },
  JUNGLE: { chip: "@max-[7.04rem]/chip:p-1.5", label: "@max-[7.04rem]/chip:sr-only" },
  MID: { chip: "@max-[4.91rem]/chip:p-1.5", label: "@max-[4.91rem]/chip:sr-only" },
  ADC: { chip: "@max-[7.38rem]/chip:p-1.5", label: "@max-[7.38rem]/chip:sr-only" },
  SUPPORT: { chip: "@max-[7.81rem]/chip:p-1.5", label: "@max-[7.81rem]/chip:sr-only" },
};

/** The card's artwork: a portrait five across (a lineup of 56rem or more), a landscape in the phone's carousel and the tablet's rows, each with its own position when the player gave one (Card Studio). */
const CARD_NARROW = { place: "cardPhone", at: "lineup" } as const;

/** How a member fits a role, as the lineup sheets name it. */
const FIT_HINT: Record<string, string> = { primary: "primary role", secondary: "off role", other: "out of role" };

/**
 * One lineup slot as a compact player card, the same structure for everyone: artwork with the
 * role and identity, this season's figures in the role they hold, and the first champions of
 * their pool for that role. The whole card opens the detail panel (full pool and statistics) over
 * the page, so the lineup never moves. Over the artwork sit only the card's own controls
 * (personalising your card, turning it over to its substitute). The artwork grows with what it
 * holds (a tagline, a long name, links), so nothing is ever cut off or drawn over the role. Cards
 * side by side keep their identities the same height (CardIdentity's `align`), so their artwork,
 * and the figures under it, stay level along the row; a shorter body takes the spare height.
 *
 * Edit lineup (lineup managers) adds a bar at the foot of the card, under everything the card
 * shows: Change (who starts in this role) and Substitute (who is its substitute), each opening a
 * sheet to choose from. The card stays fully readable and still opens its details.
 *
 * With `bench` it is the back of the card: a substitute for the role, built from the same parts,
 * where the whole card turns back to the starter.
 *
 * Card Studio previews this same component (studio-preview.tsx), on Team's lineup and on the public
 * page (`guest`), so a preview is the card itself, never a copy of it.
 */
export function RosterCard({ slot, championsById, canManageLineup, editingLineup, canEdit, viewerPlayerId, champions, onOpen, selected = false, dimmed = false, guest = false, flip, bench, turnRef, startsElsewhere, deferImages = false, align, priority = false, frozen, roleUnknown = false, publicFigures = false }: { /** A preview of a player who has not chosen a role yet (first-time setup): the chip says "Role" and shows no icon. */ roleUnknown?: boolean; /** The public page shows Riot data (Card Studio's preview of it, from your own card's brush). */ publicFigures?: boolean; slot: RosterSlot; champions: PickerChampion[]; championsById: ChampionsById; canManageLineup: boolean; editingLineup: boolean; canEdit: boolean; viewerPlayerId: string | null; onOpen: () => void; /** Its detail panel is open: lifted and outlined. */ selected?: boolean; /** Another card's panel is open: stepped back. */ dimmed?: boolean; /** The public page: no lineup suggestions, and a player who may not appear is a role placeholder. */ guest?: boolean; flip?: FlipControl; bench?: BenchFace; /** The face's turn control (front) or way back (back), for keyboard focus after a turn. */ turnRef?: React.Ref<HTMLButtonElement>; /** Who starts in another role (player id → that role's name), for the Change sheet's warnings. */ startsElsewhere?: ReadonlyMap<string, string>; /** A back nobody is about to see: the same card without its pictures (artwork, picture, champions), which load once it may turn. */ deferImages?: boolean; /** Everyone the lineup can show, so cards side by side keep their parts level (CardIdentity). */ align?: React.ComponentProps<typeof CardIdentity>["align"]; /** The lineup's first card (the one a phone shows first): its art loads at once, ahead of the others (CardArtLayer's priority). */ priority?: boolean; /** Edit lineup on a phone: the art band's and the body's heights as they were at rest, kept while the bar shows (FROZEN_WHILE_EDITING). */ frozen?: { art: number; body: number } }) {
  // The open lineup sheet, if any, and the member it opens on (a suggestion's Assign).
  const [sheet, setSheet] = React.useState<{ kind: SheetKind; pick?: string } | null>(null);
  const p = slot.player;
  const accent = p ? accentCss(p.look.style) : ACCENT_COLOR.default;
  const sub = slot.substitute?.player ?? null;
  const editing = canManageLineup && editingLineup && !bench;
  const own = !!p && p.id === viewerPlayerId && canEdit && !bench;
  // Support is judged on vision, not farm: its cards show average vision score where others show CS/min.
  const support = slot.role === "SUPPORT";
  // Main Role or Off Role for the position held (the Team page shows the assignment, not the preference).
  const status = p ? assignmentStatus(p, slot.role) : null;
  // Customise and the turn control both: five across they stand one above the other (see below).
  const twoControls = own && !editingLineup && !!flip;
  // The controls in the card's top corner (Customise, the turn control or the way back), which the role chip keeps clear of (CHIP_LANE).
  const controls = (own && !editingLineup ? 1 : 0) + (flip ? 1 : 0) + (bench ? 1 : 0);

  return (
    <article className={cn(!bench && "rise-in", "group/card @container/card relative flex h-full w-full min-w-0 flex-col overflow-hidden rounded-card border bg-surface transition-[transform,opacity,box-shadow,border-color,filter] duration-200 ease-out motion-reduce:transition-none", editingLineup ? "border-accent/50" : "border-border hover:border-border-strong", selected && "z-[1] -translate-y-1 border-accent shadow-xl shadow-black/40 ring-2 ring-accent motion-reduce:translate-y-0", dimmed && "opacity-50 saturate-[0.6]")} data-selected={selected || undefined} style={p ? { ...cardShellStyle(p.look), ...(editingLineup ? { borderColor: undefined } : {}) } : { ["--card-accent" as string]: accent }} data-frame={p?.look.style.frame} data-fx-host data-testid={bench ? `lineup-sub-${slot.role}` : `lineup-row-${slot.role}`} data-player-id={p?.id} data-player-name={p?.name} data-pool-size={slot.champions.length} data-off-role={status ? status === "off" : undefined} data-role-status={status ?? undefined}>
      <CardFrame look={p?.look} />
      {p ? (
        // The whole card opens the detail panel; the controls are drawn above this button. On the
        // back, the whole card opens the substitute's details (the card stays turned); only the
        // turn control, or Escape, turns it back to the starter.
        <button type="button" onClick={onOpen} className="absolute inset-0 z-[1] rounded-card focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent" aria-label={`${p.name}, ${slot.roleLabel}${bench ? " substitute" : ""}: ${p.statsVisible ? "champions and statistics" : "champion pool"}`} aria-haspopup="dialog" aria-expanded={selected} data-peek-row={p.id} data-testid="open-player-detail" />
      ) : null}
      {/* The artwork, with the role in its corner and the player's identity at its foot. Its
          height follows its content (a fixed height cut the identity off on narrow cards and drew
          the picture over the role), from a minimum. Its top keeps clear of the role and the
          card's controls: two controls stand one above the other five across (and on a card under
          9.25rem, see CHIP_LANE), so a card with both keeps more. A touch screen's controls
          (2.75rem) reach below the usual top, which only matters where they also reach over the
          picture: a card under 7.75rem with one control, or under 10.875rem with two side by side
          (larger text on a phone; at 200% on 320px the turn control covered the picture's edge).
          There the top keeps clear of their row. Five across on wide screens it is tall, a
          portrait card. */}
      <div className={cn("pointer-events-none relative flex min-h-[10.5rem] shrink-0 flex-col justify-end px-3 pb-2.5 pt-12 @max-xl/lineup:flex-[3_1_auto] @4xl/lineup:min-h-[clamp(13rem,29vh,20rem)] ", TIGHT.art, "[&_.card-art-img]:group-hover/card:scale-[1.03] motion-reduce:[&_.card-art-img]:group-hover/card:scale-100", !guest && cn("@max-xl/lineup:min-h-[7.5rem]", SIDEWAYS_ROW.art), controls === 1 && "@max-[7.75rem]/card:pointer-coarse:pt-[3.625rem]", twoControls && "@4xl/lineup:pt-[5.25rem] @4xl/lineup:pointer-coarse:pt-[6.75rem] @max-[10.875rem]/card:pointer-coarse:pt-[3.625rem] @max-[9.25rem]/card:pt-[5.25rem] @max-[9.25rem]/card:pointer-coarse:pt-[6.75rem]")} style={frozen ? { minHeight: frozen.art } : undefined} data-testid="card-art">
        {/* Splash of the player's chosen champion and skin, darkened towards the text, tinted with their accent. */}
        <CardArtLayer art={deferImages ? null : (p?.art ?? null)} accent={accent} kind="splash" position="center 22%" look={p?.look} motion="hover" foot={!!p} priority={priority} place="card" narrow={CARD_NARROW} />
        {/* The role chip in its lane, clear of the card's controls: the icon alone where the lane is too narrow for the role's name (CHIP_LANE). */}
        <span className={cn("absolute left-3 top-3 flex @container/chip", CHIP_LANE[controls])} data-testid="assigned-role-lane">
          {roleUnknown ? <CardRoleChip role={null} label="Role" className="shrink-0" /> : <CardRoleChip role={slot.role} label={slot.roleLabel} className={cn("shrink-0", CHIP_FIT[slot.role].chip)} labelClassName={CHIP_FIT[slot.role].label} />}
        </span>
        {p ? (
          <span className="relative">
            <CardIdentity look={p.look} name={p.name} avatarUrl={deferImages ? null : p.avatarUrl} rank={p.rank} showRank={p.statsVisible} isYou={p.id === viewerPlayerId} status={roleUnknown ? null : status} role={roleUnknown ? null : slot.role} tag={bench ? <SubstituteTag /> : null} social={p.social.length ? <CardSocialIcons links={p.social} owner={p.name} className="pointer-events-auto relative z-[2]" /> : null} align={align} phoneSide={guest || twoControls ? false : controls ? "control" : true} />
          </span>
        ) : null}
      </div>
      {/* The card's own controls, over the artwork's top corner: personalising your own card, and
          turning the card. Side by side; one above the other five across, where the cards are
          narrow and the artwork tall, and on a card under 9.25rem (larger text on a phone), where
          side by side they left the role no room. Lineup changes are never here: they sit at the
          card's foot. */}
      <span className="absolute right-2.5 top-2.5 z-[2] flex items-center gap-1.5 empty:hidden @4xl/lineup:flex-col @4xl/lineup:items-end @max-[9.25rem]/card:flex-col @max-[9.25rem]/card:items-end" data-card-overlay>
        {own && !editingLineup && p ? <CustomiseCardButton variant="icon" ownLinks playerId={p.id} name={p.name} avatarUrl={p.avatarUrl} art={p.art} accent={p.cardAccent} look={p.look} champions={champions} poolIds={p.poolIds} preview={{ role: slot.role, rank: p.rank, showRank: p.statsVisible, status, season: p.season, poolIds: slot.champions.map((c) => c.championId), social: p.social, pool: slot.champions, seasonLabel: p.seasonLabel, primaryRole: p.primaryRole, offRoles: [p.profile.secondaryRole, ...p.profile.additionalRoles.map((r) => r.role)].filter((r): r is Role => !!r && r !== p.primaryRole), lineupRole: slot.role }} origin="team" publicFigures={publicFigures} /> : null}
        {bench ? (
          <button type="button" ref={turnRef} className={ART_BUTTON} onClick={bench.onBack} aria-label={bench.backLabel} title="Back to the starter" data-testid="flip-back">
            <Undo2 className="h-4 w-4" aria-hidden />
          </button>
        ) : null}
        {flip ? <FlipButton flip={flip} roleLabel={slot.roleLabel} buttonRef={turnRef} /> : null}
      </span>
      {p ? (
        // The body continues the artwork (the card's accent fades down from it), so identity, season
        // and pool read as one card, not three strips. Every filled card has the same parts in the
        // same order, so a row of cards lines up whatever each player has recorded.
        <div className={cn("pointer-events-none relative flex flex-1 flex-col gap-2.5 px-3 pb-3 pt-2.5 @max-xl/lineup:flex-[1_1_auto] @max-xl/lineup:justify-evenly", TIGHT.body)} style={{ backgroundImage: "linear-gradient(to bottom, color-mix(in srgb, var(--card-accent) 7%, transparent), transparent 70%)", ...(frozen ? { minHeight: frozen.body } : null) }} data-card-body>
          {p.statsVisible ? <CardPerformance season={p.season} support={support} roleLabel={slot.roleLabel} /> : null}
          <div className={cn("flex flex-col gap-1.5", TIGHT.pool)} data-card-pool>
            {/* Under 9.75rem, which only larger text makes, the pool's name wraps instead of ending in
                "…" ("SUPPO…" at 200% on a 320px phone): the count stays beside it while its longest
                word fits there, otherwise it takes a line of its own, still on the right. */}
            <p className="flex items-center justify-between text-2xs font-medium uppercase tracking-label text-fg-subtle @max-[9.75rem]/card:flex-wrap">
              <span className="truncate @max-[9.75rem]/card:min-w-min @max-[9.75rem]/card:grow @max-[9.75rem]/card:basis-0 @max-[9.75rem]/card:whitespace-normal">{roleUnknown ? "Champion" : slot.roleLabel} pool</span>
              <span className="inline-flex items-center gap-0.5 text-2xs normal-case tracking-normal group-hover/card:text-[var(--card-accent)] @max-[9.75rem]/card:ml-auto">
                {slot.champions.length ? (
                  <>
                    {slot.champions.length}
                    <span className="@max-[15rem]/card:sr-only"> champion{slot.champions.length === 1 ? "" : "s"}</span>
                  </>
                ) : null}
                <ChevronRight className="h-3.5 w-3.5" aria-hidden />
              </span>
            </p>
            <CardPool champions={slot.champions.map((c) => ({ ...lookup(championsById, c.championId), ...(deferImages ? { portraitUrl: "" } : null), games: p.statsVisible ? c.games : null, winRate: p.statsVisible ? c.winRate : null, tierLabel: p.statsVisible ? c.tierLabel : null }))} roleLabel={slot.roleLabel} showFigures={p.statsVisible} />
          </div>
        </div>
      ) : guest ? (
        // Public page: the role is held by a player who may not appear (archived, off the team or
        // deactivated: no name, picture or link), or not assigned yet. Nothing else is suggested.
        <div className="flex flex-1 items-center gap-3 px-3.5 pb-3.5 pt-3 text-sm text-fg-subtle" data-testid={slot.privateMember ? `private-member-${slot.role}` : `vacancy-${slot.role}`}>
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-border-strong bg-surface-2/60">
            <RoleIcon role={slot.role} className="h-5 w-5" />
          </span>
          {slot.privateMember ? `${slot.roleLabel} · team member` : "Not assigned yet"}
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-3 px-3.5 pb-3.5 pt-3" data-testid={`vacancy-${slot.role}`}>
          <div className="flex items-center gap-3 text-sm text-fg-subtle">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-dashed border-border-strong">
              <UserPlus className="h-5 w-5" aria-hidden />
            </span>
            {canManageLineup ? (editingLineup ? "Choose a player with Assign" : "No player yet: use Edit lineup") : "Not assigned yet"}
          </div>
          <div className="border-t border-border pt-3">
            <p className="text-xs font-medium text-fg-subtle">Suggested</p>
            {slot.suggestions.length === 0 ? (
              <p className="mt-1 text-sm text-fg-muted">No registered player lists {slot.roleLabel} as a role.{canManageLineup ? " An administrator can add their account." : ""}</p>
            ) : (
              // One line per suggestion (its first two reasons, cut short where they do not fit; all of
              // them for screen readers), so an empty role is no taller than a filled card.
              <ul className="mt-1.5 divide-y divide-border/60" data-testid="lineup-suggestions">
                {slot.suggestions.slice(0, 3).map((sg) => (
                  <li key={sg.playerId} className="flex items-center justify-between gap-2 py-1.5">
                    <span className="min-w-0">
                      <IntentLink href={`/players/${sg.playerId}`} className="block truncate text-sm font-medium text-fg hover:underline">
                        {sg.name}
                      </IntentLink>
                      <span className="block truncate text-xs text-fg-muted" title={sg.reasons.join(" · ")}>
                        {sg.reasons.slice(0, 2).join(" · ")}
                        {sg.reasons.length > 2 ? <span className="sr-only"> · {sg.reasons.slice(2).join(" · ")}</span> : null}
                      </span>
                    </span>
                    {canManageLineup && editingLineup ? (
                      <Button size="sm" variant="outline" className="relative z-[2]" onClick={() => setSheet({ kind: "starter", pick: sg.playerId })} aria-haspopup="dialog" aria-label={`Assign ${sg.name} to ${slot.roleLabel}`}>
                        Assign
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
      {editing ? (
        // Edit lineup: this role's two choices, at the foot of the card where they never cover the player.
        // On a card under 14.25rem (five across a laptop) their icons step aside, so both labels stay
        // whole side by side ("Substitute" was cut to "Substit…" there).
        <div className="relative z-[2] grid grid-cols-2 gap-2 border-t border-white/10 bg-bg/50 p-2.5" data-testid={`lineup-actions-${slot.role}`}>
          <Button size="sm" variant="outline" onClick={() => setSheet({ kind: "starter" })} aria-haspopup="dialog" aria-label={`${p ? "Change" : "Assign"} ${slot.roleLabel} player`} className="min-w-0 @max-[14.25rem]/card:[&>svg]:hidden" data-testid={`lineup-change-${slot.role}`}>
            <ArrowLeftRight className="h-3.5 w-3.5 shrink-0" aria-hidden /> <span className="truncate">{p ? "Change" : "Assign"}</span>
          </Button>
          <Button size="sm" variant="outline" onClick={() => setSheet({ kind: "substitute" })} aria-haspopup="dialog" aria-label={sub ? `Change the ${slot.roleLabel} substitute (${sub.name})` : `Choose a ${slot.roleLabel} substitute`} className="min-w-0 @max-[14.25rem]/card:[&>svg]:hidden" data-testid={`lineup-substitute-${slot.role}`}>
            <Users className="h-3.5 w-3.5 shrink-0" aria-hidden /> <span className="truncate">Substitute</span>
          </Button>
        </div>
      ) : null}
      {bench?.start ? (
        // The back in Edit lineup: this substitute takes the role (and the starter becomes the substitute).
        <div className="relative z-[2] border-t border-white/10 bg-bg/50 p-2.5">
          <Button size="sm" variant="outline" className="w-full" disabled={bench.start.busy} onClick={bench.start.onStart} aria-label={bench.start.label} title={bench.start.label} data-testid="start-substitute">
            <ArrowUpFromLine className="h-3.5 w-3.5" aria-hidden /> Make starter
          </Button>
        </div>
      ) : null}
      {sheet ? <LineupSheet slot={slot} kind={sheet.kind} pick={sheet.pick} startsElsewhere={startsElsewhere} onClose={() => setSheet(null)} /> : null}
    </article>
  );
}

type SheetKind = "starter" | "substitute";

/**
 * Edit lineup, one choice at a time: who starts in a role, or who is its substitute. Each member
 * who can take it is listed with their picture and how the role fits them; the current choice is
 * marked. Picking another changes nothing until Save, and Cancel (or closing the sheet) leaves the
 * lineup as it was. A pick who starts in another role is flagged, since saving moves them and
 * leaves that role empty. On a phone the sheet rises from the bottom edge, within reach.
 */
function LineupSheet({ slot, kind, pick, startsElsewhere, onClose }: { slot: RosterSlot; kind: SheetKind; /** The member chosen when it opens (a suggestion's Assign); the current choice otherwise. */ pick?: string; startsElsewhere?: ReadonlyMap<string, string>; onClose: () => void }) {
  const router = useRouter();
  const starter = kind === "starter";
  const current = starter ? (slot.player?.id ?? null) : (slot.substitute?.player.id ?? null);
  const [choice, setChoice] = React.useState<string | null>(pick ?? current);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const options = starter
    ? slot.candidates.map((c) => ({ id: c.id, name: c.name, avatarUrl: c.avatarUrl, hint: [FIT_HINT[c.fit] ?? null, c.setupPending ? "setup incomplete" : null].filter(Boolean).join(" · "), moves: c.id !== current ? (startsElsewhere?.get(c.id) ?? null) : null }))
    : slot.substituteCandidates.map((c) => ({ id: c.id, name: c.name, avatarUrl: c.avatarUrl, hint: FIT_HINT[c.fit] ?? "", moves: null }));
  const chosen = options.find((o) => o.id === choice);
  const save = async () => {
    setBusy(true);
    setError(null);
    const r = starter ? await setLineupSlotAction(slot.role, choice) : await setLineupSubstituteAction(slot.role, choice);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    toast.success(starter ? (choice ? `${slot.roleLabel} updated.` : `${slot.roleLabel} cleared.`) : choice ? `${slot.roleLabel} substitute updated.` : `${slot.roleLabel} substitute removed.`);
    onClose();
    router.refresh();
  };
  const none = starter ? (current ? `Nobody: leave ${slot.roleLabel} empty` : null) : "No substitute";
  // One tab stop for the group (the choice, else the first option); arrow keys move the choice.
  const ids: Array<string | null> = [...options.map((o) => o.id), ...(none ? [null] : [])];
  const tabStop = ids.includes(choice) ? choice : ids[0];
  const group = React.useRef<HTMLDivElement>(null);
  const onArrow = (e: React.KeyboardEvent) => {
    const step = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
    const radios = [...(group.current?.querySelectorAll<HTMLButtonElement>("[role=radio]:not(:disabled)") ?? [])];
    const at = radios.indexOf(document.activeElement as HTMLButtonElement);
    if (!step || at < 0) return;
    e.preventDefault();
    const next = radios[(at + step + radios.length) % radios.length]!;
    next.focus();
    next.click();
  };
  const option = (id: string | null, body: React.ReactNode, testId: string, opts: { name?: string; disabled?: boolean } = {}) => (
    <button key={id ?? "none"} type="button" role="radio" aria-checked={choice === id} tabIndex={id === tabStop && !opts.disabled ? 0 : -1} disabled={opts.disabled || busy} onClick={() => setChoice(id)} className={cn("flex min-h-14 w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50", choice === id ? "border-accent bg-accent/10" : "border-border enabled:hover:border-border-strong enabled:hover:bg-surface-2/60")} data-testid={testId} data-player-name={opts.name}>
      {body}
      <span className={cn("ml-auto grid h-5 w-5 shrink-0 place-items-center rounded-full border-2", choice === id ? "border-accent bg-accent" : "border-border-strong")} aria-hidden>
        {choice === id ? <Check className="h-3 w-3 text-bg" /> : null}
      </span>
    </button>
  );
  return (
    <DetailModal
      open
      onClose={onClose}
      size="sheet"
      title={starter ? `${slot.roleLabel}: who starts` : `${slot.roleLabel}: substitute`}
      description={starter ? `Members who list ${slot.roleLabel}. Nothing changes until you save.` : `One member on the bench who lists ${slot.roleLabel}, shown on the back of the card. Nothing changes until you save.`}
      testId={starter ? `lineup-sheet-${slot.role}` : `substitute-sheet-${slot.role}`}
      footer={
        <>
          {error ? (
            <p role="alert" className="mr-auto self-center text-sm text-bad" data-testid="lineup-sheet-error">
              {error}
            </p>
          ) : null}
          <Button variant="ghost" onClick={onClose} disabled={busy} data-testid="lineup-sheet-cancel">
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void save()} disabled={busy || choice === current} data-testid="lineup-sheet-save">
            {busy ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <div ref={group} role="radiogroup" aria-label={starter ? `${slot.roleLabel} starter` : `${slot.roleLabel} substitute`} onKeyDown={onArrow} className="space-y-1.5">
        {options.length === 0 ? <p className="rounded-lg border border-dashed border-border px-3 py-3 text-sm text-fg-muted">{starter ? `No team member lists ${slot.roleLabel}.` : `Nobody on the bench lists ${slot.roleLabel}.`}</p> : null}
        {options.map((o) =>
          option(
            o.id,
            <>
              <Avatar name={o.name} src={o.avatarUrl} size="sm" />
              {/* The name and its hint wrap where the row is narrow (a 320px phone at 200% text), never cut
                  to nothing: truncated, "Demo Top" was 0px wide beside "Now". */}
              <span className="min-w-0 grow">
                <span className="flex flex-wrap items-center gap-x-1.5">
                  <span className="min-w-0 text-sm font-medium text-fg [overflow-wrap:break-word]">{o.name}</span>
                  {o.id === current ? <Badge tone="accent">Now</Badge> : null}
                </span>
                <span className="block text-xs text-fg-muted [overflow-wrap:break-word]">{o.hint}</span>
                {o.moves ? <span className="block text-xs text-warn">Starts at {o.moves} now: saving moves them and leaves {o.moves} empty</span> : null}
              </span>
            </>,
            starter ? "lineup-option" : "substitute-option",
            { name: o.name },
          ),
        )}
        {none ? option(null, <span className="flex min-w-0 items-center gap-3 text-sm text-fg-muted"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-dashed border-border-strong"><X className="h-4 w-4" aria-hidden /></span><span className="min-w-0 [overflow-wrap:break-word]">{none}</span></span>, starter ? "clear-role" : "remove-substitute") : null}
        {starter && slot.waiting.length ? (
          <>
            <p className="pt-2.5 text-xs font-medium text-fg-subtle">Roles not chosen yet</p>
            {slot.waiting.map((w) =>
              option(
                w.id,
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-fg [overflow-wrap:break-word]">{w.name}</span>
                  <span className="block text-xs text-fg-subtle">setup incomplete: no role chosen yet</span>
                </span>,
                "lineup-waiting",
                { name: w.name, disabled: true },
              ),
            )}
          </>
        ) : null}
      </div>
      {chosen?.moves ? <span className="sr-only" aria-live="polite">{`${chosen.name} starts at ${chosen.moves} now. Saving moves them and leaves ${chosen.moves} empty.`}</span> : null}
    </DetailModal>
  );
}

/** The substitute side's label, beside the role status and drawn like it: "Sub", read as the whole word "Substitute" (a word split across hidden text is read in two parts). */
function SubstituteTag() {
  return (
    <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full border border-border-strong bg-bg/70 px-1.5 py-px text-2xs font-semibold leading-4 text-fg @min-[17rem]/card:text-xs" title="Substitute" data-testid="substitute-label">
      <span aria-hidden>Sub</span>
      <span className="sr-only">Substitute</span>
    </span>
  );
}

/** Turns a starter's card over to the role's substitute: one quiet icon on the artwork, like Customise. */
function FlipButton({ flip, roleLabel, buttonRef }: { flip: FlipControl; roleLabel: string; buttonRef?: React.Ref<HTMLButtonElement> }) {
  return (
    <button type="button" ref={buttonRef} onClick={flip.onFlip} onPointerEnter={flip.onIntent} onPointerDown={flip.onIntent} onFocus={flip.onIntent} className={ART_BUTTON} aria-label={`Turn over to the ${roleLabel} substitute, ${flip.substituteName}`} title="Show the substitute" data-testid="flip-to-substitute">
      <Repeat2 className="h-4 w-4" aria-hidden />
    </button>
  );
}

const TURN_MS = 460;
/** --ease-turn: symmetric, so the card is edge-on at exactly half time, the moment the faces swap. */
const TURN_EASE = "cubic-bezier(0.6, 0, 0.4, 1)";

/**
 * One turn of a card, on one timeline (Web Animations): the rotation, a slight dip, and the two
 * faces trading places at half time, when the card is edge-on. The face turned away is transparent
 * and `visibility: hidden` from that moment: phone browsers draw some of a face's parts on layers of
 * their own (the art's moving effects, the links and controls painted over them) and do not always
 * cull those with the face, but every part inherits the face's visibility. The face turning in is
 * only transparent until then, so keyboard focus can move to it as the turn starts. The links and
 * controls (data-card-overlay) also fade out as the turn begins and back in as it settles, so none is
 * ever seen apart from its face. A reversed turn plays the same timeline backwards, so the swap stays
 * at the edge-on moment. Returns null where the browser cannot animate (the faces swap).
 */
function startTurn(root: HTMLElement, toBack: boolean): Animation[] | null {
  const inner = root.querySelector<HTMLElement>(":scope > .flip-card-inner");
  const front = inner?.querySelector<HTMLElement>(":scope > .flip-face-front");
  const back = inner?.querySelector<HTMLElement>(":scope > .flip-face-back");
  if (!inner || !front || !back || typeof inner.animate !== "function") return null;
  // "both": held at whichever end the turn finishes on, until it is cleared in the same frame.
  const timing: KeyframeAnimationOptions = { duration: TURN_MS, fill: "both" };
  const shown = { opacity: 1, visibility: "visible" };
  const gone = { opacity: 0, visibility: "hidden" };
  const leaving = [shown, { ...shown, offset: 0.5 }, { ...gone, offset: 0.5 }, gone];
  const arriving = [{ opacity: 0 }, { opacity: 0, offset: 0.5 }, { opacity: 1, offset: 0.5 }, { opacity: 1 }];
  const [from, to] = toBack ? [front, back] : [back, front];
  const overlays = (face: HTMLElement) => [...face.querySelectorAll<HTMLElement>("[data-card-overlay]")];
  return [
    inner.animate({ rotate: toBack ? ["y 0deg", "y 180deg"] : ["y 180deg", "y 0deg"] }, { ...timing, easing: TURN_EASE }),
    inner.animate([{ scale: 1, easing: "ease-in-out" }, { scale: 0.96, offset: 0.5, easing: "ease-in-out" }, { scale: 1 }], timing),
    from.animate(leaving, timing),
    to.animate(arriving, timing),
    ...overlays(from).map((el) => el.animate([{ opacity: 1 }, { opacity: 0, offset: 0.2 }, { opacity: 0 }], timing)),
    ...overlays(to).map((el) => el.animate([{ opacity: 0 }, { opacity: 0, offset: 0.6 }, { opacity: 1, offset: 0.85 }, { opacity: 1 }], timing)),
  ];
}

/**
 * A filled lineup card that turns over (a 3D turn on the vertical axis, see .flip-card in
 * globals.css) to show the role's designated substitute on the same card parts as the starter.
 * Only a role with a substitute can turn: without one the card has no turn control at all.
 * Turning is this card's own state: nothing is saved, no other card re-renders, nothing is fetched
 * (the substitute arrives with the roster), and a reload shows the saved lineup.
 *
 * In Edit lineup (lineup managers), the back's Start makes the substitute the starter (and the
 * former starter the substitute) through the same lineup action as Change, guarded so a lineup
 * someone else changed meanwhile is never overwritten; turning back is the cancel.
 *
 * The two faces share one grid cell, so the card is as tall as the taller of them: a substitute
 * with more to show (a longer name, tagline or labels) makes the card taller instead of being cut
 * off at the starter's height. So the back is built with the card, and the card has its final
 * height from the start: building it on the way to a turn moved the lineup under the pointer (a
 * taller card re-centres the lineup) as it was pressed. Its pictures (artwork, picture, champions)
 * load only once the card is about to turn (a pointer on the turn control, or focus).
 */
type CardSide = "starter" | "substitute";

function LineupCard({ openSide, onOpenSide, ...props }: Omit<React.ComponentProps<typeof RosterCard>, "onOpen" | "selected"> & { /** Which side of this card has its details open, if any. */ openSide: CardSide | null; onOpenSide: (side: CardSide) => void }) {
  const { slot, canManageLineup, editingLineup } = props;
  const router = useRouter();
  const [flipped, setFlipped] = React.useState(false);
  // The back's pictures load from the first sign of a turn (see deferImages).
  const [backReady, setBackReady] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [refreshing, startRefresh] = React.useTransition();
  const rootRef = React.useRef<HTMLDivElement>(null);
  const frontButton = React.useRef<HTMLButtonElement>(null);
  const backButton = React.useRef<HTMLButtonElement>(null);
  const timers = React.useRef<number[]>([]);
  const turning = React.useRef<Animation[]>([]);
  const wasShown = React.useRef(false);
  const saved = React.useRef(false);
  const sub: RosterSubstitute | null = slot.substitute;
  const starter = slot.player;
  // The substitute's side is showing.
  const shown = flipped && !!starter && !!sub;

  // The control keyboard focus is to move to, until it has it (see turn).
  const focusTo = React.useRef<React.RefObject<HTMLButtonElement | null> | null>(null);
  const placeFocus = React.useCallback(() => {
    const target = focusTo.current?.current;
    if (!target) return;
    target.focus({ preventScroll: true });
    if (document.activeElement === target) focusTo.current = null;
  }, []);
  // Once its side is shown, the control can stay hidden for a few more frames while the card's
  // parts settle (measured: about 30ms after Make starter, with reduced motion), and focus() does
  // nothing on a hidden control: so focus is tried each frame, for up to a second, until it lands.
  const settleFocus = React.useCallback(() => {
    let frames = 0;
    const attempt = () => {
      if (!focusTo.current) return;
      placeFocus();
      if (focusTo.current && ++frames < 60) requestAnimationFrame(attempt);
    };
    attempt();
  }, [placeFocus]);
  const turn = React.useCallback(
    (to: boolean, focus = false) => {
      // Focus moves with the turn when it was on the card, or when the turn asks for it.
      const moveFocus = focus || !!rootRef.current?.contains(document.activeElement);
      setBackReady(true);
      setFlipped(to);
      for (const t of timers.current) clearTimeout(t);
      timers.current = [];
      // Keyboard focus follows the turn to the other face as soon as it is no longer inert, or, if
      // that face is still hidden (a turn reversed past half way), as the turn ends.
      focusTo.current = moveFocus ? (to ? backButton : frontButton) : null;
      if (moveFocus) timers.current.push(window.setTimeout(placeFocus, 0));
    },
    [placeFocus],
  );
  // The turn starts with the side's change, before that frame is drawn (the resting styles already
  // show the new side; the animation holds the old one and turns it). Turned again mid-turn, the
  // same turn plays back from where it is.
  React.useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el || wasShown.current === shown) return;
    wasShown.current = shown;
    // This commit made the side now shown interactive (no longer inert), so keyboard focus can move
    // to it now. A turn with an animation tries again as it ends; with reduced motion there is none,
    // and focus asked for from an effect (after Make starter saved) could otherwise arrive too early.
    settleFocus();
    const inFlight = turning.current.length > 0 && turning.current.every((a) => a.playState === "running" || a.playState === "paused");
    if (inFlight) {
      for (const a of turning.current) a.reverse();
      return;
    }
    for (const a of turning.current) a.cancel();
    turning.current = [];
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const next = startTurn(el, shown);
    if (!next) return;
    // The deeper shadow and will-change last for the turn only.
    el.dataset.turn = "turning";
    turning.current = next;
    next[0]!.onfinish = () => {
      if (turning.current[0] !== next[0]) return;
      delete el.dataset.turn;
      for (const a of turning.current) a.cancel();
      turning.current = [];
      placeFocus();
    };
  }, [shown, placeFocus, settleFocus]);
  React.useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      turning.current.forEach((a) => a.cancel());
    },
    [],
  );
  // After a saved substitution the new lineup arrives, then the card turns back to show the new
  // starter. Make starter was disabled while it saved, which left keyboard focus nowhere: it moves
  // to the card's turn control (the former starter is now the substitute behind it), unless the
  // member has since put it somewhere else.
  React.useEffect(() => {
    if (refreshing || !saved.current) return;
    saved.current = false;
    const lost = document.activeElement === document.body || !!rootRef.current?.contains(document.activeElement);
    turn(false, lost);
  }, [refreshing, turn]);
  const canTurn = !!starter && !!sub;
  const front = <RosterCard {...props} onOpen={() => onOpenSide("starter")} selected={openSide === "starter"} flip={canTurn ? { substituteName: sub.player.name, onFlip: () => turn(true), onIntent: () => setBackReady(true) } : undefined} turnRef={frontButton} />;
  if (!starter) return front;

  const backLabel = `Back to ${starter.name}, the starting ${slot.roleLabel}`;
  const startSub = async () => {
    if (!sub) return;
    setSaving(true);
    const r = await setLineupSlotAction(slot.role, sub.player.id, { replacing: starter.id });
    setSaving(false);
    if (!r.ok) {
      // Refused (the lineup changed, or this account may no longer manage it): show the saved state.
      toast.error(r.error);
      startRefresh(() => router.refresh());
      return;
    }
    toast.success(`${sub.player.name} now starts at ${slot.roleLabel}; ${starter.name} is the substitute.`);
    saved.current = true;
    startRefresh(() => router.refresh());
  };
  const back = sub ? (
    <RosterCard
      {...props}
      slot={{ ...slot, player: sub.player, champions: sub.champions }}
      canEdit={false}
      deferImages={!backReady}
      priority={false}
      onOpen={() => onOpenSide("substitute")}
      selected={openSide === "substitute"}
      bench={{
        onBack: () => turn(false),
        backLabel,
        // Named from its visible words first, so speech input finds it by what it says.
        start: canManageLineup && editingLineup ? { label: `Make starter: ${sub.player.name} starts as ${slot.roleLabel}; ${starter.name} becomes the substitute`, onStart: () => void startSub(), busy: saving || refreshing } : null,
      }}
      turnRef={backButton}
    />
  ) : null;

  // A substitute removed meanwhile (Edit lineup, or someone else) leaves nothing to show: the front.
  return (
    <div ref={rootRef} className="flip-card relative h-full w-full min-w-0" data-flipped={shown || undefined} data-substitute-id={sub?.player.id} data-testid={`lineup-card-${slot.role}`}>
      <div className="flip-card-inner relative grid h-full w-full">
        <div className="flip-face flip-face-front col-start-1 row-start-1 min-w-0" inert={shown} aria-hidden={shown || undefined}>
          {front}
        </div>
        {back ? (
          <div className="flip-face flip-face-back col-start-1 row-start-1 min-w-0" inert={!shown} aria-hidden={!shown || undefined} onKeyDown={(e) => e.key === "Escape" && turn(false)}>
            {back}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * A lineup player in detail, in the shared centred window (the whole screen on phones), as tall as
 * its content: their card opened up (artwork, role, identity and rank, the way to their full
 * profile), then the season in the role they hold as one strip of figures, then their whole pool
 * for it as one aligned list, the first choice marked in its row. Previous / next move through the
 * lineup without closing it; the pool is edited on the profile.
 */
/**
 * A team player's details, for the Team lineup's Peek (a docked panel on wider screens, the whole
 * screen on a phone): the player's card opened up (`hero`) and this season's figures and pool (`body`).
 */
export function playerDetail({ slot, championsById, canEdit, canViewProfile, profileHref, editHref, position }: { slot: RosterSlot; championsById: ChampionsById; canEdit: boolean; canViewProfile: boolean; profileHref: string; /** Where this viewer edits the pool: their own profile, or the player's profile for admins. */ editHref: string; position: string }): { title: string; hero: React.ReactNode; body: React.ReactNode } {
  const p = slot.player!;
  const support = slot.role === "SUPPORT";
  const season = p.season;
  const status = assignmentStatus(p, slot.role);
  const figure = (label: string, value: string, sub: React.ReactNode, tone?: string) => (
    <div className="min-w-0">
      <dt className="text-2xs font-semibold uppercase tracking-label text-fg-subtle">{label}</dt>
      <dd className={cn("text-2xl font-bold leading-tight tabular-nums", tone ?? "text-fg")}>{value}</dd>
      <dd className="truncate text-xs tabular-nums text-fg-muted">{sub}</dd>
    </div>
  );

  // The player's card, opened up: their saved artwork and colours behind the role, identity and
  // rank, with this season's figures in the same block and the way to the full profile. Static
  // art only (no card motion, no blur), so opening and moving between players stays light. The
  // shell style's `--card-accent` is the readable one (lightened to 4.5:1 on the surface), the same
  // the card draws its text and icons in.
  const hero = (
    <div className="relative isolate" style={{ ...cardShellStyle(p.look, { glow: false }), borderColor: undefined }} data-testid="player-detail-hero">
      <CardArtLayer art={p.art} accent={accentCss(p.look.style)} kind="splash" position="center 22%" look={p.look} decorate={false} strength="normal" testId="detail-art" foot place="peek" />
      <div className={cn("relative flex min-h-[var(--peek-hero-min,11rem)] flex-col justify-end gap-2.5 px-4 pb-4 sm:min-h-[var(--peek-hero-min,12.5rem)] sm:px-6 sm:pb-5", BELOW_CONTROLS)}>
        <h2 id="player-detail-title" className="sr-only">
          {p.name} · {slot.roleLabel}
        </h2>
        <CardRoleChip role={slot.role} label={slot.roleLabel} className="absolute left-4 top-3 sm:left-6 sm:top-4" />
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 [text-shadow:0_1px_10px_rgb(0_0_0/0.6)]">
          <CardIdentity look={p.look} name={p.name} avatarUrl={p.avatarUrl} rank={p.rank} showRank={p.statsVisible} status={status} role={slot.role} layout="side" nameClassName="text-2xl sm:text-3xl" />
          {canViewProfile ? (
            <IntentLink href={profileHref} className={buttonClass("primary", "sm", "shrink-0 [text-shadow:none]")} data-testid="detail-profile-link">
              Full profile <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            </IntentLink>
          ) : null}
        </div>
        <SocialLinks links={p.social} owner={p.name} className="[text-shadow:none]" />
        <p className="flex flex-col gap-y-0.5 text-xs text-fg-muted" data-testid="player-detail-position">
          <span>
            {slot.roleLabel} · {position}{p.statsVisible ? ` · ${p.seasonLabel}` : ""}
          </span>
          {/* One line of ranked progress (its own line, wrapping as a sentence); the chart and every rank change are on the profile. */}
          {p.rankChange ? (
            <Link href={`/players/${p.id}${p.rankChange.queue === "flex" ? "?rq=flex" : ""}#ranked-progress`} className="self-start hover:text-fg" data-testid="detail-rank-change">
              Ranked {p.rankChange.queue === "flex" ? "Flex" : "Solo/Duo"}{" "}
              <span className={cn("font-semibold tabular-nums", p.rankChange.points > 0 ? "text-good" : p.rankChange.points < 0 ? "text-bad" : "text-fg-muted")}>
                {p.rankChange.points > 0 ? "+" : ""}
                {p.rankChange.points} ladder points
              </span>{" "}
              {p.rankChange.since === null ? `in ${p.rankChange.days} days` : `since ${formatDayMonth(p.rankChange.since)}`} ({p.rankChange.from} → {p.rankChange.to})
            </Link>
          ) : null}
        </p>
      </div>
    </div>
  );
  const body = (
    <>
      {/* This season in the role: the three figures a lineup is judged on, the record as a bar,
          then the rest in one quiet line. */}
      {p.statsVisible ? (
        season ? (
          <section aria-labelledby="detail-season" className="mb-5 rounded-panel border border-border bg-bg/40 p-3 sm:p-3.5" data-testid="detail-season">
            <h3 id="detail-season" className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-fg-muted">
              {slot.roleLabel} this season
              <InfoTip text={`This season's ranked and normal games as ${slot.roleLabel}, on any champion, from all their Riot accounts.`} label="What these figures count" />
            </h3>
            <dl className="grid grid-cols-3 gap-3">
              {figure("Win rate", season.winRate === null ? "—" : `${Math.round(season.winRate * 100)}%`, `${season.wins}W ${season.losses}L${season.games < WIN_RATE_MIN_GAMES.season ? " · small sample" : ""}`, WIN_RATE_TONE_CLASS[winRateTone(season.winRate, season.games, WIN_RATE_MIN_GAMES.season)])}
              {figure("KDA", season.perfectKda ? "Perfect" : season.kda === null ? "—" : season.kda.toFixed(2), season.kills !== null && season.deaths !== null && season.assists !== null ? `${season.kills.toFixed(1)} / ${season.deaths.toFixed(1)} / ${season.assists.toFixed(1)}` : "\u00a0")}
              {figure(support ? "Vision" : "CS/min", support ? (season.visionPerGame === null ? "—" : season.visionPerGame.toFixed(1)) : season.csPerMinute === null ? "—" : season.csPerMinute.toFixed(1), support ? "per game" : "per minute")}
            </dl>
            <div className="mt-2.5 flex h-1 overflow-hidden rounded-full bg-red/30" aria-hidden>
              {season.wins + season.losses > 0 ? <span className="h-full rounded-full bg-blue/80" style={{ width: `${(season.wins / (season.wins + season.losses)) * 100}%` }} /> : null}
            </div>
            <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-muted tabular-nums">
              <span>
                <span className="font-semibold text-fg">{season.games}</span> game{season.games === 1 ? "" : "s"}
              </span>
              <span>
                <span className="font-semibold text-fg">{season.damagePerMinute === null ? "—" : formatCount(season.damagePerMinute)}</span> damage/min
              </span>
              {support ? (
                <span>
                  <span className="font-semibold text-fg">{season.csPerMinute === null ? "—" : season.csPerMinute.toFixed(1)}</span> CS/min
                </span>
              ) : (
                <span>
                  <span className="font-semibold text-fg">{season.visionPerGame === null ? "—" : season.visionPerGame.toFixed(1)}</span> vision per game
                </span>
              )}
            </p>
          </section>
        ) : (
          <p className="mb-5 rounded-panel border border-dashed border-border px-3 py-2.5 text-sm text-fg-muted" data-testid="detail-season-empty">
            No {slot.roleLabel} games stored this season yet.
          </p>
        )
      ) : null}
      <section aria-labelledby="detail-pool" className="space-y-2.5" style={cardColourVars(p.look)}>
        {/* Wraps where the row is short of room (320px at 200% text): "Edit on profile" ran off the screen. */}
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <h3 id="detail-pool" className="min-w-0 text-sm font-semibold text-fg">
            {slot.roleLabel} champion pool{slot.champions.length ? <span className="font-normal text-fg-subtle"> · {slot.champions.length}, in order of preference</span> : null}
          </h3>
          {/* Pools are edited on the profile (one place, with every role); Team only shows them. */}
          {canEdit ? (
            <Link href={editHref} className="inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-xs font-medium text-accent hover:bg-accent/10 pointer-coarse:min-h-11" aria-label={`Edit on profile: ${p.name}'s champions`} data-testid="edit-pool-on-profile">
              <Pencil className="h-3.5 w-3.5" aria-hidden /> Edit on profile
            </Link>
          ) : null}
        </div>
        {slot.champions.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-3 text-sm text-warn">No {slot.roleLabel} champions yet.</p>
        ) : (
          // One aligned list, in order of preference, under one row of column names (as the
          // profile's pools); the first choice is marked in its row, in the card's own colour.
          <div className="@container/pool overflow-hidden rounded-panel border border-border">
            {p.statsVisible ? <PoolColumnNames support={support} /> : null}
            <ol className="divide-y divide-border/60" data-testid="pool-list" aria-label={`${slot.roleLabel} champion pool, in order of preference`}>
              {slot.champions.map((c, i) => (
                <PoolChampionTile key={c.championId} index={i} champion={lookup(championsById, c.championId)} row={c} support={support} withStats={p.statsVisible} />
              ))}
            </ol>
          </div>
        )}
      </section>
    </>
  );
  return { title: `${p.name} · ${slot.roleLabel}`, hero, body };
}

/**
 * One width for the header and the cards, following the card grid's own breakpoints. Five across
 * from a 64rem content area (normal desktops, sidebar open or not) up to a shared maximum, so on
 * wide screens the lineup stays one centred group of equal cards instead of stretching. From a
 * 1920px window (LINEUP_FULL) the header and the cards take Team's whole column instead (100rem at
 * most), so the section tabs, the logo and the first card share one left edge (UD.T2: 38px apart at
 * 1920, 165px at 2560 before) and the tabs keep one place on all four sections.
 */
const LINEUP_FULL = "min-[120rem]:@5xl:max-w-full";
const LINEUP_WIDTH = `mx-auto w-full max-w-[26rem] @xl:max-w-[54rem] @4xl:max-w-[80rem] @5xl:max-w-[84rem] ${LINEUP_FULL}`;

/** Who holds a role, as the lineup's slides and dots name it. */
const holder = (s: RosterSlot) => s.player?.name ?? (s.privateMember ? "team member" : "no player");

/**
 * Where the phone's lineup carousel is (phones only, under the card): five quiet dots, the card in
 * view a longer pill in the brand blue (its shape marks it as well as its colour). Each dot is a tab
 * that brings its card into view the shortest way round, a 44px target sized in px so larger text
 * never spreads the five past a 320px phone (220px at every size); ← → move along them and wrap as the
 * carousel does, Home and End go to the first and the last. Named by the role, then the player, and
 * read with its place ("1 of 5") as tabs are. The one part of the lineup that follows the track as it
 * scrolls (useSnapIndex), so a swipe never draws the cards again.
 */
function LineupIndicator({ slots, index, go, step, slideIds }: { slots: RosterSlot[]; index: SnapIndex; go: (i: number) => void; step: (delta: number) => number; /** Each card's slide, which its dot controls. */ slideIds: string[] }) {
  const current = useSnapIndex(index);
  const dots = React.useRef<Array<HTMLButtonElement | null>>([]);
  const onKeyDown = (e: React.KeyboardEvent) => {
    let to: number;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") to = step(e.key === "ArrowRight" ? 1 : -1);
    else if (e.key === "Home" || e.key === "End") go((to = e.key === "Home" ? 0 : slots.length - 1));
    else return;
    e.preventDefault();
    dots.current[to]?.focus();
  };
  return (
    <div className="relative z-[1] mx-auto flex w-max justify-center @xl:hidden" role="tablist" aria-label="Lineup position" onKeyDown={onKeyDown} data-testid="lineup-indicator">
      {slots.map((s, i) => (
        <button
          key={s.role}
          ref={(b) => {
            dots.current[i] = b;
          }}
          type="button"
          role="tab"
          aria-selected={current === i}
          aria-controls={slideIds[i]}
          aria-label={`${s.roleLabel}: ${holder(s)}`}
          tabIndex={current === i ? 0 : -1}
          onClick={() => go(i)}
          className="group/dot grid h-[44px] w-[44px] place-items-center rounded-full"
          data-testid="lineup-indicator-dot"
        >
          <span aria-hidden className={cn("block h-1.5 rounded-full transition-[width,background-color] duration-200 ease-emphasized motion-reduce:transition-none", current === i ? "w-5 bg-accent" : "w-1.5 bg-border-control group-hover/dot:bg-fg-subtle")} data-testid="lineup-indicator-mark" />
        </button>
      ))}
    </div>
  );
}

/**
 * The carousel's position, said once it comes to rest on another card ("Mid, 3 of 5: Demo Mid"), for
 * screen readers: a swipe or a key moves the cards without moving keyboard focus to the dots. Not
 * while focus is on a dot, which says the same itself, nor in a window (the player window's ‹ › move
 * the carousel behind it, and the window says who it shows), and nothing as the page arrives.
 */
function LineupAnnouncer({ rest, slots }: { rest: SnapIndex; slots: RosterSlot[] }) {
  const [said, setSaid] = React.useState("");
  const latest = React.useRef(slots);
  React.useEffect(() => {
    latest.current = slots;
  });
  React.useEffect(
    () =>
      rest.subscribe(() => {
        // A window open over the page (its content re-keyed by ‹ › can leave focus on the body for a moment).
        // A window's ‹ › moving the carousel behind it also empties what was said before (a rest on a
        // card just before the window opened, under a slow first tap), so nothing stale stays in it.
        if (document.querySelector("dialog[open]")) return setSaid("");
        if (document.activeElement?.closest("[data-testid=lineup-indicator]")) return;
        const i = rest.get();
        const s = latest.current[i];
        if (s) setSaid(`${s.roleLabel}, ${i + 1} of ${latest.current.length}: ${holder(s)}`);
      }),
    [rest],
  );
  return (
    <p className="sr-only" aria-live="polite" aria-atomic="true" data-testid="lineup-announcer">
      {said}
    </p>
  );
}

/**
 * A phone held sideways (480px tall or less, the lineup 36rem or wider): the desktop's five-across
 * row in a compact variant, every player on the first screen (UM.T3: 2 + 2 + 1 with Support alone,
 * 3.46 screens). Five cards share the row (about 140px each in an iPhone's 734px between the
 * notches); the art band is 88px at least, and each card keeps its name, rank and the season's three
 * figures (globals.css, [data-sideways-row]: the picture, tagline, record lines and pool wait for
 * the player's window, one tap away). Under 36rem of lineup (larger text) the track stays, one card
 * at a time with the pager.
 */
const SIDEWAYS_ROW = {
  track: "short:@xl:max-w-none short:@xl:grid-cols-5 short:@xl:gap-2 short:@xl:[&>*]:col-span-1 short:@xl:[&>*:nth-child(4)]:col-start-auto short:@xl:[&>*:nth-child(5)]:col-start-auto",
  art: "short:@xl/lineup:min-h-[5.5rem] short:@xl/lineup:pt-11",
  /** At a larger text size (under 36rem of lineup) the phone's carousel: about two cards in view, the position dots under them. */
  cell: "max-lg:short:@max-xl/lineup:w-[min(18rem,78%)]",
} as const;

/**
 * Members' phones, upright (below sm): the carousel's cards take the height the screen has left.
 * main, the page's column, this frame, the stage and the track each grow into the room between the
 * top bar and the tab bar (app-shell.tsx: main is a column on this page, from the window's height,
 * min-h-dvh, less the top bar, its own padding and the room it keeps for the tab bar and the home
 * indicator), so the track is as tall as that room less the header line and the dots under it. The
 * five cards share the track's height (the slides stretch to it), so a longer pool or name never
 * changes a card's height; inside a card the art band takes three parts of the spare height and the
 * body one, spread evenly around its season figures and its pool (RosterCard). Pure CSS, so the
 * server's page is already the final layout. The track only grows: where its cards need more (a
 * larger text size, a short screen) it is their height and the page scrolls (docs/MOBILE.md, "The
 * active card uses the screen").
 */
/** Where the cards fill the height (FILL), and so where Edit lineup keeps their parts' resting heights. */
const FROZEN_WHILE_EDITING = "(max-width: 39.99rem)";
const FILL = {
  frame: "max-sm:flex-1",
  stage: "max-sm:flex-1",
  inner: "max-sm:flex max-sm:flex-1 max-sm:flex-col",
  track: "max-sm:grow max-sm:shrink-0",
} as const;

/**
 * A short upright phone (under 40rem wide and 43.75rem tall, the phones under 700px where the frame
 * slides away: an iPhone SE at 320 × 568 or 375 × 667, an iPhone in Safari's tab at 393 × 659; in rem,
 * so a larger text size counts): the card's own spacing a step tighter, its least height lower, so a
 * card with a tagline and "You" still fits above the tab bar with its dots from 375 × 667. Where there
 * is room the spare height still goes to the art and the body's even gaps (FILL), so only the least
 * spacing changes. On 320 × 568 the whole card without a tagline ends above the tab bar, its dots a
 * short scroll away (which slides the frame away too); with a tagline the page scrolls about 100px.
 * Every figure and the pool stay.
 */
const TIGHT = {
  frame: "[@media(max-width:39.99rem)_and_(max-height:43.75rem)]:gap-2.5",
  art: "[@media(max-width:39.99rem)_and_(max-height:43.75rem)]:pb-1.5",
  body: "[@media(max-width:39.99rem)_and_(max-height:43.75rem)]:gap-1.5 [@media(max-width:39.99rem)_and_(max-height:43.75rem)]:pt-1.5 [@media(max-width:39.99rem)_and_(max-height:43.75rem)]:pb-2 [@media(max-width:39.99rem)_and_(max-height:43.75rem)]:[&_[data-testid=card-season]]:py-1.5",
  pool: "[@media(max-width:39.99rem)_and_(max-height:43.75rem)]:gap-1",
} as const;

/*
  The lineup's frame, stage, track and slide (TeamRoster), as functions so Card Studio's previews lay a
  card out exactly as Team does (LineupPreview): in the carousel on a phone, the three and two rows on a
  tablet, five across on a desktop, the public page's (`guest`) without the members' phone filling.
*/
const frameClass = (guest: boolean) => cn("@container/lineup flex flex-col gap-5 lg:flex-1 lg:justify-center lg:gap-6 lg:overflow-y-clip @7xl/lineup:gap-7", !guest && cn("max-sm:gap-4 max-lg:short:gap-3", FILL.frame, TIGHT.frame));
const stageClass = (guest: boolean) => cn("relative isolate flex flex-col", !guest && FILL.stage);
const innerClass = (guest: boolean) => cn("relative", !guest && FILL.inner);
const trackClass = (guest: boolean) =>
  cn(
    "flex snap-x snap-mandatory gap-[max(2rem,calc(50%_-_11rem))] overflow-x-auto overscroll-x-contain px-4 pt-3 pb-4 -my-3 [scrollbar-width:none] data-[loop-free]:snap-none [&::-webkit-scrollbar]:hidden",
    "-mx-4",
    "@xl:mx-auto @xl:my-0 @xl:grid @xl:w-full @xl:max-w-[54rem] @xl:grid-cols-6 @xl:gap-3 @xl:overflow-visible @xl:px-0 @xl:py-0 @xl:[&>*]:col-span-2 @xl:[&>*:nth-child(4)]:col-start-2",
    "@4xl:max-w-[84rem] @4xl:grid-cols-5 @4xl:[&>*]:col-span-1 @4xl:[&>*:nth-child(4)]:col-start-auto @7xl:gap-5",
    LINEUP_FULL,
    // Held sideways (a short window): the desktop's five across, compact (SIDEWAYS_ROW), never 2 + 2 + 1 with an orphan.
    !guest && SIDEWAYS_ROW.track,
    // Upright phones: the track takes the height left above the dots (FILL), never less than its cards need.
    !guest && FILL.track,
  );
const cellClass = (guest: boolean) => cn("flex w-full max-w-[26rem] shrink-0 snap-center snap-always order-[var(--loop-order,0)] @xl:order-none @xl:w-auto @xl:max-w-none @xl:min-w-0", !guest && SIDEWAYS_ROW.cell);

/**
 * One player's card laid out as Team lays it out (the same frame, track and slide: frameClass and the
 * rest), for Card Studio's previews of the Team card and the public page's card, and the first-time
 * setup's preview. The card is RosterCard itself, inert. In a phone's page (`fill`, Card Studio's
 * mobile preview) the frame takes the height the page leaves, as Team's does: `header` stands in for
 * the team's header line, and the position dots keep their 44px under the card. Without `fill` the
 * card is as tall as its content (the setup's narrow column).
 */
export function LineupPreview({ slot, champions, guest = false, own = false, fill = false, header, roleUnknown = false }: { slot: RosterSlot; champions: PickerChampion[]; guest?: boolean; roleUnknown?: boolean; /** The viewer's own card: "You", and its Customise control where Team shows it. */ own?: boolean; fill?: boolean; header?: React.ReactNode }) {
  const championsById = React.useMemo(() => new Map(champions.map((c) => [c.id, c])), [champions]);
  const align = React.useMemo(() => (slot.player ? [{ name: slot.player.name, look: slot.player.look }] : []), [slot.player]);
  const noop = React.useCallback(() => {}, []);
  const filled = fill && !guest;
  return (
    <div className={filled ? frameClass(false) : "@container/lineup flex flex-col"} data-fills-height={filled || undefined} data-testid="lineup-preview">
      {filled ? header : null}
      <div className={filled ? stageClass(false) : "relative"}>
        <div className={filled ? innerClass(false) : "relative"}>
          <div className={trackClass(guest || !fill)}>
            <div className={cellClass(guest || !fill)}>
              <RosterCard slot={slot} champions={champions} championsById={championsById} canManageLineup={false} editingLineup={false} canEdit={own} viewerPlayerId={own ? (slot.player?.id ?? null) : null} onOpen={noop} guest={guest} align={align} roleUnknown={roleUnknown} />
            </div>
          </div>
          {filled ? <div aria-hidden className="h-[44px] @xl:hidden" /> : null}
        </div>
      </div>
    </div>
  );
}

/**
 * Team Overview's header on members' phones (below sm, and held sideways; the public page keeps its own): the top bar
 * already carries the team's mark and name, so the header's logo goes and its h1 is read out only
 * (docs/MOBILE.md, "The phone header budget"). What is left is one 44px line: the scope ("Main
 * lineup · Season 2026") over the lineup's state, with Edit lineup at its end.
 */
const PHONE_HEADER = "max-sm:gap-y-0.5 max-lg:short:gap-x-3 max-lg:short:gap-y-0.5";

/**
 * OUR TEAM: the team's header (logo, name, the lineup's context and Edit lineup) and the main
 * lineup as five player cards, as one centred section. "Edit lineup" (lineup managers only)
 * switches every card into a mode with a Change/Assign control; your own card's brush personalises
 * its look. A card opens its player in the shared detail window: that card lifts, the others step back.
 * Champion pools are shown here and edited on the profile. On phones the five cards are a
 * carousel that loops (useLoopTrack: native scrolling with a snap point a card), one card at a time
 * across the page's width inside its gutter, with five dots under it that say where you are and move
 * to any card; the public page's phone layout is the same.
 */
export function TeamRoster({ team, slots, complete, champions, canManageLineup, canViewPlayers, editablePlayerIds, viewerPlayerId, guest = null, initialPlayer = null, publicFigures = false }: { /** The public page shows Riot data: Card Studio's preview of it shows the figures. */ publicFigures?: boolean; team: { name: string; shortName: string; logo: string | null; logoStill: string | null }; slots: RosterSlot[]; complete: boolean; champions: PickerChampion[]; canManageLineup: boolean; /** Without the Players directory the detail panel does not offer a profile it cannot open. */ canViewPlayers: boolean; editablePlayerIds: string[]; viewerPlayerId: string | null; /** The public Team Overview: profiles open under this path, and nothing about managing the lineup is shown. */ guest?: { profileBase: string | null } | null; /** The player the address names (`?player=`), open as the page arrives. */ initialPlayer?: string | null }) {
  const [editingLineup, setEditingLineup] = React.useState(false);
  // Edit lineup on an upright phone: each card's art band and body keep their resting heights while
  // the bar shows (FROZEN_WHILE_EDITING), so the bar adds its height under the pool instead of taking
  // it from the art and the gaps above it (the pool never moves when editing starts).
  const [frozen, setFrozen] = React.useState<Partial<Record<Role, { art: number; body: number }>> | null>(null);
  const toggleEditing = () => {
    if (!editingLineup && window.matchMedia(FROZEN_WHILE_EDITING).matches) {
      const sizes: Partial<Record<Role, { art: number; body: number }>> = {};
      for (const s of slots) {
        const card = trackRef.current?.querySelector<HTMLElement>(`[data-testid=lineup-row-${s.role}]`);
        const art = card?.querySelector("[data-testid=card-art]");
        const body = card?.querySelector("[data-card-body]");
        if (art && body) sizes[s.role] = { art: art.getBoundingClientRect().height, body: body.getBoundingClientRect().height };
      }
      setFrozen(sizes);
    } else setFrozen(null);
    setEditingLineup((v) => !v);
  };
  // A turn or a resize while editing measures again from nothing: the frozen heights belong to the old size.
  React.useEffect(() => {
    if (!frozen) return;
    const thaw = () => setFrozen(null);
    window.addEventListener("resize", thaw);
    return () => window.removeEventListener("resize", thaw);
  }, [frozen]);
  // Interactive once hydrated (data-ready on the cards, which browser tests wait for before they
  // touch the page: React discards server HTML that changed before it hydrated, as a mismatch).
  const interactive = React.useSyncExternalStore(noopSubscribe, () => true, () => false);
  // The player whose detail panel is open: a role, and which side of its card (the starter, or the
  // substitute on a turned card). Owned here, so a turned card opening its substitute stays turned.
  const filled = slots.filter((s) => s.player);
  // Its details open in a Peek with the player in the address (`?player=`): the first open pushes
  // one entry, switching replaces it, and Back closes it (address-item.ts). ↑/↓ and ‹ › move along
  // the starters; a turned card opens its substitute.
  const locate = (id: string | null): { role: Role; side: CardSide } | null => {
    if (!id) return null;
    for (const s of filled) {
      if (s.player!.id === id) return { role: s.role, side: "starter" };
      if (s.substitute?.player.id === id) return { role: s.role, side: "substitute" };
    }
    return null;
  };
  const peek = usePeek({ param: "player", ids: filled.map((s) => s.player!.id), initial: initialPlayer, valid: (id) => locate(id) !== null });
  const detail = locate(peek.id);
  const detailIndex = filled.findIndex((s) => s.role === detail?.role);
  const detailBase = detailIndex >= 0 ? filled[detailIndex]! : null;
  // A substitute removed meanwhile leaves the starter's details.
  const detailSub = detail?.side === "substitute" ? (detailBase?.substitute ?? null) : null;
  const detailSlot = detailBase && detailSub ? { ...detailBase, player: detailSub.player, champions: detailSub.champions } : detailBase;
  const championsById = React.useMemo(() => new Map(champions.map((c) => [c.id, c])), [champions]);
  const editable = new Set(editablePlayerIds);
  const { ref: trackRef, index: inView, rest: atRest, go, step, onKeyDown: onTrackKeyDown } = useLoopTrack(slots.length);
  // Each card's slide, named by its dot (aria-controls).
  const slideBase = React.useId();
  const slideIds = slots.map((s) => `${slideBase}-${s.role}`);
  // A phone shows the lineup as a carousel, one card at a time: the other cards' art waits (globals.css,
  // data-art-wait) until the first card's art has arrived or failed, so the first has the connection
  // to itself (docs/PERFORMANCE.md, "Team Overview's first card"). Touching the track, or moving to
  // another card, lets them load at once. Wider screens show all five together and never wait.
  const [artWait, setArtWait] = React.useState(true);
  React.useEffect(() => {
    if (!artWait) return;
    const release = () => setArtWait(false);
    const first = trackRef.current?.querySelector<HTMLImageElement>(":scope > :first-child .card-art-img");
    const off = inView.subscribe(() => {
      if (inView.get() !== 0) release();
    });
    if (!first || first.complete) {
      queueMicrotask(release);
      return off;
    }
    first.addEventListener("load", release, { once: true });
    first.addEventListener("error", release, { once: true });
    return () => {
      off();
      first.removeEventListener("load", release);
      first.removeEventListener("error", release);
    };
  }, [artWait, trackRef, inView]);
  // Phones: moving through the panel (previous / next) brings that card into view in the track.
  React.useEffect(() => {
    if (detail) go(slots.findIndex((s) => s.role === detail.role));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail?.role]);
  const season = filled.find((s) => s.player?.statsVisible)?.player?.seasonLabel ?? null;
  // Who starts where, so choosing someone already in another role says what saving would do.
  const startsElsewhere = React.useMemo(() => new Map(slots.flatMap((s) => (s.player ? [[s.player.id, s.roleLabel] as const] : []))), [slots]);
  // Everyone the lineup can show, starters and substitutes: cards side by side keep their names and
  // taglines level whichever side each shows (CardIdentity's align).
  const align = React.useMemo(() => slots.flatMap((s) => [s.player, s.substitute?.player].flatMap((p) => (p ? [{ name: p.name, look: p.look }] : []))), [slots]);
  return (
    // The team's identity and its five players as one composition, centred in the window (desktop):
    // the frame takes the height left under the section tabs (main and the page are flex columns on
    // this page) and centres its content (flex, nothing positioned), so there is as much room above
    // the header as below the cards and the header stays right above them. On a short window the content is taller than that minimum,
    // so it simply starts at the top and scrolls. The floor's light is clipped at the frame, so it
    // never adds a scroll.
    <div className={frameClass(!!guest)} data-testid="lineup-frame" data-fills-height>
      {/* The team's identity: logo, name and the lineup's state, with Edit lineup. Wider screens: one
          row, the logo and Edit lineup either side of the name, its line and the state. Phones: the
          logo and the name on the first line, then the state and Edit lineup on a line of their own,
          so neither squeezes the name (the tab above already says this is the Team Overview). With a
          larger text size (the frame under 11.25rem: 200% text on a 375px phone or narrower), Edit
          lineup takes a line of its own under the state, and a member's state (no Edit lineup
          beside it) takes the whole line under the logo rather than the room beside it (it ran 33px
          past a 320px phone at 200%), so the header stays within the phone; at the usual size
          nothing moves. The logo is drawn at its own proportions in a square
          (BrandMark: object-contain, never squeezed), and animates where the browser allows motion. */}
      <header className={cn(LINEUP_WIDTH, "grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2.5 [text-shadow:0_1px_14px_rgb(0_0_0/0.55)] sm:gap-x-4 sm:gap-y-1", !guest && PHONE_HEADER)} data-testid="team-header">
        <BrandMark src={team.logo} still={team.logoStill} name={team.shortName} className={cn("col-start-1 row-start-1 h-12 w-12 shrink-0 rounded-panel text-lg shadow-lg shadow-black/40 ring-1 ring-border-strong sm:row-end-3 sm:h-16 sm:w-16 sm:rounded-card sm:text-2xl lg:h-20 lg:w-20 lg:text-3xl short:h-11 short:w-11 short:rounded-panel short:text-lg", !guest && "max-sm:hidden max-lg:short:hidden")} />
        <div className={cn("col-start-2 col-end-4 row-start-1 min-w-0 sm:col-end-3 sm:self-end", !guest && "max-sm:col-start-1 max-sm:col-end-3 max-lg:short:col-start-1")}>
          <p className="text-xs font-semibold uppercase tracking-label text-accent max-sm:sr-only short:sr-only">Team Overview</p>
          <h1 className={cn("truncate text-[1.375rem] font-bold leading-tight tracking-tight text-fg sm:text-3xl lg:text-4xl short:text-xl", !guest && "max-sm:sr-only max-lg:short:sr-only")} data-testid="team-name">
            {team.name}
          </h1>
          <p className="mt-0.5 text-xs text-fg-muted sm:mt-1 sm:text-sm short:mt-0.5 short:text-xs" data-testid="team-subtitle">
            {guest ? <span>Main lineup</span> : editingLineup ? <span className="font-medium text-accent">Editing the lineup</span> : <span>Main lineup{season ? ` · ${season}` : ""}</span>}
          </p>
        </div>
        {!guest && !editingLineup ? (
          <span className={cn("row-start-2 inline-flex items-center gap-1.5 justify-self-start rounded-full border py-px pl-2 pr-1 text-xs font-medium leading-5 [text-shadow:none] sm:col-start-2 sm:col-end-3 sm:self-start sm:text-sm short:text-xs", canManageLineup ? "col-start-1 col-end-3 @max-[11.25rem]/lineup:col-end-4" : "col-start-2 col-end-4 @max-[11.25rem]/lineup:col-start-1 max-sm:col-start-1",
              !guest && "max-lg:short:col-start-1", complete ? "border-good/35 bg-good/10 text-good" : "border-warn/35 bg-warn/10 text-warn")} data-testid="lineup-status">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
            {complete ? "Lineup complete" : canManageLineup ? "Assign all five roles" : "A lineup manager assigns the five roles"}
            <InfoTip text="Each card shows this season's ranked and normal games in the player's lineup role, and their champions for it in order of preference." label="About the cards" />
          </span>
        ) : null}
        {canManageLineup ? (
          <Button size="sm" variant={editingLineup ? "primary" : "outline"} className="col-start-3 row-start-2 shrink-0 justify-self-end max-sm:row-start-1 max-sm:row-end-3 sm:row-start-1 sm:row-end-3 sm:self-center @max-[11.25rem]/lineup:col-start-1 @max-[11.25rem]/lineup:col-end-4 @max-[11.25rem]/lineup:row-start-3 @max-[11.25rem]/lineup:justify-self-start" onClick={toggleEditing} aria-pressed={editingLineup} data-testid="edit-lineup">
            {editingLineup ? (
              <>
                <Check className="h-4 w-4" aria-hidden /> Done
              </>
            ) : (
              <>
                <Users className="h-4 w-4" aria-hidden /> Edit lineup
              </>
            )}
          </Button>
        ) : null}
      </header>
      {/* Phones (a narrow content area): one carousel of the five cards that scrolls sideways on its
          own and loops (after the last card comes the first again), one card in view, centred inside
          the page's gutter: the track reaches the screen's edges (-mx-4) and keeps the gutter as its
          padding, and the cards are a gap apart that keeps the next card out of view at rest (two
          gutters, more where a card stops at 26rem on a wider window). Wider: three and two, the
          second row centred (cards in a row share its height), never a card alone on a row; five
          across from a 56rem content area (a 1280px window with the sidebar open; UD.T1) and held
          sideways (SIDEWAYS_ROW). Cards never shrink below a readable width. */}
      {/* The stage: five across on wide screens, the cards stand on a floor lit from just under them
          in the team's colour and carrying the team's name. Decoration only: it never moves or sizes
          a card, and is hidden from screen readers. */}
      <div className={stageClass(!!guest)} data-testid="lineup-stage">
        <div className={innerClass(!!guest)}>
          {/* The track's vertical padding (taken back by its margins) leaves room for a card's edges
              while it turns over: a scrolling track clips anything outside its box. No smooth
              scrolling in CSS: the loop moves the track by a whole card in one step where nothing
              shows it (useLoopTrack), and `go` asks for smoothness itself. Snapping pauses only while
              the loop places the cards mid-way (data-loop-free). */}
          <div
            ref={trackRef}
            onKeyDown={onTrackKeyDown}
            onPointerDown={artWait ? () => setArtWait(false) : undefined}
            className={trackClass(!!guest)}
            role="region"
            aria-roledescription="carousel"
            aria-label="Main lineup"
            data-testid="lineup-overview"
            data-ready={interactive ? "true" : undefined}
            data-art-wait={artWait || undefined}
            data-sideways-row={!guest || undefined}
          >
            {slots.map((s, i) => (
              // Each card once, in lineup order; on a phone its place in the loop is its flex order (--loop-order, useLoopTrack).
              <div key={s.role} id={slideIds[i]} tabIndex={-1} className={cellClass(!!guest)} role="group" aria-roledescription="slide" aria-label={`${s.roleLabel}: ${holder(s)} (${i + 1} of ${slots.length})`} data-testid="lineup-cell" data-art-later={i > 0 || undefined}>
                <LineupCard slot={s} champions={champions} championsById={championsById} canManageLineup={canManageLineup} editingLineup={editingLineup} canEdit={!!s.player && editable.has(s.player.id)} viewerPlayerId={viewerPlayerId} onOpenSide={(side) => peek.toggle(side === "substitute" ? s.substitute!.player.id : s.player!.id)} openSide={detail?.role === s.role ? detail.side : null} guest={!!guest} startsElsewhere={startsElsewhere} align={align} priority={i === 0} frozen={frozen?.[s.role]} publicFigures={publicFigures} />
              </div>
            ))}
          </div>
          <LineupIndicator slots={slots} index={inView} go={go} step={step} slideIds={slideIds} />
          <LineupAnnouncer rest={atRest} slots={slots} />
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-full -z-10 -mt-10 hidden h-[clamp(10rem,30vh,18rem)] overflow-hidden @4xl:block" data-testid="lineup-stage-floor">
            <div className="absolute inset-x-0 top-0 h-[85%]" style={{ background: "radial-gradient(50% 75% at 50% 0%, color-mix(in srgb, var(--color-accent) 16%, transparent), transparent 75%)" }} />
            <div className="absolute inset-x-[6%] top-10 h-px" style={{ background: "linear-gradient(90deg, transparent, color-mix(in srgb, var(--color-accent) 50%, transparent), transparent)" }} />
            {team.logo ? (
              // Lazy: the server then names it in no preload, and where the floor is hidden (phones,
              // tablets, narrower desktops) it is never fetched.
              // eslint-disable-next-line @next/next/no-img-element -- the team's validated logo, decorative
              <img src={team.logoStill ?? team.logo} alt="" loading="lazy" decoding="async" className="absolute left-1/2 top-[38%] h-[min(9rem,45%)] w-auto -translate-x-1/2 -translate-y-1/2 opacity-[0.07] grayscale" />
            ) : (
              <span className="absolute inset-x-0 top-[45%] -translate-y-1/2 pl-(--tracking-tagline) text-center text-[clamp(3rem,7vw,7.5rem)] font-black uppercase leading-none tracking-tagline text-fg opacity-[0.035]">{team.shortName}</span>
            )}
          </div>
        </div>
      </div>
      {(() => {
        const d = detailSlot?.player
          ? playerDetail({
              slot: detailSlot,
              championsById,
              canEdit: editable.has(detailSlot.player.id),
              canViewProfile: guest ? !!guest.profileBase : canViewPlayers || detailSlot.player.id === viewerPlayerId,
              profileHref: `${guest?.profileBase ?? "/players/"}${detailSlot.player.id}`,
              editHref: detailSlot.player.id === viewerPlayerId ? "/overview#champion-pools" : `/players/${detailSlot.player.id}#champion-pools`,
              position: detailSub ? "substitute" : `${detailIndex + 1} of ${filled.length} in the lineup`,
            })
          : null;
        return (
          <Peek peek={peek} label="Player" title={d?.title ?? ""} itemKey={d ? detailSlot!.player!.id : null} hero={d?.hero} windowSize="standard" windowHeader={d?.hero} windowTitleId="player-detail-title" testId="player-detail" navTestIds={{ prev: "detail-prev", next: "detail-next" }}>
            {d?.body}
          </Peek>
        );
      })()}
    </div>
  );
}
