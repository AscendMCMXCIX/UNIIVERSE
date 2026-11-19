import { Gamepad2, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/cn";
import { RAIL_FADE, RAIL_HIGHLIGHT, RAIL_HOVER, RAIL_ICON, RAIL_ROW } from "@/lib/sidebar";
import { ACCOUNT_ROW, ACCOUNT_ROW_ICON } from "@/lib/sheet";
import { menuItemClass } from "./ui/menu-style";

/**
 * The way between Player Mode and Admin Mode: "Switch to Admin Mode" in Player Mode, "Return to
 * Player Mode" in Admin Mode. Administrators only: the server renders it for nobody else, so a
 * player never sees Admin Mode named anywhere. A plain link to the switch route (never
 * prefetched), which checks the account again and remembers the choice, so it works the same in
 * a browser tab, on a phone and in the installed app. It sits apart from the pages of the mode.
 *
 * In the sidebar it is one of the footer's rows, set apart from the pages by the footer's hairline
 * rather than by a box of its own, and as quiet as its neighbours (the shield turns to the brand
 * blue while pointed at), so the current page remains the one coloured mark in the frame. The phone's
 * account screen has it as one of its full-width rows (lib/sheet.ts), and a tablet's avatar menu as
 * one of its items (an item of the menu, so its arrow keys reach it), each in the brand blue on the
 * way to Admin Mode.
 */
export function ModeSwitch({ mode, variant }: { mode: "player" | "admin"; variant: "sidebar" | "row" | "menu" }) {
  const toAdmin = mode === "player";
  const label = toAdmin ? "Switch to Admin Mode" : "Return to Player Mode";
  const Icon = toAdmin ? ShieldCheck : Gamepad2;
  return (
    <a
      href={`/api/mode?to=${toAdmin ? "admin" : "player"}`}
      title={label}
      data-testid="mode-switch"
      data-to={toAdmin ? "admin" : "player"}
      role={variant === "menu" ? "menuitem" : undefined}
      tabIndex={variant === "menu" ? -1 : undefined}
      className={
        variant === "sidebar"
          ? cn(RAIL_ROW, "font-medium text-fg-muted hover:text-fg")
          : variant === "row"
            ? cn(ACCOUNT_ROW, toAdmin ? "text-accent" : "text-fg")
            : cn(menuItemClass(), toAdmin && "text-accent")
      }
    >
      {variant === "sidebar" ? <span className={cn(RAIL_HIGHLIGHT, RAIL_HOVER)} aria-hidden /> : null}
      <Icon className={cn(variant === "row" ? ACCOUNT_ROW_ICON : variant === "menu" ? "h-4 w-4 shrink-0" : RAIL_ICON, variant === "sidebar" && (toAdmin ? "text-fg-subtle group-hover:text-accent" : "text-fg-subtle group-hover:text-fg-muted"), variant !== "sidebar" && !toAdmin && "text-fg-subtle")} aria-hidden />
      <span className={cn("truncate", variant === "sidebar" && RAIL_FADE, variant === "menu" && "min-w-0 flex-1")}>{label}</span>
    </a>
  );
}
