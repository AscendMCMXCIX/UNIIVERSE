import * as React from "react";
import { cn } from "@/lib/cn";

/** The title block every page starts with: one h1, a short description, optional actions on the right. */
export function PageHeader({ title, description, actions, className, eyebrow }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; className?: string; eyebrow?: React.ReactNode }) {
  return (
    <header className={cn("flex flex-wrap items-end justify-between gap-x-4 gap-y-2", className)}>
      <div className="min-w-0">
        {eyebrow ? <div className="mb-1 text-xs font-semibold uppercase tracking-label text-accent">{eyebrow}</div> : null}
        <h1 className="text-2xl font-semibold tracking-tight text-fg">{title}</h1>
        {description ? <p className="mt-1 text-sm text-fg-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
