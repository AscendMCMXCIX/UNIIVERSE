import type { JournalDashboard } from "@/domain/ranked-improvement";
import { Metric } from "@/components/ui/metric";
import { percent } from "@/lib/format";

/** The four numbers that matter, each with its ⓘ from the glossary. */
export function JournalDashboardTiles({ dashboard }: { dashboard: JournalDashboard & { focus: string } }) {
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      <Metric id="journal-games" value={dashboard.totalGames} valueClassName="text-lg" />
      <Metric id="journal-win-rate" value={dashboard.winRate === null ? "—" : percent(dashboard.winRate, 0)} showUnit={false} valueClassName="text-lg" />
      <Metric id="journal-focus" value={dashboard.focus || <span className="font-normal text-fg-muted">Not set yet</span>} valueClassName="text-sm font-medium leading-snug" className="max-lg:col-span-2" />
      <Metric id="journal-mistake" value={dashboard.mostCommonMistake ? `${dashboard.mostCommonMistake.label} (${dashboard.mostCommonMistake.count})` : "—"} valueClassName="text-sm font-medium leading-snug" className="max-lg:col-span-2" />
    </div>
  );
}
