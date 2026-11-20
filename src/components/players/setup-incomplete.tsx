import { Badge } from "@/components/ui/badge";
import { InfoTip } from "@/components/ui/info-tip";
import { cn } from "@/lib/cn";

/**
 * The one mark for a team member whose account has not finished first-time setup. Membership and
 * setup are separate: such a member is listed, shown and can be opened like anyone else; this only
 * says why some of their information (roles, champions, Riot accounts) may still be missing.
 */
export const SETUP_INCOMPLETE_HINT = "They haven't finished setting up, so their roles, champions or Riot accounts may be missing.";

/** `wordClassName`: classes for the word "incomplete", which a narrow list row keeps for screen readers only ("Setup"; its tip still explains it). */
export function SetupIncompleteBadge({ className, wordClassName }: { className?: string; wordClassName?: string }) {
  return (
    <span className={cn("relative z-[2] inline-flex", className)} data-testid="setup-incomplete">
      <InfoTip text={SETUP_INCOMPLETE_HINT}>
        <Badge tone="neutral" className="whitespace-nowrap">
          <span>
            Setup<span className={wordClassName}> incomplete</span>
          </span>
        </Badge>
      </InfoTip>
    </span>
  );
}
