import * as React from "react";
import { cn } from "@/lib/cn";

/*
  Form controls are 44px tall with 16px text on phones (iOS does not zoom into a 16px field) and
  keep the compact 36px / 14px desktop sizing from md up.
*/
export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-11 w-full rounded-md border border-border bg-bg-elevated px-3 text-base text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none md:h-9 md:text-sm",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "w-full rounded-md border border-border bg-bg-elevated px-3 py-2 text-base text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none md:text-sm",
        className,
      )}
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

export function Select({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <select className={cn("h-11 w-full rounded-md border border-border bg-bg-elevated px-2 text-base text-fg focus:border-accent focus:outline-none md:h-9 md:text-sm", className)} {...props}>
      {children}
    </select>
  );
}
