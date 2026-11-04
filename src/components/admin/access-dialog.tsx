"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, ShieldCheck } from "lucide-react";
import type { AccountView } from "@/server/auth/account-admin";
import type { PermissionPreset } from "@/server/repositories/permissions";
import { setAccessGroupsAction, setAccessLevelAction, setAdministratorAction, setTeamMemberAction } from "@/server/actions/users";
import { ROLE_LABELS, type Role } from "@/domain/roles";
import { ACCESS_GROUPS, ALWAYS_AVAILABLE, CAPABILITIES, effectiveCapabilities, type Capability } from "@/server/auth/permissions";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Label, Select } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useBrandNames } from "@/components/brand-names";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { CapabilityChecklist } from "./capability-checklist";

const OWNER = "__owner__";
const CUSTOM = "__custom__";

/** "Team member · Standard Player + Team Lineup Manager": the account's access in a few words. */
export function accessSummary(account: Pick<AccountView, "role" | "isAdmin" | "permissionPresetId" | "hasCustomCapabilities" | "accessGroups" | "teamMember">, presets: PermissionPreset[]): string {
  if (account.role === "owner") return "Owner";
  const base = account.hasCustomCapabilities ? "Custom" : ((presets.find((p) => p.id === account.permissionPresetId) ?? presets.find((p) => p.isDefault))?.name ?? "Standard Player");
  const groups = ACCESS_GROUPS.filter((g) => account.accessGroups.includes(g.key)).map((g) => g.label);
  return `${account.teamMember ? "Team member" : "Personal use"} · ${[base, ...groups].join(" + ")}${account.isAdmin ? " · Administrator" : ""}`;
}

/**
 * One person's access in one place: team membership (the team workspace, or personal use only),
 * the base level (Standard Player, Team Manager, Restricted Player or Custom), additional access
 * groups on top (Team Lineup Manager…), administrator access (Admin Mode, on top of all that),
 * and the resulting abilities in plain English. Every rule is enforced on the server: only
 * administrators open this, nobody edits their own access, nobody is made an Owner, only the
 * Owner changes the Owner account, and no level or group reaches Admin Mode, accounts or settings.
 */
export function AccessDialog({ account, presets, lineupRole = null, onClose }: { account: AccountView; presets: PermissionPreset[]; lineupRole?: Role | null; onClose: () => void }) {
  const router = useRouter();
  const { teamName } = useBrandNames();
  const defaultPreset = presets.find((p) => p.isDefault);
  const startBase = account.role === "owner" ? OWNER : account.hasCustomCapabilities ? CUSTOM : (account.permissionPresetId ?? defaultPreset?.id ?? "");
  const [base, setBase] = React.useState(startBase);
  const [custom, setCustom] = React.useState<string[]>(account.hasCustomCapabilities ? account.baseCapabilities : (presets.find((p) => p.id === startBase)?.capabilities ?? defaultPreset?.capabilities ?? []));
  const [groups, setGroups] = React.useState<string[]>(account.accessGroups);
  const [member, setMember] = React.useState(account.teamMember);
  const [admin, setAdmin] = React.useState(account.isAdmin);
  const [busy, setBusy] = React.useState(false);

  const owner = base === OWNER;
  const baseCaps: Capability[] = owner ? CAPABILITIES.map((c) => c.key) : base === CUSTOM ? (custom as Capability[]) : ((presets.find((p) => p.id === base)?.capabilities ?? []) as Capability[]);
  // An administrator holds every ability, like the Owner; their own level is kept for when it ends.
  const effective = effectiveCapabilities({ owner: owner || admin, base: baseCaps, groups, teamMember: member });
  const fromGroup = (key: Capability) => !owner && !baseCaps.includes(key) && effective.has(key);
  const ownerChange = (base === OWNER) !== (account.role === "owner");

  const save = async () => {
    setBusy(true);
    if (account.playerId && member !== account.teamMember) {
      const r = await setTeamMemberAction(account.playerId, member);
      if (!r.ok) {
        setBusy(false);
        return toast.error(r.error);
      }
    }
    const baseChanged = base !== startBase || (base === CUSTOM && custom.join() !== account.baseCapabilities.join());
    if (baseChanged) {
      const r = await setAccessLevelAction(account.userId, owner ? { level: "owner" } : base === CUSTOM ? { level: "custom", capabilities: custom } : { level: "preset", presetId: base });
      if (!r.ok) {
        setBusy(false);
        return toast.error(r.error);
      }
    }
    if (!owner && groups.slice().sort().join() !== account.accessGroups.slice().sort().join()) {
      const r = await setAccessGroupsAction(account.userId, groups);
      if (!r.ok) {
        setBusy(false);
        return toast.error(r.error);
      }
    }
    if (account.role !== "owner" && admin !== account.isAdmin) {
      const r = await setAdministratorAction(account.userId, admin);
      if (!r.ok) {
        setBusy(false);
        return toast.error(r.error);
      }
    }
    setBusy(false);
    toast.success(`${account.username}: access saved.`, { description: "It applies the next time they open a page." });
    onClose();
    router.refresh();
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Access for ${account.username}`}
      description="Team membership, a base level, any additional groups, and administrator access to Admin Mode."
      className="sm:max-w-3xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={busy || ownerChange} data-testid="save-access">
            {busy ? "Saving…" : "Save access"}
          </Button>
        </>
      }
    >
      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" data-testid="access-dialog">
        <div className="space-y-4">
          {account.playerId ? (
            <section aria-labelledby={`team-${account.userId}`} className="space-y-1.5 rounded-panel border border-border bg-bg-elevated p-3" data-testid="team-membership">
              <h3 id={`team-${account.userId}`} className="text-sm font-medium text-fg">
                Team membership
              </h3>
              <Switch id={`member-${account.userId}`} label={`Member of the ${teamName} team`} description={member ? "Team Overview, Players, Leaderboards and Matches; listed in Players once set up and eligible for the lineup." : "Personal use: their own profile and statistics. No Team pages; not in Players or the lineup."} checked={member} onChange={setMember} />
              {!member && lineupRole && account.teamMember ? <p className="rounded-md border border-warn/40 bg-warn/10 px-2.5 py-1.5 text-xs text-fg">They hold the lineup&apos;s {ROLE_LABELS[lineupRole]} place: give it to someone else on Team Overview first.</p> : null}
              <p className="text-xs text-fg-subtle">Their Riot accounts, champion pools and statistics stay as they are either way.</p>
            </section>
          ) : null}
          <div>
            <Label htmlFor="base-access">Base access</Label>
            <Select id="base-access" value={base} onChange={(e) => setBase(e.target.value)} data-testid="base-access">
              {account.role === "owner" ? <option value={OWNER}>Owner (everything)</option> : null}
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
              <option value={CUSTOM}>Custom (choose each ability)</option>
            </Select>
            <p className="mt-1 text-xs text-fg-subtle">
              {owner ? "Owners can manage every account, password and permission." : base === CUSTOM ? "Tick each ability below." : (presets.find((p) => p.id === base)?.description ?? "")}
            </p>
            {ownerChange ? <p className="mt-1.5 rounded-md border border-warn/40 bg-warn/10 px-2.5 py-1.5 text-xs text-fg">There is one Owner: its level cannot be changed here.</p> : null}
          </div>
          {base === CUSTOM ? <CapabilityChecklist value={custom} onChange={setCustom} idPrefix={`custom-${account.userId}`} /> : null}
          <section aria-labelledby={`admin-${account.userId}`} className="space-y-1.5 rounded-panel border border-border bg-bg-elevated p-3" data-testid="administrator-access">
            <h3 id={`admin-${account.userId}`} className="text-sm font-medium text-fg">
              Administrator
            </h3>
            {account.role === "owner" ? (
              <p className="text-xs text-fg-subtle">The Owner is always an administrator.</p>
            ) : (
              <>
                <Switch
                  id={`administrator-${account.userId}`}
                  label="Administrator access"
                  description={admin ? "Can open Admin Mode: accounts and permissions, platform settings, data, system health and audit logs. Everything a player can do too. Not the Owner account." : "Plays as a normal player and never sees Admin Mode."}
                  checked={admin}
                  onChange={setAdmin}
                />
                <p className="text-xs text-fg-subtle">Their profile, Riot accounts and statistics stay theirs. Turning it off returns them to the access set here, at their next page.</p>
              </>
            )}
          </section>
          <fieldset className="space-y-1" disabled={owner}>
            <legend className="mb-1 text-sm font-medium text-fg">Additional access</legend>
            <p className="mb-1 text-xs text-fg-subtle">{owner ? "Owners already have everything." : "Extra responsibilities on top of the base level: they stay a normal player otherwise."}</p>
            {ACCESS_GROUPS.map((g) => (
              <Switch
                key={g.key}
                id={`group-${account.userId}-${g.key}`}
                label={g.label}
                description={g.description}
                checked={!owner && groups.includes(g.key)}
                disabled={owner}
                onChange={(on) => setGroups((cur) => (on ? [...cur, g.key] : cur.filter((k) => k !== g.key)))}
              />
            ))}
          </fieldset>
        </div>
        <section aria-labelledby="effective-access" className="rounded-panel border border-border bg-bg-elevated p-3">
          <h3 id="effective-access" className="flex items-center gap-1.5 text-sm font-semibold text-fg">
            <ShieldCheck className="h-4 w-4 text-accent" aria-hidden /> What they can do
          </h3>
          <p className="mt-1 text-xs text-fg-subtle">{owner ? "Owner: everything below and Admin Mode." : admin ? "Administrator: everything below and Admin Mode." : `${member ? "Team member" : "Personal use"} · ${base === CUSTOM ? "Custom" : (presets.find((p) => p.id === base)?.name ?? "")}${groups.length ? ` + ${ACCESS_GROUPS.filter((g) => groups.includes(g.key)).map((g) => g.label).join(" + ")}` : ""}`}</p>
          <p className="mt-2 text-xs font-medium text-fg-muted">Always</p>
          <ul className="mt-1 space-y-1" data-testid="always-available">
            {ALWAYS_AVAILABLE.map((t) => (
              <li key={t} className="flex items-start gap-2 text-sm text-fg">
                <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-good/20 text-good" aria-hidden>
                  <Check className="h-3 w-3" />
                </span>
                {t}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs font-medium text-fg-muted">With this access</p>
          <ul className="mt-1 space-y-1" data-testid="effective-capabilities">
            {CAPABILITIES.map((c) => {
              const on = effective.has(c.key);
              return (
                <li key={c.key} className={cn("flex items-start gap-2 text-sm", on ? "text-fg" : "text-fg-subtle line-through decoration-fg-subtle/40")} data-on={on}>
                  <span className={cn("mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full", on ? "bg-good/20 text-good" : "bg-surface-3")} aria-hidden>
                    {on ? <Check className="h-3 w-3" /> : null}
                  </span>
                  <span className="min-w-0">
                    {c.label}
                    {fromGroup(c.key) ? <span className="ml-1 text-xs text-accent">(additional access)</span> : null}
                    <span className="sr-only">{on ? ": allowed" : ": not allowed"}</span>
                  </span>
                </li>
              );
            })}
            <li className={cn("flex items-start gap-2 text-sm", owner || admin ? "text-fg" : "text-fg-subtle line-through decoration-fg-subtle/40")} data-testid="admin-mode-ability" data-on={owner || admin}>
              <span className={cn("mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full", owner || admin ? "bg-good/20 text-good" : "bg-surface-3")} aria-hidden>
                {owner || admin ? <Check className="h-3 w-3" /> : null}
              </span>
              Admin Mode: accounts, permissions and settings <span className="sr-only">{owner || admin ? ": allowed" : ": administrators only"}</span>
            </li>
          </ul>
        </section>
      </div>
    </Dialog>
  );
}
