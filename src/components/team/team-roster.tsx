"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, ArrowUpFromLine, Check, ChevronLeft, ChevronRight, Pencil, Repeat2, Undo2, UserPlus, Users, X } from "lucide-react";
import type { Role } from "@/domain/roles";
import type { RosterSlot, RosterSubstitute } from "@/server/team/roster";
import { ACCENT_COLOR } from "@/domain/player-card";
import { accentCss } from "@/domain/card-style";
import { CardFrame, cardShellStyle } from "@/components/players/card-look";
import { setLineupSlotAction, setLineupSubstituteAction } from "@/server/actions/players";
import type { PickerChampion } from "@/components/champion-picker";
import { Button, buttonClass } from "@/components/ui/button";
import { RoleIcon } from "@/components/role-icon";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { CardArtLayer } from "@/components/players/card-art";
import { CustomiseCardButton } from "@/components/players/customise-card-button";
import { CardIdentity, CardPerformance, CardPool, CardRoleChip, PoolChampionTile } from "@/components/players/player-card";
import { DetailModal } from "@/components/ui/detail-modal";
import { InfoTip } from "@/components/ui/info-tip";
import { BrandMark } from "@/components/brand-mark";
import { toast } from "@/components/ui/toast";
import { useSnapTrack } from "@/components/ui/use-snap-track";
import { cn } from "@/lib/cn";
import { assignmentStatus } from "@/domain/roster";
import { WIN_RATE_MIN_GAMES, WIN_RATE_TONE_CLASS, winRateTone } from "@/domain/stats/win-rate";
import { CardSocialIcons, SocialLinks } from "@/components/players/social-links";
import { formatCount } from "@/lib/format";

type ChampionsById = Map<string, { id: string; name: string; portraitUrl: string }>;
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

/** How a member fits a role, as the lineup sheets name it. */
const FIT_HINT: Record<string, string> = { primary: "primary role", secondary: "off role", other: "out of role" };

/**
 * One lineup slot as a compact player card, the same structure for everyone: artwork with the
 * role and identity, this season's figures in the role they hold, and the first champions of
 * their pool for that role. The whole card opens the detail panel (full pool and statistics) over
 * the page, so the lineup never moves. Over the artwork sit only the card's own controls
 * (personalising your card, turning it over to its substitute). The artwork grows with what it
 * holds (a tagline, a long name, links), so nothing is ever cut off or drawn over the role.
 *
 * Edit lineup (lineup managers) adds a bar at the foot of the card, under everything the card
 * shows: Change (who starts in this role) and Substitute (who is its substitute), each opening a
 * sheet to choose from. The card stays fully readable and still opens its details.
 *
 * With `bench` it is the back of the card: a substitute for the role, built from the same parts,
 * where the whole card turns back to the starter.
 */
function RosterCard({ slot, championsById, canManageLineup, editingLineup, canEdit, viewerPlayerId, champions, onOpen, selected = false, dimmed = false, guest = false, flip, bench, turnRef, startsElsewhere }: { slot: RosterSlot; champions: PickerChampion[]; championsById: ChampionsById; canManageLineup: boolean; editingLineup: boolean; canEdit: boolean; viewerPlayerId: string | null; onOpen: () => void; /** Its detail panel is open: lifted and outlined. */ selected?: boolean; /** Another card's panel is open: stepped back. */ dimmed?: boolean; /** The public page: no lineup suggestions, and a player who may not appear is a role placeholder. */ guest?: boolean; flip?: FlipControl; bench?: BenchFace; /** The face's turn control (front) or way back (back), for keyboard focus after a turn. */ turnRef?: React.Ref<HTMLButtonElement>; /** Who starts in another role (player id → that role's name), for the Change sheet's warnings. */ startsElsewhere?: ReadonlyMap<string, string> }) {
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

  return (
    <article className={cn(!bench && "rise-in", "group/card @container/card relative flex h-full w-full min-w-0 flex-col overflow-hidden rounded-card border bg-surface transition-[transform,opacity,box-shadow,border-color,filter] duration-200 ease-out motion-reduce:transition-none", editingLineup ? "border-accent/50" : "border-border hover:border-border-strong", selected && "z-[1] -translate-y-1 border-accent shadow-xl shadow-accent/15 ring-2 ring-accent motion-reduce:translate-y-0", dimmed && "opacity-50 saturate-[0.6]")} data-selected={selected || undefined} style={p ? { ...cardShellStyle(p.look), ...(editingLineup ? { borderColor: undefined } : {}) } : { ["--card-accent" as string]: accent }} data-frame={p?.look.style.frame} data-fx-host data-testid={bench ? `lineup-sub-${slot.role}` : `lineup-row-${slot.role}`} data-player-id={p?.id} data-player-name={p?.name} data-pool-size={slot.champions.length} data-off-role={status ? status === "off" : undefined} data-role-status={status ?? undefined}>
      <CardFrame look={p?.look} />
      {p ? (
        // The whole card opens the detail panel; the controls are drawn above this button. On the
        // back, the whole card opens the substitute's details (the card stays turned); only the
        // turn control, or Escape, turns it back to the starter.
        <button type="button" onClick={onOpen} className="absolute inset-0 z-[1] rounded-card focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent" aria-label={`${p.name}, ${slot.roleLabel}${bench ? " substitute" : ""}: ${p.statsVisible ? "champions and statistics" : "champion pool"}`} aria-haspopup="dialog" aria-expanded={selected} data-testid="open-player-detail" />
      ) : null}
      {/* The artwork, with the role in its corner and the player's identity at its foot. Its
          height follows its content (a fixed height cut the identity off on narrow cards and drew
          the picture over the role), from a minimum that fits a usual identity (tagline, name, and
          the line under it taking two lines for links), so cards side by side keep their figures
          level. Five across on wide screens it is tall, a portrait card. */}
      <div className="pointer-events-none relative flex min-h-[10.5rem] shrink-0 flex-col justify-end px-3 pb-2.5 pt-12 pointer-coarse:pt-14 @5xl/lineup:min-h-[clamp(13rem,29vh,20rem)] [&_.card-art-img]:group-hover/card:scale-[1.03] motion-reduce:[&_.card-art-img]:group-hover/card:scale-100" data-testid="card-art">
        {/* Splash of the player's chosen champion and skin, darkened towards the text, tinted with their accent. */}
        <CardArtLayer art={p?.art ?? null} accent={accent} kind="splash" position="center 22%" look={p?.look} motion="hover" foot={!!p} />
        <CardRoleChip role={slot.role} label={slot.roleLabel} className="absolute left-3 top-3" />
        {p ? (
          <span className="relative">
            <CardIdentity look={p.look} name={p.name} avatarUrl={p.avatarUrl} rank={p.rank} showRank={p.statsVisible} isYou={p.id === viewerPlayerId} status={status} role={slot.role} tag={bench ? <SubstituteTag /> : null} nameLines={2} social={p.social.length ? <CardSocialIcons links={p.social} owner={p.name} className="pointer-events-auto relative z-[2]" /> : null} />
          </span>
        ) : null}
      </div>
      {/* The card's own controls, over the artwork's top corner: personalising your own card, and
          turning the card. Side by side; one above the other five across, where the cards are
          narrow and the artwork tall. Lineup changes are never here: they sit at the card's foot. */}
      <span className="absolute right-2.5 top-2.5 z-[2] flex items-center gap-1.5 empty:hidden @5xl/lineup:flex-col @5xl/lineup:items-end">
        {own && !editingLineup && p ? <CustomiseCardButton variant="icon" ownLinks playerId={p.id} name={p.name} avatarUrl={p.avatarUrl} art={p.art} accent={p.cardAccent} look={p.look} champions={champions} poolIds={p.poolIds} preview={{ role: slot.role, rank: p.rank, status, season: p.season, poolIds: slot.champions.map((c) => c.championId), social: p.social }} /> : null}
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
        <div className="pointer-events-none relative flex flex-1 flex-col gap-2.5 px-3 pb-3 pt-2.5" style={{ backgroundImage: "linear-gradient(to bottom, color-mix(in srgb, var(--card-accent) 7%, transparent), transparent 70%)" }}>
          {p.statsVisible ? <CardPerformance season={p.season} support={support} roleLabel={slot.roleLabel} /> : null}
          <div className="flex flex-col gap-1.5">
            <p className="flex items-center justify-between text-2xs font-medium uppercase tracking-label text-fg-subtle">
              <span className="truncate">{slot.roleLabel} pool</span>
              <span className="inline-flex items-center gap-0.5 normal-case tracking-normal group-hover/card:text-accent">
                {slot.champions.length ? (
                  <>
                    {slot.champions.length}
                    <span className="@max-[15rem]/card:sr-only"> champion{slot.champions.length === 1 ? "" : "s"}</span>
                  </>
                ) : null}
                <ChevronRight className="h-3.5 w-3.5" aria-hidden />
              </span>
            </p>
            <CardPool champions={slot.champions.map((c) => ({ ...lookup(championsById, c.championId), games: p.statsVisible ? c.games : null, winRate: p.statsVisible ? c.winRate : null, tierLabel: p.statsVisible ? c.tierLabel : null }))} roleLabel={slot.roleLabel} showFigures={p.statsVisible} />
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
              // One line per suggestion (the full reasons on hover and for screen readers), so an
              // empty role is no taller than a filled card and never stretches its row.
              <ul className="mt-1.5 divide-y divide-border/60" data-testid="lineup-suggestions">
                {slot.suggestions.slice(0, 3).map((sg) => (
                  <li key={sg.playerId} className="flex items-center justify-between gap-2 py-1.5" title={sg.reasons.join(" · ")}>
                    <span className="min-w-0">
                      <Link href={`/players/${sg.playerId}`} className="block truncate text-sm font-medium text-fg hover:underline">
                        {sg.name}
                      </Link>
                      <span className="block truncate text-xs text-fg-muted">
                        {sg.reasons[0]}
                        {sg.reasons.length > 1 ? <span className="sr-only"> · {sg.reasons.slice(1).join(" · ")}</span> : null}
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
        <div className="relative z-[2] grid grid-cols-2 gap-2 border-t border-white/10 bg-bg/50 p-2.5" data-testid={`lineup-actions-${slot.role}`}>
          <Button size="sm" variant="primary" onClick={() => setSheet({ kind: "starter" })} aria-haspopup="dialog" aria-label={`${p ? "Change" : "Assign"} ${slot.roleLabel} player`} className="min-w-0" data-testid={`lineup-change-${slot.role}`}>
            <ArrowLeftRight className="h-3.5 w-3.5 shrink-0" aria-hidden /> <span className="truncate">{p ? "Change" : "Assign"}</span>
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setSheet({ kind: "substitute" })} aria-haspopup="dialog" aria-label={sub ? `Change the ${slot.roleLabel} substitute (${sub.name})` : `Choose a ${slot.roleLabel} substitute`} className="min-w-0" data-testid={`lineup-substitute-${slot.role}`}>
            <Users className="h-3.5 w-3.5 shrink-0" aria-hidden /> <span className="truncate">Substitute</span>
          </Button>
        </div>
      ) : null}
      {bench?.start ? (
        // The back in Edit lineup: this substitute takes the role (and the starter becomes the substitute).
        <div className="relative z-[2] border-t border-white/10 bg-bg/50 p-2.5">
          <Button size="sm" variant="primary" className="w-full" disabled={bench.start.busy} onClick={bench.start.onStart} aria-label={bench.start.label} title={bench.start.label} data-testid="start-substitute">
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
              <span className="min-w-0">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-medium text-fg">{o.name}</span>
                  {o.id === current ? <Badge tone="accent">Now</Badge> : null}
                </span>
                <span className="block truncate text-xs text-fg-muted">{o.hint}</span>
                {o.moves ? <span className="block text-xs text-warn">Starts at {o.moves} now: saving moves them and leaves {o.moves} empty</span> : null}
              </span>
            </>,
            starter ? "lineup-option" : "substitute-option",
            { name: o.name },
          ),
        )}
        {none ? option(null, <span className="flex items-center gap-3 text-sm text-fg-muted"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-dashed border-border-strong"><X className="h-4 w-4" aria-hidden /></span>{none}</span>, starter ? "clear-role" : "remove-substitute") : null}
        {starter && slot.waiting.length ? (
          <>
            <p className="pt-2.5 text-xs font-medium text-fg-subtle">Roles not chosen yet</p>
            {slot.waiting.map((w) =>
              option(
                w.id,
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-fg">{w.name}</span>
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

/** The substitute side's label, beside the role status: "Sub" (read as "Substitute"). */
function SubstituteTag() {
  return (
    <span className="inline-flex shrink-0 items-center rounded-sm border border-border-strong bg-bg/70 px-1.5 py-0.5 font-medium leading-tight text-fg" title="Substitute" data-testid="substitute-label">
      Sub<span className="sr-only">stitute</span>
    </span>
  );
}

/** Turns a starter's card over to the role's substitute: one quiet icon on the artwork, like Customise. */
function FlipButton({ flip, roleLabel, buttonRef }: { flip: FlipControl; roleLabel: string; buttonRef?: React.Ref<HTMLButtonElement> }) {
  return (
    <button type="button" ref={buttonRef} onClick={flip.onFlip} onPointerEnter={flip.onIntent} onPointerDown={flip.onIntent} onFocus={flip.onIntent} className={ART_BUTTON} aria-label={`Turn over to the ${roleLabel} substitute, ${flip.substituteName}`} title="Substitute" data-testid="flip-to-substitute">
      <Repeat2 className="h-4 w-4" aria-hidden />
    </button>
  );
}

const TURN_MS = 460;

/**
 * A filled lineup card that turns over (a 3D turn on the vertical axis, see .flip-card in
 * globals.css) to show the role's designated substitute on the same card parts as the starter.
 * Only a role with a substitute can turn: without one the card has no turn control at all.
 * Turning is this card's own state: nothing is saved, no other card re-renders, nothing is fetched
 * (the substitute arrives with the roster), and a reload shows the saved lineup.
 *
 * In Edit lineup (lineup managers), the back's Start makes the substitute the starter (and the
 * former starter the substitute) through the same lineup action as Change, guarded so a lineup
 * someone else changed meanwhile is never overwritten; turning back is the cancel. The back is
 * only built once the card is about to turn.
 */
type CardSide = "starter" | "substitute";

function LineupCard({ openSide, onOpenSide, ...props }: Omit<React.ComponentProps<typeof RosterCard>, "onOpen" | "selected"> & { /** Which side of this card has its details open, if any. */ openSide: CardSide | null; onOpenSide: (side: CardSide) => void }) {
  const { slot, canManageLineup, editingLineup } = props;
  const router = useRouter();
  const [flipped, setFlipped] = React.useState(false);
  const [backReady, setBackReady] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [refreshing, startRefresh] = React.useTransition();
  const rootRef = React.useRef<HTMLDivElement>(null);
  const frontButton = React.useRef<HTMLButtonElement>(null);
  const backButton = React.useRef<HTMLButtonElement>(null);
  const timers = React.useRef<number[]>([]);
  const saved = React.useRef(false);
  const sub: RosterSubstitute | null = slot.substitute;
  const starter = slot.player;

  const turn = React.useCallback((to: boolean) => {
    const el = rootRef.current;
    const hadFocus = !!el?.contains(document.activeElement);
    setBackReady(true);
    setFlipped(to);
    for (const t of timers.current) clearTimeout(t);
    timers.current = [];
    if (el && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // The dip and the deeper shadow last for the turn only; will-change goes with them.
      el.dataset.turn = "dip";
      timers.current.push(window.setTimeout(() => (el.dataset.turn = "settle"), TURN_MS / 2), window.setTimeout(() => delete el.dataset.turn, TURN_MS + 20));
    }
    // Keyboard focus follows the turn to the other face (once it is no longer inert).
    if (hadFocus) timers.current.push(window.setTimeout(() => (to ? backButton : frontButton).current?.focus({ preventScroll: true }), 0));
  }, []);
  React.useEffect(() => () => timers.current.forEach(clearTimeout), []);
  // After a saved substitution the new lineup arrives, then the card turns back to show the new starter.
  React.useEffect(() => {
    if (refreshing || !saved.current) return;
    saved.current = false;
    turn(false);
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
  const back =
    backReady && sub ? (
      <RosterCard
        {...props}
        slot={{ ...slot, player: sub.player, champions: sub.champions }}
        canEdit={false}
        onOpen={() => onOpenSide("substitute")}
        selected={openSide === "substitute"}
        bench={{
          onBack: () => turn(false),
          backLabel,
          start: canManageLineup && editingLineup ? { label: `Start ${sub.player.name} as ${slot.roleLabel}; ${starter.name} becomes the substitute`, onStart: () => void startSub(), busy: saving || refreshing } : null,
        }}
        turnRef={backButton}
      />
    ) : null;

  // A substitute removed meanwhile (Edit lineup, or someone else) leaves nothing to show: the front.
  const shown = flipped && !!back;
  return (
    <div ref={rootRef} className="flip-card relative h-full w-full min-w-0" data-flipped={shown || undefined} data-substitute-id={sub?.player.id} data-testid={`lineup-card-${slot.role}`}>
      <div className="flip-card-inner relative h-full w-full">
        <div className="flip-face flip-face-front h-full" inert={shown} aria-hidden={shown || undefined}>
          {front}
        </div>
        {back ? (
          <div className="flip-face flip-face-back absolute inset-0" inert={!shown} aria-hidden={!shown || undefined} onKeyDown={(e) => e.key === "Escape" && turn(false)}>
            {back}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * A lineup player in detail, in the shared centred window (the whole screen on phones): the season in the role they hold, then their whole pool for it with each champion's
 * figures and proficiency, and the way to their full profile. Previous / next move through the
 * lineup without closing it. Editing the champions opens the same editor as before.
 */
function PlayerDetailPanel({ slot, championsById, canEdit, canViewProfile, profileHref, editHref, onClose, onPrev, onNext, position }: { slot: RosterSlot; championsById: ChampionsById; canEdit: boolean; canViewProfile: boolean; profileHref: string; /** Where this viewer edits the pool: their own profile, or the player's profile for admins. */ editHref: string; onClose: () => void; onPrev: (() => void) | null; onNext: (() => void) | null; position: string }) {
  const p = slot.player!;
  const support = slot.role === "SUPPORT";
  const season = p.season;
  const status = assignmentStatus(p, slot.role);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, select")) return;
      if (e.key === "ArrowLeft" && onPrev) onPrev();
      if (e.key === "ArrowRight" && onNext) onNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onPrev, onNext]);
  const nav = "grid h-9 w-9 place-items-center rounded-md text-fg-subtle hover:bg-surface-2 hover:text-fg disabled:opacity-30 pointer-coarse:h-11 pointer-coarse:w-11";

  const figure = (label: string, value: string, sub: React.ReactNode, tone?: string) => (
    <div className="min-w-0">
      <dt className="text-2xs font-medium uppercase tracking-label text-fg-subtle">{label}</dt>
      <dd className={cn("text-2xl font-bold leading-tight tabular-nums sm:text-figure", tone ?? "text-fg")}>{value}</dd>
      <dd className="truncate text-xs tabular-nums text-fg-muted">{sub}</dd>
    </div>
  );

  return (
    <DetailModal
      open
      onClose={onClose}
      size="standard"
      title={`${p.name} · ${slot.roleLabel}`}
      titleId="player-detail-title"
      // The player's card, opened up: their saved artwork and colours behind the role, identity and
      // rank, with this season's figures in the same block and the way to the full profile. Static
      // art only (no card motion, no blur), so opening and moving between players stays light. The
      // window is as tall as its content.
      headerClassName="overflow-hidden"
      header={
        <div className="relative isolate" style={{ ...cardShellStyle(p.look, { glow: false }), borderColor: undefined, ["--card-accent" as string]: accentCss(p.look.style) }} data-testid="player-detail-hero">
          <CardArtLayer art={p.art} accent={accentCss(p.look.style)} kind="splash" position="center 22%" look={p.look} decorate={false} strength="normal" testId="detail-art" foot />
          <div className="relative flex min-h-[13rem] flex-col justify-end gap-3 px-4 pb-4 pt-14 sm:min-h-[15rem] sm:px-6 sm:pb-5">
            <h2 id="player-detail-title" className="sr-only">
              {p.name} · {slot.roleLabel}
            </h2>
            <CardRoleChip role={slot.role} label={slot.roleLabel} className="absolute left-4 top-3 sm:left-6 sm:top-4" />
            <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 [text-shadow:0_1px_10px_rgb(0_0_0/0.6)]">
              <CardIdentity look={p.look} name={p.name} avatarUrl={p.avatarUrl} rank={p.rank} showRank={p.statsVisible} status={status} role={slot.role} nameClassName="text-2xl sm:text-3xl" />
              {canViewProfile ? (
                <Link href={profileHref} className={buttonClass("primary", "sm", "shrink-0 [text-shadow:none]")} data-testid="detail-profile-link">
                  Full profile <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              ) : null}
            </div>
            <SocialLinks links={p.social} owner={p.name} className="[text-shadow:none]" />
            <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-fg-muted" data-testid="player-detail-position">
              <span>
                {slot.roleLabel} · {position}{p.statsVisible ? ` · ${p.seasonLabel}` : ""}
              </span>
              {/* One line of ranked progress; the chart and every rank change are on the profile. */}
              {p.rankChange ? (
                <Link href={`/players/${p.id}${p.rankChange.queue === "flex" ? "?rq=flex" : ""}#ranked-progress`} className="inline-flex flex-wrap items-center gap-x-1 hover:text-fg" data-testid="detail-rank-change">
                  <span aria-hidden className="text-fg-subtle">·</span> Ranked {p.rankChange.queue === "flex" ? "Flex" : "Solo/Duo"}{" "}
                  <span className={cn("font-semibold tabular-nums", p.rankChange.points > 0 ? "text-good" : p.rankChange.points < 0 ? "text-bad" : "text-fg-muted")}>
                    {p.rankChange.points > 0 ? "+" : ""}
                    {p.rankChange.points} ladder points
                  </span>{" "}
                  in {p.rankChange.days} days ({p.rankChange.from} → {p.rankChange.to})
                </Link>
              ) : null}
            </p>
            {/* This season in the role, part of the identity block: the three figures a lineup is
                judged on, the record as a bar, then the rest in one quiet line. */}
            {p.statsVisible ? (
              season ? (
                <section aria-labelledby="detail-season" className="rounded-panel border border-white/10 bg-bg/70 p-3 sm:p-3.5" data-testid="detail-season">
                  <h3 id="detail-season" className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-fg-muted">
                    {slot.roleLabel} this season
                    <InfoTip text="Supported games this season (Ranked Solo/Duo, Ranked Flex, Normal games) played in this role, on any champion, from every linked Riot account." label="What these figures count" />
                  </h3>
                  <dl className="grid grid-cols-3 gap-3">
                    {figure("Win rate", season.winRate === null ? "—" : `${Math.round(season.winRate * 100)}%`, `${season.wins}W ${season.losses}L${season.games < WIN_RATE_MIN_GAMES.season ? " · small sample" : ""}`, WIN_RATE_TONE_CLASS[winRateTone(season.winRate, season.games, WIN_RATE_MIN_GAMES.season)])}
                    {figure("KDA", season.perfectKda ? "Perfect" : season.kda === null ? "—" : season.kda.toFixed(2), season.kills !== null && season.deaths !== null && season.assists !== null ? `${season.kills.toFixed(1)} / ${season.deaths.toFixed(1)} / ${season.assists.toFixed(1)}` : "\u00a0")}
                    {figure(support ? "Vision" : "CS/min", support ? (season.visionPerGame === null ? "—" : season.visionPerGame.toFixed(1)) : season.csPerMinute === null ? "—" : season.csPerMinute.toFixed(1), support ? "per game" : "per minute")}
                  </dl>
                  <div className="mt-2.5 flex h-1.5 overflow-hidden rounded-full bg-bad/25" aria-hidden>
                    {season.wins + season.losses > 0 ? <span className="h-full rounded-full bg-good/80" style={{ width: `${(season.wins / (season.wins + season.losses)) * 100}%` }} /> : null}
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
                <p className="rounded-panel border border-dashed border-white/15 bg-bg/60 px-3 py-2.5 text-sm text-fg-muted" data-testid="detail-season-empty">
                  No {slot.roleLabel} games stored this season yet.
                </p>
              )
            ) : null}
          </div>
        </div>
      }
      testId="player-detail"
      headerExtra={
        <>
          <button type="button" className={cn(nav, "bg-bg/60 text-fg-muted")} onClick={onPrev ?? undefined} disabled={!onPrev} aria-label="Previous player" data-testid="detail-prev">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button type="button" className={cn(nav, "bg-bg/60 text-fg-muted")} onClick={onNext ?? undefined} disabled={!onNext} aria-label="Next player" data-testid="detail-next">
            <ChevronRight className="h-4 w-4" />
          </button>
        </>
      }
    >
      <section aria-labelledby="detail-pool" className="space-y-2.5" style={{ ["--card-accent" as string]: accentCss(p.look.style) }}>
        <div className="flex items-center justify-between gap-2">
          <h3 id="detail-pool" className="text-sm font-semibold text-fg">
            {slot.roleLabel} champion pool{slot.champions.length ? <span className="font-normal text-fg-subtle"> · {slot.champions.length}, in order of preference</span> : null}
          </h3>
          {/* Pools are edited on the profile (one place, with every role); Team only shows them. */}
          {canEdit ? (
            <Link href={editHref} className="inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-xs font-medium text-accent hover:bg-accent/10 pointer-coarse:min-h-11" aria-label={`Edit ${p.name}'s champions on the profile`} data-testid="edit-pool-on-profile">
              <Pencil className="h-3.5 w-3.5" aria-hidden /> Edit on profile
            </Link>
          ) : null}
        </div>
        {slot.champions.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-3 text-sm text-warn">No {slot.roleLabel} champions yet.</p>
        ) : (
          // The first choice is a wide tile in the card's own colour; the rest follow in order, two
          // to a row from small tablets up.
          <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2" data-testid="pool-list" aria-label={`${slot.roleLabel} champion pool, in order of preference`}>
            {slot.champions.map((c, i) => (
              <PoolChampionTile key={c.championId} index={i} champion={lookup(championsById, c.championId)} row={c} support={support} withStats={p.statsVisible} />
            ))}
          </ol>
        )}
      </section>
    </DetailModal>
  );
}

/**
 * One width for the header and the cards, following the card grid's own breakpoints. Five across
 * from a 64rem content area (normal desktops, sidebar open or not) up to a shared maximum, so on
 * wide screens the lineup stays one centred group of equal cards instead of stretching.
 */
const LINEUP_WIDTH = "mx-auto w-full max-w-[26rem] @xl:max-w-[54rem] @4xl:max-w-[80rem] @5xl:max-w-[84rem]";

/**
 * OUR TEAM: the team's header (logo, name, the lineup's context and Edit lineup) and the main
 * lineup as five player cards, as one centred section. "Edit lineup" (lineup managers only)
 * switches every card into a mode with a Change/Assign control; your own card's brush personalises
 * its look. A card opens its player in the shared detail window: that card lifts, the others step back.
 * Champion pools are shown here and edited on the profile. On phones the five cards are a
 * swipeable track (native scrolling with snap points, each card centred with a glimpse of its neighbours) under a
 * bar of the five roles that says where you are and moves to any of them.
 */
export function TeamRoster({ team, slots, complete, champions, canManageLineup, canViewPlayers, editablePlayerIds, viewerPlayerId, guest = null }: { team: { name: string; shortName: string; logo: string | null; logoStill: string | null }; slots: RosterSlot[]; complete: boolean; champions: PickerChampion[]; canManageLineup: boolean; /** Without the Players directory the detail panel does not offer a profile it cannot open. */ canViewPlayers: boolean; editablePlayerIds: string[]; viewerPlayerId: string | null; /** The public Team Overview: profiles open under this path, and nothing about managing the lineup is shown. */ guest?: { profileBase: string | null } | null }) {
  const [editingLineup, setEditingLineup] = React.useState(false);
  // Interactive once hydrated (data-ready on the cards, which browser tests wait for before they
  // touch the page: React discards server HTML that changed before it hydrated, as a mismatch).
  const interactive = React.useSyncExternalStore(noopSubscribe, () => true, () => false);
  // The player whose detail panel is open: a role, and which side of its card (the starter, or the
  // substitute on a turned card). Owned here, so a turned card opening its substitute stays turned.
  const [detail, setDetail] = React.useState<{ role: Role; side: CardSide } | null>(null);
  const filled = slots.filter((s) => s.player);
  const detailIndex = filled.findIndex((s) => s.role === detail?.role);
  const detailBase = detailIndex >= 0 ? filled[detailIndex]! : null;
  // A substitute removed meanwhile leaves the starter's details.
  const detailSub = detail?.side === "substitute" ? (detailBase?.substitute ?? null) : null;
  const detailSlot = detailBase && detailSub ? { ...detailBase, player: detailSub.player, champions: detailSub.champions } : detailBase;
  const championsById = React.useMemo(() => new Map(champions.map((c) => [c.id, c])), [champions]);
  const editable = new Set(editablePlayerIds);
  const { ref: trackRef, index: current, onScroll: onTrackScroll, go } = useSnapTrack(slots.length);
  // Phones: moving through the panel (previous / next) brings that card into view in the track.
  React.useEffect(() => {
    if (detail) go(slots.findIndex((s) => s.role === detail.role));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail?.role]);
  const season = filled.find((s) => s.player?.statsVisible)?.player?.seasonLabel ?? null;
  // Who starts where, so choosing someone already in another role says what saving would do.
  const startsElsewhere = React.useMemo(() => new Map(slots.flatMap((s) => (s.player ? [[s.player.id, s.roleLabel] as const] : []))), [slots]);
  return (
    // The team's identity and its five players as one composition, centred in the window (desktop):
    // the frame takes the height left under the section tabs (main and the page are flex columns on
    // this page) and centres its content (flex, nothing positioned), so there is as much room above
    // the header as below the cards and the header stays right above them. On a short window the content is taller than that minimum,
    // so it simply starts at the top and scrolls. The floor's light is clipped at the frame, so it
    // never adds a scroll.
    <div className="@container/lineup flex flex-col gap-5 lg:flex-1 lg:justify-center lg:gap-6 lg:overflow-y-clip @7xl/lineup:gap-7" data-testid="lineup-frame">
      {/* The team's identity: logo, name and the lineup's state, with Edit lineup beside it. On a
          phone it is one compact block (the tab above already says this is the Team Overview), so the
          players start on the first screen; wider screens give the team a larger mark. The logo is
          drawn at its own proportions in a square (BrandMark: object-contain, never squeezed), and
          animates where the browser allows motion. The line under the name wraps between whole
          items (the lineup and season, then its state), never leaving a separator at a line's end. */}
      <header className={cn(LINEUP_WIDTH, "flex items-center gap-3 [text-shadow:0_1px_14px_rgb(0_0_0/0.55)] sm:gap-4")} data-testid="team-header">
        <BrandMark src={team.logo} still={team.logoStill} name={team.shortName} className="h-12 w-12 shrink-0 rounded-panel text-lg shadow-lg shadow-accent/15 ring-1 ring-border-strong sm:h-16 sm:w-16 sm:rounded-card sm:text-2xl lg:h-20 lg:w-20 lg:text-3xl short:h-11 short:w-11 short:rounded-panel short:text-lg" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-label text-accent max-sm:sr-only short:sr-only">Team Overview</p>
          <h1 className="truncate text-[1.375rem] font-bold leading-tight tracking-tight text-fg sm:text-3xl lg:text-4xl short:text-xl" data-testid="team-name">
            {team.name}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-muted sm:text-sm short:mt-0.5 short:text-xs" data-testid="team-subtitle">
            {guest ? (
              <span>Main lineup</span>
            ) : editingLineup ? (
              <span className="font-medium text-accent">Editing the lineup</span>
            ) : (
              <>
                <span className="whitespace-nowrap">Main lineup{season ? ` · ${season}` : ""}</span>
                <span className={cn("inline-flex items-center gap-1.5 rounded-full border py-px pl-2 pr-1 font-medium leading-5 [text-shadow:none]", complete ? "border-good/35 bg-good/10 text-good" : "border-warn/35 bg-warn/10 text-warn")} data-testid="lineup-status">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
                  {complete ? "Lineup complete" : canManageLineup ? "Assign all five roles" : "A lineup manager assigns the five roles"}
                  <InfoTip text="Each card is about the role the player holds in this lineup: its figures count this season's supported games (Ranked Solo/Duo, Ranked Flex, Normal games) played in that role, on any champion, from their linked Riot accounts; the champions are their whole pool for that role, in order of preference." />
                </span>
              </>
            )}
          </p>
        </div>
        {canManageLineup ? (
          <Button size="sm" variant={editingLineup ? "primary" : "outline"} className="shrink-0 self-start sm:self-center short:self-center" onClick={() => setEditingLineup((v) => !v)} aria-pressed={editingLineup} data-testid="edit-lineup">
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
      {/* Phones (a narrow content area): one track of five cards that scrolls sideways on its own,
          one card centred with an equal glimpse of the cards either side. Wider: a grid of half-width tracks (cards in a row
          share its height; each row is as tall as its own content) and a short last row is centred
          (2 + 2 + 1, 3 + 2), five across when the content area allows. Cards never shrink below a
          readable width. */}
      {/* The stage: five across on wide screens, the cards stand on a floor lit from just under them
          in the team's colour and carrying the team's name. Decoration only: it never moves or sizes
          a card, and is hidden from screen readers. */}
      <div className="relative isolate flex flex-col" data-testid="lineup-stage">
        <div className="relative">
          {/* The five roles as one bar (phones only): where you are in the track, and a tap away from
              any player. Swiping moves through the cards; the bar follows. */}
          <div className="relative z-[1] mx-auto mb-3 grid max-w-[26rem] grid-cols-5 gap-1 rounded-card border border-border bg-surface/85 p-1 shadow-sm shadow-black/20 @xl:hidden" role="tablist" aria-label="Lineup position" data-testid="lineup-pager">
            {slots.map((s, i) => (
              <button key={s.role} type="button" role="tab" aria-selected={current === i} aria-label={`${s.roleLabel}${s.player ? `: ${s.player.name}` : ""}`} onClick={() => go(i)} className={cn("flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-panel px-1 text-2xs font-semibold leading-none transition-[background-color,color,box-shadow] duration-150 motion-reduce:transition-none", current === i ? "bg-accent/15 text-accent shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-accent)_40%,transparent)]" : "text-fg-muted hover:bg-surface-2/60 hover:text-fg")} data-testid="lineup-dot">
                <RoleIcon role={s.role} className="h-4 w-4" decorative />
                <span className="max-w-full truncate">{s.roleLabel}</span>
              </button>
            ))}
          </div>
          {/* The track's vertical padding (taken back by its margins) leaves room for a card's edges
              while it turns over: a scrolling track clips anything outside its box. */}
          <div
            ref={trackRef}
            onScroll={onTrackScroll}
            className={cn(
              "flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain scroll-smooth px-7 pt-3 pb-4 -my-3 [scrollbar-width:none] motion-reduce:scroll-auto [&::-webkit-scrollbar]:hidden",
              "-mx-4",
              "@xl:mx-auto @xl:my-0 @xl:grid @xl:w-full @xl:max-w-[54rem] @xl:grid-cols-4 @xl:overflow-visible @xl:px-0 @xl:py-0 @xl:[&>*]:col-span-2 @xl:[&>*:nth-child(5)]:col-start-2",
              "@4xl:max-w-[80rem] @4xl:grid-cols-6 @4xl:[&>*:nth-child(4)]:col-start-2 @4xl:[&>*:nth-child(5)]:col-start-auto",
              "@5xl:max-w-[84rem] @5xl:grid-cols-5 @5xl:[&>*]:col-span-1 @5xl:[&>*:nth-child(4)]:col-start-auto @7xl:gap-5",
            )}
            role="region"
            aria-roledescription="carousel"
            aria-label="Main lineup"
            data-testid="lineup-overview"
            data-ready={interactive ? "true" : undefined}
          >
            {slots.map((s, i) => (
              <div key={s.role} className="flex w-full max-w-[26rem] shrink-0 snap-center snap-always @xl:w-auto @xl:max-w-none @xl:min-w-0" role="group" aria-roledescription="slide" aria-label={`${s.roleLabel}: ${s.player?.name ?? (s.privateMember ? "team member" : "no player")} (${i + 1} of ${slots.length})`} data-testid="lineup-cell">
                <LineupCard slot={s} champions={champions} championsById={championsById} canManageLineup={canManageLineup} editingLineup={editingLineup} canEdit={!!s.player && editable.has(s.player.id)} viewerPlayerId={viewerPlayerId} onOpenSide={(side) => setDetail({ role: s.role, side })} openSide={detail?.role === s.role ? detail.side : null} dimmed={detail !== null && detail.role !== s.role} guest={!!guest} startsElsewhere={startsElsewhere} />
              </div>
            ))}
          </div>
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-full -z-10 -mt-10 hidden h-[clamp(10rem,30vh,18rem)] overflow-hidden @5xl:block" data-testid="lineup-stage-floor">
            <div className="absolute inset-x-0 top-0 h-[85%]" style={{ background: "radial-gradient(50% 75% at 50% 0%, color-mix(in srgb, var(--color-accent) 16%, transparent), transparent 75%)" }} />
            <div className="absolute inset-x-[6%] top-10 h-px" style={{ background: "linear-gradient(90deg, transparent, color-mix(in srgb, var(--color-accent) 50%, transparent), transparent)" }} />
            {team.logo ? (
              // eslint-disable-next-line @next/next/no-img-element -- the team's validated logo, decorative
              <img src={team.logoStill ?? team.logo} alt="" className="absolute left-1/2 top-[38%] h-[min(9rem,45%)] w-auto -translate-x-1/2 -translate-y-1/2 opacity-[0.07] grayscale" />
            ) : (
              <span className="absolute inset-x-0 top-[45%] -translate-y-1/2 pl-(--tracking-tagline) text-center text-[clamp(3rem,7vw,7.5rem)] font-black uppercase leading-none tracking-tagline text-fg opacity-[0.035]">{team.shortName}</span>
            )}
          </div>
        </div>
      </div>
      {detailSlot ? (
        <PlayerDetailPanel
          slot={detailSlot}
          championsById={championsById}
          canEdit={!!detailSlot.player && editable.has(detailSlot.player.id)}
          canViewProfile={guest ? !!guest.profileBase : canViewPlayers || detailSlot.player?.id === viewerPlayerId}
          profileHref={`${guest?.profileBase ?? "/players/"}${detailSlot.player?.id}`}
          editHref={detailSlot.player?.id === viewerPlayerId ? "/overview#champion-pools" : `/players/${detailSlot.player?.id}#champion-pools`}
          onClose={() => setDetail(null)}
          onPrev={detailIndex > 0 ? () => setDetail({ role: filled[detailIndex - 1]!.role, side: "starter" }) : null}
          onNext={detailIndex < filled.length - 1 ? () => setDetail({ role: filled[detailIndex + 1]!.role, side: "starter" }) : null}
          position={detailSub ? "substitute" : `${detailIndex + 1} of ${filled.length} in the lineup`}
        />
      ) : null}
    </div>
  );
}
