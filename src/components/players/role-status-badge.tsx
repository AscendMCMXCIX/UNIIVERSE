import type { Role } from "@/domain/roles";
import type { AssignmentStatus } from "@/domain/roster";
import { cn } from "@/lib/cn";

/**
 * Main role / Off role (sentence case since Release 19, D4): whether the position a player holds is their Primary Role
 * (`assignmentStatus`). One size and style wherever a lineup player is shown: the Team page cards.
 * The badge says it in words, so it carries no hover text (TT.T15). On a card under 12rem (five
 * across from a 56rem lineup, a 1280px window with the sidebar open) it shows "Main" or "Off", the
 * word "Role" read out: there the 12px floor (S2c) made the longest rank and "Main Role" one line
 * too wide for the card ("Platinum IV" with it took 161px of 156), and the wrapped labels lifted that
 * card's picture and name above its neighbours'.
 */
export function RoleStatusBadge({ status, role, className }: { status: AssignmentStatus; role: Role; className?: string }) {
  const main = status === "main";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center whitespace-nowrap rounded-full border px-1.5 py-px text-2xs font-semibold leading-4",
        main ? "border-good/35 bg-good/10 text-good" : "border-warn/50 bg-warn/15 text-warn",
        className,
      )}
      data-testid={main ? "main-role-badge" : "off-role-badge"}
      data-status={status}
      data-role={role}
    >
      {main ? "Main" : "Off"}
      {/* A non-breaking space: as a flex item of its own, a leading plain space would not be drawn. */}
      <span className="@max-[12rem]/card:sr-only">{"\u00a0role"}</span>
    </span>
  );
}
