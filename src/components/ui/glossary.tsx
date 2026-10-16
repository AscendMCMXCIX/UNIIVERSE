import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

export interface GlossaryTerm {
  term: string;
  /** One line, read at a glance beside the data. */
  short: React.ReactNode;
  /** The full definition, one click away. */
  long?: React.ReactNode;
}

/**
 * How to read a statistics page, without competing with the statistics: one short line per term,
 * the full definitions and caveats behind a disclosure. Quiet styling (no card) so the data stays
 * the focus; the same pattern on every statistics page.
 */
export function Glossary({ title = "Reading the numbers", terms, note, className, testId }: { title?: string; terms: GlossaryTerm[]; note?: React.ReactNode; className?: string; testId?: string }) {
  return (
    <section aria-label={title} className={cn("space-y-2 text-xs text-fg-muted", className)} data-testid={testId}>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">{title}</h2>
      <dl className="space-y-1.5">
        {terms.map((t) => (
          <div key={t.term} className="leading-snug">
            <dt className="inline font-semibold text-fg">{t.term}</dt> <dd className="inline">{t.short}</dd>
          </div>
        ))}
      </dl>
      {terms.some((t) => t.long) || note ? (
        <details className="group">
          <summary className="inline-flex min-h-8 cursor-pointer list-none items-center gap-1 font-medium text-accent hover:underline [&::-webkit-details-marker]:hidden">
            Full definitions <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden />
          </summary>
          <dl className="mt-1.5 space-y-1.5">
            {terms
              .filter((t) => t.long)
              .map((t) => (
                <div key={t.term} className="leading-snug">
                  <dt className="inline font-medium text-fg">{t.term}</dt> <dd className="inline">{t.long}</dd>
                </div>
              ))}
          </dl>
          {note ? <p className="mt-2 leading-snug">{note}</p> : null}
        </details>
      ) : null}
    </section>
  );
}
