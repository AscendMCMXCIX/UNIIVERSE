import * as React from "react";
import { cn, withDefaults } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "outline";
export type ButtonSize = "sm" | "md" | "lg";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-bg hover:bg-accent-strong font-semibold",
  secondary: "bg-surface-2 text-fg hover:bg-surface-3 border border-border-control",
  outline: "bg-transparent text-fg border border-border-control hover:bg-surface-2",
  ghost: "bg-transparent text-fg-muted hover:text-fg hover:bg-surface-2",
  danger: "bg-transparent text-bad border border-bad/40 hover:bg-bad/10",
};

/**
 * The one disabled look (docs/DESIGN_SYSTEM.md §5, 25 Nov 2026): the words and icon in the disabled
 * tone, the not-allowed cursor and no hover; a filled button keeps a fill, the neutral raised one,
 * and an outlined one a quiet edge. Never a half-transparent control: that read differently on every
 * surface (30% to 70% across the app before). Only for disabled controls: fg-disabled is below 4.5:1,
 * which WCAG allows for inactive controls (axe skips them), never for active text.
 */
const disabledLook: Record<ButtonVariant, string> = {
  primary: "disabled:bg-surface-2 disabled:text-fg-disabled disabled:hover:bg-surface-2",
  secondary: "disabled:text-fg-disabled disabled:hover:bg-surface-2",
  outline: "disabled:border-border disabled:text-fg-disabled disabled:hover:bg-transparent",
  ghost: "disabled:text-fg-disabled disabled:hover:bg-transparent disabled:hover:text-fg-disabled",
  danger: "disabled:border-border disabled:text-fg-disabled disabled:hover:bg-transparent",
};

/**
 * Desktop keeps the compact heights; on phones (below md) and on any touch pointer every button
 * grows to a 44px target without changing its text size.
 */
const sizes: Record<ButtonSize, string> = {
  sm: "h-7 px-2.5 text-xs rounded-sm max-md:min-h-11 max-md:px-3 pointer-coarse:min-h-11",
  md: "h-9 px-3.5 text-sm rounded-md max-md:min-h-11 pointer-coarse:min-h-11",
  lg: "h-11 px-5 text-sm rounded-md",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /**
   * On a phone, a label that a larger text size makes too long for the line wraps, and the button
   * grows with it rather than letting it spill (at the usual size it is one line, 44px, as before).
   * For a label that can be long beside little room: a form's Save, say.
   */
  wrap?: boolean;
}

/** `wrap`: the height follows the label on a phone (its 44px minimum stays), the lines centred. */
const WRAP = "max-sm:h-auto max-sm:whitespace-normal max-sm:py-2 max-sm:text-center";

/** The button look for anything else (a Link), so links never wrap buttons. */
export function buttonClass(variant: ButtonVariant = "secondary", size: ButtonSize = "md", className?: string): string {
  return withDefaults(cn("inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-accent", variants[variant], disabledLook[variant], sizes[size]), className);
}

export function Button({ className, variant = "secondary", size = "md", type = "button", wrap = false, ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={withDefaults(cn("inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-accent", variants[variant], disabledLook[variant], sizes[size], wrap && WRAP), className)}
      {...props}
    />
  );
}
