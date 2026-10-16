import Link from "next/link";
import { ChevronRight, NotebookPen, ScrollText, Swords } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Shortcuts to the profile's improvement tools, after the player's own information: Match History
 * to review games, All Champions for each champion's lanes against each opponent (its window's
 * Matchups) and (on your own profile only) your private Solo Queue Blocks. One quiet row on wide
 * screens; links only.
 */
export function ImproveLinks({ basePath, self }: { basePath: string; self: boolean }) {
  const links = [
    { href: `${basePath}/matches`, icon: ScrollText, title: "Match History", text: "Every game, with both teams, builds and the timeline" },
    { href: `${basePath}/champions`, icon: Swords, title: "Champions & matchups", text: "Open a champion: how your lanes went against each opponent" },
    ...(self ? [{ href: "/overview/blocks", icon: NotebookPen, title: "Solo Queue Blocks", text: "Your private Solo/Duo journal" }] : []),
  ];
  return (
    <nav aria-labelledby="improve-title" className="space-y-2" data-testid="improve-links">
      <h2 id="improve-title" className="text-sm font-semibold text-fg-muted">
        Keep improving
      </h2>
      <ul className={cn("grid grid-cols-1 gap-2", links.length === 3 ? "md:grid-cols-3" : "md:grid-cols-2")}>
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="group flex min-h-14 items-center gap-3 rounded-panel border border-border bg-surface/40 px-3 py-2.5 transition-colors hover:border-border-strong hover:bg-surface-2/60 focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-accent/10 text-accent">
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
