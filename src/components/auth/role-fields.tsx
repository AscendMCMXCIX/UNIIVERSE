"use client";

import * as React from "react";
import { ROLES, ROLE_LABELS, type Role } from "@/domain/roles";
import { RoleIcon } from "@/components/role-icon";
import { Label } from "@/components/ui/input";
import { ToggleChip } from "@/components/ui/toggle";

/** Main role (required) and an optional off-role, as hidden inputs plus clickable chips. */
export function RoleFields({ initialPrimary, initialSecondary, onChange }: { initialPrimary?: Role | null; initialSecondary?: Role | null; onChange?: (value: { primaryRole: Role | null; secondaryRole: Role | null }) => void }) {
  const [primary, setPrimary] = React.useState<Role | null>(initialPrimary ?? null);
  const [secondary, setSecondary] = React.useState<Role | null>(initialSecondary ?? null);
  const choosePrimary = (r: Role) => {
    const s = secondary === r ? null : secondary;
    setPrimary(r);
    setSecondary(s);
    onChange?.({ primaryRole: r, secondaryRole: s });
  };
  const chooseSecondary = (r: Role | null) => {
    setSecondary(r);
    onChange?.({ primaryRole: primary, secondaryRole: r });
  };
  const chip = (role: Role, active: boolean, disabled: boolean, onClick: () => void) => (
    <ToggleChip key={role} size="sm" disabled={disabled} active={active} onClick={onClick}>
      <RoleIcon role={role} className="h-3.5 w-3.5" /> {ROLE_LABELS[role]}
    </ToggleChip>
  );
  return (
    <div className="space-y-2">
      <input type="hidden" name="primaryRole" value={primary ?? ""} />
      <input type="hidden" name="secondaryRole" value={secondary ?? ""} />
      <div>
        <Label>MAIN ROLE *</Label>
        <div className="flex flex-wrap gap-1.5">{ROLES.map((r) => chip(r, primary === r, false, () => choosePrimary(r)))}</div>
      </div>
      <div>
        <Label>OFF-ROLE (optional)</Label>
        <div className="flex flex-wrap gap-1.5">
          <ToggleChip size="sm" active={secondary === null} onClick={() => chooseSecondary(null)}>
            None
          </ToggleChip>
          {ROLES.map((r) => chip(r, secondary === r, primary === r, () => chooseSecondary(r)))}
        </div>
      </div>
    </div>
  );
}
