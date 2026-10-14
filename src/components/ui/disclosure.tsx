import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

/** A collapsible section on the native <details> element: works without JavaScript and with the keyboard. */
export function Disclosure({ title, description, children, defaultOpen = false, id, className, testId }: { title: React.ReactNode; description?: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean; id?: string; className?: string; testId?: string }) {
  return (
    <details className={cn("group rounded-xl border border-border bg-surface/60", className)} open={defaultOpen} id={id} data-testid={testId}>
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3 hover:bg-surface-2/50 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-fg">{title}</span>
          {description ? <span className="block text-sm text-fg-muted">{description}</span> : null}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-fg-subtle transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="space-y-4 border-t border-border p-3 sm:p-4">{children}</div>
    </details>
  );
}
