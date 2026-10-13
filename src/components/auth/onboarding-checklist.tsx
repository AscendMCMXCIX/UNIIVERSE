import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";

export interface ChecklistItem {
  key: string;
  done: boolean;
  title: string;
  detail: string;
  href?: string;
}

/** Short post-signup checklist on My profile: what is done, what is still worth doing. */
export function OnboardingChecklist({ items }: { items: ChecklistItem[] }) {
  const remaining = items.filter((i) => !i.done).length;
  return (
    <Panel className={remaining ? "border-accent/40" : undefined}>
      <PanelHeader title="GETTING STARTED" subtitle={remaining ? `${remaining} step${remaining === 1 ? "" : "s"} left. Each one makes recommendations for you more accurate.` : "All set. Everything below is in place."} />
      <PanelBody>
        <ol className="space-y-1.5">
          {items.map((i) => (
            <li key={i.key} className="flex items-start gap-2 text-sm">
              {i.done ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-good" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-fg-subtle" />}
              <span className={i.done ? "text-fg-muted" : "text-fg"}>
                {i.href && !i.done ? (
                  <Link href={i.href} className="font-medium text-accent hover:underline">
                    {i.title}
                  </Link>
                ) : (
                  <span className="font-medium">{i.title}</span>
                )}
                <span className="ml-1 text-xs text-fg-subtle">{i.detail}</span>
              </span>
            </li>
          ))}
        </ol>
      </PanelBody>
    </Panel>
  );
}
