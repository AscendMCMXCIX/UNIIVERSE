import * as React from "react";
import type { Role } from "@/domain/roles";
import { ROLE_LABELS } from "@/domain/roles";
import { RoleIcon } from "@/components/role-icon";
import { cn, withDefaults } from "@/lib/cn";

/*
  The selection controls of the app, one family of text-led controls (Release 17, the owner's brief
  §9, 24 Nov 2026):
    Segmented  one choice out of a few (a role, a view, a sort): words side by side, the chosen one
               in the main text colour and semibold over a short accent underline. No outline round
               the group and no filled box round the chosen one.
    Chip       a filter that can be switched on and off on its own (several may be on): a quiet
               round outline, lit while on. A control, never a tab.
  Section tabs (TabBar) and a section's views (SubTabs) draw the same underline, stronger and larger
  (docs/DESIGN_SYSTEM.md §5, "Text-led controls"). Both work as buttons (client state) or as links
  (choices kept in the URL); the caller renders the element and takes its classes from here, so
  every page draws them the same way (src/app/segmented-use.test.ts refuses a page's own boxed group).
*/

/**
 * The underline of a text-led control (a segment, a view's tab): drawn inside the item's own box, 4px
 * above its foot, so it never reaches past the item or its row (a scroll row that overflows by a pixel
 * scrolls the other way too: tabIndicatorClass's note). The chosen item: the main text colour over
 * the accent line; at rest the secondary grey, brighter while pointed at with a faint line under it
 * (as TabBar's); disabled, the disabled tone with no line (on a disabled control only: the tone is
 * under 4.5:1, which WCAG allows for inactive controls). `inset`: the line's ends, matching the
 * item's side padding so it is as wide as the words.
 */
export function choiceIndicatorClass(on: boolean, opts: { disabled?: boolean; inset?: string } = {}): string {
  return cn(
    "relative after:pointer-events-none after:absolute after:bottom-1 after:h-0.5 after:rounded-full after:transition-opacity after:duration-150",
    opts.inset ?? "after:inset-x-2.5",
    on ? "text-fg after:bg-accent" : opts.disabled ? "cursor-not-allowed text-fg-disabled after:opacity-0" : "text-fg-muted after:bg-border-strong after:opacity-0 hover:text-fg hover:after:opacity-100",
  );
}

/**
 * The group around the segments: no outline and no fill. Give it role="radiogroup" (or a nav) and a
 * label. Where its words outgrow the line (a narrow sheet, a larger text size) they wrap onto the
 * next: with no box round them nothing breaks, and nothing is hidden off its edge (the boxed group
 * scrolled sideways, which at 200% hid three of a phone's six roles with no sign of them).
 */
export function segmentedGroupClass(className?: string): string {
  // ui-segmented, ui-segment: markers with no style, by which e2e/shared-controls.spec.ts finds every group.
  // A caller's flex-nowrap replaces the wrap (Tailwind's stylesheet order, not the class list, would decide between the two).
  const nowrap = className?.split(/\s+/).includes("flex-nowrap");
  return cn("ui-segmented inline-flex max-w-full items-center gap-x-1", !nowrap && "flex-wrap", className);
}

/**
 * One segment: 36px tall with a mouse, the height of a field or a chip beside it; 44px on touch
 * screens, a finger's target (UM.TT1). `md`: the main filter of a list's toolbar (Encounters' All,
 * Against and Alongside), in the body text size, at the same height. The focus ring is drawn inside
 * the segment, where a group that scrolls sideways cannot clip it. A caller's width, padding, text
 * size or colour replaces the default (withDefaults).
 */
export function segmentClass(active: boolean, opts: { disabled?: boolean; className?: string; size?: "sm" | "md" } = {}): string {
  const md = opts.size === "md";
  return withDefaults(
    cn(
      "ui-segment inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent",
      "min-h-9 pointer-coarse:min-h-11",
      md ? "px-3 text-sm" : "px-2.5 text-xs",
      active ? "font-semibold" : "font-medium",
      choiceIndicatorClass(active, { disabled: opts.disabled, inset: md ? "after:inset-x-3" : "after:inset-x-2.5" }),
    ),
    opts.className,
  );
}

/** A chip's colours: a quiet outline at rest; on, an accent edge over a faint accent wash. */
export function chipLookClass(active: boolean): string {
  return active ? "border-accent/60 bg-accent/10 text-fg" : "border-border text-fg-muted hover:border-border-strong hover:text-fg";
}

/** A filter chip: round, outlined, lit when on; 36px with a mouse, 44px on touch screens. */
export function chipClass(active: boolean, className?: string): string {
  return cn(
    "inline-flex min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-xs font-medium transition-colors duration-150 pointer-coarse:min-h-11 focus-visible:outline-2 focus-visible:outline-accent",
    chipLookClass(active),
    className,
  );
}

/** Below which breakpoint inactive role segments show their icon only ("always": at every width, the chosen one keeping its name: Champion Intel's lane control, in a title row it shares). */
export type CompactBelow = "md" | "xl" | "always";
const COMPACT: Record<CompactBelow, string> = { md: "max-md:sr-only", xl: "max-xl:sr-only", always: "sr-only" };
// The chosen role's name, with "xl": hidden too in the inline bar of a touch tablet (md to xl), where
// the roles' 44px targets leave no room for it; the page's scope line names the role.
const ACTIVE_COMPACT: Record<CompactBelow, string | undefined> = { md: undefined, xl: "md:max-xl:pointer-coarse:sr-only", always: undefined };

/**
 * What a role segment shows: the role's icon, and its name. With `compactLabel`, inactive segments
 * keep only the icon on narrow screens (the name stays available to screen readers), so five roles
 * fit a phone without wrapping; `compactBelow="xl"` keeps tablets and laptops (the sidebar open
 * beside a 1024px window) to the icons too, for a toolbar that shares one row with a search and
 * other filters (Players), and on touch tablets the chosen role as well, so choosing one never
 * widens the bar.
 */
export function RoleSegmentContent({ role, active, compactLabel = true, compactBelow = "md", count, countTitle, noneLabel = "All roles" }: { role: Role | null; active: boolean; compactLabel?: boolean; compactBelow?: CompactBelow; count?: number | null; countTitle?: string; noneLabel?: string }) {
  return (
    <>
      {role ? <RoleIcon role={role} className="h-4 w-4 shrink-0" /> : null}
      <span className={cn(role && compactLabel && (active ? ACTIVE_COMPACT[compactBelow] : COMPACT[compactBelow]))}>{role ? ROLE_LABELS[role] : noneLabel}</span>
      {count !== undefined && count !== null ? (
        <span className="text-2xs font-medium tabular-nums text-fg-subtle" title={countTitle}>
          {count}
        </span>
      ) : null}
    </>
  );
}

/**
 * A role selector made of buttons (client state). Links in the URL use the class helpers above with
 * <Link> instead. `roles` is the order shown; `allowAll` adds the choice of none first, "All roles"
 * unless `noneLabel` names it otherwise (Champion Intel's lane control: "No lane"). `compactBelow`:
 * see RoleSegmentContent; with "xl", a role's segment keeps its name for screen readers and in its
 * title, and is a finger's width on touch screens (from md, where the bar is inline). `disabled`
 * (aria-disabled, so a keyboard keeps its focus) while a change of the page is on its way.
 */
export function RoleSegmented({ label, roles, value, onChange, allowAll = false, noneLabel, compactBelow = "md", disabled = false, testId, className }: { label: string; roles: readonly Role[]; value: Role | null; onChange: (role: Role | null) => void; allowAll?: boolean; noneLabel?: string; compactBelow?: CompactBelow; disabled?: boolean; testId?: string; className?: string }) {
  const options: Array<Role | null> = allowAll ? [null, ...roles] : [...roles];
  return (
    <div role="radiogroup" aria-label={label} className={segmentedGroupClass(className)} data-testid={testId}>
      {options.map((r) => {
        const on = value === r;
        const iconOnly = compactBelow !== "md" && r !== null && !(compactBelow === "always" && on);
        return (
          <button key={r ?? "ALL"} type="button" role="radio" aria-checked={on} aria-disabled={disabled || undefined} onClick={() => (disabled ? undefined : onChange(r))} className={segmentClass(on, { className: cn(iconOnly && (compactBelow === "always" ? "pointer-coarse:min-w-11" : "md:pointer-coarse:min-w-11"), disabled && "aria-disabled:cursor-not-allowed") })} title={iconOnly ? ROLE_LABELS[r] : undefined} data-value={r ?? "ALL"} data-testid={testId ? `${testId}-${r ?? "ALL"}` : undefined}>
            <RoleSegmentContent role={r} active={on} compactBelow={compactBelow} noneLabel={noneLabel} />
          </button>
        );
      })}
    </div>
  );
}
