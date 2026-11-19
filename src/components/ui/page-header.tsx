import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * The title block every page starts with: one h1, a short description, optional actions on the right.
 * `guide`: the description explains how to use the page rather than what it counts; phones leave it
 * out, so the content starts on the first screen (a scope line, such as "Season 2026 · 6 games",
 * always shows). `sectionNamed`: a section of a destination with tabs (Team's Players, Leaderboards,
 * Matches), whose name the top bar's sections row already says on phones (upright, and held
 * sideways below lg): there the h1 is read out only, so the scope line leads (docs/MOBILE.md, "The
 * phone header budget"). `admin`: an Admin Mode page, whose bar already says the mode: on phones
 * the eyebrow and the description are left out (UM.AD2).
 */
export function PageHeader({ title, description, actions, className, eyebrow, guide = false, sectionNamed = false, admin = false }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; className?: string; eyebrow?: React.ReactNode; guide?: boolean; sectionNamed?: boolean; admin?: boolean }) {
  return (
    <header className={cn("flex flex-wrap items-end justify-between gap-x-4 gap-y-2", className)}>
      <div className="min-w-0">
        {eyebrow ? <div className={cn("mb-1 text-xs font-semibold uppercase tracking-label text-accent", admin && PHONE_HIDDEN)}>{eyebrow}</div> : null}
        <h1 className={cn("text-2xl font-semibold tracking-tight text-fg", sectionNamed && SECTION_NAMED_TITLE)}>{title}</h1>
        {description ? <p className={cn("mt-1 text-sm text-fg-muted", guide && "max-md:hidden", admin && PHONE_HIDDEN)}>{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/** A section's h1 where the phone's sections row names the page (upright phones, and any window held sideways below lg): read out only there. */
export const SECTION_NAMED_TITLE = "max-md:sr-only max-lg:short:sr-only";

/** Phones, upright and held sideways below lg. */
const PHONE_HIDDEN = "max-md:hidden max-lg:short:hidden";
