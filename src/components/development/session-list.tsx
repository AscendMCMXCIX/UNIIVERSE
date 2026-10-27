import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { sessionStatusText } from "@/domain/development/sessions";
import type { SessionListItem } from "@/server/development/page-data";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";

/** Sessions newest first, each a link to its summary: results, objective, reviews and follow-through. */
export function SessionList({ sessions, emptyText }: { sessions: SessionListItem[]; emptyText: string }) {
  if (sessions.length === 0) return <p className="px-1 py-3 text-sm text-fg-muted">{emptyText}</p>;
  return (
    <ul className="divide-y divide-border" data-testid="session-list">
      {sessions.map((s) => (
        <li key={s.id}>
          <Link href={`/overview/development/sessions/${s.id}`} className="flex min-h-14 items-center gap-3 px-1 py-2.5 hover:bg-surface-2/50" data-testid="session-row">
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-sm font-semibold text-fg">{s.label}</span>
                <Badge tone={s.status === "active" ? "accent" : "neutral"}>{sessionStatusText(s)}</Badge>
                <span className="text-sm tabular-nums">
                  <span className="text-blue">{s.wins}W</span> <span className="text-red">{s.losses}L</span>
                </span>
              </span>
              <span className="mt-0.5 block truncate text-xs text-fg-muted">
                {formatDate(s.startedAt)}
                {s.focus ? ` · ${s.focus}` : " · no objective"}
                {s.reviews.done ? ` · ${s.reviews.done} reviewed` : ""}
                {s.reviews.pending ? ` · ${s.reviews.pending} to review` : ""}
                {s.execution.rated ? ` · plan followed ${s.execution.followed}/${s.execution.rated}` : ""}
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-fg-subtle" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}
