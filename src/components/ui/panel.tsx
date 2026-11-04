import * as React from "react";
import { cn } from "@/lib/cn";

export function Panel({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <section className={cn("panel-depth min-w-0 rounded-panel border border-border bg-surface", className)} {...props}>
      {children}
    </section>
  );
}

export function PanelHeader({ title, subtitle, actions, className }: { title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return (
    // The actions (a badge, a link, a section's Refresh) stay on the title's row at the right at every
    // width: on phones the subtitle takes the full width under them, from sm up it wraps beside them.
    // Without a subtitle they are centred on the title's line, so a small count lines up with it.
    <header className={cn("grid items-start gap-x-4 border-b border-border px-3 py-3 sm:px-4", actions ? "grid-cols-[minmax(0,1fr)_auto]" : "grid-cols-[minmax(0,1fr)]", className)}>
      <h2 className="min-w-0 self-center text-base font-semibold text-fg">{title}</h2>
      {actions ? <div className={cn("col-start-2 row-start-1 flex flex-wrap items-center justify-end gap-2", subtitle ? "sm:row-span-2" : "self-center")}>{actions}</div> : null}
      {subtitle ? <p className={cn("mt-0.5 text-sm text-fg-muted", actions && "col-span-2 sm:col-span-1")}>{subtitle}</p> : null}
    </header>
  );
}

export function PanelBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("px-3 py-3 sm:px-4", className)}>{children}</div>;
}

export function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("text-xs font-semibold uppercase tracking-label text-fg-subtle", className)}>{children}</div>;
}
