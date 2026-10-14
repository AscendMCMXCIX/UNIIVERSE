import { getAppDb } from "@/server/bootstrap";
import { requirePageAccess } from "@/server/auth/page-access";
import { listPermissionPresets } from "@/server/repositories/permissions";
import { ACCESS_GROUPS, CAPABILITIES } from "@/server/auth/permissions";
import { PermissionPresetsPanel } from "@/components/admin/permissions-editor";

export const dynamic = "force-dynamic";

const LABEL = Object.fromEntries(CAPABILITIES.map((c) => [c.key, c.label]));

/** People & Access → Access levels & groups: what each base level and each additional group allows (Owner only). */
export default async function AdminAccessPage() {
  await requirePageAccess("manage-users");
  const presets = await listPermissionPresets(await getAppDb());
  return (
    <div className="space-y-6">
      <PermissionPresetsPanel presets={presets} />
      <section className="space-y-3" data-testid="access-groups">
        <div>
          <h2 className="text-base font-semibold">Additional access groups</h2>
          <p className="text-sm text-fg-muted">Given on top of a base level (Accounts → Access), so a player can take on one responsibility without becoming an Administrator. Groups never include accounts, passwords or permissions.</p>
        </div>
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {ACCESS_GROUPS.map((g) => (
            <li key={g.key} className="rounded-lg border border-border bg-surface p-4">
              <h3 className="font-medium text-fg">{g.label}</h3>
              <p className="mt-0.5 text-sm text-fg-muted">{g.description}</p>
              <p className="mt-2 text-xs text-fg-subtle">Adds: {g.capabilities.map((c) => LABEL[c] ?? c).join(", ")}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
