"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BadgeCheck, ScanSearch } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchInput } from "@/components/ui/search-input";
import { segmentClass, segmentedGroupClass } from "@/components/ui/segmented";
import { opggRegion } from "@/domain/opgg";

export interface HistoryRow {
  id: string;
  opponentName: string;
  platform: string;
  tournamentName: string | null;
  playersCaptured: number;
  playersVerified: number;
  scoutedAt: string;
  createdByName: string | null;
}

/**
 * The team's saved scouts: a compact list (opponent, when, which Clash, how many players and how
 * many verified), searchable by opponent or player name, active or archived. Each opens in the
 * workspace at its own address, which teammates can open too. Its links are not prefetched: each
 * would render a saved scout (or the list) on the server, a database read per row.
 */
export function ScoutHistory({ rows, query, archived }: { rows: HistoryRow[]; query: string; archived: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = React.useState(query);
  React.useEffect(() => {
    if (q === query) return;
    const t = setTimeout(() => {
      const sp = new URLSearchParams();
      if (q.trim()) sp.set("q", q.trim());
      if (archived) sp.set("archived", "1");
      router.replace(`${pathname}${sp.size ? `?${sp}` : ""}`, { scroll: false });
    }, 300);
    return () => clearTimeout(t);
  }, [q, query, archived, pathname, router]);
  const tab = (a: boolean) => `${pathname}?${new URLSearchParams({ ...(q.trim() ? { q: q.trim() } : {}), ...(a ? { archived: "1" } : {}) })}`;

  return (
    <section className="space-y-3" aria-labelledby="clash-history-h" data-testid="clash-history">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="clash-history-h" className="mr-auto text-base font-semibold text-fg">
          Saved scouts
        </h2>
        <div className={segmentedGroupClass()} role="group" aria-label="Which scouts">
          <Link href={tab(false)} prefetch={false} className={segmentClass(!archived)} aria-current={!archived ? "page" : undefined} data-testid="clash-history-active">
            Active
          </Link>
          <Link href={tab(true)} prefetch={false} className={segmentClass(archived)} aria-current={archived ? "page" : undefined} data-testid="clash-history-archived">
            Archived
          </Link>
        </div>
        <SearchInput value={q} onChange={setQ} label="Search scouts by opponent or player" placeholder="Opponent or player" className="w-full sm:w-64" testId="clash-history-search" />
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={ScanSearch} compact title={query ? "No saved scout matches" : archived ? "No archived scouts" : "No saved scouts yet"}>
          {query ? "Search looks at opponent names, player names and verified Riot IDs." : archived ? null : "Save a scout to keep it here for the whole team."}
        </EmptyState>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-panel border border-border bg-surface" data-testid="clash-history-list">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/clash/${r.id}`} prefetch={false} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent" data-testid="clash-history-row">
                <span className="min-w-0 flex-1 truncate font-medium text-fg">{r.opponentName}</span>
                <span className="text-sm text-fg-muted">{[r.tournamentName, opggRegion(r.platform)?.toUpperCase()].filter(Boolean).join(" · ")}</span>
                <span className="text-sm tabular-nums text-fg-muted">
                  {r.playersCaptured}/5 players
                  {r.playersVerified ? (
                    <span className="ml-2 inline-flex items-center gap-1 text-good">
                      <BadgeCheck className="h-3.5 w-3.5" aria-hidden />
                      {r.playersVerified} verified
                    </span>
                  ) : null}
                </span>
                <time className="text-sm tabular-nums text-fg-subtle" dateTime={r.scoutedAt}>
                  {new Date(r.scoutedAt).toLocaleDateString()}
                </time>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
