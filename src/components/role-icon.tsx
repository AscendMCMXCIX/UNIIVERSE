import * as React from "react";
import { ROLE_LABELS, type Role } from "@/domain/roles";
import { cn } from "@/lib/cn";

/**
 * Original position glyphs: a stylised map square with the relevant lane highlighted.
 * They are deliberately simple so they read at 14px next to a champion portrait.
 */
const GLYPHS: Record<Role, React.ReactNode> = {
  TOP: (
    <>
      <path d="M3 3h12l-3 3H6v6l-3 3V3z" fill="currentColor" />
      <path d="M21 9v12H9l3-3h6v-6l3-3z" fill="currentColor" opacity="0.35" />
      <rect x="9.5" y="9.5" width="5" height="5" fill="currentColor" opacity="0.35" />
    </>
  ),
  JUNGLE: (
    <>
      <path d="M12 2c-1 4-4 6-4 10 0 3 2 5 4 6 2-1 4-3 4-6 0-4-3-6-4-10z" fill="currentColor" />
      <path d="M12 7v15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M5 11c2 1 4 3 5 6M19 11c-2 1-4 3-5 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" />
    </>
  ),
  MID: (
    <>
      <path d="M3 3h6L3 9V3zM21 21h-6l6-6v6z" fill="currentColor" opacity="0.35" />
      <path d="M21 3v6l-2.5 2.5-6 6L9 21H3v-6l2.5-2.5 6-6L15 3h6z" fill="currentColor" />
    </>
  ),
  ADC: (
    <>
      <path d="M21 21H9l3-3h6v-6l3-3v12z" fill="currentColor" />
      <path d="M3 15V3h12l-3 3H6v6l-3 3z" fill="currentColor" opacity="0.35" />
      <rect x="9.5" y="9.5" width="5" height="5" fill="currentColor" opacity="0.35" />
    </>
  ),
  SUPPORT: (
    <>
      <path d="M12 2l7 3v6c0 5-3 8.5-7 11-4-2.5-7-6-7-11V5l7-3z" fill="currentColor" opacity="0.35" />
      <path d="M11 7h2v4h4v2h-4v4h-2v-4H7v-2h4V7z" fill="currentColor" />
    </>
  ),
};

export function RoleIcon({ role, className, title }: { role: Role; className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-label={title ?? ROLE_LABELS[role]} role="img" className={cn("h-4 w-4 shrink-0", className)}>
      <title>{title ?? ROLE_LABELS[role]}</title>
      {GLYPHS[role]}
    </svg>
  );
}

export function RoleTag({ role, className, short = false }: { role: Role; className?: string; short?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium text-fg-muted", className)}>
      <RoleIcon role={role} className="h-3.5 w-3.5" />
      {short ? role : ROLE_LABELS[role]}
    </span>
  );
}
