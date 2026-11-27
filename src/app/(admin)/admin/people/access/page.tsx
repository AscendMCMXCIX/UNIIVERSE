import { getAppDb } from "@/server/bootstrap";
import { requirePageAccess } from "@/server/auth/page-access";
import { listPermissionPresets } from "@/server/repositories/permissions";
import { ACCESS_GROUPS, CAPABILITIES } from "@/server/auth/permissions";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { PermissionPresetsPanel } from "@/components/admin/permissions-editor";
import { ACCESS_CELL, ACCESS_CELLS } from "@/components/admin/access-cells";

export const dynamic = "force-dynamic";

const LABEL = Object.fromEntries(CAPABILITIES.map((c) => [c.key, c.label]));

/** Users & Permissions → Access levels & groups: what each base level and each additional group allows (administrators only). */
export default async function AdminAccessPage() {
  await requirePageAccess("manage-users");
  const presets = await listPermissionPresets(await getAppDb());
  return (
    <div className="space-y-5">
      <PermissionPresetsPanel presets={presets} />
      <Panel data-testid="access-groups">
        <PanelHeader title="Additional access groups" subtitle="Given on top of a base level, so a player can take on one responsibility without becoming an Administrator. Groups never include accounts, passwords or permissions." />
        <PanelBody>
          {/* Cells on the panel's surface, as the base levels' (no boxes within the panel). */}
          <ul className={ACCESS_CELLS}>
            {ACCESS_GROUPS.map((g) => (
              <li key={g.key} className={ACCESS_CELL}>
                <h3 className="text-sm font-medium text-fg">{g.label}</h3>
                <p className="mt-0.5 text-sm text-fg-muted">{g.description}</p>
                <p className="mt-1.5 text-sm text-fg-subtle">Adds: {g.capabilities.map((c) => LABEL[c] ?? c).join(", ")}</p>
              </li>
            ))}
          </ul>
        </PanelBody>
      </Panel>
    </div>
  );
}
