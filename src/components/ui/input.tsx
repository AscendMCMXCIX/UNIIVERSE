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
      className={withDefaults("h-11 w-full rounded-md border border-border-control bg-bg-elevated px-3 text-base text-fg placeholder:text-fg-subtle hover:border-fg-subtle focus:border-accent focus:outline-none md:text-sm md:pointer-fine:h-9", className)}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={withDefaults("w-full rounded-md border border-border-control bg-bg-elevated px-3 py-2 text-base text-fg placeholder:text-fg-subtle hover:border-fg-subtle focus:border-accent focus:outline-none md:text-sm", className)}
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

const SELECT = "h-11 w-full min-w-0 truncate rounded-md border border-border-control bg-bg-elevated px-2 text-base text-fg hover:border-fg-subtle focus:border-accent focus:outline-none disabled:opacity-50 md:text-sm md:pointer-fine:h-9";

/** The one dropdown look (for a <select> rendered elsewhere, e.g. inside a form helper). Pass width overrides as className. */
export function selectClass(className?: string): string {
  return withDefaults(SELECT, className);
}

/** A native dropdown: keyboard, screen readers and phone pickers behave as people expect. */
export function Select({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <select className={selectClass(className)} {...props}>
      {children}
    </select>
  );
}
