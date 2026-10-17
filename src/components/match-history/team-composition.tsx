import type { PortraitChampion } from "@/components/champion-portrait";
import type { CompSlot, Composition } from "@/server/matches/compositions";
import { cn } from "@/lib/cn";
import { PlayerLink } from "./player-link";

/*
  Both teams of a game at a glance, shared by a player's Match History and Team → Matches: blue
  then red, each in lane order, every champion with the name of who played it. The player the
  list is about is in bold, UNIIVERSE team members in the accent colour (by their profile name),
  and the side they played on is tinted. Names Riot did not provide fall back to the champion's
  name, in a quieter colour; nothing is guessed.

  Layouts (no interaction needed to read them):
  - "columns": two columns of five, icon and name, for the match cards on wider screens; with
    32rem or more of room (a card stacked full width) each side is one line of five instead.
    Below 13rem of room, and on phones, the names fold away (still read by screen readers) and
    each side becomes a row of five icons.
  - "strip": each side as one line of icons and short names, for wide cards that have the room
    across rather than down (Team → Matches); phones keep the icons only.
  Icons are 16 px, lazily loaded portraits the browser already caches from the rest of the page.
  Names link to the member's profile, or to a non-member's OP.GG profile (see PlayerLink).
*/

const SIDE = {
  blue: { label: "Blue team", rail: "border-blue/70", dot: "bg-blue" },
  red: { label: "Red team", rail: "border-red/70", dot: "bg-red" },
} as const;

function Icon({ champion, you, member }: { champion: PortraitChampion; you: boolean; member: boolean }) {
  return champion.portraitUrl ? (
    // Static Riot portraits at 18–20 px; a plain image so the browser caches and lazy-loads it.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={champion.portraitUrl} alt="" width={16} height={16} loading="lazy" decoding="async" className={cn("h-4 w-4 shrink-0 rounded-[4px] bg-surface-2 object-cover", you ? "ring-[1.5px] ring-fg" : member ? "ring-1 ring-accent/80" : null)} />
  ) : (
    <span className={cn("grid h-4 w-4 shrink-0 place-items-center rounded-[4px] bg-surface-3 text-[0.5rem] font-bold text-fg-muted", you ? "ring-[1.5px] ring-fg" : member ? "ring-1 ring-accent/80" : null)} aria-hidden>
      {champion.name.slice(0, 2)}
    </span>
  );
}

function slotText(s: CompSlot, champion: PortraitChampion) {
  const who = s.member?.name ?? s.name;
  return {
    label: who ?? champion.name,
    known: !!who,
    title: [who ?? "Name not provided by Riot", champion.name, s.member && s.name && s.name !== s.member.name ? `Riot: ${s.name}` : null, s.you ? "this player" : s.member ? "team member" : null].filter(Boolean).join(" · "),
  };
}

export function TeamComposition({ teams, champion, variant = "columns", id, className }: { teams: Composition; champion: (id: string | null) => PortraitChampion; variant?: "columns" | "strip"; id?: string; className?: string }) {
  const columns = variant === "columns";
  return (
    <span id={id} className={cn("@container/teams block min-w-0", className)} data-testid="match-teams" data-variant={variant}>
      <span className={cn("grid min-w-0 gap-1.5", columns ? "grid-cols-2 gap-x-2 max-md:gap-x-3 md:@max-[13rem]/teams:grid-cols-1 md:@min-[32rem]/teams:grid-cols-1 md:@min-[32rem]/teams:gap-y-1" : "grid-cols-1 gap-y-1 sm:grid-cols-2 sm:gap-x-4")}>
        {(["blue", "red"] as const).map((side) => {
          const slots = teams[side];
          const own = teams.side === side;
          return (
            <span key={side} className={cn("flex min-w-0 border-l-2 pl-1.5", SIDE[side].rail, own && "rounded-r-md bg-white/[0.04]", columns ? "flex-row items-center gap-0.5 md:@min-[13rem]/teams:flex-col md:@min-[13rem]/teams:items-stretch md:@min-[13rem]/teams:gap-0.5 md:@min-[13rem]/teams:py-0.5 md:@min-[32rem]/teams:flex-row md:@min-[32rem]/teams:items-center md:@min-[32rem]/teams:gap-3" : "flex-wrap items-center gap-x-2.5 gap-y-0.5 py-0.5")} data-side={side} data-own={own || undefined}>
              <span className="sr-only">
                {SIDE[side].label}
                {own ? " (this player's team)" : ""}:
              </span>
              {slots.map((s, i) => {
                const c = champion(s.championId);
                const t = slotText(s, c);
                return (
                  <span key={i} className={cn("flex min-w-0 items-center gap-1 leading-none", columns && "md:@min-[32rem]/teams:flex-1 md:@min-[32rem]/teams:basis-0")} title={t.title} data-testid="team-slot" data-you={s.you || undefined} data-member={s.member ? s.member.id : undefined}>
                    <Icon champion={c} you={s.you} member={!!s.member} />
                    <span data-testid="team-slot-name" className={cn("truncate text-[0.6875rem] leading-4", columns ? "max-md:sr-only md:@max-[13rem]/teams:sr-only" : "max-w-[7.5rem] max-sm:sr-only", s.you ? "font-semibold text-fg" : s.member ? "font-medium text-accent" : t.known ? "text-fg-muted" : "text-fg-subtle")}>
                      <PlayerLink memberId={s.member?.id ?? null} opgg={s.opgg} label={t.label} preview>
                        {t.label}
                      </PlayerLink>
                      <span className="sr-only">
                        {" "}
                        ({c.name}
                        {s.you ? ", this player" : s.member ? ", team member" : ""})
                      </span>
                    </span>
                  </span>
                );
              })}
            </span>
          );
        })}
      </span>
    </span>
  );
}
