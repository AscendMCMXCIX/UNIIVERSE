import * as React from "react";
import { cn, withDefaults } from "@/lib/cn";

/*
  Form controls are 44px tall with 16px text on phones (iOS does not zoom into a 16px field) and
  keep the compact 36px / 14px desktop sizing from md up with a mouse; touch screens keep 44px, like
  every other control beside them.
*/
export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={withDefaults("h-11 w-full rounded-md border border-border-control bg-bg-elevated px-3 text-base text-fg placeholder:text-fg-subtle hover:border-fg-subtle focus:border-accent focus:outline-none md:pointer-fine:text-sm md:pointer-fine:h-9", className)}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={withDefaults("w-full rounded-md border border-border-control bg-bg-elevated px-3 py-2 text-base text-fg placeholder:text-fg-subtle hover:border-fg-subtle focus:border-accent focus:outline-none md:pointer-fine:text-sm", className)}
      {...props}
    />
  );
}

export function Label({ className, children, htmlFor }: { className?: string; children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className={cn("mb-1 block text-xs font-medium text-fg-muted", className)}>
      {children}
    </label>
  );
}

const SELECT = "h-11 w-full min-w-0 truncate rounded-md border border-border-control bg-bg-elevated px-2 text-base text-fg hover:border-fg-subtle focus:border-accent focus:outline-none disabled:cursor-not-allowed disabled:border-border disabled:text-fg-disabled disabled:hover:border-border md:pointer-fine:text-sm md:pointer-fine:h-9";

/** The one dropdown look (for a <select> rendered elsewhere, e.g. inside a form helper). Pass width overrides as className. */
export function selectClass(className?: string): string {
  return withDefaults(SELECT, className);
}

/**
 * The browser's own dropdown. Only `Select` (select.tsx) draws it, in the phone posture, where the
 * phone's own picker is what its owner expects; everywhere else `Select` is the app's popover. Its
 * arrow is the popover's chevron (globals.css, select-chevron), not the system's.
 */
export function NativeSelect({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <select className={cn(selectClass(className), "select-chevron pr-[28px]")} {...props}>
      {children}
    </select>
  );
}
