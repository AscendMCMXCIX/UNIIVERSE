import Link from "next/link";
import { getAppDb } from "@/server/bootstrap";
import { requirePageAccess } from "@/server/auth/page-access";
import { listErasureRecords } from "@/server/privacy/ledger";
import { BACKUP_RETENTION_DAYS, PRIVACY_DISCORD } from "@/domain/privacy";
import { EraseFormerMember } from "@/components/admin/erase-person";
import { ErasureRecords } from "@/components/admin/erasure-records";

export const dynamic = "force-dynamic";

/**
 * Users & Permissions → Personal data (administrators only): how privacy requests are handled,
 * erasing what a former member left, and the erasure records (export, import, re-apply, release).
 * A current member is erased from their row under Accounts.
 */
export default async function AdminPrivacyPage() {
  await requirePageAccess("manage-users");
  const records = await listErasureRecords(await getAppDb());
  return (
    <div className="space-y-6" data-testid="admin-privacy">
      <section className="space-y-2">
        <h2 className="text-base font-semibold">Privacy requests</h2>
        <p className="text-sm text-fg-muted">
          People ask privately on Discord, to <span className="font-medium text-fg">@{PRIVACY_DISCORD}</span> (the{" "}
          <Link href="/privacy" className="text-accent underline-offset-2 hover:underline">
            privacy notice
          </Link>{" "}
          explains how). A Discord username alone does not prove who someone is, so check before acting:
        </p>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-fg-muted marker:text-fg-subtle">
          <li>Prefer the Discord account the member linked on their own profile, or one the team already knows as theirs.</li>
          <li>Otherwise ask for details only the account holder would know (their username, linked Riot accounts, roles and champion pools), or ask them to change their League profile icon to one you name and check it on their Riot profile.</li>
          <li>Never ask for a password, a temporary password, a session or any other credential. Nobody here needs one.</li>
          <li>Keep the conversation private, act on the request, and tell them when it is done (for an erasure, its reference).</li>
        </ol>
        <p className="text-sm text-fg-muted">
          Access: tell them what is stored (the privacy notice lists it; their profile shows most of it). Correction: they change most details in Settings, or you fix them. Permanent removal: <span className="text-fg">Erase personal data</span> on their row under Accounts, or below for someone whose account is already gone. Deactivate, Delete and Archive keep data; only Erase removes the person.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">Erase a former member</h2>
        <p className="text-sm text-fg-muted">For someone whose account and profile were deleted before erasure existed: their Riot account is checked with Riot, and every stored game, scout, log and team record that still names them is erased or de-identified as for a member.</p>
        <EraseFormerMember />
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">Erasure records</h2>
        <p className="text-sm text-fg-muted">
          Each erasure leaves a reference and keyed codes, never a name, Riot ID or account id. They keep the person out of games synced later and stop their Riot accounts being linked again by accident. They depend on the server secret UNIIVERSE_AUTH_SECRET: replacing it makes them unusable.
        </p>
        <p className="text-sm text-fg-muted">
          Backups made before an erasure still hold the person&apos;s data until they expire ({BACKUP_RETENTION_DAYS} days), and offline copies until whoever holds them deletes them. Export the records after each erasure and keep the file with the offline backups. If a backup is ever restored, import the newest records file and re-apply them before the app is used again (docs/BACKUPS.md).
        </p>
        <ErasureRecords records={records} />
      </section>
    </div>
  );
}
