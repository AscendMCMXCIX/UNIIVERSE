import * as React from "react";
import { segmentClass } from "./segmented";

/**
 * A selectable chip (a role at setup): one of a few, so drawn as a segment (ui/segmented.tsx: the
 * words, the chosen one semibold over the accent underline; a filled box until Release 17). 44px
 * tall on touch screens, 36px with a mouse. `size="md"`: the body text size.
 */
export function ToggleChip({ active, size = "sm", className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { active: boolean; size?: "sm" | "md" }) {
  return <button type="button" aria-pressed={active} className={segmentClass(active, { size, disabled: props.disabled ?? undefined, className })} {...props} />;
}
