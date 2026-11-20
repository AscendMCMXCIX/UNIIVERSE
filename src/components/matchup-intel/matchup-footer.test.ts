import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Source } from "@/domain/matchup-intel/types";
import { riotLegal } from "@/components/app-shell";
import { CC_BY_SA_3, MatchupFooter, type FooterView } from "./matchup-footer";

/*
  Matchup Intel's footer as the server renders it (docs/MATCHUP_INTEL.md, "Compliance"): Riot's
  data with its version and patch, when the curated notes were checked, the credit CC BY-SA 3.0
  asks for the League of Legends Wiki's text, that this is a static reference, and Riot's notice in
  full. Each part has its case here; the browser spec (e2e/matchup-intel.spec.ts) checks the same
  footer on the demo.
*/

type Src = Pick<Source, "title" | "url" | "licence">;

const wiki = (slug: string, title = `League of Legends Wiki: ${slug.replace(/_/g, " ")}`): Src => ({ title, url: `https://wiki.leagueoflegends.com/en-us/${slug}`, licence: "CC BY-SA 3.0" });
const riot: Src = { title: "Data Dragon 16.22.1: Renekton", url: "https://ddragon.leagueoflegends.com/cdn/16.22.1/data/en_US/champion/Renekton.json", licence: "Riot Games" };
const checked = { patch: "26.22", checkedOn: "2026-11-16" };
const intel = (id: string, sources: Src[], verified: typeof checked | null = checked, dataVersion: string | null = "16.22.1") => ({ champion: { id, name: id }, dataVersion, sources, curated: verified ? { verified } : null });

const W = wiki("Template:Data_Renekton/Ruthless_Predator", "League of Legends Wiki: Ruthless Predator (Renekton)");
const E = wiki("Template:Data_Renekton/Slice_and_Dice", "League of Legends Wiki: Slice and Dice (Renekton)");
const Q = wiki("Template:Data_Ambessa/Cunning_Sweep", "League of Legends Wiki: Cunning Sweep (Ambessa)");
const PAGE = wiki("Renekton", "League of Legends Wiki: Renekton");

/** Ambessa vs Renekton with both champions' notes and the briefing: pages cited more than once. */
const curatedPair = (over: Partial<FooterView> = {}): FooterView => ({
  you: { name: "Ambessa" },
  enemy: { name: "Renekton" },
  enemyIntel: intel("Renekton", [W, E, riot]),
  yourIntel: intel("Ambessa", [Q]),
  matchup: { verified: checked, sources: [Q, W, E, PAGE] },
  ...over,
});
const uncuratedPair: FooterView = { you: { name: "Garen" }, enemy: { name: "Darius" }, enemyIntel: intel("Darius", [], null), yourIntel: intel("Garen", [], null), matchup: null };

const LEGAL = riotLegal("Rocket Hub");
const render = (view: FooterView, legal = LEGAL) => renderToStaticMarkup(createElement(MatchupFooter, { view, legal }));
// A source link holds its last word's end with its icon in a nowrap span (source-link.tsx), drawn
// joined to the rest of the word: that tag is read without a space, every other tag as one.
const text = (html: string) => html.replace(/<span class="whitespace-nowrap">/g, "").replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ");
/** The inner HTML of the element with this test id (the first; elements of this footer do not nest their own kind). */
const part = (html: string, testId: string, tag = "[a-z]+") => new RegExp(`<(${tag})[^>]*data-testid="${testId}"[^>]*>([\\s\\S]*?)</\\1>`).exec(html)?.[2] ?? null;
const links = (html: string) => [...html.matchAll(/<a [^>]*>/g)].map((m) => m[0]);
const count = (html: string, s: string) => html.split(s).length - 1;

describe("Riot's data and notice", () => {
  it("names the Data Dragon version the abilities come from, with its public patch", () => {
    const t = text(part(render(curatedPair()), "matchup-footer-ddragon")!);
    expect(t.trim()).toBe("Ability names, icons and base cooldowns: Riot Data Dragon 16.22.1 (patch 26.22).");
  });

  it("says where the abilities come from, without a version, when none is stored or the stored one is not a version", () => {
    for (const dataVersion of [null, "", "not a version", "16.22.1<script>"]) {
      const view = curatedPair({ enemyIntel: intel("Renekton", [W], checked, dataVersion), yourIntel: intel("Ambessa", [Q], checked, dataVersion) });
      const html = render(view);
      expect(text(part(html, "matchup-footer-ddragon")!).trim(), String(dataVersion)).toBe("Ability names, icons and base cooldowns come from Riot Data Dragon, read once per game version.");
      expect(html).not.toContain("16.22.1");
    }
    // Only one side chosen: that side's version.
    expect(text(render({ ...uncuratedPair, you: null, yourIntel: null }))).toContain("Riot Data Dragon 16.22.1 (patch 26.22).");
  });

  it("shows Riot's notice in full, with the installation's own name, on every state of the page", () => {
    for (const view of [curatedPair(), uncuratedPair, { you: null, enemy: null, enemyIntel: null, yourIntel: null, matchup: null }]) {
      const html = render(view);
      expect(text(part(html, "matchup-footer-riot")!).trim()).toBe(LEGAL);
      expect(LEGAL).toContain("Rocket Hub isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games");
      expect(LEGAL).toContain("Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc.");
    }
  });

  it("says it is a static reference, with no live tracking, on every state of the page: on the summary line that stays visible, and in full inside", () => {
    for (const view of [curatedPair(), uncuratedPair]) {
      const html = render(view);
      expect(text(part(html, "matchup-footer-static")!).trim()).toBe("A static reference: no live tracking, no timers, nothing read from a game in progress.");
      expect(text(part(html, "matchup-sources-summary")!).trim()).toMatch(/^A static reference: no live tracking · Riot Data Dragon 16\.22\.1 · .*Not endorsed by Riot Games$/);
    }
  });

  it("keeps the whole credit and Riot's notice behind one native disclosure, always on the page, whose summary names it", () => {
    const html = render(curatedPair());
    expect(html).toMatch(/<details[^>]*data-testid="matchup-sources"[^>]*><summary[^>]*>[\s\S]*?Sources and notices[\s\S]*?<\/summary>/);
    const inside = html.split('data-testid="matchup-sources"')[1]!;
    for (const id of ["matchup-footer-ddragon", "matchup-footer-checked", "matchup-footer-wiki", "matchup-footer-static", "matchup-footer-riot"]) expect(inside).toContain(`data-testid="${id}"`);
    expect(text(part(html, "matchup-sources-summary")!)).toContain("League of Legends Wiki, CC BY-SA 3.0");
  });

  it("names the facts from Riot's text, and how they were reviewed, from the review's own record, when the page shows them", () => {
    const review = { automatedReviewers: 2, adjudicated: true, consistencyCheckers: 2, checkedByPerson: false };
    const view = { ...uncuratedPair, enemyIntel: { ...uncuratedPair.enemyIntel!, riotText: { version: "16.22.1", review } } };
    const html = render(view);
    expect(text(part(html, "matchup-footer-riot-text")!)).toBe(
      "Kinds of mechanic from Riot's ability text (its descriptions and tooltips, Data Dragon 16.22.1), each with the clause it quotes: from Riot's ability text, reviewed automatically (not by a person). Reviewed by two independent automated reviewers and an adjudicator, then a consistency pass checked by two more independent automated checkers; no person has checked them. No number in that text is used for these facts.",
    );
    expect(text(part(html, "matchup-sources-summary")!)).toContain("Riot's text, reviewed automatically");
    expect(render(uncuratedPair)).not.toContain('data-testid="matchup-footer-riot-text"');
    // Only what the records say: once where the two champions' agree, each champion's where they differ, nothing where no record can be read.
    const both = (a: typeof review | undefined, b: typeof review | undefined) => render({ ...view, yourIntel: { ...uncuratedPair.yourIntel!, riotText: { version: "16.22.1", review: b } }, enemyIntel: { ...view.enemyIntel, riotText: { version: "16.22.1", review: a } } });
    expect(text(part(both(review, review), "matchup-footer-riot-text")!).match(/Reviewed by /g)).toHaveLength(1);
    const differ = text(part(both(review, { automatedReviewers: 3, adjudicated: false, consistencyCheckers: 0, checkedByPerson: false }), "matchup-footer-riot-text")!);
    expect(differ).toContain("(not by a person). Darius's: Reviewed by two independent automated reviewers and an adjudicator, then a consistency pass checked by two more independent automated checkers; no person has checked them. Garen's: Reviewed by three independent automated reviewers; no person has checked them. No number");
    expect(text(part(render({ ...view, enemyIntel: { ...view.enemyIntel, riotText: { version: "16.22.1" } } }), "matchup-footer-riot-text")!)).toContain("(not by a person). No number in that text is used for these facts.");
    // A record of the first version (a count under another name) is not read as one.
    expect(text(part(both({ automatedReviews: 2, adjudicated: true } as unknown as typeof review, undefined), "matchup-footer-riot-text")!)).toContain("(not by a person). No number in that text is used for these facts.");
  });
});

describe("the League of Legends Wiki's credit (CC BY-SA 3.0)", () => {
  const html = render(curatedPair());
  const credit = part(html, "matchup-footer-wiki", "div")!;

  it("links each page by its title", () => {
    const list = part(credit, "matchup-footer-wiki-list", "ul")!;
    // Each link's own words, without the screen readers' "(opens in a new tab)".
    const titles = [...list.matchAll(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => [m[1], text(m[2]!.replace(/<span class="sr-only">[^<]*<\/span>/g, "")).trim()]);
    expect(titles).toEqual([
      [W.url, "Ruthless Predator (Renekton)"],
      [E.url, "Slice and Dice (Renekton)"],
      [Q.url, "Cunning Sweep (Ambessa)"],
      [PAGE.url, "Renekton"],
    ]);
  });

  it("names League of Legends Wiki contributors as the authors, and links the licence", () => {
    const t = text(credit);
    expect(t).toContain("Their text is by League of Legends Wiki contributors, under CC BY-SA 3.0");
    expect(credit).toMatch(new RegExp(`<a href="${CC_BY_SA_3.replace(/[./]/g, "\\$&")}"[^>]*data-testid="matchup-licence-link"[^>]*>CC BY-SA 3.0`));
    expect(CC_BY_SA_3).toBe("https://creativecommons.org/licenses/by-sa/3.0/");
  });

  it("says how the pages were used, in our own words, and never that their text was adapted", () => {
    expect(text(credit)).toContain("The curated notes are written in our own words from the League of Legends Wiki pages below.");
    expect(text(html)).not.toMatch(/adapt/i);
  });

  it("implies no endorsement, in one short sentence", () => {
    expect(text(part(credit, "matchup-footer-endorsement", "span")!).trim()).toBe("The wiki and its contributors do not endorse this page.");
  });

  it("opens every link in a new tab, cut off from this page, and says so to screen readers", () => {
    const all = links(html);
    expect(all.length).toBe(5);
    for (const a of all) {
      expect(a).toContain('target="_blank"');
      expect(a).toContain('rel="noopener noreferrer"');
      expect(a).toMatch(/href="https:\/\/(wiki\.leagueoflegends\.com|creativecommons\.org)\//);
    }
    expect(count(html, "(opens in a new tab)")).toBe(5);
  });

  it("credits only the wiki's pages: Riot's files are Riot's data, said above", () => {
    expect(html).not.toContain("ddragon.leagueoflegends.com");
    expect(text(credit)).not.toContain("Data Dragon");
  });
});

describe("compact on a phone", () => {
  const html = render(curatedPair());

  it("lists each page once, however many of the notes cite it", () => {
    // W and E are in Renekton's notes and the briefing; Q in Ambessa's notes and the briefing.
    for (const s of [W, E, Q, PAGE]) expect(count(html, `href="${s.url}"`), s.title).toBe(1);
    expect(text(part(html, "matchup-footer-wiki-pages", "details")!)).toContain("The 4 wiki pages");
  });

  it("says the wiki's name once, not in every title or after every link", () => {
    const list = text(part(html, "matchup-footer-wiki-list", "ul")!);
    expect(list).not.toContain("League of Legends Wiki");
    expect(list).not.toContain("CC BY-SA");
    expect(count(html, 'data-testid="matchup-licence-link"')).toBe(1);
    expect(count(html, "do not endorse")).toBe(1);
  });

  it("folds the pages into one line until they are asked for (a native details element, closed)", () => {
    const details = /<details[^>]*data-testid="matchup-footer-wiki-pages"[^>]*>/.exec(html)?.[0];
    expect(details).toBeDefined();
    expect(details).not.toMatch(/\sopen/);
    expect(html).toMatch(/<details[^>]*data-testid="matchup-footer-wiki-pages"[^>]*><summary[^>]*>[\s\S]*?The 4 wiki pages<\/summary><div[^>]*><ul/);
    // The shared Fold: every summary a 44px row on a touch screen.
    const summaries = [...html.matchAll(/<summary class="([^"]*)"/g)].map((m) => m[1]!.split(" "));
    expect(summaries[0]).toContain("min-h-11");
    expect(/data-testid="matchup-footer-wiki-pages"[^>]*><summary class="([^"]*)"/.exec(html)?.[1]?.split(" ")).toContain("min-h-11");
  });

  it("says the day of the check once when the notes on the page share it", () => {
    const t = text(part(html, "matchup-footer-checked")!).trim();
    expect(t).toBe("The curated notes on this page were checked on 16 Nov 2026 against patch 26.22.");
  });

  it("names each set of notes with its own day when they differ", () => {
    const view = curatedPair({ enemyIntel: intel("Renekton", [W], { patch: "26.21", checkedOn: "2026-11-02" }) });
    expect(text(part(render(view), "matchup-footer-checked")!).trim()).toBe("The curated notes on this page were checked: the Ambessa vs Renekton briefing on 16 Nov 2026 against patch 26.22; Renekton's notes on 2 Nov 2026 against patch 26.21; Ambessa's notes on 16 Nov 2026 against patch 26.22.");
  });

  it("counts a mirror's notes once", () => {
    const same = intel("Riven", [wiki("Template:Data_Riven/Broken_Wings")]);
    const html = render({ you: { name: "Riven" }, enemy: { name: "Riven" }, enemyIntel: same, yourIntel: same, matchup: null });
    expect(text(part(html, "matchup-footer-checked")!).trim()).toBe("The curated notes on this page were checked on 16 Nov 2026 against patch 26.22.");
    expect(text(part(html, "matchup-footer-wiki-pages", "details")!)).toContain("The wiki page");
    expect(count(html, 'data-testid="matchup-footer-wiki-page"')).toBe(1);
  });
});

describe("without curated notes, and with malformed ones", () => {
  it("an uncurated pair has no check and no wiki credit, only Riot's data, the static line and the notice", () => {
    const html = render(uncuratedPair);
    expect(html).not.toContain('data-testid="matchup-footer-checked"');
    expect(html).not.toContain('data-testid="matchup-footer-wiki"');
    expect(html).not.toContain("creativecommons.org");
    expect(text(html)).toContain("Riot Data Dragon 16.22.1 (patch 26.22).");
    expect(text(html)).toContain("A static reference: no live tracking");
    expect(text(html)).toContain(LEGAL);
  });

  it("curated notes that cite no wiki page are dated, with no wiki credit", () => {
    const html = render(curatedPair({ enemyIntel: intel("Renekton", [riot]), yourIntel: intel("Ambessa", []), matchup: null }));
    expect(text(html)).toContain("The curated notes on this page were checked on 16 Nov 2026 against patch 26.22.");
    expect(html).not.toContain('data-testid="matchup-footer-wiki"');
  });

  it("leaves out a page with no title, keeps a page whose link was dropped as its title alone, and never throws", () => {
    const view = curatedPair({
      enemyIntel: intel("Renekton", [{ ...W, title: "" }, { title: "A page whose link was dropped", url: "", licence: "CC BY-SA 3.0" }, { title: "Not https", url: "http://wiki.leagueoflegends.com/en-us/Renekton", licence: "CC BY-SA 3.0" }]),
      yourIntel: intel("Ambessa", [], { patch: "", checkedOn: "not a day" }),
      matchup: null,
    });
    const html = render(view);
    const list = part(html, "matchup-footer-wiki-list", "ul")!;
    expect(text(list)).toContain("A page whose link was dropped");
    expect(text(list)).toContain("Not https");
    expect(list).not.toContain("<a ");
    expect(html).not.toContain(W.url);
    // A check with no day or patch recorded says "—" for the day and leaves the patch out.
    expect(text(part(html, "matchup-footer-checked")!)).toContain("Ambessa's notes on —.");
  });
});

describe("each champion's data, and an offline copy", () => {
  it("gives each champion's version when the two differ, the enemy's first", () => {
    const view = curatedPair({ enemyIntel: intel("Renekton", [W], checked, "16.23.1"), yourIntel: intel("Ambessa", [Q], checked, "16.22.1") });
    expect(text(part(render(view), "matchup-footer-ddragon")!).trim()).toBe("Ability names, icons and base cooldowns: Riot Data Dragon 16.23.1 (patch 26.23) for Renekton; Riot Data Dragon 16.22.1 (patch 26.22) for Ambessa.");
  });

  it("says an offline copy is one, and that the game's current patch is not known where it is not", () => {
    const offline = (id: string) => ({ ...intel(id, [], null), offlineCopy: true });
    const view: FooterView = { ...uncuratedPair, enemyIntel: offline("Darius"), yourIntel: offline("Garen") };
    expect(text(part(render(view), "matchup-footer-ddragon")!).trim()).toBe("Ability names, icons and base cooldowns: an offline copy of Riot Data Dragon 16.22.1 (patch 26.22); the game's current patch is not known.");
    expect(text(part(render({ ...view, patch: { current: "26.22" } }), "matchup-footer-ddragon")!).trim()).toBe("Ability names, icons and base cooldowns: an offline copy of Riot Data Dragon 16.22.1 (patch 26.22).");
  });

  it("neither dates nor credits a briefing whose check is too old to show, while the champions' notes keep theirs", () => {
    const html = render(curatedPair({ matchup: { verified: checked, sources: [Q, W, E, PAGE], briefing: null, interactions: [] } }));
    expect(text(part(html, "matchup-footer-checked")!).trim()).toBe("The curated notes on this page were checked on 16 Nov 2026 against patch 26.22.");
    // The Renekton page was the briefing's alone: no longer listed.
    expect(html).not.toContain(`href="${PAGE.url}"`);
    expect(count(html, 'data-testid="matchup-footer-wiki-page"')).toBe(3);
  });
});
