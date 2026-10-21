import type { AuditEntry } from "@/server/audit/log";
import { auditLabel } from "@/domain/audit";
import { timeAgo } from "@/lib/format";

/**
 * Recorded admin actions, newest first: when, who, what, to whom, and the short details kept with
 * it (never a password, a token or a key: the record drops them before it is written).
 */
export function AuditList({ entries, empty = "Nothing recorded yet." }: { entries: AuditEntry[]; empty?: string }) {
  if (!entries.length) return <p className="text-sm text-fg-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-border text-sm">
      {entries.map((e, i) => (
        <li key={i} className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 py-1.5" data-testid="admin-activity-row">
          <time className="w-16 shrink-0 text-xs tabular-nums text-fg-subtle" dateTime={e.at.toISOString()} title={e.at.toISOString()}>
            {timeAgo(e.at)}
          </time>
          <span className="font-medium">{e.actorName ?? "Local owner"}</span>
          <span>{auditLabel(e.action)}</span>
          {e.targetName ? <span className="min-w-0 text-fg-muted [overflow-wrap:anywhere]">· {e.targetName}</span> : null}
          {Object.keys(e.details).length ? (
            <span className="text-xs text-fg-subtle [overflow-wrap:anywhere]">
              ({Object.entries(e.details).map(([k, v]) => `${k}: ${String(v)}`).join(", ")})
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
