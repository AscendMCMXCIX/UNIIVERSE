import * as React from "react";
import type { Role } from "@/domain/roles";
import { ROLE_LABELS } from "@/domain/roles";
import { RoleIcon } from "@/components/role-icon";
import { cn } from "@/lib/cn";

/*
  The two selection controls of the app, one look each:
    Segmented  one choice out of a few (a role, a view, a sort): an inset group of segments.
    Chip       a filter that can be switched on and off on its own (several may be on).
  Both work as buttons (client state) or as links (choices kept in the URL); the caller renders the
  element and takes its classes from here, so every page draws them the same way.
*/

/** The group around the segments. Give it role="radiogroup" (or a nav) and a label. */
export function segmentedGroupClass(className?: string): string {
  return cn("inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-lg border border-border bg-bg-elevated p-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", className);
}

/**
 * One segment: 30px tall with a mouse, 38px on touch screens, so the group around it is 36px or 44px:
 * the height of a field or a chip beside it.
 */
export function segmentClass(active: boolean, opts: { disabled?: boolean; className?: string } = {}): string {
  return cn(
    "inline-flex min-h-[1.875rem] shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-xs font-medium transition-colors pointer-coarse:min-h-[2.375rem] focus-visible:outline-2 focus-visible:outline-accent",
    active ? "bg-accent/15 text-accent" : opts.disabled ? "cursor-not-allowed text-fg-subtle/50" : "text-fg-muted hover:bg-surface-2 hover:text-fg",
    opts.className,
  );
}

/** A filter chip: round, bordered, lit when on. */
export function chipClass(active: boolean, className?: string): string {
  return cn(
    "inline-flex min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-xs font-medium transition-colors pointer-coarse:min-h-11 focus-visible:outline-2 focus-visible:outline-accent",
    active ? "border-accent bg-accent/15 text-fg" : "border-border text-fg-muted hover:border-border-strong hover:text-fg",
    className,
  );
}

/**
 * What a role segment shows: the role's icon, and its name. With `compactLabel`, inactive segments
 * keep only the icon on narrow screens (the name stays available to screen readers), so five roles
 * fit a phone without wrapping.
 */
export function RoleSegmentContent({ role, active, compactLabel = true, count, countTitle }: { role: Role | null; active: boolean; compactLabel?: boolean; count?: number | null; countTitle?: string }) {
  return (
    <>
      {role ? <RoleIcon role={role} className="h-4 w-4 shrink-0" /> : null}
      <span className={cn(role && compactLabel && !active && "max-md:sr-only")}>{role ? ROLE_LABELS[role] : "All roles"}</span>
      {count !== undefined && count !== null ? (
        <span className={cn("rounded px-1 text-[0.625rem] tabular-nums", count ? "bg-surface-3 text-fg-muted" : "text-fg-subtle/60")} title={countTitle}>
          {count}
        </span>
      ) : null}
    </>
  );
}

/**
 * A role selector made of buttons (client state). Links in the URL use the class helpers above with
 * <Link> instead. `roles` is the order shown; `allowAll` adds "All roles" first.
 */
export function RoleSegmented({ label, roles, value, onChange, allowAll = false, testId, className }: { label: string; roles: readonly Role[]; value: Role | null; onChange: (role: Role | null) => void; allowAll?: boolean; testId?: string; className?: string }) {
  const options: Array<Role | null> = allowAll ? [null, ...roles] : [...roles];
  return (
    <div role="radiogroup" aria-label={label} className={segmentedGroupClass(className)} data-testid={testId}>
      {options.map((r) => {
        const on = value === r;
        return (
          <button key={r ?? "ALL"} type="button" role="radio" aria-checked={on} onClick={() => onChange(r)} className={segmentClass(on)} data-value={r ?? "ALL"} data-testid={testId ? `${testId}-${r ?? "ALL"}` : undefined}>
            <RoleSegmentContent role={r} active={on} />
          </button>
        );
      })}
    </div>
  );
}
