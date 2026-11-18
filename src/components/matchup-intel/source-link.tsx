import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/cn";

/** Joins a link to the punctuation after it: a WORD JOINER, so a comma never starts a line of its own. */
export const NO_BREAK = "⁠";

/**
 * A curated note's source: a link to the page it rests on, in a new tab (cut off from this page and
 * without its address), or its title alone when its address is not an allowed one (the view keeps
 * only https links to the League of Legends Wiki and Riot's own hosts). The page never loads anything
 * from these hosts: they are links only.
 *
 * The link is inline, so a long title wraps like the words around it, and the end of its last word
 * and the icon are held together: never an icon alone at the start of a line, or far from its words.
 * Only the word's last three characters are held, so a word too long for its line ("(Mordekaiser)"
 * at 200% on a 320px phone) can still break before them. (As an inline-flex box, a title that
 * wrapped took the rest of its line, the icon at its far end, and what followed it started the next
 * line.)
 */
export function SourceLink({ source, className }: { source: { title: string; url: string }; className?: string }) {
  if (!source.title) return null;
  if (!source.url) return <span className={className}>{source.title}</span>;
  const title = source.title.trim();
  const at = title.lastIndexOf(" ");
  const last = at > 0 ? title.slice(at + 1) : title;
  const held = Math.max(0, last.length - 3);
  return (
    <a href={source.url} target="_blank" rel="noopener noreferrer" className={cn("touch-target text-accent underline underline-offset-2 [overflow-wrap:anywhere] hover:text-accent-strong", className)} data-testid="matchup-source-link">
      {at > 0 ? title.slice(0, at + 1) : null}
      {last.slice(0, held)}
      <span className="whitespace-nowrap">
        {last.slice(held)}
        <ExternalLink className="ml-1 inline h-3 w-3 align-[-0.0625rem]" aria-hidden />
      </span>
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}
