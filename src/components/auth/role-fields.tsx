"use client";

import * as React from "react";
import { ROLES, ROLE_LABELS, type Role } from "@/domain/roles";
import { RoleIcon } from "@/components/role-icon";
import { Label } from "@/components/ui/input";
import { cn } from "@/lib/cn";

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
    <button key={role} type="button" disabled={disabled} onClick={onClick} className={cn("flex h-8 items-center gap-1 rounded-md border px-2.5 text-xs disabled:opacity-30", active ? "border-accent bg-accent/10 text-accent-strong" : "border-border bg-bg-elevated text-fg-muted hover:text-fg")}>
      <RoleIcon role={role} className="h-3.5 w-3.5" /> {ROLE_LABELS[role]}
    </button>
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
          <button type="button" onClick={() => chooseSecondary(null)} className={cn("h-8 rounded-md border px-2.5 text-xs", secondary === null ? "border-accent bg-accent/10 text-accent-strong" : "border-border bg-bg-elevated text-fg-muted hover:text-fg")}>
            None
          </button>
          {ROLES.map((r) => chip(r, secondary === r, primary === r, () => chooseSecondary(r)))}
        </div>
      </div>
    </div>
  );
}
