import type { AuditEntry } from "@/server/audit/log";
import { AuditRow } from "./audit-log";

/**
 * Recorded admin actions, newest first, as sentences (the Dashboard's latest few): never a
 * password, a token or a key (the record drops them before it is written), never `key: value`.
 */
export function AuditList({ entries, empty = "Nothing recorded yet." }: { entries: AuditEntry[]; empty?: string }) {
  if (!entries.length) return <p className="text-sm text-fg-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-border">
      {entries.map((e) => (
        <AuditRow key={e.id} entry={e} />
      ))}
    </ul>
  );
}
