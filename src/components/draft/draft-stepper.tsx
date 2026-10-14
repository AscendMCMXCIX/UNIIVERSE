import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

const STEPS = ["Draft setup", "Opponent scouting", "Pick / ban"] as const;

/** Where a new draft stands: setup → opponent scouting (optional) → side and pick/ban. */
export function DraftStepper({ current }: { current: 1 | 2 | 3 }) {
  return (
    <ol className="flex items-center gap-2 text-xs sm:text-sm" aria-label="Starting a draft" data-testid="draft-stepper">
      {STEPS.map((label, i) => {
        const n = i + 1;
        const done = n < current;
        const active = n === current;
        return (
          <li key={label} className="flex min-w-0 items-center gap-2" aria-current={active ? "step" : undefined}>
            <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold", done ? "bg-good/20 text-good" : active ? "bg-accent text-bg" : "bg-surface-3 text-fg-subtle")} aria-hidden>
              {done ? <Check className="h-3.5 w-3.5" /> : n}
            </span>
            <span className={cn("truncate", active ? "font-semibold text-fg" : "text-fg-muted", !active && "max-sm:sr-only")}>{label}</span>
            {n < STEPS.length ? <span className="h-px w-4 shrink-0 bg-border sm:w-8" aria-hidden /> : null}
          </li>
        );
      })}
    </ol>
  );
}
