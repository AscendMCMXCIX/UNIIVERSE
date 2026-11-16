/*
  The privacy contact, shown on the public privacy notice and in Admin Mode. Requests (access,
  correction, permanent removal) arrive privately on Discord to the team owner; there is no email,
  form or ticket system. Change it here if the owner's Discord username changes (docs/PRIVACY.md).
*/

/** The owner's Discord username (approved 22 Oct 2026), without the "@". */
export const PRIVACY_DISCORD = "ascend1999";

/** The date the privacy notice last changed; update it with the text. */
export const PRIVACY_UPDATED = "6 November 2026";

/** How long the encrypted database backups are kept (the private AscendMCMXCIX/uniiverse-backups repository's .github/workflows/backup.yml, retention-days; docs/backup-repository/ here). */
export const BACKUP_RETENTION_DAYS = 28;

/**
 * Who else sees what a member shows on their card (picture, display name, banner): the phrase that
 * follows "Shown to teammates" in Settings and the Card Studio. The public team page is open to
 * everyone, with no switch and no opt-in, and shows the players holding a lineup role and each
 * role's designated substitute (server/public/team.ts; docs/UNIIVERSE_TECHNICAL_HANDOVER.md §C4):
 * change these words with that rule. A role whose starter is missing or may not appear shows no
 * substitute either, so for that substitute the words say more than the page shows, never less.
 * Not part of the privacy notice (app/privacy/page.tsx has its own words), so PRIVACY_UPDATED does
 * not follow it.
 */
export const ON_THE_PUBLIC_PAGE = "on the public team page while you're in the lineup or a substitute";
