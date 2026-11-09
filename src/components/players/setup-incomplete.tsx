import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";

/**
 * The one mark for a team member whose account has not finished first-time setup. Membership and
 * setup are separate: such a member is listed, shown and can be opened like anyone else; this only
 * says why some of their information (roles, champions, Riot accounts) may still be missing.
 */
export const SETUP_INCOMPLETE_HINT = "This member has not finished setting up their profile yet, so some of their information (roles, champions, Riot accounts) may still be missing.";

/** `wordClassName`: classes for the word "incomplete", which a narrow list row keeps for screen readers only ("Setup"; the title still explains it). */
export function SetupIncompleteBadge({ className, wordClassName }: { className?: string; wordClassName?: string }) {
  return (
    <span className={cn("inline-flex", className)} data-testid="setup-incomplete">
      <Badge tone="neutral" title={SETUP_INCOMPLETE_HINT} className="whitespace-nowrap">
        <span>
          Setup<span className={wordClassName}> incomplete</span>
        </span>
      </Badge>
    </span>
  );
}
