"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Bookmark, BookmarkCheck, Share2 } from "lucide-react";
import { setTeamBookmarkAction } from "@/server/actions/matches";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";

/**
 * Bookmark a Riot game for the team (Matches → Bookmarked), or remove the bookmark. `share` is a
 * member sharing one of their own games; the server checks the game is theirs. `canRemove` false
 * shows the state without the control to undo it (someone else's bookmark).
 */
export function BookmarkButton({ matchId, bookmarked, canRemove = true, share = false, compact = false, iconOnly = false }: { matchId: string; bookmarked: boolean; canRemove?: boolean; share?: boolean; compact?: boolean; /** A square icon button (a card's corner): the words for screen readers and in its tooltip. */ iconOnly?: boolean }) {
  const router = useRouter();
  const [on, setOn] = React.useState(bookmarked);
  const [busy, setBusy] = React.useState(false);
  const label = on ? (share ? "Shared with the team" : "Bookmarked") : share ? "Share with the team" : "Bookmark";
  const toggle = async () => {
    setBusy(true);
    const r = await setTeamBookmarkAction(matchId, !on, { share });
    setBusy(false);
    if (!r.ok) return void toast.error(on ? "Not removed" : share ? "Not shared" : "Not bookmarked", { description: r.error });
    setOn(r.data.bookmarked);
    if (r.data.bookmarked) toast.success(share ? "Shared with the team." : "Bookmarked for the team.", { description: "Find it under Matches → Bookmarked." });
    router.refresh();
  };
  const Icon = on ? BookmarkCheck : share ? Share2 : Bookmark;
  if (on && !canRemove)
    return (
      <span className={cn("inline-flex items-center gap-1 text-xs text-accent", iconOnly && "h-8 w-8 justify-center pointer-coarse:h-11 pointer-coarse:w-11")} title={iconOnly ? label : undefined} data-testid="bookmark-state">
        <Icon className="h-3.5 w-3.5" aria-hidden /> <span className={cn(iconOnly && "sr-only")}>{label}</span>
      </span>
    );
  return (
    <button
      type="button"
      onClick={() => void toggle()}
      disabled={busy}
      aria-label={on ? `${label}: remove` : label}
      title={on ? "Remove from the team's bookmarks" : share ? "Show this game to the team under Matches → Bookmarked" : "Keep this game under Matches → Bookmarked"}
      className={cn(
        "inline-flex min-h-8 items-center gap-1.5 rounded-md text-xs font-medium transition-colors pointer-coarse:min-h-11",
        iconOnly ? "w-8 justify-center pointer-coarse:w-11" : "px-2",
        on ? "text-accent hover:bg-accent/10" : "text-fg-muted hover:bg-surface-2 hover:text-fg",
        !compact && !iconOnly && "border border-border",
      )}
      data-testid={share ? "share-game" : "bookmark-game"}
      data-bookmarked={on || undefined}
    >
      <Icon className={cn(iconOnly ? "h-4 w-4" : "h-3.5 w-3.5")} aria-hidden fill={on && iconOnly ? "currentColor" : "none"} />
      <span className={cn(iconOnly ? "sr-only" : compact && "max-sm:sr-only")}>{label}</span>
    </button>
  );
}
