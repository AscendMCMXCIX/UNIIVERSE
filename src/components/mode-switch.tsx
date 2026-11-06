import { Gamepad2, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/cn";
import { RAIL_FADE, RAIL_HIGHLIGHT, RAIL_HOVER, RAIL_ICON, RAIL_ROW } from "@/lib/sidebar";

/**
 * The way between Player Mode and Admin Mode: "Switch to Admin Mode" in Player Mode, "Return to
 * Player Mode" in Admin Mode. Administrators only: the server renders it for nobody else, so a
 * player never sees Admin Mode named anywhere. A plain link to the switch route (never
 * prefetched), which checks the account again and remembers the choice, so it works the same in
 * a browser tab, on a phone and in the installed app. It sits apart from the pages of the mode.
 *
 * In the sidebar it is one of the footer's rows, set apart from the pages by the footer's hairline
 * rather than by a box of its own, and as quiet as its neighbours (the shield turns to the brand
 * blue while pointed at), so the current page remains the one coloured mark in the frame. The phone
 * sheet and the tablet drawer keep their bordered button.
 */
export function ModeSwitch({ mode, variant }: { mode: "player" | "admin"; variant: "sidebar" | "drawer" }) {
  const toAdmin = mode === "player";
  const label = toAdmin ? "Switch to Admin Mode" : "Return to Player Mode";
  const Icon = toAdmin ? ShieldCheck : Gamepad2;
  return (
    <a
      href={`/api/mode?to=${toAdmin ? "admin" : "player"}`}
      title={label}
      data-testid="mode-switch"
      data-to={toAdmin ? "admin" : "player"}
      className={
        variant === "sidebar"
          ? cn(RAIL_ROW, "font-medium text-fg-muted hover:text-fg")
          : cn(
              "group/mode flex min-h-12 items-center gap-3 rounded-lg border pl-[0.875rem] pr-3 text-sm font-medium transition-colors duration-150",
              toAdmin ? "border-accent/30 bg-accent/5 text-accent hover:border-accent/50 hover:bg-accent/10" : "border-border bg-surface/60 text-fg-muted hover:border-border-strong hover:bg-surface-2 hover:text-fg",
            )
      }
    >
      {variant === "sidebar" ? <span className={cn(RAIL_HIGHLIGHT, RAIL_HOVER)} aria-hidden /> : null}
      <Icon className={cn(RAIL_ICON, variant === "sidebar" && (toAdmin ? "text-fg-subtle group-hover:text-accent" : "text-fg-subtle group-hover:text-fg-muted"))} aria-hidden />
      <span className={cn("truncate", variant === "sidebar" && RAIL_FADE)}>{label}</span>
    </a>
  );
}
