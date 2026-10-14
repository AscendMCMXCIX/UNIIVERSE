"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AccountView } from "@/server/auth/account-admin";
import type { PermissionPreset } from "@/server/repositories/permissions";
import { setAccessLevelAction } from "@/server/actions/users";
import { Avatar } from "@/components/ui/avatar";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { timeAgo } from "@/lib/format";
import { AccountActions, AccountStatusBadge, PasswordStateBadge } from "./account-actions";
import { CustomAccessDialog, PermissionPresetsPanel } from "./permissions-editor";
import { Disclosure } from "@/components/ui/disclosure";

const OWNER = "__owner__";
const CUSTOM = "__custom__";

/**
 * Users & Permissions: one Access Level per account (Owner, Administrator, Standard Player,
 * Restricted Player, Custom, plus any level an owner made). Choose a level and it is saved; Owner
 * changes ask first and Custom opens the capability list. Every rule is enforced on the server:
 * nobody changes their own level, the last Owner keeps Owner access, and only Owners manage
 * accounts, passwords and permissions.
 */
export function UsersPanel({ accounts, currentUserId, presets }: { accounts: AccountView[]; currentUserId: string | null; presets: PermissionPreset[] }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [custom, setCustom] = React.useState<AccountView | null>(null);
  const [confirm, setConfirm] = React.useState<{ account: AccountView; value: string } | null>(null);
  const valueOf = (a: AccountView) => (a.role === "owner" ? OWNER : a.hasCustomCapabilities ? CUSTOM : (a.permissionPresetId ?? presets.find((p) => p.isDefault)?.id ?? ""));
  const labelOf = (value: string) => (value === OWNER ? "Owner" : value === CUSTOM ? "Custom" : (presets.find((p) => p.id === value)?.name ?? "Standard Player"));
  const describe = (a: AccountView) => {
    if (a.role === "owner") return "Everything, including accounts, passwords and permissions.";
    if (a.hasCustomCapabilities) return `Custom: ${a.capabilities.length} of the delegable capabilities.`;
    return (presets.find((p) => p.id === a.permissionPresetId) ?? presets.find((p) => p.isDefault))?.description ?? "";
  };
  const apply = async (a: AccountView, value: string) => {
    setBusy(a.userId);
    const r = await setAccessLevelAction(a.userId, value === OWNER ? { level: "owner" } : { level: "preset", presetId: value });
    setBusy(null);
    if (r.ok) toast.success(`${a.username} is now ${labelOf(value)}.`);
    else toast.error(r.error);
    router.refresh();
  };
  const choose = (a: AccountView, value: string) => {
    if (value === valueOf(a)) return;
    if (value === CUSTOM) return setCustom(a);
    // Giving or taking Owner access always asks first.
    if (value === OWNER || a.role === "owner") return setConfirm({ account: a, value });
    void apply(a, value);
  };
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">Accounts</h2>
          <p className="text-sm text-fg-muted">Pick an access level for each account; it applies the next time they open a page.</p>
        </div>
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          {accounts.map((a) => (
            <li key={a.userId} className="flex flex-col gap-3 px-3 py-3 sm:px-4" data-testid="admin-user-row">
              <div className="flex flex-wrap items-center gap-3">
                <Avatar name={a.username} src={a.avatarUrl} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-fg">{a.username}</span>
                    {a.userId === currentUserId ? <span className="text-xs text-fg-subtle">(you)</span> : null}
                    <AccountStatusBadge account={a} />
                    <PasswordStateBadge account={a} />
                  </div>
                  <div className="text-xs text-fg-subtle">
                    {a.playerId ? (
                      <Link href={`/players/${a.playerId}`} className="hover:underline">
                        Player profile
                      </Link>
                    ) : (
                      "No player profile"
                    )}{" "}
                    · last sign-in {a.lastLoginAt ? timeAgo(a.lastLoginAt) : "never"}
                  </div>
                </div>
                <div className="w-full sm:w-56">
                  <Select
                    aria-label={`Access level of ${a.username}`}
                    value={valueOf(a)}
                    disabled={busy !== null || a.userId === currentUserId}
                    onChange={(e) => choose(a, e.target.value)}
                    data-testid="access-level"
                  >
                    <option value={OWNER}>Owner</option>
                    {presets.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                    <option value={CUSTOM}>{a.hasCustomCapabilities ? "Custom (edit…)" : "Custom…"}</option>
                  </Select>
                  <p className="mt-1 text-xs text-fg-subtle">{a.userId === currentUserId ? "Your own level cannot be changed here." : describe(a)}</p>
                  {a.hasCustomCapabilities && a.userId !== currentUserId ? (
                    <button type="button" className="mt-1 text-xs text-accent underline underline-offset-2" onClick={() => setCustom(a)}>
                      Edit custom access
                    </button>
                  ) : null}
                </div>
              </div>
              <AccountActions account={a} currentUserId={currentUserId} />
            </li>
          ))}
        </ul>
      </section>
      <Disclosure title="What each access level allows" description="Edit Administrator, Standard Player and Restricted Player, or add a level of your own.">
        <PermissionPresetsPanel presets={presets} />
      </Disclosure>
      {custom ? <CustomAccessDialog open onClose={() => setCustom(null)} account={custom} start={custom.capabilities} /> : null}
      <ConfirmDialog
        open={!!confirm}
        tone={confirm?.value === OWNER ? "primary" : "danger"}
        title={confirm?.value === OWNER ? `Make ${confirm?.account.username ?? ""} an Owner?` : `Remove Owner access from ${confirm?.account.username ?? ""}?`}
        description={confirm?.value === OWNER ? "Owners can manage every account, password and permission, and override any draft." : `They become ${confirm ? labelOf(confirm.value) : ""}. The last Owner can never lose Owner access.`}
        confirmLabel={confirm?.value === OWNER ? "Make Owner" : "Change access"}
        busy={busy !== null}
        onCancel={() => {
          setConfirm(null);
          router.refresh();
        }}
        onConfirm={async () => {
          if (confirm) await apply(confirm.account, confirm.value);
          setConfirm(null);
        }}
      />
    </div>
  );
}
