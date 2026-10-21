import { Gamepad2, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/cn";

/** The label fades while the desktop sidebar is collapsed to its icon column (the icon stays). */
const FADE = "transition-opacity duration-150 group-data-[collapsed=true]/sidebar:opacity-0 group-data-[collapsed=true]/sidebar:duration-75";

/**
 * The way between Player Mode and Admin Mode: "Switch to Admin Mode" in Player Mode, "Return to
 * Player Mode" in Admin Mode. Administrators only: the server renders it for nobody else, so a
 * player never sees Admin Mode named anywhere. A plain link to the switch route (never
 * prefetched), which checks the account again and remembers the choice, so it works the same in
 * a browser tab, on a phone and in the installed app. It sits apart from the pages of the mode.
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
      className={cn(
        "group/mode flex items-center gap-3 rounded-lg border text-sm font-medium transition-colors duration-150",
        variant === "sidebar" ? "min-h-10 pl-[14px] pr-3 group-data-[collapsed=true]/sidebar:border-transparent group-data-[collapsed=true]/sidebar:bg-transparent" : "min-h-12 px-3",
        toAdmin ? "border-accent/30 bg-accent/5 text-accent hover:border-accent/50 hover:bg-accent/10" : "border-border bg-surface/60 text-fg-muted hover:border-border-strong hover:bg-surface-2 hover:text-fg",
      )}
    >
      <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
      <span className={cn("truncate", variant === "sidebar" && FADE)}>{label}</span>
    </a>
  );
}
