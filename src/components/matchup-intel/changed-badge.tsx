import { Badge } from "@/components/ui/badge";
import { InfoTip } from "@/components/ui/info-tip";

/**
 * "Changed since the check": Riot's data for an ability changed after the curated notes were
 * checked. What that means is one tap or hover away (tooltip inventory I04), never only in a title.
 */
export function ChangedBadge({ note = false, testId }: { /** On a note resting on an ability, rather than on the ability itself. */ note?: boolean; testId?: string }) {
  return (
    <InfoTip label="About changed since the check" text={note ? "Riot changed an ability this note rests on after the notes were checked, so it may be out of date." : "Riot changed this ability after the notes were checked, so they may be out of date."}>
      <Badge tone="warn">{testId ? <span data-testid={testId}>Changed since the check</span> : "Changed since the check"}</Badge>
    </InfoTip>
  );
}
