import * as React from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "outline";
export type ButtonSize = "sm" | "md" | "lg";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-bg hover:bg-accent-strong font-semibold",
  secondary: "bg-surface-2 text-fg hover:bg-surface-3 border border-border",
  outline: "bg-transparent text-fg border border-border-strong hover:bg-surface-2",
  ghost: "bg-transparent text-fg-muted hover:text-fg hover:bg-surface-2",
  danger: "bg-transparent text-bad border border-bad/40 hover:bg-bad/10",
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
}

export function Button({ className, variant = "secondary", size = "md", type = "button", ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-accent",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}
