import * as React from "react";
import { cn } from "@/lib/cn";

export function Panel({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <section className={cn("min-w-0 rounded-lg border border-border bg-surface", className)} {...props}>
      {children}
    </section>
  );
}

export function PanelHeader({ title, subtitle, actions, className }: { title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return (
    <header className={cn("flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-border px-3 py-3 sm:px-4", className)}>
      <div className="min-w-0">
        <h2 className="text-sm font-semibold tracking-wide text-fg">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-xs text-fg-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function PanelBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("px-3 py-3 sm:px-4", className)}>{children}</div>;
}

export function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-subtle", className)}>{children}</div>;
}
