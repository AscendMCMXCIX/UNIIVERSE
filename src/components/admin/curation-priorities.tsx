import { formatCount } from "@/lib/format";
import { ROLE_LABELS } from "@/domain/roles";
import type { CurationRole } from "@/server/matchup-intel/curation";

/** "1 game", "1,204 games". */
const games = (n: number) => `${formatCount(n)} ${n === 1 ? "game" : "games"}`;

/**
 * Matchup Intel's curation priorities (Admin only; curation.ts): per role, the team's pool cells
 * ranked by the members' games on them, and what is already curated. Champion names and counts only.
 */
export function CurationPriorities({ roles }: { roles: CurationRole[] }) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-surface-2 px-3 py-2 text-sm [overflow-wrap:anywhere]" data-testid="curation-priorities">
      <div className="font-semibold text-fg">Matchup Intel: what to curate next</div>
      <p className="text-xs text-fg-subtle">The champions in the team members&apos; pools, by role, most played in that role first. Checked notes exist for top lane only.</p>
      <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2">
        {roles.map((r) => (
          <section key={r.role} className="min-w-0" data-testid="curation-role" data-role={r.role}>
            <h3 className="text-xs font-semibold text-fg">{ROLE_LABELS[r.role]}</h3>
            {r.cells.length ? (
              <ol className="mt-0.5 space-y-0.5">
                {r.cells.map((c) => (
                  <li key={c.championId} className="flex flex-wrap items-baseline justify-between gap-x-2" data-testid="curation-cell" data-champion={c.championId}>
                    <span className="text-fg">
                      {c.name}
                      {c.checkedNotes ? <span className="text-xs text-good"> · checked notes</span> : null}
                      {c.curatedPairs ? <span className="text-xs text-good">{` · ${formatCount(c.curatedPairs)} curated ${c.curatedPairs === 1 ? "pair" : "pairs"}`}</span> : null}
                    </span>
                    <span className="text-xs tabular-nums text-fg-muted">{games(c.games)}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-xs text-fg-muted">No champion in a member&apos;s pool for this role.</p>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
