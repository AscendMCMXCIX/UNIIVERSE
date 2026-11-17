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
  return cn("inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-lg border border-border-control bg-bg-elevated p-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", className);
}

/**
 * One segment: 30px tall with a mouse, 38px on touch screens, so the group around it is 36px or 44px:
 * the height of a field or a chip beside it. `md`: the main filter of a list's toolbar (Encounters'
 * All, Against and Alongside), in the body text size, at the same height.
 */
export function segmentClass(active: boolean, opts: { disabled?: boolean; className?: string; size?: "sm" | "md" } = {}): string {
  return cn(
    "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md transition-colors focus-visible:outline-2 focus-visible:outline-accent",
    "min-h-[1.875rem] font-medium pointer-coarse:min-h-[2.375rem]",
    opts.size === "md" ? "px-3 text-sm" : "px-2.5 text-xs",
    active ? "bg-accent/15 font-semibold text-fg ring-1 ring-inset ring-accent/60" : opts.disabled ? "cursor-not-allowed text-fg-subtle/50" : "text-fg-muted hover:bg-surface-2 hover:text-fg",
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

/** Below which breakpoint inactive role segments show their icon only. */
export type CompactBelow = "md" | "xl";
const COMPACT: Record<CompactBelow, string> = { md: "max-md:sr-only", xl: "max-xl:sr-only" };
// The chosen role's name, with "xl": hidden too in the inline bar of a touch tablet (md to xl), where
// the roles' 44px targets leave no room for it; the page's scope line names the role.
const ACTIVE_COMPACT: Record<CompactBelow, string | undefined> = { md: undefined, xl: "md:max-xl:pointer-coarse:sr-only" };

/**
 * What a role segment shows: the role's icon, and its name. With `compactLabel`, inactive segments
 * keep only the icon on narrow screens (the name stays available to screen readers), so five roles
 * fit a phone without wrapping; `compactBelow="xl"` keeps tablets and laptops (the sidebar open
 * beside a 1024px window) to the icons too, for a toolbar that shares one row with a search and
 * other filters (Players), and on touch tablets the chosen role as well, so choosing one never
 * widens the bar.
 */
export function RoleSegmentContent({ role, active, compactLabel = true, compactBelow = "md", count, countTitle }: { role: Role | null; active: boolean; compactLabel?: boolean; compactBelow?: CompactBelow; count?: number | null; countTitle?: string }) {
  return (
    <>
      {role ? <RoleIcon role={role} className="h-4 w-4 shrink-0" /> : null}
      <span className={cn(role && compactLabel && (active ? ACTIVE_COMPACT[compactBelow] : COMPACT[compactBelow]))}>{role ? ROLE_LABELS[role] : "All roles"}</span>
      {count !== undefined && count !== null ? (
        <span className={cn("rounded px-1 text-2xs tabular-nums", count ? "bg-surface-3 text-fg-muted" : "text-fg-subtle/60")} title={countTitle}>
          {count}
        </span>
      ) : null}
    </>
  );
}

/**
 * A role selector made of buttons (client state). Links in the URL use the class helpers above with
 * <Link> instead. `roles` is the order shown; `allowAll` adds "All roles" first. `compactBelow`: see
 * RoleSegmentContent; with "xl", a role's segment keeps its name for screen readers and in its
 * title, and is a finger's width on touch screens (from md, where the bar is inline).
 */
export function RoleSegmented({ label, roles, value, onChange, allowAll = false, compactBelow = "md", testId, className }: { label: string; roles: readonly Role[]; value: Role | null; onChange: (role: Role | null) => void; allowAll?: boolean; compactBelow?: CompactBelow; testId?: string; className?: string }) {
  const options: Array<Role | null> = allowAll ? [null, ...roles] : [...roles];
  return (
    <div role="radiogroup" aria-label={label} className={segmentedGroupClass(className)} data-testid={testId}>
      {options.map((r) => {
        const on = value === r;
        const iconOnly = compactBelow === "xl" && r !== null;
        return (
          <button key={r ?? "ALL"} type="button" role="radio" aria-checked={on} onClick={() => onChange(r)} className={segmentClass(on, { className: iconOnly ? "md:pointer-coarse:min-w-11" : undefined })} title={iconOnly ? ROLE_LABELS[r] : undefined} data-value={r ?? "ALL"} data-testid={testId ? `${testId}-${r ?? "ALL"}` : undefined}>
            <RoleSegmentContent role={r} active={on} compactBelow={compactBelow} />
          </button>
        );
      })}
    </div>
  );
}
