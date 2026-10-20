/*
  The admin and security actions UNIIVERSE records (server/audit/log.ts) and how Admin → System
  Health → Admin activity names them. A new recorded action gets its label here.
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
  "jobs.schedule": "Changed job schedules",
  "jobs.run": "Ran a background job",
  "demo.data": "Changed demo data",
} as const;

export type AuditAction = keyof typeof AUDIT_ACTIONS;

export function auditLabel(action: string): string {
  return (AUDIT_ACTIONS as Record<string, string>)[action] ?? action;
}
