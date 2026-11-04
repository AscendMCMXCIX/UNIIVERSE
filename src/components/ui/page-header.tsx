import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * The title block every page starts with: one h1, a short description, optional actions on the right.
 * `guide`: the description explains how to use the page rather than what it counts; phones leave it
 * out, so the content starts on the first screen (a scope line, such as "Season 2026 · 6 games",
 * always shows).
 */
export function PageHeader({ title, description, actions, className, eyebrow, guide = false }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; className?: string; eyebrow?: React.ReactNode; guide?: boolean }) {
  return (
    <header className={cn("flex flex-wrap items-end justify-between gap-x-4 gap-y-2", className)}>
      <div className="min-w-0">
        {eyebrow ? <div className="mb-1 text-xs font-semibold uppercase tracking-label text-accent">{eyebrow}</div> : null}
        <h1 className="text-2xl font-semibold tracking-tight text-fg">{title}</h1>
        {description ? <p className={cn("mt-1 text-sm text-fg-muted", guide && "max-md:hidden")}>{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
