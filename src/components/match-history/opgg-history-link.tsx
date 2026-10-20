import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * A player's match history on OP.GG (their OP.GG profile, built by domain/opgg), for match windows
 * and Match History. OP.GG has no address for one game that can be built from Riot's match id, so
 * this never claims to open the game itself. `account`: which Riot account, shown after the label.
 */
export function OpggHistoryLink({ href, account, className, testId = "match-opgg-history" }: { href: string; account?: string | null; className?: string; testId?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn("inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-md border border-border px-2 text-xs font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:min-h-11", className)}
      data-testid={testId}
    >
      <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="truncate">
        View Match History on OP.GG
        {account ? <span className="font-normal text-fg-subtle"> · {account}</span> : null}
      </span>
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}
