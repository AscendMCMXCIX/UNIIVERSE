"use client";

import * as React from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * The one search box: a magnifier, the field, and a clear button once something is typed. 44px with
 * 16px text on phones (no zoom on iOS), the compact 36px / 14px from md up with a mouse, like every
 * other field.
 */
export function SearchInput({ value, onChange, label, placeholder, className, testId, ...props }: Omit<React.ComponentProps<"input">, "value" | "onChange" | "type"> & { value: string; onChange: (value: string) => void; /** Read by screen readers (the placeholder is not a label). */ label: string; testId?: string }) {
  return (
    <div className={cn("relative w-full min-w-0", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="h-11 w-full rounded-md border border-border-control bg-bg-elevated pl-9 pr-9 text-base text-fg placeholder:text-fg-subtle hover:border-fg-subtle focus:border-accent focus:outline-none md:text-sm md:pointer-fine:h-9 [&::-webkit-search-cancel-button]:hidden"
        data-testid={testId}
        {...props}
      />
      {value ? (
        <button type="button" onClick={() => onChange("")} className="absolute right-0.5 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-md text-fg-subtle hover:text-fg md:pointer-fine:h-8 md:pointer-fine:w-8" aria-label="Clear search">
          <X className="h-4 w-4" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
