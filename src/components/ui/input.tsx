import * as React from "react";
import { cn } from "@/lib/cn";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-9 w-full rounded-md border border-border bg-bg-elevated px-3 text-sm text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none",
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
        "w-full rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none",
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
    <select className={cn("h-9 w-full rounded-md border border-border bg-bg-elevated px-2 text-sm text-fg focus:border-accent focus:outline-none", className)} {...props}>
      {children}
    </select>
  );
}
