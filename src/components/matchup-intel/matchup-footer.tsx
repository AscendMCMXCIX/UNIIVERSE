import { ChevronDown, ExternalLink } from "lucide-react";
import type { Source, Verification } from "@/domain/matchup-intel/types";
import { patchFromVersion, publicPatchName } from "@/domain/patch";
import { formatCount, formatIsoDay } from "@/lib/format";
import { SourceLink } from "./source-link";

/*
  The page's quiet footer (docs/MATCHUP_INTEL.md, "Compliance"), in this order:
  - Riot's data: the Data Dragon version the abilities come from, and its public patch;
  - when the curated notes on the page were checked, said once when they share the day and patch;
  - the credit CC BY-SA 3.0 asks for (its section 4(c)): the League of Legends Wiki pages the notes
    are written from, each by its title and linked, their authors ("League of Legends Wiki
    contributors"), the licence, linked, how the pages were used ("written in our own words from":
    no text was adapted, so the word "adapted" is never used), and that the wiki does not endorse
    this page. Each page is listed once, folded into one line until opened, so a phone shows the
    whole credit in a few lines;
  - that this is a static reference;
  - Riot's notice, the same words as the rest of the app, with the installation's own name.
  It types only what it reads, so it takes the page's view as it is and a test can hand it just
  that. Malformed values are left out or said plainly, never thrown on.
*/

/** The licence the League of Legends Wiki's text is under. */
export const CC_BY_SA_3 = "https://creativecommons.org/licenses/by-sa/3.0/";

/** What curated sources' titles start with: the list says it once, above the titles. */
const WIKI_PREFIX = "League of Legends Wiki: ";

/** A Data Dragon version as stored ("16.22.1"). */
const VERSION = /^\d{1,3}(\.\d{1,4}){1,3}$/;

type FooterSource = Pick<Source, "title" | "url" | "licence">;
type Checked = Pick<Verification, "patch" | "checkedOn">;

/** One champion's part of the view, as far as the footer reads it. */
interface FooterIntel {
  champion: { id: string; name: string };
  dataVersion: string | null;
  sources: readonly FooterSource[];
  curated: { verified: Checked } | null;
}

/** The page's view (MatchupPageView), as far as the footer reads it. */
export interface FooterView {
  you: { name: string } | null;
  enemy: { name: string } | null;
  enemyIntel: FooterIntel | null;
  yourIntel: FooterIntel | null;
  matchup: { verified: Checked; sources: readonly FooterSource[] } | null;
}

interface NotesOnPage {
  label: string;
  verified: Checked;
  sources: readonly FooterSource[];
}

/** The curated notes the page shows: the briefing, then the enemy's notes, then yours (not twice for a mirror). */
function notesOnPage(view: FooterView): { briefing: NotesOnPage | null; enemy: NotesOnPage | null; you: NotesOnPage | null } {
  const { you, enemy, matchup, enemyIntel, yourIntel } = view;
  const champion = (intel: FooterIntel | null): NotesOnPage | null => (intel?.curated ? { label: `${intel.champion.name}'s notes`, verified: intel.curated.verified, sources: intel.sources ?? [] } : null);
  return {
    briefing: matchup && you && enemy ? { label: `the ${you.name} vs ${enemy.name} briefing`, verified: matchup.verified, sources: matchup.sources ?? [] } : null,
    enemy: champion(enemyIntel),
    you: yourIntel && yourIntel.champion.id !== enemyIntel?.champion.id ? champion(yourIntel) : null,
  };
}

/** "16 Nov 2026 against patch 26.22" (the patch left out when none is recorded). */
const when = (v: Checked) => `${formatIsoDay(v.checkedOn)}${v.patch ? ` against patch ${v.patch}` : ""}`;

/** When the notes were checked: once when they agree, otherwise each set with its own day. */
function checkedSentence(notes: readonly NotesOnPage[]): string | null {
  const first = notes[0];
  if (!first) return null;
  const same = notes.every((n) => n.verified.checkedOn === first.verified.checkedOn && n.verified.patch === first.verified.patch);
  if (same) return `The curated notes on this page were checked on ${when(first.verified)}.`;
  return `The curated notes on this page were checked: ${notes.map((n) => `${n.label} on ${when(n.verified)}`).join("; ")}.`;
}

interface WikiPage {
  key: string;
  title: string;
  url: string;
}

/**
 * The wiki pages the notes rest on, each once (by its address, or its title where it has none),
 * the enemy's first, then yours, then any only the briefing cites. A page with no title is left
 * out; an address that is not https is not linked (the view already keeps only the wiki's and
 * Riot's).
 */
function wikiPages(groups: ReadonlyArray<NotesOnPage | null>): WikiPage[] {
  const seen = new Set<string>();
  const pages: WikiPage[] = [];
  for (const group of groups) {
    for (const s of group?.sources ?? []) {
      const title = typeof s.title === "string" ? s.title.trim() : "";
      if (s.licence !== "CC BY-SA 3.0" || !title) continue;
      const url = typeof s.url === "string" && s.url.startsWith("https://") ? s.url : "";
      const key = url || `title:${title}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const short = title.startsWith(WIKI_PREFIX) ? title.slice(WIKI_PREFIX.length).trim() : title;
      pages.push({ key, title: short || title, url });
    }
  }
  return pages;
}

function DataDragonLine({ version }: { version: string | null }) {
  const patch = version ? patchFromVersion(version) : null;
  return (
    <p data-testid="matchup-footer-ddragon">
      {version ? `Ability names, icons and base cooldowns: Riot Data Dragon ${version}${patch ? ` (patch ${publicPatchName(patch)})` : ""}.` : "Ability names, icons and base cooldowns come from Riot Data Dragon, read once per game version."}
    </p>
  );
}

/** The credit for the wiki's text: who wrote it, under what licence, how it was used, and the pages. */
function WikiCredit({ pages }: { pages: readonly WikiPage[] }) {
  return (
    <div data-testid="matchup-footer-wiki">
      <p>
        The curated notes are written in our own words from the League of Legends Wiki pages below. Their text is by League of Legends Wiki contributors, under{" "}
        <a href={CC_BY_SA_3} target="_blank" rel="noopener noreferrer" className="touch-target inline-flex items-baseline gap-1 underline underline-offset-2 hover:text-fg" data-testid="matchup-licence-link">
          CC BY-SA 3.0
          <ExternalLink className="h-3 w-3 shrink-0 self-center" aria-hidden />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
        . <span data-testid="matchup-footer-endorsement">The wiki and its contributors do not endorse this page.</span>
      </p>
      <details className="group/pages" data-testid="matchup-footer-wiki-pages">
        <summary className="inline-flex min-h-9 cursor-pointer list-none items-center gap-1 rounded text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:min-h-11 [&::-webkit-details-marker]:hidden">
          <ChevronDown className="h-3.5 w-3.5 shrink-0 transition-transform group-open/pages:rotate-180 motion-reduce:transition-none" aria-hidden />
          {pages.length === 1 ? "The wiki page" : `The ${formatCount(pages.length)} wiki pages`}
        </summary>
        <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1.5 pointer-coarse:gap-y-3" data-testid="matchup-footer-wiki-list">
          {pages.map((p) => (
            <li key={p.key} data-testid="matchup-footer-wiki-page">
              <SourceLink source={p} />
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

export function MatchupFooter({ view, legal }: { view: FooterView; legal: string }) {
  const stored = view.enemyIntel?.dataVersion ?? view.yourIntel?.dataVersion ?? null;
  const version = typeof stored === "string" && VERSION.test(stored) ? stored : null;
  const { briefing, enemy, you } = notesOnPage(view);
  const checked = checkedSentence([briefing, enemy, you].filter((n): n is NotesOnPage => !!n));
  const pages = wikiPages([enemy, you, briefing]);
  return (
    <footer className="space-y-1.5 border-t border-border pt-4 text-xs leading-relaxed text-fg-subtle" data-testid="matchup-footer">
      <h2 className="sr-only">Sources and notices</h2>
      <DataDragonLine version={version} />
      {checked ? <p data-testid="matchup-footer-checked">{checked}</p> : null}
      {pages.length ? <WikiCredit pages={pages} /> : null}
      <p data-testid="matchup-footer-static">A static reference for preparation: no live tracking, no timers, nothing read from a game in progress.</p>
      <p data-testid="matchup-footer-riot">{legal}</p>
    </footer>
  );
}
