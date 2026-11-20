import type { Role } from "@/domain/roles";
import type { AssignmentStatus } from "@/domain/roster";
import { cn } from "@/lib/cn";

/**
 * Main Role / Off Role: whether the position a player holds is their Primary Role
 * (`assignmentStatus`). One size and style wherever a lineup player is shown: the Team page cards.
 * The badge says it in words, so it carries no hover text (TT.T15).
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
      {main ? "Main Role" : "Off Role"}
    </span>
  );
}
