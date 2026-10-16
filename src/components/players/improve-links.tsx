import Link from "next/link";
import { ChevronRight, NotebookPen, ScrollText, Swords } from "lucide-react";

/**
 * The profile's improvement tools in one small card: Match History to review games, Matchups for
 * the lanes against each opponent, and (on your own profile only) your private Solo Queue Blocks.
 * Links only; each tool keeps its own page.
 */
export function ImproveLinks({ basePath, self }: { basePath: string; self: boolean }) {
  const links = [
    { href: `${basePath}/matches`, icon: ScrollText, title: "Match History", text: "Every game, with both teams, builds and the timeline" },
    { href: `${basePath}/matchups`, icon: Swords, title: "Matchups", text: "How your lanes went against each opponent" },
    ...(self ? [{ href: "/overview/blocks", icon: NotebookPen, title: "Solo Queue Blocks", text: "Your private Solo/Duo journal" }] : []),
  ];
  return (
    <nav aria-labelledby="improve-title" className="rounded-card border border-border bg-surface/60 p-2" data-testid="improve-links">
      <h2 id="improve-title" className="px-2 pb-1 pt-1.5 text-base font-semibold text-fg">
        Improve
      </h2>
      <ul>
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="group flex min-h-11 items-center gap-3 rounded-panel px-2 py-2 hover:bg-surface-2/60 focus-visible:outline-2 focus-visible:outline-accent">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-accent/10 text-accent">
                <l.icon className="h-4 w-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block text-sm font-medium text-fg">{l.title}</span>
                <span className="block truncate text-xs text-fg-muted">{l.text}</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-fg-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-fg motion-reduce:transition-none" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
