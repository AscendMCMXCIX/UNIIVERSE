"use client";

import * as React from "react";
import { Plus, X } from "lucide-react";
import { ROLES, ROLE_LABELS, type Role } from "@/domain/roles";
import { RoleIcon } from "@/components/role-icon";
import { Label } from "@/components/ui/input";
import { ToggleChip } from "@/components/ui/toggle";

/**
 * Primary role (required, nothing chosen in advance: it reads "Not selected" until the player
 * picks one) and an optional off role behind "+ Add an off role". Hidden inputs carry the
 * values for plain forms.
 */
export function RoleFields({ initialPrimary, initialSecondary, onChange }: { initialPrimary?: Role | null; initialSecondary?: Role | null; onChange?: (value: { primaryRole: Role | null; secondaryRole: Role | null }) => void }) {
  const [primary, setPrimary] = React.useState<Role | null>(initialPrimary ?? null);
  const [secondary, setSecondary] = React.useState<Role | null>(initialSecondary ?? null);
  const [addingSecondary, setAddingSecondary] = React.useState(false);
  const choosePrimary = (r: Role) => {
    const s = secondary === r ? null : secondary;
    setPrimary(r);
    setSecondary(s);
    onChange?.({ primaryRole: r, secondaryRole: s });
  };
  const chooseSecondary = (r: Role | null) => {
    setSecondary(r);
    setAddingSecondary(false);
    onChange?.({ primaryRole: primary, secondaryRole: r });
  };
  const chip = (role: Role, active: boolean, disabled: boolean, onClick: () => void) => (
    <ToggleChip key={role} size="sm" disabled={disabled} active={active} onClick={onClick}>
      <RoleIcon role={role} className="h-3.5 w-3.5" /> {ROLE_LABELS[role]}
    </ToggleChip>
  );
  return (
    <div className="space-y-3">
      <input type="hidden" name="primaryRole" value={primary ?? ""} />
      <input type="hidden" name="secondaryRole" value={secondary ?? ""} />
      <div>
        <Label>
          PRIMARY ROLE *{" "}
          <span className={primary ? "font-normal normal-case tracking-normal text-fg-muted" : "font-normal normal-case tracking-normal text-warn"} data-testid="primary-role-status">
            {primary ? `· ${ROLE_LABELS[primary]}` : "· Not selected"}
          </span>
        </Label>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Primary role">
          {ROLES.map((r) => chip(r, primary === r, false, () => choosePrimary(r)))}
        </div>
      </div>
      <div>
        <Label>OFF ROLE (optional)</Label>
        {secondary ? (
          <div className="flex flex-wrap items-center gap-1.5" data-testid="secondary-role">
            {chip(secondary, true, false, () => setAddingSecondary(true))}
            <button type="button" onClick={() => chooseSecondary(null)} className="inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-xs text-fg-muted hover:bg-surface-2 hover:text-fg" aria-label="Remove off role">
              <X className="h-3.5 w-3.5" /> Remove
            </button>
          </div>
        ) : null}
        {addingSecondary || (secondary && addingSecondary) ? (
          <div className="mt-1.5 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Off role">
            {ROLES.map((r) => chip(r, secondary === r, primary === r, () => chooseSecondary(r)))}
          </div>
        ) : !secondary ? (
          <button type="button" onClick={() => setAddingSecondary(true)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-dashed border-border px-3 text-sm text-fg-muted hover:border-accent/60 hover:text-fg" data-testid="add-secondary-role">
            <Plus className="h-4 w-4" /> Add an off role
          </button>
        ) : null}
      </div>
    </div>
  );
}
