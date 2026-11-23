import type { MultikillDetail } from "@/server/leaderboards/recent-view";

/*
  A member's multikills in the player Peek on Leaderboards (Release 15, round 2): the reason behind
  a score, for every device. The board's row opens the Peek (tap or click: one interaction model),
  and the Peek leads with this: the score and its spread by chance, then each kind made (each
  multikill once, at its largest) over the number usual for their roles and champions, then the
  games behind it. Without a score, why not. Plain markup, no state: rendered inside the Peek
  (a client component) from the page's own data, so it costs no request.
*/

export function MultikillPeekDetail({ detail, seasonLabel }: { detail: MultikillDetail; seasonLabel: string }) {
  return (
    <section aria-labelledby="peek-multikills-title" className="mb-3 rounded-card border border-border bg-surface-2/40 px-3 py-2" data-testid="peek-multikills" data-status={detail.status}>
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-2">
        <h3 id="peek-multikills-title" className="text-xs font-semibold text-fg">
          Multikills · {seasonLabel}
        </h3>
        {detail.score ? (
          <p className="flex items-baseline gap-1.5 tabular-nums" data-testid="peek-multikills-score">
            <span className="text-lg font-semibold leading-5 text-fg">{detail.score}</span>
            <span className="sr-only"> multikill score</span>
            {detail.chance ? (
              <span className="text-xs text-fg-muted">
                <span aria-hidden>{detail.chance}</span>
                <span className="sr-only">, give or take {detail.chance.replace("±", "")} by chance</span>
              </span>
            ) : null}
          </p>
        ) : null}
      </div>
      <dl className="mt-1 grid grid-cols-4 gap-x-2" data-testid="peek-multikills-kinds">
        {detail.kinds.map((k) => (
          <div key={k.key} className="min-w-0" data-kind={k.key}>
            <dt className="text-xs text-fg-muted">{k.label}</dt>
            <dd className="flex min-w-0 flex-wrap items-baseline gap-x-1 tabular-nums">
              <span className="text-sm font-semibold text-fg" data-testid="peek-multikills-made">
                {k.made}
              </span>
              {k.usual !== null ? (
                <span className="text-xs text-fg-muted" data-testid="peek-multikills-usual">
                  usual {k.usual}
                </span>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-1 text-xs text-fg-muted" data-testid="peek-multikills-note">
        {detail.note ?? `${detail.gamesText} · each multikill once, at its largest · ${detail.usualIs}`}
      </p>
    </section>
  );
}
