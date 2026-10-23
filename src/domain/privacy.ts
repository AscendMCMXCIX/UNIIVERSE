/*
  The privacy contact, shown on the public privacy notice and in Admin Mode. Requests (access,
  correction, permanent removal) arrive privately on Discord to the team owner; there is no email,
  form or ticket system. Change it here if the owner's Discord username changes (docs/PRIVACY.md).
*/

/** The owner's Discord username (approved 22 Oct 2026), without the "@". */
export const PRIVACY_DISCORD = "ascend1999";

/** The date the privacy notice last changed; update it with the text. */
export const PRIVACY_UPDATED = "23 October 2026";

/** How long the encrypted database backups are kept (.github/workflows/backup.yml, retention-days). */
export const BACKUP_RETENTION_DAYS = 28;
