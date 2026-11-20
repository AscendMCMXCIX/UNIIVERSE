import { ExternalLink, ScrollText } from "lucide-react";
import { Fold } from "@/components/ui/fold";
import type { RiotTextReview, Source, Verification } from "@/domain/matchup-intel/types";
import { patchFromVersion, publicPatchName } from "@/domain/patch";
import { formatCount, formatIsoDay } from "@/lib/format";
import { SourceLink } from "./source-link";
import { RIOT_TEXT_LABEL, RIOT_TEXT_NO_NUMBERS_WORDS, dataSourceWords, riotTextProcessWords } from "./wording";

/*
  The page's sources and notices (docs/MATCHUP_INTEL.md, "Compliance"), behind one compact control at
  the dashboard's foot that is always there: its summary line stays visible (that this is a static
  reference with no live tracking, Riot's data and its version, the wiki's licence, and that Riot
  does not endorse it), and one press opens the whole, in this order:
  - Riot's data: the Data Dragon version the abilities come from, and its public patch; each
    champion's own when the two differ (a champion whose file could not be read keeps an older
    record), and said as an offline copy when it is the one committed with the app;
  - when the curated notes on the page were checked, said once when they share the day and patch;
  - the credit CC BY-SA 3.0 asks for (its section 4(c)): the League of Legends Wiki pages the notes
    are written from, each by its title and linked, their authors ("League of Legends Wiki
    contributors"), the licence, linked, how the pages were used ("written in our own words from":
    no text was adapted, so the word "adapted" is never used), and that the wiki does not endorse
    this page. Each page is listed once, folded into one line until opened, so a phone shows the
    whole credit in a few lines;
  - where facts from Riot's ability text appear: that they come from Riot's own text and were
    reviewed automatically, not by a person, and how, from each file's review record (how many
    automated reviewers, the adjudicator, how many automated checkers of the consistency pass; the
    record was added to the reviewed table for the import, from the review's own sentence), and that
    no number in that text is used for them (the ability's details show Riot's description, numbers
    and all, as Riot's);
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
  /** The abilities are the offline copy committed with the app (absent: not). */
  offlineCopy?: boolean;
  sources: readonly FooterSource[];
  curated: { verified: Checked } | null;
  /** Its facts from Riot's text, when the page shows them (absent: none), and how they were reviewed, as the review recorded it. */
  riotText?: { version: string; review?: RiotTextReview } | null;
}

/** The page's view (MatchupPageView), as far as the footer reads it. */
export interface FooterView {
  you: { name: string } | null;
  enemy: { name: string } | null;
  enemyIntel: FooterIntel | null;
  yourIntel: FooterIntel | null;
  /** `briefing` null: its check is too old to show, and with no interaction shown, nothing of it is on the page. */
  matchup: { verified: Checked; sources: readonly FooterSource[]; briefing?: unknown; interactions?: readonly unknown[] } | null;
  /** The game's current patch, when the app knows it (absent: not said). */
  patch?: { current: string | null };
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
  // A briefing whose check is too old is hidden with its interactions: nothing of it is on the page to date or credit.
  const shown = !!matchup && (matchup.briefing !== null || (matchup.interactions?.length ?? 0) > 0);
  return {
    briefing: matchup && shown && you && enemy ? { label: `the ${you.name} vs ${enemy.name} briefing`, verified: matchup.verified, sources: matchup.sources ?? [] } : null,
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

/** One champion's abilities as the footer names their source. */
interface DataSide {
  name: string;
  version: string;
  offline: boolean;
}

/** "Riot Data Dragon 16.22.1 (patch 26.22)", or "an offline copy of Riot Data Dragon 16.22.1 (patch 26.22)". */
const sourceWords = (side: DataSide) => {
  const patch = patchFromVersion(side.version);
  return `${dataSourceWords(side.version, side.offline)}${patch ? ` (patch ${publicPatchName(patch)})` : ""}`;
};

/**
 * Where the abilities shown come from: one version for the page, or each champion's own when they
 * differ; an offline copy says so, and that the game's current patch is not known where it is not.
 */
function DataDragonLine({ sides, currentKnown }: { sides: readonly DataSide[]; currentKnown: boolean }) {
  const first = sides[0];
  const same = !!first && sides.every((s) => s.version === first.version && s.offline === first.offline);
  const unknownPatch = sides.some((s) => s.offline) && !currentKnown ? "; the game's current patch is not known" : "";
  return (
    <p data-testid="matchup-footer-ddragon">
      {!first
        ? "Ability names, icons and base cooldowns come from Riot Data Dragon, read once per game version."
        : same
          ? `Ability names, icons and base cooldowns: ${sourceWords(first)}${unknownPatch}.`
          : `Ability names, icons and base cooldowns: ${sides.map((s) => `${sourceWords(s)} for ${s.name}`).join("; ")}${unknownPatch}.`}
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
      <Fold variant="inline" tone="muted" testId="matchup-footer-wiki-pages" summary={pages.length === 1 ? "The wiki page" : `The ${formatCount(pages.length)} wiki pages`}>
        <ul className="flex flex-wrap gap-x-3 gap-y-1.5 pointer-coarse:gap-y-3" data-testid="matchup-footer-wiki-list">
          {pages.map((p) => (
            <li key={p.key} data-testid="matchup-footer-wiki-page">
              <SourceLink source={p} />
            </li>
          ))}
        </ul>
      </Fold>
    </div>
  );
}

/** The words a static reference is said in: on the summary line, and in full inside. */
export const STATIC_SHORT = "A static reference: no live tracking";
export const STATIC_WORDS = "A static reference: no live tracking, no timers, nothing read from a game in progress.";

/** A review record as the footer can say it: every field of the right type (the page's own reader checks the same). */
function readable(r: RiotTextReview | undefined): r is RiotTextReview {
  return !!r && Number.isInteger(r.automatedReviewers) && r.automatedReviewers > 0 && typeof r.adjudicated === "boolean" && Number.isInteger(r.consistencyCheckers) && r.consistencyCheckers >= 0 && r.checkedByPerson === false;
}

/**
 * The facts from Riot's text on the page: where they come from, and how they were reviewed, from
 * each champion's review record: said once when the records agree, for each champion where they
 * differ, and left out for any record that cannot be read (nothing is said that no record states).
 */
function riotTextSentence(sides: ReadonlyArray<{ name: string; version: string; review?: RiotTextReview }>): string | null {
  if (!sides.length) return null;
  const list = [...new Set(sides.map((s) => s.version))];
  const head = `Kinds of mechanic from Riot's ability text (its descriptions and tooltips, Data Dragon ${list.join(" and ")}), each with the clause it quotes: ${RIOT_TEXT_LABEL.charAt(0).toLowerCase()}${RIOT_TEXT_LABEL.slice(1)}.`;
  const known = sides.filter((s) => readable(s.review));
  const first = known[0];
  let process = "";
  if (first && known.every((s) => JSON.stringify(s.review) === JSON.stringify(first.review))) process = ` ${riotTextProcessWords(first.review!)}`;
  else if (known.length) process = known.map((s) => ` ${s.name}'s: ${riotTextProcessWords(s.review!)}`).join("");
  return `${head}${process} ${RIOT_TEXT_NO_NUMBERS_WORDS}`;
}

export function MatchupFooter({ view, legal }: { view: FooterView; legal: string }) {
  // The enemy's first, then yours (once for a mirror); only versions that are versions.
  const intels = [view.enemyIntel, view.yourIntel?.champion.id !== view.enemyIntel?.champion.id ? view.yourIntel : null];
  const sides = intels.flatMap((i): DataSide[] => (i && typeof i.dataVersion === "string" && VERSION.test(i.dataVersion) ? [{ name: i.champion.name, version: i.dataVersion, offline: i.offlineCopy === true }] : []));
  const { briefing, enemy, you } = notesOnPage(view);
  const checked = checkedSentence([briefing, enemy, you].filter((n): n is NotesOnPage => !!n));
  const pages = wikiPages([enemy, you, briefing]);
  const riotText = riotTextSentence(intels.flatMap((i) => (i?.riotText && VERSION.test(i.riotText.version) ? [{ name: i.champion.name, version: i.riotText.version, review: i.riotText.review }] : [])));
  const first = sides[0];
  const summaryData = first ? `${dataSourceWords(first.version, first.offline, true)}${sides.some((s) => s.version !== first.version) ? " and others" : ""}` : "Riot Data Dragon";
  return (
    <footer className="text-xs text-fg-subtle" data-testid="matchup-footer">
      <h2 className="sr-only">Sources and notices</h2>
      {/* One press away and always there; the native details element works before the page's code has run. */}
      <Fold
        testId="matchup-sources"
        flush
        bodyClassName="space-y-1.5 p-3 leading-relaxed sm:p-4"
        summary={
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="inline-flex items-center gap-1.5 font-medium text-fg">
              <ScrollText className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Sources and notices
            </span>
            <span className="min-w-0" data-testid="matchup-sources-summary">
              {STATIC_SHORT} · {summaryData}
              {pages.length ? " · League of Legends Wiki, CC BY-SA 3.0" : ""}
              {riotText ? " · Riot's text, reviewed automatically" : ""} · Not endorsed by Riot Games
            </span>
          </span>
        }
      >
        <DataDragonLine sides={sides} currentKnown={view.patch?.current != null} />
        {riotText ? <p data-testid="matchup-footer-riot-text">{riotText}</p> : null}
        {checked ? <p data-testid="matchup-footer-checked">{checked}</p> : null}
        {pages.length ? <WikiCredit pages={pages} /> : null}
        <p data-testid="matchup-footer-static">{STATIC_WORDS}</p>
        <p data-testid="matchup-footer-riot">{legal}</p>
      </Fold>
    </footer>
  );
}
