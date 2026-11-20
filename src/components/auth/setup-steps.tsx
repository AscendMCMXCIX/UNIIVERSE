import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

/** The first-time setup's steps, in order: two required, then the optional Personalise. */
export const SETUP_STEPS = [
  { key: "name", label: "Your name" },
  { key: "profile", label: "Roles & champions" },
  { key: "personalise", label: "Personalise", optional: true },
] as const;
export type SetupStepKey = (typeof SETUP_STEPS)[number]["key"];

/** Where the player is in the setup: done steps ticked, the current one marked, "Step 2 of 3" for screen readers too. */
export function SetupSteps({ current }: { current: SetupStepKey }) {
  const at = SETUP_STEPS.findIndex((s) => s.key === current);
  return (
    <nav aria-label="Setup progress" className="mt-4" data-testid="setup-steps" data-current={current}>
      <p className="text-xs text-fg-subtle">
        Step {at + 1} of {SETUP_STEPS.length}
      </p>
      <ol className="mt-1.5 grid grid-cols-3 gap-1.5">
        {SETUP_STEPS.map((s, i) => (
          <li key={s.key} aria-current={i === at ? "step" : undefined} className="@container/step min-w-0">
            <span className={cn("block h-1 rounded-full", i <= at ? "bg-accent" : "bg-surface-2")} aria-hidden />
            {/* One flow of text, the tick inline in it: a long name wraps (balanced) in its third of the bar ("Roles &" / "champions" on a phone, G3-2). Where the third is under 4.5rem (a large text size on a small phone) a word no longer fits, so the name keeps one line and ends in an ellipsis, as the page's budget allows, rather than running into the next step. */}
            <span className={cn("mt-1.5 block min-w-0 text-xs leading-tight text-balance @max-[4.5rem]/step:truncate", i === at ? "font-medium text-fg" : i < at ? "text-fg-muted" : "text-fg-subtle")} data-testid="setup-step-label">
              {i < at ? <Check className="mr-1 inline h-3 w-3 align-text-bottom text-accent" aria-hidden /> : null}
              {s.label}
              {"optional" in s && s.optional ? <span className="ml-1 text-fg-subtle max-sm:hidden">(optional)</span> : null}
              {i < at ? <span className="sr-only">(done)</span> : null}
            </span>
          </li>
        ))}
      </ol>
    </nav>
  );
}
