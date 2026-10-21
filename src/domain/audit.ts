/*
  The admin and security actions UNIIVERSE records (server/audit/log.ts) and how Admin Mode →
  Audit Logs names and groups them. A new recorded action gets its label and its category here.
*/

export const AUDIT_ACTIONS = {
  "owner.setup": "Created the Owner account",
  "owner.recover": "Recovered Owner access with the setup key",
  "account.create": "Created an account",
  "account.password-reset": "Issued a temporary password",
  "account.activate": "Reactivated an account",
  "account.deactivate": "Deactivated an account",
  "account.delete": "Deleted an account",
  "account.role": "Changed an account's role",
  "account.access": "Changed an account's access level",
  "account.groups": "Changed an account's extra access",
  "account.permissions": "Changed an account's permissions",
  "account.team-member": "Changed team membership",
  "account.admin-grant": "Granted administrator access",
  "account.admin-revoke": "Removed administrator access",
  "profile.delete": "Deleted a player profile",
  "password.change": "Changed their own password",
  "preset.save": "Saved an access level",
  "preset.delete": "Deleted an access level",
  "branding.save": "Changed branding",
  "branding.reset": "Reset branding",
  "branding.asset": "Uploaded a branding image",
  "branding.asset-remove": "Removed a branding image",
  // Earlier entries only: the public page's own settings panel was removed (20 Oct 2026).
  "branding.public-site": "Changed the public page",
  "resources.add": "Added a resource",
  "resources.edit": "Changed a resource",
  "resources.remove": "Removed a resource",
  "resources.restore": "Restored removed default resources",
  "clash.scout-delete": "Deleted a Clash scout",
  "jobs.schedule": "Changed job schedules",
  "jobs.run": "Ran a background job",
  "demo.data": "Changed demo data",
} as const;

export type AuditAction = keyof typeof AUDIT_ACTIONS;

/** The Audit Logs filter: every recorded action belongs to exactly one category. */
export const AUDIT_CATEGORIES = {
  access: { label: "Access & permissions", actions: ["account.role", "account.access", "account.groups", "account.permissions", "account.admin-grant", "account.admin-revoke", "preset.save", "preset.delete"] },
  accounts: { label: "Accounts & passwords", actions: ["owner.setup", "owner.recover", "account.create", "account.password-reset", "account.activate", "account.deactivate", "account.delete", "account.team-member", "profile.delete", "password.change"] },
  settings: { label: "Platform settings", actions: ["branding.save", "branding.reset", "branding.asset", "branding.asset-remove", "branding.public-site", "resources.add", "resources.edit", "resources.remove", "resources.restore"] },
  data: { label: "Data & jobs", actions: ["clash.scout-delete", "jobs.schedule", "jobs.run", "demo.data"] },
} as const satisfies Record<string, { label: string; actions: readonly AuditAction[] }>;

export type AuditCategory = keyof typeof AUDIT_CATEGORIES;

export function isAuditCategory(value: unknown): value is AuditCategory {
  return typeof value === "string" && Object.hasOwn(AUDIT_CATEGORIES, value);
}

export function auditLabel(action: string): string {
  return (AUDIT_ACTIONS as Record<string, string>)[action] ?? action;
}
