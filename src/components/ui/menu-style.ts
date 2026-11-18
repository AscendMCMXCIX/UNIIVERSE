import { cn } from "@/lib/cn";

/*
  The look of a menu's rows (ui/menu.tsx), in a plain module so a component the server also renders
  can draw a row of its own in a menu (the switch between the modes, a plain link: mode-switch.tsx).
*/

/** A menu row: 44px on a touch screen at every width (a tablet, a phone held sideways), 36px under a mouse. */
export function menuItemClass(tone: "default" | "danger" = "default", active = false): string {
  return cn(
    "flex min-h-11 w-full items-center gap-2.5 rounded-md px-3 text-left text-sm outline-none transition-colors focus-visible:bg-surface-2 md:pointer-fine:min-h-9",
    tone === "danger" ? "text-bad hover:bg-bad/10 focus-visible:bg-bad/10" : "text-fg hover:bg-surface-2",
    active && "bg-accent/10 font-medium text-fg",
  );
}
