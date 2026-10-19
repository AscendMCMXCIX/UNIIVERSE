"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ROLES, ROLE_LABELS, type Role } from "@/domain/roles";
import { RoleIcon } from "@/components/role-icon";
import { saveProfilePatchAction } from "@/server/actions/players";
import { segmentClass, segmentedGroupClass } from "@/components/ui/segmented";
import { toast } from "@/components/ui/toast";

/**
 * Roles & champion pools of a member who has not chosen a role yet: says so plainly (nothing is
 * assumed for them), and lets whoever may edit the profile (the member, or a manager) choose the
 * primary role, after which the usual pool editor appears.
 */
export function FirstRole({ playerId, name, self, editable }: { playerId: string; name: string; self: boolean; editable: boolean }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const choose = (role: Role) =>
    start(async () => {
      const r = await saveProfilePatchAction(playerId, { primaryRole: role }, null);
      if (!r.ok) toast.error(r.error);
      else router.refresh();
    });
  return (
    <div className="space-y-3 rounded-panel border border-dashed border-border px-4 py-5" data-testid="no-roles">
      <p className="text-sm text-fg-muted">{self ? "You have not chosen your roles and champions yet." : `${name} has not chosen their roles and champions yet.`} Until then {self ? "you are" : "they are"} not offered for lineup roles.</p>
      {editable ? (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-fg-subtle" id={`first-role-${playerId}`}>
            Choose the Primary Role to start
          </p>
          <div role="group" aria-labelledby={`first-role-${playerId}`} className={segmentedGroupClass()} data-testid="first-role">
            {ROLES.map((r) => (
              <button key={r} type="button" disabled={pending} onClick={() => choose(r)} className={segmentClass(false)} data-testid={`first-role-${r}`}>
                <RoleIcon role={r} className="h-3.5 w-3.5" /> {ROLE_LABELS[r]}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
