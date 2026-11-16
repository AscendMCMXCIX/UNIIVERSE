import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * A curated note's source: a link to the page it rests on, in a new tab (cut off from this page and
 * without its address), or its title alone when its address is not an allowed one (the view keeps
 * only https links to the League of Legends Wiki and Riot's own hosts). The page never loads anything
 * from these hosts: they are links only.
 */
export function SourceLink({ source, className }: { source: { title: string; url: string }; className?: string }) {
  if (!source.title) return null;
  if (!source.url) return <span className={className}>{source.title}</span>;
  return (
    <a href={source.url} target="_blank" rel="noopener noreferrer" className={cn("touch-target inline-flex items-baseline gap-1 text-accent underline underline-offset-2 hover:text-accent-strong", className)} data-testid="matchup-source-link">
      {source.title}
      <ExternalLink className="h-3 w-3 shrink-0 self-center" aria-hidden />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}
