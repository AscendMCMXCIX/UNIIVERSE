# Matchup Intel

"I'm playing this champion against that champion. What do I need to know before entering lane?"
(the owner's request, 16 Nov 2026). On 18 Nov 2026 the owner asked for more: UNIIVERSE runs on a
second monitor while they play, so the lane opponent must be understood within seconds, without
scrolling a long page, and every pair of champions must give a meaningful reference, with notes a
person curated kept clearly apart from what the page assembles. Matchup Intel answers both as a
static reference with its own place in the sidebar (since 18 Nov 2026), for every signed-in
account: on a desktop a dashboard that fits one screen, on a phone a compact column, the essentials
first.

It is not **Matchups**, a player's own games against a lane opponent, which lives in a champion's
window under All Champions ([MATCHUPS.md](MATCHUPS.md)). The two keep their names apart, and this
one's code lives under `matchup-intel`.

## What it is

You pick your champion and the enemy. Every pair gives a reference, and the page says which kind,
in words, every time:

- a **curated briefing** where a matchup file exists for this pair, in this direction, and its
  check is recent enough to show (3 pairs so far);
- otherwise the **assembled reference**: each champion's own facts, grouped by kind and set side by
  side, labelled as put together by the page, with no person having checked the pair.

Around it, always: the enemy's five abilities as tiles, the interactions and level changes that are
recorded, your own champion folded into one line, and the sources and Riot's notice one press away.
The pages, sizes and words below are what the code does; the reasons are the owner's decisions of
18 Nov 2026 (below).

**As it ships (release 4, 19 Nov 2026): the facts from Riot's text (L3) are in the code, switched
off** until the owner has pasted the new registration text in Riot's Developer Portal
([RIOT_COMPLIANCE.md](RIOT_COMPLIANCE.md), "Proposed description for the registration"; For the
owner, step 10). Off, the page reads none of their files and shows nothing of them: no chip, marker,
label or sentence. A champion without checked notes then reads as one with no reviewed facts, its
side of the assembled reference and its tiles' panel each saying so in one line ("No reviewed facts
for Gnar yet: crowd control, mobility, defence and sustain are not recorded."); the curated briefings
and the six champions' checked notes show as before. Switching the layer on is a one-line change:
`RIOT_TEXT_FACTS_ENABLED = true` in `src/server/matchup-intel/riot-text/switch.ts`. The importer, the
173 files and their tests stay as they are, and what this document says of the layer (its chips,
labels, coverage, fit and phones) is what the page does once it is on. The browser tests keep
testing it on, through a cookie that only the in-memory demo reads, never a deployment, and test the
off state too: `e2e/matchup-intel.spec.ts` (Gnar, Yone and Twisted Fate show none of it, a details
window included) and `src/components/matchup-intel/riot-text-switch.test.ts` (no file read).

### The layers and their labels

Every item on the page belongs to one layer and says which, in words, never by colour alone
(`src/domain/matchup-intel/types.ts`):

| Layer | What it holds | Who makes it | What the page says | How much exists (19 Nov 2026) |
| --- | --- | --- | --- | --- |
| **L1** Curated matchup | A threat, an opportunity, one to four lane points and interactions, for one pair in one direction | Written in our own words from wiki pages, approved by the owner, through a pull request (the first batch was drafted and audited by AI agents: Curated notes) | "Curated briefing", "Checked on patch 26.22"; "Not re-checked for 26.23" once a later patch is out | 3 pairs: Ambessa vs Renekton, Gwen vs Ornn, Riven vs Mordekaiser |
| **L2** Checked facts | A champion's facts per ability (crowd control, mobility, defence, sustain, damage, empowerment, interactions, exceptions), how its cooldowns work, level notes | The same | "Checked on patch 26.22"; each fact's tip and the ability's details say who checked it, "Checked notes (drafted and audited by AI agents, not by a person)", with its source page and revision | 6 champions (Ambessa, Gwen, Mordekaiser, Ornn, Renekton, Riven): 99 facts, 24 checked cooldowns, 7 level notes |
| **L3** Facts from Riot's text | The kinds of mechanic Riot's own ability text names (a stun, a dash, a shield, a heal…), each with the clause it quotes and what the review recorded beside it (a qualifier, the conditional marker), and where Riot's two texts differ | Drafted by fixed rules from Data Dragon's descriptions and tooltips, with the reviewers' own additions; reviewed by two independent automated reviewers and an adjudicator, then a consistency pass (which added, removed and changed facts) checked by two more automated checkers; no person. Not every fact was a draft of the rules: 61 of the 1,112 came in as a reviewer's addition or with the consistency pass | "From Riot's ability text, reviewed automatically (not by a person)", the quoted clause one hover, focus or tap away | Imported on 19 Nov 2026: 173 champions, 1,112 facts and 7 places where Riot's texts differ, for the 167 champions without checked notes (Facts from Riot's text). Switched off as it ships, until the registration describes it (above) |
| **L4** Riot's data | Names, icons, ranks, base cooldowns per rank, Riot's short descriptions | Data Dragon, read once per game version, behind the cooldown rules (Cooldowns) | "Riot's data, not reviewed", or why there is no number | All 173 champions, 865 abilities: 624 with a cooldown number (24 checked, 600 Riot's), 241 with the reason there is none |
| **L5** Assembled reference | For a pair with no curated briefing: each champion's L2 facts, else its L3 facts, grouped by kind | Code, on the server, for this pair, in fixed and tested sentences | "Assembled reference"; "No curated briefing for Riven vs Darius yet. Put together from each champion's own facts. No person has checked Riven vs Darius as a pair."; for a pair whose briefing is hidden, "The curated briefing for Ambessa vs Renekton is hidden, above. Put together from each champion's own facts in its place. No person has checked them as a pair." | Every other pair: 29,753 of the 29,756 pairs of two different champions, and the 173 mirrors |

The page never uses the word "verified": no person has checked any of it against its sources
(Coverage, below). The browser specs check that the word is not on the page.

### Coverage

Counted from the committed data on 19 Nov 2026 (Data Dragon 16.22.1, 173 champions):

- **Facts from Riot's text** (imported 19 Nov 2026; switched off as the page ships, until the
  registration describes them: What it is, above, and the counts below are for the layer on): a
  reviewed file for every one of the 173 champions, 1,112 facts, 7 places where Riot's two texts
  differ. They show for the 167 champions
  without checked notes (1,067 facts, 6 disagreements: Riven's Q is the seventh, and her checked notes
  win); the 6 with checked notes show those instead. Among the 1,067: 67 carry a qualifier (4 of them
  from the ability's other text), 42 are conditional and 11 are also worded as another kind. Every
  champion has at least one fact (Kog'Maw one; Aphelios, Brand, Corki, Ezreal, Jinx, Miss Fortune and
  Veigar two; K'Sante the most, 18), and 207 of those champions' 835 abilities have none, which the
  page says in words ("No reviewed facts for this ability"), never as "none".
- **Pairs of two different champions**, in one direction: 173 × 172 = 29,756.
  - curated briefing: 3 (0.01%);
  - assembled, checked facts on both sides: 27;
  - assembled, checked facts on one side and facts from Riot's text on the other: 2,004;
  - assembled, facts from Riot's text on both sides: 27,722 (93.2%);
  - assembled with no facts on a side: none. With the layer off, as it ships, the 2,004 and the
    27,722 are pairs with no facts on one side or on both, each such side saying so in one line.
- **Ambessa, Gwen and Riven as your champion** (the owner's priority): 516 pairs. 3 have a curated
  briefing, 12 have checked facts on both sides, and 501 are against an enemy whose side shows its
  facts from Riot's text.
- **No person has checked any of it.** The 3 briefings and the 6 champions' 99 facts were drafted
  and audited by AI agents, and the owner approved the three briefings "for now" (Curated notes);
  the facts from Riot's text were reviewed by automated reviewers, an adjudicator and automated
  checkers only, and say so on every one.
- **What a pair without a matchup file never gets**: a threat, an opportunity, lane points, or an
  interaction between the two kits. Those come only from a curated file (the owner's decisions 2
  and 3, below).

### The dashboard

On a desktop the page is one screen, read in a glance (`matchup-content.tsx`, `matchup-frame.tsx`):

- **The bar**, one row from a bar 60rem wide: the title; your champion and the enemy as slots, each
  a 36px portrait, "You" in blue or "Enemy" in red (always with the word) and the name, with the
  swap between them; at the far end the game's patch ("Patch 26.22"), where the abilities come from
  ("Riot Data Dragon 16.22.1"), which layer the pair shows ("Curated briefing · checked on patch
  26.22" with a shield, or "Assembled reference" with a stack of layers) and its warnings ("Not
  re-checked for 26.23"; "Changed since the check: two parts hidden", or "…: the briefing is
  hidden", once parts of the briefing or its interactions are hidden because Riot changed an ability
  they rest on; "Ability data from patch 26.22"), and the remembered line under them. A slot opens
  the picker window (Where it is).
- **Left**, the main panel: the curated briefing or the assembled reference (both below). Under it,
  Interactions and Level changes side by side once the dashboard is 40rem wide, the fuller the wider
  (`notesBalance`: a rough count of each panel's words, at least twice the other's to tip it, the
  level notes two thirds of the row where the interactions are only each champion's folded line;
  the page's own words, so nothing is judged by it).
- **Right**, the enemy's five ability tiles, P, Q, W, E and R, always in that order (The ability
  tiles), then your champion, folded into one line ("Your champion: Riven", where its abilities and
  facts come from under it); opened, its own five tiles.
- **At the foot**, across both columns, "Sources and notices": one line that is always on the
  screen, its summary visible, the rest one press away (Compliance).

The two columns start where the page's body is 60rem wide (a container query on the dashboard; the
right one at least 22rem and 0.72 of the left), each as tall as its content: nothing is stretched to
fill the screen. The page takes the dashboard width, `--content-wide` (100rem), as Team Overview and
Leaderboards do, since it is a destination of its own (the owner's decision 12). No part has a fixed
height and nothing is clipped or scrolls inside the page: at a larger text size, or in a smaller
window, the page reflows and scrolls as any page does.

**Measured** on the demo with the review's fixes (Chromium, 100% zoom, the sidebar open, Data Dragon
16.22.1, the demo's pin; 19 Nov 2026), in a sweep of every champion as the enemy against Riven, Gwen,
Ambessa, K'Sante (the most facts from Riot's text) and Briar, and the 30 pairs of the six champions
with checked notes: 880 pages, each loaded once and measured at four sizes, the window resized (on 20
of them, the same numbers as a page loaded at each size). "The essentials" are the enemy's five tiles
and the sources' summary:

| Window | No page scroll | The essentials on the screen | Least room under the sources' summary |
| --- | --- | --- | --- |
| 1920 × 1080 | 880 of 880 | 880 | 186px, Briar vs Mordekaiser |
| 1920 × 950 (a maximised window on a 1080p screen) | 880 of 880 | 880 | 56px, Briar vs Mordekaiser |
| 2560 × 1440 | 880 of 880 | 880 | 428px, K'Sante vs Mordekaiser |
| 1440 × 900 | 874 of 880 | 879 | none: K'Sante vs Mordekaiser's summary is 23px under the fold |

Nothing scrolls inside the page and nothing reaches past its width at any of them. The 30 pairs of
the six champions with checked notes fit all four. **1440 × 900**, a size the overview is not
promised to fit, scrolls on six pages, the tallest sides from Riot's text against a champion with
checked notes and level notes, or Ambessa's against K'Sante's: K'Sante vs Mordekaiser by 58px, K'Sante
vs Ornn by 21px, Ambessa vs K'Sante by 15px, Briar vs Mordekaiser by 7px, and Riven vs K'Sante and Gwen
vs K'Sante by 5px each (the page's own bottom padding); only K'Sante vs Mordekaiser's sources' summary is
off the screen there. `e2e/matchup-intel-dashboard.spec.ts` asserts the fit at 1920 × 1080, 2560 ×
1440, 1920 × 950, 3440 × 1440 and 1440 × 900 for 40 pairs: the curated three and their reverse, Riven
vs Renekton (checked facts on both sides, no file), the complex kits (Aphelios, Nidalee, Jayce, Elise,
Gnar, Kayn, Hwei, Udyr, Kled, Yone with Riot's texts differing, Camille, Twisted Fate with his
placeholders), the pairs with the most facts from Riot's text (K'Sante vs Briar and the reverse, Riven
vs K'Sante, Shyvana vs K'Sante and the reverse, Hwei vs K'Sante), Garen vs Darius, Riven vs Darius,
Ambessa vs Aatrox, and the sweep's twelve tallest pages; at 1440 × 900 it names the seven of them
that scroll there, by no more than measured.

**On production's patch.** A second sweep, on the demo given Riot's Data Dragon 16.23.1 (production's
version on 19 Nov 2026: Riot's 16.23.1 records for every champion, every checked note "Not re-checked
for 26.23", and on Mel's pages her W's fact hidden, as Riot changed its text), final build: every
champion as the enemy against Riven, Gwen and Ambessa, the 30 pairs of the six champions with checked
notes, and K'Sante's and Briar's against those six, 546 pages. No page scroll on all 546 at 1920 ×
1080 (the least room under the sources' summary 175px, Ornn vs Ambessa), 1920 × 950 (45px, the same
page) and 2560 × 1440 (428px, K'Sante vs Mordekaiser); at 1440 × 900 on 526, the essentials on the screen
on 541, the tallest scrolling by 83px (K'Sante vs Mordekaiser), and Riven vs Mordekaiser, the
Production check's pair, by 23px. Before the notes panels' badge moved onto their title row (Interactions
and level changes, above), Briar vs Mordekaiser and K'Sante vs Mordekaiser scrolled at 1920 × 950 by
15 and 13px there.

**What changed to fit.** Before these fixes ten pairs scrolled at 1920 × 950: Mordekaiser vs Ornn and
the reverse by 95px, Ambessa vs Mordekaiser by 55px, Mordekaiser vs Ambessa by 46px, Ambessa vs Ornn
by 34px, Briar vs Mordekaiser and the reverse by 32px, K'Sante vs Mordekaiser and the reverse by 30px,
and Ornn vs Ambessa by 25px; mostly because Level changes listed every level note of both champions
(five between Ambessa, Mordekaiser and Ornn), unfolded. Now the level notes beyond two fold behind
their count, as lane points and interactions do; where the interactions are only each champion's
folded line, the level notes take two thirds of their row (`notesBalance`'s "folds"); the assembled
lines' keys are as tall as their chips (21px, a 25px target: every line 3px lower); and with no
curated links, the assembled reference's sentences sit beside its title. Those ten fit at 1920 × 950,
the least room 56px; at 1440 × 900 the pairs of Ambessa, Mordekaiser and Ornn now fit too (they
scrolled by 42 to 120px).

The page also stays one screen at 1920 × 1080 as the game moves on (Production check, below):
measured with Riot's real Data Dragon 16.23.1 records for Riven and Mordekaiser (production's patch on
19 Nov 2026), Riven vs Mordekaiser has no page scroll at 1920 × 1080 with "Not re-checked for 26.23"
(and at 1920 × 950), none with a part of its briefing hidden because Riot changed Mordekaiser's Q, and
none with its briefing hidden as three patches old (26.25), though at 1920 × 950 those two scroll by
45 and 81px (a hidden part's note, or the assembled reference under the hidden briefing, takes more
room than the part); at 1440 × 900 it scrolls by 23px with "Not re-checked for 26.23", the five tiles
and the sources' summary still on the screen. With every ability of both champions changed (the
briefing hidden whole, every assembled line flagged with Riot's newer number beside it), it runs
190px past 1920 × 1080: the one state measured that does not fit there. (Each state's body and bar
built by the app's own view and put into the demo page, re-measured on the final build.)

Running text is never smaller than `text-xs` (0.75rem: 13.3px at 1920, 15.5px at 2560, the app's
root growing with the window), the chips and badges included; only labels are `text-2xs`, as
STANDARDS.md allows: the uppercase ones (Threat, Opportunity, Danger), the ability keys, a tile's
own source label ("Not reviewed"), an assembled number's own source and the word "source". Each
tile's cooldown numbers are `text-md` (0.9375rem), and the chips of the facts from Riot's text, their
qualifiers and the conditional marker's line are `text-xs` too. `e2e/matchup-intel-dashboard.spec.ts`
asserts the fit, the text sizes and the inner scrollers at the five sizes for its 40 pairs; the
screenshots are kept with the work's notes, not in the repository.

### The curated briefing

Where a matchup file exists for this pair in this direction (`briefing.tsx`), word for word as the
owner approved it (the owner's decision 7):

- Its title, "Curated briefing" (a screen reader hears the pair in the heading), and "Checked on
  patch 26.22", with "Not re-checked for 26.23" once a later patch is out. Once Riot changed an
  ability it rests on, what rests on it is hidden and said in its place (below), and the bar warns
  "Changed since the check: two parts hidden" (the header itself dates only what still shows).
- **The threat and the opportunity** side by side from a panel 34rem wide, each as wide as its
  words need against the other's, between 40% and 62% of the row (`threatShare`), so the longer one
  is not left twice as tall. The threat has a warning sign and the word "Threat" in `warn`, the
  opportunity a crosshair and "Opportunity" in `good`: the colour is never the only signal.
- **In lane**: the first two lane points, two to a row; the rest folded behind their count ("2
  more"), one press away, word for word, never cut (`LANE_SHOWN`).
- Each part ends with chips naming the abilities it rests on ("Renekton W"), which jump to that
  ability's tile and give it the focus; a champion with no tiles on the page (no abilities stored
  yet) gets plain labels, never links that lead nowhere. The jump goes into the address through the
  router's own history, so Back after a later choice shows the pair it was made on. That holds where
  the browser has the Navigation API; without it (Safari before 26.2, Firefox before 147) the jump
  replaces the current entry, as each pair does, so Back leaves the page in one step (docs/MOBILE.md,
  Back).
- A point that rests on an ability Riot changed after the check is hidden, and the page says so in
  its place, naming the ability ("Hidden: Riot changed Renekton W after this briefing was checked.";
  Data, "Hidden points"). More than two patches after its check the whole briefing is hidden, and
  says why (Data, "Freshness"); the assembled reference then follows it.

### The assembled reference

For every pair without a curated briefing, or whose briefing is hidden whole (`assembled.tsx`,
`src/domain/matchup-intel/kit.ts`; the owner's decisions 1 to 3):

- **Its header**: "Assembled reference" (never called a briefing), the curated pairs that do exist
  for your champion as links ("Curated for Riven: Riven vs Mordekaiser"; the pair on the page is never
  one of them), and two sentences: "No curated briefing for Riven vs Darius yet." and "Put together
  from each champion's own facts. No person has checked Riven vs Darius as a pair." Where the pair has
  a curated briefing that is hidden (its check too old, or every part resting on an ability Riot
  changed), the panel under that briefing says so instead, never that there is none: "The curated
  briefing for Ambessa vs Renekton is hidden, above." and "Put together from each champion's own facts
  in its place. No person has checked them as a pair." With no curated links, the sentences sit beside
  the title where 20rem are left for them. The bar says "Assembled reference" too, and a screen reader
  hears that no person has checked the pair, or that the briefing is hidden (`announcementWords`).
- **Two sides**, side by side from a panel 40rem wide: **Danger**, with a warning sign on a `warn`
  tint, "Darius's kit, by kind"; **Opportunity**, with a crosshair on a `good` tint, "Riven's
  tools, by kind". A mirror pair has one side, "Both sides". Under its subtitle each side names its
  layer, as the ability panels do: the checked notes' line ("Curated notes: checked on patch 26.22",
  with "Not re-checked for 26.23", "Riot changed one ability after the check: its notes are flagged"
  or "Checked three patches ago: may be out of date" as they apply), or "From Riot's ability text,
  reviewed automatically (not by a person)". Where the side's cooldown numbers are Riot's, it says so
  once, at the subtitle's row's end over the numbers: "Cooldowns: Riot's data, not reviewed".
- **Five groups on each side**, in this order: Crowd control, Burst and power, Mobility, Defence,
  Sustain (`SIDE_GROUPS`); how a cooldown behaves (recasts, charges, refunds, resets, toggles) shows
  on the tiles instead. A group lists the abilities with a fact of its kind in slot order (P, Q, W,
  E, R), and each ability's chips in the kinds' own order: never a ranking. Each line is the
  ability's key (a link to its tile, as tall as the chips: 21px, its target 25px), its chips of that
  kind, and, the first time the ability appears on its side, its base cooldown per rank from its
  tile's line ("14/12/10/8/6 s"; only where that line is one number per rank: `tightCooldownWords`),
  which breaks only after a slash, never inside a number. A line whose ability Riot changed after its
  notes were checked is flagged "Changed since the check", as its tile is, and its number, then Riot's,
  says so after it ("· Riot's data for patch 26.23, not re-checked"): a number from elsewhere than its
  side's line names its own source.
- **Where a side's facts come from**: the champion's checked facts (L2) where it has checked notes,
  else its facts from Riot's text (L3), else none. Checked facts win: a champion with checked notes
  shows only those, and any facts from Riot's text committed for it are left out of its view.
- **What is missing is said in words**, never an empty box that reads as "none": a group with
  nothing, "· None in the checked notes" or "· No reviewed facts of this kind" (no fact of it passed
  the review, which says nothing of what the champion has); a champion with neither layer, "No
  reviewed facts for Darius yet: crowd control, mobility, defence and sustain are not recorded." (no
  committed champion is in that state since the import, but a file that cannot be read would be); an
  ability whose facts from Riot's text are hidden, "Riot's text for W changed after the review: its 2
  facts are hidden." at the side's foot, and on that side a group with nothing shown says only what
  holds outside it, "· No reviewed facts of this kind outside W", since a hidden fact may be of that
  kind and its kind is not shown (the review's finding of 19 Nov 2026); no ability data, "Ability details aren't stored yet", or, for a stored record
  that cannot be read, "Riot's ability data for Darius could not be read", as on the tiles.
- **Facts from Riot's text keep what the review recorded with them** here as on the tiles (below): a
  qualifier on its chip ("Stun · “Mega Gnar”"), a conditional fact named in the owner's marker under
  the ability's chips on its line ("Conditional: see Riot's text (Stun and Pull)"), and where Riot's
  two texts differ, a neutral chip "Riot's texts differ" in the group of the kinds they name, opening
  both quotes. How a cooldown behaves (cooldown refunds among it) shows on the tiles only.
- **Group, never judge.** Nothing chooses a threat or an opportunity, ranks one fact above another,
  joins the two kits in a sentence or pairs an ability of one with an ability of the other by rule.
  Every sentence is fixed, and `wording.test.ts` holds each to `REFUSED_WORDS`, the estimate words
  and no "verified"; `coverage.test.ts` renders the page body for 655 pairs over the real data
  (Ambessa, Gwen and Riven against every champion, their mirrors included, 75 champions against
  them, 60 pairs drawn at random and one more mirror), and the three curated pairs both ways, and
  checks that each is the curated briefing or the assembled reference, labelled as such, with five
  tiles and every group saying what it holds. In the browser, `e2e/matchup-intel-dashboard.spec.ts`
  sweeps 40 pairs (20 chosen, 20 drawn at random from the roster by a seeded generator) on a phone
  and a desktop, and `e2e/quality.spec.ts` checks two assembled pairs (Ornn vs Gwen, the fullest,
  and Riven vs Darius) for sideways overflow at 16 sizes and with axe.

### The ability tiles

The enemy's abilities, P, Q, W, E and R, one compact tile each, always in that order and always
visible on a desktop (`ability-list.tsx`):

- the icon (40px, from Data Dragon), the key and the name;
- at the line's end, the base cooldown at each rank in `text-md` figures ("16 / 14 / 12 / 10 / 8 s",
  "13 s at every rank"; one line per form for a champion who transforms), or plainly why there is no
  number ("Cooldown not in Riot's data", "Two abilities share this slot in Riot's data", "Riot's
  data lists charges but not their recharge"…; Cooldowns); where the line comes from is said once in
  the panel's heading when every line with a number shares it ("Cooldowns: Riot's data, not
  reviewed", "Curated notes: checked on patch 26.22"), and on a tile only where its own differs
  ("· Not reviewed" after a passive's "Cooldown not in Riot's data");
- the facts as chips, each with its kind's icon and a word, the kind read out first ("Crowd
  control: Stun"): the checked facts (L2) where the champion has notes, else one chip per kind from
  Riot's text (L3), else none, which the panel's heading says in words; recasts, charges, refunds
  and resets among them, and the checked notes' wait between casts, refunds, resets and recasts in
  one short line under them ("0.3125 s between casts, unaffected by ability haste · Can be cast 2
  more times");
- for a fact from Riot's text, what the review recorded with it, in fixed and tested words
  (`wording.ts`, `fact-chip.tsx`):
  - a **qualifier** on the chip itself, in Riot's words, so the fact reads as holding only then or
    only for them: "Stun · “Mega Gnar”", "Shield · “an ally champion”"; on a cooldown refund it names
    the abilities whose cooldown is cut, "Cooldown refund of “Mantra”" (one without a qualifier
    refunds its own ability's cooldown). In the chip's tip and the Details window its line reads
    "Riot adds “Mega Gnar”" or "Cuts the cooldown of “Mantra”", and names the other text where the
    qualifier is quoted from it rather than from the clause's ("(Riot's tooltip for Dragon Strike)");
  - a **conditional** fact: the owner's fixed marker, once under the ability's chips, naming the
    chips it marks ("Conditional: see Riot's text (Stun and Pull)"), and in the chip's tip after its
    quote ("Conditional: see Riot's text."), one tap away; the page never says the condition in its
    own words (it holds a number or a count, so no number-free words of Riot's name it). One line for
    the ability rather than the marker inside each chip: inside them, K'Sante's four conditional facts
    made each chip a line of its own, and his side 44px taller at 1920 × 950;
  - **where Riot's two texts differ** (their description says one kind, their tooltip another): a
    neutral chip with its icon, "Riot's texts differ", whose tip and Details give both quotes alike, the
    description's first ("Pull, in Riot's description of Fate Sealed: “…”", "Knock-up, in Riot's
    tooltip for Fate Sealed: “…”"), and "Neither is shown as a fact."; no chip of either kind exists
    for that ability, so the page never picks one;
  - **another kind Riot's description words it as** (`alsoDescribedAs`): no chip of its own and never
    counted; in the Details window only, "Riot's description calls it blink: “…”";
  - an ability with **no reviewed fact**: "No reviewed facts for this ability", never "none";
- "Changed since the check" once Riot's data moved after the check, the line then Riot's and the
  notes flagged in the details;
- a Details button (an icon, its name "Details: Obliterate, Q"), which opens the ability's window:
  the cooldown in full and where it comes from, every checked fact with its source page and
  revision, every fact from Riot's text with the clause it quotes and which of Riot's two texts it
  is, the notes' longer words, and Riot's description.

Chip colours follow the kind (`KIND_LOOK`, `GROUP_LOOK` in `fact-chip.tsx`): crowd control `bad`
with a lock, mobility `info` with footprints, defence `blue` with a shield, sustain `good` with a
pulse, damage and empowerment `warn`, interactions `accent` with a link, exceptions neutral with a
warning sign, how a cooldown behaves neutral with a turning arrow. The icon and the word always say
it too. Five tiles in a column, in the app's own panel, are not the game's ability bar: no circular
cooldown overlay, no frame from the game's HUD.

Your own champion's tiles are the same, inside the folded "Your champion" line (a native `details`,
which works before the page's code has run and which a chip's jump opens), whose summary says where
the cooldowns come from once for them all, as the enemy's panel heading does ("Cooldowns: Riot's
data, not reviewed"; a champion with checked notes, "Curated notes: checked on patch 26.22").

### Interactions and level changes

Under the main panel (`matchup-notes.tsx`), each a compact panel that always says what is recorded:

- **Interactions**: the curated matchup's own first, word for word, with chips to what they rest on;
  the first two shown, the rest folded behind their count; their source, a "source" whose tip names
  the page (a 24px target, 44px on a touch screen), said once on the panel's line when they all cite
  one page (Gwen vs Ornn, Riven vs Mordekaiser), else after each (Ambessa vs Renekton cites three). Then
  each champion's own checked interaction and exception facts, folded side by side under one line
  each ("Renekton's interactions and exceptions · 7"), each also a chip on its tile, with a flag
  when any is from an ability Riot changed since the check. None at all: "No interactions recorded
  for this pair: they come only from curated matchup notes and each champion's checked notes." No
  interaction is made up from the two kits.
- **Level changes**: the levels at which something notable becomes possible, for both champions, in
  level order ("Level 6", then "Mordekaiser: Darkness Rise's bonus movement speed rises from 3% to
  6%."), only where a checked note states one, each flagged
  ("Changed since the check") once Riot changes an ability it rests on; their source said once on the
  panel's line when they all share it. The first two show and the rest fold behind their count ("3
  more"), word for word, one press away, as lane points and interactions do (`LEVELS_SHOWN`): two of Ambessa,
  Mordekaiser and Ornn hold up to five level notes between them. None: "No level changes recorded
  for Darius or Riven."

Each panel's line says how fresh what it shows is, as the tiles' heading does: "Not re-checked for
26.23" while the notes' check is one or two patches old, "Checked three patches ago: may be out of
date" after that (the Interactions panel for the matchup's own interactions and each champion's,
Level changes for the notes it lists); nothing while they are current. The badge is the title row's
last item: at its end where the title and its words leave room (Level changes, the wider panel of
its row, at 1920 × 950 and up), else on a line of its own under them, never inside the words. On
production's patch 26.23 a line of its own had made Level changes 27px taller, enough to keep Briar
vs Mordekaiser and K'Sante vs Mordekaiser from fitting 1920 × 950 (19 Nov 2026).

### Progressive disclosure

The dashboard keeps each part to its essentials and puts the rest one step away, never cut:

- **a chip's tip** (the app's one tooltip, `InfoTip`, on hover, focus or a tap): a checked fact's own
  sentence, who checked it ("Checked notes (drafted and audited by AI agents, not by a person)", as a
  level note's source tip and the ability's details say it too) and its source page and revision; a
  kind from Riot's text, the clause it quotes, which
  text, its qualifier's line, the conditional marker where it has one, and "From Riot's ability text,
  reviewed automatically (not by a person)"; "Riot's texts differ", both quotes and that neither is
  shown as a fact. The same words are the chip's accessible description. A tip holds no link (the
  sources are linked in the Details window), and a clause from Riot's text holds no number: each of
  Riot's placeholders reads "[…]" (Twisted Fate's W stuns "for […] seconds", never the 1 to 2 of
  Riot's effectBurn);
- **an ability's Details window** (`details-dialog.tsx`, the app's standard `DetailModal`: the
  whole screen on a phone, a centred window wider up; Escape and Close shut it, and the focus goes
  back to the button): everything the tile leaves out, the sources linked; for the facts from Riot's
  text, each kind with its marker, its quote and which text, its qualifier's line, and the other kind
  Riot's description words it as ("Riot's description calls it leap: “…”"), then where Riot's texts
  differ, both quotes and "Neither is shown as a fact.";
- **folds**, native `details` elements: the lane points beyond two, the matchup's interactions beyond
  two, each champion's interactions and exceptions, your champion, the wiki's pages, and the sources
  and notices;
- **the sources and notices**: their summary always on the screen (Compliance).

### On a phone

One column, the essentials first: the bar (the title, the two slots and the swap, the patch line,
the remembered line), then the main panel, the interactions, the level changes, the enemy's tiles,
your champion and the sources. The slots are compact (a small portrait above the label and the name
on a 320 or 375px phone, beside them from a row of 22rem, a 384px phone), so the briefing's threat
starts on the first screen: whole at 390 by 664, its first line at 320 by 568, above the tab bar
(`e2e/matchup-intel.spec.ts`), and the assembled reference's Danger side starts there too: its label
and whose kit it is, and at 390 by 664 (375 by 667 and 360 by 640 alike) its first group. At 320 by
568 the side's lines that say where its facts and its numbers come from (since the review of 19 Nov
2026, two lines each there) put its first group 38px under the tab bar when your champion has
curated pairs, whose link takes a row of the header (Riven vs Darius). A tile puts its
icon beside the key, the name and the cooldown and its chips under them; under a tile 24rem wide
the cooldown takes a line of its own, and under 16rem (a phone at a large text size) a smaller copy
of the icon starts the key's line and the words take the tile's whole width. At a large text size
the slots stand one above the other with the swap between them (under a row of 17.5rem: 200%, 150%
on a 393px phone, 125% up to 375px wide), a level note puts its level above it, and the assembled
reference's chips go under the key unless 8rem are left beside it; under 9rem (a 320px phone at
200%) the briefing's and the assembled sides' labels drop their icon and take a narrower padding. At
200% on a 320px or a 390px phone nothing on the page is cut or reaches past its box, in every state
and in the picker window: a word too long for its line breaks rather than being cut, and a button's
words wrap.

Measured on 19 Nov 2026 (Chromium, the demo): no page is wider than the phone at 320, 375, 390 and
393px upright or 852px held sideways, at 100%, 150% and 200% text. With the facts from Riot's text
imported, Riven vs Mordekaiser is 2,421px tall at 390px (4,837px before the redesign, 2,456px before
the chips' rows were made overlap-free, below) and Garen vs Darius 1,984px (1,958px before the
redesign; 1,420px while neither side had facts), Briar vs K'Sante, the most facts on both sides,
2,452px.

**Facts from Riot's text on a phone** (19 Nov 2026): a chip with a qualifier wraps its words inside
the chip, its lines starting at the left ("Heal · “Briar can reactivate this ability while frenzied”"
over two lines on a 320px phone); a conditional fact's marker is one line under the ability's chips;
"Riot's texts differ" is one chip, its tip a tap away like every chip's. A chip is its badge's own
box, and the rows of chips touch with no gap between them, so a chip that wraps (at a larger text
size, or a long qualifier) pushes the next row down instead of overlapping it, as the chips of
checked notes did at 150% and 200% text before (the tip's 24px line box with negative margins); each
chip's target still reaches 24px, 44px on a touch screen, with a pseudo-element that takes no room.
On a touch screen the rows stand 12px apart and the chips 6px (`CHIP_ROWS`), and so do the assembled
lines, the chips to what a part rests on and the two interaction folds (16px), so no control's 44px
area covers another's box: a tap lands on what was tapped (before, a tap at the centre of "Bonus AD
for 15 s" could open the chip above it, and axe's WCAG 2.2 target-size rule found serious faults).
`e2e/matchup-intel.spec.ts` samples every control's box on the phone and the touch tablet, with every
fold open, for Riven vs Mordekaiser, Riven vs Darius, Ornn vs Gwen and Ambessa vs Aatrox, and runs axe
at WCAG 2.2 AA there. A tight cooldown on an assembled line breaks only after a slash: at 200% on 390
and 393px phones "13/12.5/12/11.5/11 s" broke as "…/1" and "1 s" before; the same spec checks every
numbered line of ten pairs at 320, 375 and 393px.
Measured at 320 × 640, 375 × 667 and 393 × 852 upright and 852 × 393 held sideways, at 100%, 150% and
200% text, for Briar vs K'Sante, Riven vs Yone, Gwen vs Caitlyn (the longest qualifier), Garen vs
Darius, Riven vs Gnar and Riven vs Mordekaiser (72 page states): nothing wider than the phone, no chip
overlapping another, nothing scrolling inside the page, and the chips, markers and their words never
under `text-xs`; `e2e/matchup-intel.spec.ts` asserts the same, and that nothing is cut or reaches past
its box, for the first three pairs at those sizes. The large-text
audit (nothing chosen, either side alone, the three curated pairs and two of them reversed, Riven
vs Darius, Garen vs Darius, Heimerdinger vs Aphelios and the mirror Riven vs Riven: 12 states at
320, 375, 393 and 852px, at 150% and 200%, in both ways of emulating a larger text size:
RESPONSIVE.md) finds no text cut, no word broken mid-word and no overflow in any of its 96 page
states each way.

The page also has a state for each of these:

- **Nothing chosen**: what to do, and links to the curated briefings so far.
- **One side chosen**: with only the enemy, its tiles and a way to choose your champion; with only
  yours, a prompt to choose the enemy and the curated matchups for your champion.
- **No ability data stored yet** for a champion: "Ability details aren't stored yet", and that they
  are read from Riot's Data Dragon once per game version.
- **A stored record that cannot be read** (not in the shape the page reads): said as that ("Riot's
  ability data for Riven could not be read"), never as missing.
- **Ability data older than the current patch**: said once, above the tiles, naming whose it is
  when only one champion's is ("Riven's ability data is from patch 26.22; the game is on patch
  26.23."), and in the bar ("Ability data from patch 26.22"): a champion whose file could not be read
  keeps its older record beside the other's current one.
- **The offline copy** (stored when Riot's servers could not be reached on a first start): the
  panel says "Offline copy of Riot Data Dragon 16.22.1", and the sources that the game's current
  patch is not known.
- **A choice on its way**: the slots show it at once, a line under them says what is loading
  ("Loading Riven vs Mordekaiser…"), and the page under them dims and is out of reach (`inert`)
  until the server's page arrives. A curated pair's link does the same. A screen reader then hears
  what came ("Riven vs Mordekaiser: curated briefing, checked on patch 26.22. Mordekaiser's
  abilities follow."; for any other pair, "No curated briefing for Riven vs Darius yet: an assembled
  reference from each champion's own facts, which no person has checked as a pair. Darius's
  abilities follow."), from a live region that is always there. While a picker window is open the
  line keeps the words it had, and keeps them for 200ms after the window has gone (longer than its
  closing motion, so the page under it is back in a screen reader's reach), then says what is new; a
  window closed without a pick says nothing (`heldStatus` in `matchup-frame.tsx`).
- **The page failed** (the roster or the abilities could not be read, with nothing cached to stand
  in): "Matchup Intel could not load", with Try again (the page read afresh) and Start again (no
  champions chosen), inside the app's frame, its sidebar entry still marked (`error.tsx` beside the
  page).
- **A champion the roster does not know** in the address: it is left out and the page says so,
  never repeating what the address said. A repeated parameter (`?vs=a&vs=b`) reads its first value.

The data comes in layers kept apart, so each can improve without the others: champion intelligence
(Riot's Data Dragon for every champion, the checked facts, the facts from Riot's text) and matchup
intelligence (curated notes for your champion against one enemy, in that direction only).

The page writes nothing of its own about a pair: it shows Riot's Data Dragon data, labelled "not
reviewed" where nobody has checked it, the curated notes committed with the code, the reviewed facts
from Riot's text once they are committed, and fixed, tested sentences that say which is which. The
notes change only through pull requests. The owner alone curates them, and from the second batch on
writes or checks each file there before it ships. The first batch (16 Nov 2026) was drafted and
cross-checked by AI agents. The owner approved its three briefings "for now", as drafted, and set
the rule under which AI agents then audited and corrected every note; the corrections reworded parts
of those briefings afterwards, and no person has checked each fact against its page (For the owner,
step 2).

## Roles, the bot lane, haste and Riot's tips (S7a, 20 Nov 2026)

The overhaul's S7a (docs/overhaul PLAN.md, S7) sets the page for all five roles, adds the cooldowns
at a chosen ability haste and Riot's own tips, and reads more of the static data the version-check
job already downloads. No new Riot request, no new job, no migration; nothing of it comes from the
facts from Riot's text, so `RIOT_TEXT_FACTS_ENABLED` (still false) governs none of it.

### Roles and their slots

- **A lane selector** in the bar: Top · Jungle · Mid · ADC · Support (`matchup-frame.tsx`,
  `RoleSelector`). The lane last chosen is remembered on this device, under the account's key, with
  the champions (`preferences.ts`).
- **Top, Jungle and Mid** set you against one enemy: two slots, "Your champion" and "Enemy" (at a
  320px phone "You", the screen reader still hearing the whole label). Nothing else is asked for: no
  full team, no jungle input.
- **ADC and Support** set your duo against theirs: four slots, your own role's first ("Your ADC",
  "Your support", "Enemy ADC", "Enemy support"), seen from your role: as ADC, `champion` is your ADC
  and `vs` the enemy ADC; as Support, `champion` is your support and `vs` the enemy support. The pair
  `champion`/`vs` is the lane counterpart, so the curated briefing or the assembled reference is
  for it, as in a solo lane; the other two (`ally`, `vs2`) add their kits.
- **An empty slot** names what it wants ("Choose the enemy support") and keeps its place, so filling
  it moves nothing (the browser spec measures every other slot within 1px).
- **The address** carries the lineup: `?role=adc&champion=&ally=&vs=&vs2=` (`lineupHref`,
  `address.ts`). A solo lane drops `ally` and `vs2`. A reload and a shared link open the same lineup
  (for signed-in members only). An old `?champion=&vs=` link opens as a 1v1 in the lane this device
  used last, else Top.
- **History:** every change (a champion, the swap, the lane) replaces the entry: the lineup is the
  page's state, like a filter, so Back leaves Matchup Intel in one step however many changes were
  made; "Recent" in the picker returns to an earlier champion. (Before S7a each pair was an entry
  where the browser had the Navigation API.) A chip's jump to an ability is still an entry of its own.
- **The swap** trades the sides, in the bot lane both duos.
- **"Copy link"**, an icon button at the title's row end: the page's address with the lineup, to the
  clipboard, or the share sheet on a touch screen that has one (the installed app has no address bar).
- **On a phone**, once the slots have scrolled away, a **pinned pair bar** under the phone's top bar
  (at the very top while that bar hides): the champions as 40px portraits and the swap. A champion is
  changed in two taps, its portrait and the pick, with no scroll back up (the browser keeps the new
  enemy's kit where the reader was); the focus stays on the bar's portrait.
- **The title** is the same size as the other destinations' (`text-2xl`).

### The bot lane's page

Both enemies' kits side by side (from a dashboard 60rem wide), each with its cooldowns; your duo's
two kits folded side by side under them; Riot's tips for all four; and "No curated notes for this
2v2" in the evidence line. Measured on the demo (Jinx and Lulu vs Caitlyn and Lux, the sidebar open):
no page scroll at 1920 × 950 and 1920 × 1080; 293px under the fold at 1440 × 900, with the bar, both
kits and the start of the main panel on the screen.

### Cooldowns at a haste

The enemy's kit header holds the haste choice: 0 (base cooldowns only, the default), 20, 40, 60, or
a whole number typed up to 300, remembered on this device. At a haste above 0 each tile adds one
line under its base line ("At 20 haste: 7.5 / 6.46 / … s · Riot's general rule"); the base line never
changes. Every case says which it is (`src/domain/matchup-intel/haste.ts`):

| Case | What is shown | Mark |
| --- | --- | --- |
| The checked notes mark the cooldown static (`static`) | the base at every haste | "Static: haste doesn't shorten it" |
| The checked notes leave it open (`hasteUnknown`: Death's Grasp, from Riven vs Mordekaiser's list of what no saved page states) | the base only | "Whether haste shortens it isn't known" |
| Every other per-rank number (Riot's, or checked) | base × 100 / (100 + haste), to two decimals | "Riot's general rule"; on R "Riot's general rule · ability haste only" (ultimate haste from some runes and items is not counted) |
| Charges' recharge, a passive's own cooldown | the base only | "How haste applies is not in Riot's data" |
| No number | nothing | — |

The rule is Riot's published one (patch 10.23); its tip (the mark "Riot's general rule" opens it, the
shared InfoTip: a tap on a touch screen, hover or focus elsewhere; never a hover-only title) says
Riot's data does not list the abilities it does not apply to and that checked notes cover 6
champions. **Of the 24 checked cooldowns**, the
notes mark none as static (their two static marks are lockouts between casts, said in words), leave
one open (Death's Grasp, base only), and the rule is applied to the other 23: the notes record
nothing that contradicts it, which is not the same as having checked each hasted value. Summoner
spells are never shortened by ability haste ("Summoner spell haste is a separate stat";
`summonerSpellCooldown`). **Never a timer, a countdown or "ready at"**: only the cooldown's length
(game integrity; the browser spec checks the words are absent). `curated.test.ts` checks that every
"whether ability haste shortens …" line in a note has its ability's `hasteUnknown` flag, and no other
ability has one. `haste.test.ts` holds every ability of the 173 to the rule at four haste values.

### Riot's tips

Each enemy's Data Dragon `enemytips` and your side's `allytips`, **verbatim**, in quotation marks,
attributed "Riot's tip (may predate later changes)" (`riot-tips.tsx`). They are read by the ability
sync from the champion files it already downloads (rules format 3, `abilities.ts`: a record stored
under format 2 is read again on the next version-check run; until then the page says the tips "are
not stored yet", never that Riot publishes none). Under the kits, one folded line, "Riot's tips (n)",
so the one-screen fit holds; opened, the first tip per enemy, the rest of the enemies' in one fold and
your side's in another; a champion Riot gives none says "Riot publishes no tip for playing against
X". At 16.22.1, **147 champions have enemy tips and 149 ally tips** (814 tips); `abilities.test.ts`
holds every stored tip byte-equal to Data Dragon's own (the digest,
`tests/fixtures/ddragon-16.22.1-ability-digest.json`, now carries Riot's raw tips beside its
numbers). A tip of more than 600 characters would be left out whole, never cut (none is).

### Words

- `REFUSED_WORDS` (unchanged) holds curated text, kit facts, the assembled reference's fixed
  sentences and S7a's fixed lines (the haste marks, the tips' label, the evidence line).
- **Riot's tips are exempt** as attributed quotes: they are Riot's words ("Try to stay away from
  walls. Ornn is much less strong if he cannot stun you."), and the byte-equal test makes sure nothing
  of the app's own hides in the exemption. 100+ of them use a refused word.
- **`EVIDENCE_REFUSED_WORDS`** (`refused-words.ts`, `evidence-words.test.ts`), for the sentences
  built from the team's games (S7b): "you/your" only as the possessive of the viewer's own games ("In
  your games", "4 of your 9 games"), "won/lost" only as counted results; instructions, verdicts (win
  as a verdict, best, counter, recommended, core build) and absolutes stay refused.

### Evidence

Until S7b counts the team's own games, the page claims none: the tips' fold ends with "Runes, items
and skill order: No high-elo evidence (not collected)", and in the bot lane "No curated notes for
this 2v2". No build, rune page or skill order is suggested anywhere.

### Static data for the build evidence

`compactAssets` (`src/server/riot/static/assets.ts`, rules format 2: stored maps of format 1 are read
again on the next run) now keeps, from the `item.json`, `summoner.json` and `runesReforged.json`
version-check already downloads: each Summoner's Rift item's gold, tags, `from`/`into`, depth and the
ability haste its `<stats>` name; each summoner spell's base cooldown; each rune tree's slots.
**Measured at 16.22.1: 72 Summoner's Rift items (map 11, ids of up to four digits) name ability haste
in their stats, 65 of them purchasable** (the plan's estimate was 70); the parser reads all 72
(`assets.test.ts`, against Riot's own text in `tests/fixtures/ddragon-16.22.1-item-haste.json`,
written by `scripts/matchup-intel/build-item-digest.mjs`). The page shows none of it yet: S7b's
build evidence uses it.

## Where it is

- **Its own sidebar entry**, **Matchup Intel** with the swords, between Team and Resources (the
  owner's decision of 18 Nov 2026; until then it was Resources' second tab, beside the Library).
  The address is the one it always had, `/resources/matchups`, so every link and deep link
  (`?champion=…&vs=…`) opens as before and nothing redirects (`MATCHUP_INTEL` in `src/lib/nav.ts`,
  `MATCHUP_INTEL_PATH` in `address.ts`). The entry is marked on the page whatever pair it shows,
  and Resources (the Library, `/resources`, one page now) only on the Library: Resources is current
  only on its own address (`isActivePath`). Neither page has tabs, so each is listed once.
  - Every bar holds the same four destinations, in the sidebar's order (navigation N1, 19 Nov 2026;
    `destinations()` in `src/lib/nav.ts`): a tablet's top bar, a phone's bottom bar (where it shows
    as "Intel" when the bar has no room for its whole name, read out in full) and its compact bar
    held sideways, and the installed app's shortcuts. On a phone it is one tap, a tab of its own
    (before, it was a row of the account screen behind the avatar: two taps). The tab on its own page
    goes back to the top and keeps the pair.
  - On a phone Matchup Intel has no Back: it is a destination, where you start (`phoneParent`; before
    navigation N1, opened directly it said "‹ Team"). Each pair chosen is an entry in the
    browser's history, so the browser's Back steps through them; the top bar's Back, named after the
    page before Matchup Intel, goes past them to that page (`backSteps`). That needs the browser's
    Navigation API (Chrome, Safari from 26.2, Firefox from 147): without it the page cannot see
    those entries, so each pair replaces the entry instead, and both Backs leave the page in one step
    (`historyShowsEntries`).
- **The address** carries the choice: `?champion=<id>&vs=<id>`, Data Dragon ids, the same names as
  the champion window's. Each id is checked against the roster on the server. An id that is not on
  it is dropped. The id may also be written as a name, in any case, with accents or punctuation
  ("wukong" finds MonkeyKing). Links and attributes only ever carry the roster's own ids.
- **From a champion's window** (All Champions, Roles & champion pools): the **Matchup Intel** link
  in its scope row opens the page with that champion as yours. While Matchups is open with a lane
  opponent, the link carries the opponent too.
- **The pickers**: your champion and the enemy side by side, with the swap between them. Each slot
  opens a picker window (`DetailModal` "standard", the whole screen on a phone); a tap on a slot,
  or on the page's prompt for it, before the page's code has run is kept and opens it once the
  code runs (`data-early`, `src/components/early-taps.ts`). The window has:
  - a 16px search that filters as you type, by name, ignoring case, accents, spaces and
    punctuation ("kha" finds Kha'Zix, "wu" Wukong, "dr m" Dr. Mundo), then by a name's initials
    ("tf" Twisted Fate, "mf" Miss Fortune, "lb" LeBlanc) and a short reviewed list of nicknames
    ("j4", "asol", "ww", "gp": `NICKNAMES` in `search.ts`), after every name match. The count of
    what it found is said to screen readers as it changes. Its band stays pinned at the window's
    top, over the body's padding, so no portraits show above it. It is not the shared
    `SearchInput`, on purpose: 16px at every width (a tablet's Safari zooms into smaller text), a
    44px clear button with a mouse too, which hands the focus back to the field, and Escape that
    clears before it closes;
  - with nothing typed, the champions chosen lately on that side (Recent);
  - for the enemy, the curated matchups that exist for your champion;
  - then the whole roster (`ChampionGrid` without its own toolbar).

  Enter takes the first match. Escape clears the search, then closes the window. A choice goes into
  the address at once (`router.push`; `router.replace` where the browser has no Navigation API): the slots show it while the page under them dims until the
  server's page arrives (a curated pair's link goes the same way, `PairLink`).
- **Remembered on this device, for this account**: the champion you choose as yours, and the last
  eight champions on each side. They live in `localStorage` under `uniiverse.matchup-intel.v1`
  followed by the signed-in account's marker (`perAccountKey`, `src/components/account-storage.ts`,
  as a picker's recent champions are), so two people who use one browser in turn never see or
  forget each other's; champion ids only, never sent anywhere. With no champion of yours in the
  address, the page offers the remembered one (Use or Forget) and never assumes it. While it is
  shown, the page says it is remembered. A champion that came from a link can be remembered with
  one tap (a button that looks like one, with a bookmark icon).

**The code:**

| What | Where |
| --- | --- |
| The page and its loading state | `src/app/(app)/resources/matchups/` |
| The view, built on the server (`buildMatchupPageView`, its parts injected; `loadMatchupPage` wires the real ones) | `src/server/matchup-intel/view.ts` |
| The facts from Riot's text: the committed files, their loader and its checks | `src/server/matchup-intel/riot-text/`, `riot-text.ts` |
| The dashboard's parts: the bar and pickers, the curated briefing, the assembled reference, the tiles, the notes, the sources, the page's words | `src/components/matchup-intel/` |
| The shared types, the cooldown rules, the grouping of a champion's facts (`kit.ts`) and the refused words | `src/domain/matchup-intel/` |
| The import of the reviewed facts, and the offline copy of Riot's abilities | `scripts/matchup-intel/` |

**What a visit costs** (docs/HOSTING_USAGE.md, "Vercel Active CPU"):

- The page is rendered on each request. It reads:
  - the session (its own `requirePageAccess`);
  - the cached roster, current patch and list of patches (a few dozen short rows, cached for a
    minute, to count the patches since a check);
  - the stored abilities of at most the two champions chosen;
  - Branding's names, from the cache the app's frame has just filled.
- The curated notes are committed with the code, so reading them costs no request. The facts from
  Riot's text are committed files too, one per champion, loaded on demand (one dynamic import each)
  for the two champions chosen only: no request and no query.
- The assembled reference is pure functions over that same view: no extra read.
- No component fetches data in the browser (choosing a pair is a navigation, rendered on the
  server), and there is no `next/image`. Outside the app itself, the browser loads only the champion
  portraits and ability icons, from Data Dragon's CDN (below), as every page with champion art does.
- Links to a pair and to a champion use `prefetch={false}`.
- The curated dataset and the facts from Riot's text never reach a browser bundle
  (`src/app/client-imports.test.ts`): only plain view data does.

## Data

- **Ability names, icons, ranks and base cooldowns** come from Riot's Data Dragon. The game-data job
  stores them once per game version, and the page reads them per champion with
  `loadChampionAbilities` (`src/server/matchup-intel/abilities.ts`). Each ability's record holds
  its spell id, name, icon, ranks, cooldown array, charges (Data Dragon's `maxammo` above 0, else
  none), Riot's short description and a short hash of Riot's whole text for it (`textHash`, never
  the text: Facts from Riot's text). How they are stored and refreshed:
  [DATA_PIPELINES.md](DATA_PIPELINES.md), "Riot static data (Data Dragon)".
- **Icons** are linked from `https://ddragon.leagueoflegends.com/cdn/<version>/img/spell/<file>`
  (`img/passive/` for the passive), 40px on a tile (32px where a narrow tile puts it on its key's
  line) and lazily loaded. The key on a plain tile stands in where
  one cannot load. Champions' portraits come from the same CDN (`img/champion/`), with two letters
  standing in where one cannot load.
- **Curated notes** (`src/server/matchup-intel/curated/`: `getChampionNotes`, `getMatchupNotes`,
  `curatedEnemiesFor`) are committed and reviewed; see Curated notes below. Every fact names its
  source, and each set of notes says the patch it was checked on. A source keeps its link only when
  it is an https address on `wiki.leagueoflegends.com`, `ddragon.leagueoflegends.com` or
  `developer.riotgames.com` (`safeSourceUrl`); any other link is dropped and the title stays.
  Every source gives its `kind` (`wiki-ability`, `wiki-champion`, `wiki-reference`, `ddragon`,
  `riot-docs`), and every wiki source the `revisionTime` of the revision read; the ability details
  give that revision's day ("revision of 23 Sep 2026").
- **Facts from Riot's text** (`src/server/matchup-intel/riot-text/`): the reviewed kinds of mechanic
  for champions without checked notes, each pinned to Riot's text (Facts from Riot's text, below):
  one file per champion, all 173, imported on 19 Nov 2026, loaded only for the champions on the page
  that have no checked notes.
- **Facts** say who has the effect (`appliesTo`: `self`, `target`, `allies`, `area`; the notes
  always give it). A chip's tip and the ability's Details window add it only where the fact's kind
  would not say it: crowd control and damage fall on the target, the other kinds on the champion
  ("Fails on spell shields (on the target)"). Tags from `FACT_TAGS` (`src/domain/matchup-intel/types.ts`)
  name the mechanics a fact is about. The page carries them as data (`data-tags` beside each chip),
  not as words: the chip's own label says the same.
- **The patch**: the game's current patch by its public name (26.22 for Data Dragon 16.22.1),
  unknown while the game data is the offline fixture. It comes from Data Dragon's own list of
  versions, through the version check, so it is never ahead of Data Dragon. Each champion's ability
  data is judged by its own version (a champion whose file could not be read keeps an older record
  beside the other's current one): data older than the current patch is said once above the
  abilities, naming whose it is when only one champion's is, and the sources give each champion's
  version when they differ. Records from the committed offline copy are said to be that.
- **Freshness** of curated notes, against Riot's record of each ability they cover (`abilityChanges`,
  `abilityFreshness` and `weakestFreshness`, `src/domain/matchup-intel/cooldown.ts`). What is
  compared is the cooldown array (`ddragonCooldown`) and, where the notes record them, the spell
  id, name, ranks and charges (`ddragonIdentity`): a rework can keep its cooldowns (Mel's Q was
  renamed in 16.22.1 with the same array). The identity is written out, not hashed, so a reviewer
  can read it against Riot's file; a hash would also move with fields the page never shows. The
  description is not compared: the stored one is the index's cleaned text, so a change in the
  cleaning would read as Riot's.
  - checked on the data's own version, and nothing compared changed: "current";
  - checked on an earlier version, and nothing compared changed since: said only as "Checked on
    patch N";
  - the data held is older than the check: a difference is the data's age, not Riot's change, so
    this too is said only as "Checked on patch N", and the notes stay the line;
  - something compared changed after the check: "changed since". The ability's line is then only
    what Riot's data supports (Cooldowns, below), and its notes follow under "Notes from patch
    26.22 · may be out of date: Riot changed its cooldown since", their cooldown as checked
    included ("As checked: 16 / 14 / 12 / 10 / 8 s · starts when the effect ends"). The champion's
    line says how many changed ("Riot changed one ability after the check: its notes are
    flagged").

  A briefing's freshness comes from the abilities it rests on, judged against the matchup's own
  check (`matchupAbilityFreshness`, `src/server/matchup-intel/view.ts`). A matchup holds no numbers
  of its own, only the Data Dragon version it was checked on; the numbers a person took are the
  champion notes', on their own version. So, for each ability:
  - the data shown is the matchup's version: "current", whichever version the champion's notes
    were checked on;
  - the champion's notes took their numbers on the matchup's version or later, and Riot's record
    moved since them: the change came after the matchup's check, so it is "changed since";
  - anything else (notes checked before the matchup, data older than the notes, no notes) is not
    known, and is said only as "Checked on patch N".

  `curated.test.ts` holds a matchup and the notes of each champion it rests on to one Data Dragon
  version (Curated notes, Rules), so for the committed notes the numbers the matchup was checked
  with are exactly those notes', and "changed since" means Riot moved them after both checks. The
  cases for notes on another version only keep notes from anywhere else from claiming more than is
  known.

  Riot's record cannot show most changes (a crowd-control duration or a range sits behind its
  tooltips' placeholders), so a check also ages by patch, whatever Riot's records say (`recheckOf`
  and `MAX_PATCHES_UNCHECKED`, `view.ts`). The newest patch the page knows is the later of the data's
  (both champions', for a matchup) and the game's current one; the patches since the check are
  counted by the patches the app has stored (`listPatchesDesc`), never fewer than the numbering
  shows (16.22 to 16.25 is 3; across a season, 16.22 to 17.2 is at least 2), so a new season never
  reads as hundreds of patches. With the game's patch not known (the offline fixture) nothing is
  counted. Then:
  - one or two patches since: everything shows, and each label says nobody has checked it again
    for that patch: "Not re-checked for 26.23" beside the briefing's and the notes' "Checked on
    patch 26.22" (the tiles' heading, your champion's summary, a checked side of the assembled
    reference, and the Interactions and Level changes panels' lines), in the bar, and "Checked on
    patch 26.22 · not re-checked for 26.23" under each checked cooldown;
  - more than two (the default the code follows; the owner may change it, For the owner): the
    briefing is hidden whole, its words kept on the server ("This briefing is hidden: it was
    checked on patch 26.22, three patches ago, and not since. It shows again once a person checks
    it."), and its interactions with it ("One interaction is hidden: …"), and the assembled
    reference under it says the briefing is hidden above, never that there is none; the champion
    notes still show, flagged ("Checked three patches ago: may be out of date"), on their panel's
    line, on a checked side of the assembled reference, and on the Interactions and Level changes
    panels' lines.

  A level note names the abilities it rests on (`basedOn`), and once Riot changes one of them after
  the check, it is flagged as that ability's notes are ("Changed since the check").

- **Hidden points.** A briefing point, the threat, the opportunity or one of the matchup's
  interactions that rests on an ability "changed since" its check is hidden (`matchupIntel`,
  `view.ts`): its words stay on the server, and the page says in their place what changed, with
  chips to those abilities' rows:
  - in place of the threat or the opportunity: "Hidden: Riot changed Renekton W after this
    briefing was checked.";
  - after the lane points shown: "One point is hidden: Riot changed Renekton W after this briefing
    was checked.";
  - when nothing is left to show: "This briefing is hidden: Riot changed Renekton W after it was
    checked.";
  - in the Interactions panel: "One interaction is hidden: Riot changed Renekton W after it was
    checked."

  The points that rest on nothing that changed keep "Checked on patch N", and the briefing's
  freshness is that of what it shows; the bar warns once for them all, "Changed since the check: two
  parts hidden" (the threat, the opportunity, each lane point and each interaction hidden so), or
  "Changed since the check: the briefing is hidden" when nothing of it is left. The facts from a
  changed ability keep their row's "Changed since the check" in the Interactions panel (and on its
  folded line) and on their line of the assembled reference. A briefing hidden for its age is said
  the same way (Freshness, above), and the sources then neither date nor credits it. Nothing is hidden
  silently.

## Facts from Riot's text

For a champion without checked notes, the kinds of mechanic Riot's own ability text names: a stun, a
dash, a shield, a heal, a recast. Each is shown with the clause of Riot's text it quotes, and only
once it has passed the review below (the owner's decisions 4 and 5, 18 Nov 2026). They are the L3
layer (What it is). **Imported on 19 Nov 2026**: a reviewed file for each of the 173 champions of Data
Dragon 16.22.1, 1,112 facts and 7 places where Riot's two texts differ (Coverage, above). **Switched
off as it ships** (`RIOT_TEXT_FACTS_ENABLED = false`, `src/server/matchup-intel/riot-text/switch.ts`),
until the owner has pasted the proposed registration text (For the owner, step 10); then a one-line
change turns it on. Off, `loadMatchupPage` gives the view no reader of these files
(`riotTextReader`), so none is read and the page shows nothing of them; the browser tests pin either
state with a cookie that only the in-memory demo reads (the bounds of
`src/server/riot/browser-test.ts`), so the layer's tests run with it on, and the off state's with it
off, whatever the switch says.
[MATCHUP_INTEL_RIOT_TEXT_REVIEW.md](MATCHUP_INTEL_RIOT_TEXT_REVIEW.md) is the review's own summary for
the owner: its counts, its conventions, the decisions it leaves to the owner and what it asks of the app.

**The kinds** (`RIOT_TEXT_KINDS`, 45, in `src/domain/matchup-intel/types.ts`, each in one group):
- crowd control: stun, knock-up, knock-back, pull, root, slow, silence, fear, flee, charm, taunt,
  suppression, grounding, polymorph, sleep, blind, disarm, nearsight, drowsy;
- mobility: dash, blink, leap, teleport;
- defence: unstoppable, shield, untargetable, invulnerable, stasis, spell shield, damage reduction,
  tenacity, cleanse, stealth, parry;
- sustain: heal, life steal, omnivamp, regeneration;
- burst and power: empowered, transforms;
- how a cooldown behaves (on the tiles only): recast, charges, cooldown refund, reset, toggle.

**How they were made.** No person has checked any of it.
1. **Drafted** by fixed rules from Data Dragon 16.22.1's `championFull.json`, read from a local
   file: nothing was fetched, and nothing was read from the League of Legends Wiki or any Weird
   Gloop site. 1,223 drafts on all 173 champions. Each draft is one ability and one kind, with the
   exact words of Riot's text it rests on (a passive's description, a spell's description or
   tooltip, with markup removed): 3 to 30 words, no digit outside Riot's placeholders, one per
   ability and kind. The rules read Riot's text for kinds only, never for numbers: most of its
   numbers are placeholders, and the description and the tooltip disagree on some abilities.
2. **Reviewed**: two independent automated reviewers read every draft (they gave the same decision
   on 1,178 of the 1,223, 96.3%) and proposed additions of their own (46, 34 of them accepted), and an
   automated adjudicator settled each batch (1,092 accepted).
3. **Made consistent**: a consistency pass across all nine batches, checked by two further
   independent automated checkers (5 objections, all upheld; 27 instances they found missed, applied
   in their safe form), gave the final 1,112 facts. It recorded with each fact what it holds only
   with (a qualifier, or the conditional marker), another kind Riot's other text words it as, and the
   7 abilities whose two texts state different effects.
4. **Recorded**: every file of the table, and its index, says how it was reviewed in the review's
   own sentence ("two independent automated reviews and an adjudicator, then a consistency pass
   checked by two more; not checked by a person"). The structured record was not written by the
   review: it was added to every file and to the index for the import (19 Nov 2026), from that
   sentence, stating it as data and changing nothing else: `"reviewRecord": {"automatedReviewers": 2,
   "adjudicated": true, "consistencyCheckers": 2, "checkedByPerson": false}`. The committed files carry
   the same record (`review`), and the sources and notices state the process from it, for the facts as
   a whole, never that each went through every step ("Reviewed by two independent automated reviewers
   and an adjudicator, then a consistency pass checked by two more independent automated checkers; no
   person has checked them.", `riotTextProcessWords`): not every fact was a draft of the rules, since
   61 of the 1,112 came in as a reviewer's addition or with the consistency pass. The sentence after
   it, "No number in that text is used for these facts.", is about the facts: the ability's Details
   window shows Riot's description, numbers and all, as Riot's.
5. **Imported** by `scripts/matchup-intel/import-riot-text.mjs --from <the table> --ddragon
   <championFull.json>`: all 173 files or none, nothing refused, no fact changed. It reads Data
   Dragon's own `championFull.json` of the version reviewed, from a file (it downloads nothing), and
   refuses the whole table at the first of these that fails:
   - the table is complete (its `DONE`), its `_index.json` lists exactly the champions' files with
     each one's counts, and the totals in the index and in `DONE` are the files';
   - **the review record**: every file, and the index, has one, whole and of the right types; nothing
     is assumed for a file without it, and a file whose record differs from the index's is refused.
     A record saying a person checked the facts is refused too, until the owner has decided the words
     such facts carry (below);
   - the champion, the version and each ability's name are Riot's;
   - **the hashes**: each ability's `descriptionHash` and `tooltipHash` (null for a passive) are the
     SHA-256 of Riot's description and tooltip cleaned exactly as the drafts were (`preparedText`, a
     port of the drafting rules' `prepare()`: entities decoded, the description-append placeholder,
     inline icons and comments removed, one line per line break, markup removed, whitespace
     collapsed, the lines joined by a line break). A file whose hashes are not Riot's text of that
     version was reviewed against other words. All 1,557 hashes match Data Dragon 16.22.1;
   - **verbatim**: every clause, qualifier (from the fact's own text, or the other one where
     `qualifierSource` says so), `alsoDescribedAs` clause and disagreement clause is in the text it
     names, character for character, on one line (1,205 spans); none holds markup or a digit outside
     Riot's placeholders, a clause is at most 400 characters and a qualifier at most 12 words;
   - every fact names a known kind, slot and source, one per ability and kind, and no field the app
     does not show (a field it would drop could narrow the fact); `conditional` is `true` or absent;
     an `alsoDescribedAs` names another known kind; a disagreement names two different kinds, and no
     fact on its ability names either (that would pick one).

   Each of Riot's placeholders is stored as "[…]", never resolved into a number from any field
   (effectBurn, datavalues, vars). `--check` compares the committed files with the table instead of
   writing them. `riot-text.test.ts` holds the importer to each refusal (a missing or partial review
   record, a hash that is not Riot's text, a clause, qualifier, other wording or disagreement that is
   not verbatim, a number, a fact that picks a side) and to Braum's passive, whose cleaned text has
   the hash the review recorded.

**Where they live.** `src/server/matchup-intel/riot-text/<ChampionId>.json`, one per champion, one
fact and one disagreement per line, and the generated `riot-text/index.ts`, with one dynamic import
per file, so a page loads only its two champions' files, and only for a champion without checked
notes (they win), and a cold start loads none (`loadRiotText`, `src/server/matchup-intel/riot-text.ts`),
which keeps them off every other page's server work (Vercel Active CPU: docs/HOSTING_USAGE.md). No
database query reads them. The page reads them defensively (`parseRiotText`): a file in another shape
or without its review record, or a fact or disagreement that is not one in every field, is left out,
never shown in part (a fact without its qualifier would read as holding always).
`riot-text.test.ts` checks that every file is listed and reads whole with its review record, that the
committed table is the whole one (173 files, 1,112 facts, 7 disagreements, 68 qualifiers, 44
conditional, 11 other wordings, 224 clauses with "[…]"), and that each ability is pinned to the
offline copy's text at its version. They stay on the server: the browser gets only the plain view
built from them.

**Pinned to Riot's text.** Each ability's facts, and where its texts differ, are pinned to its name
and to a hash of its whole raw text (`riotTextHash`: the first 16 hex digits of SHA-256 over its raw
description and tooltip), which the version-check job stores with each ability (rules format 2;
DATA_PIPELINES.md). Once Riot changes either text, or renames the ability, all of it is hidden, and
the tile and the assembled side say how much and why: "Riot's text for W changed after the review: its
2 facts are hidden.", "… its fact and the note that Riot's texts differ are hidden.", "Riot renamed W
after the review: …". The whole ability, not only the text that changed: the cautious choice the
review asked for (Data Dragon 16.23.1 changes only Mel's W tooltip, whose one fact quotes the
description; the page hides it all the same). On a record stored before the hash was kept, the facts
show only on the very version reviewed; on any other, "Whether Riot's text for Q changed since the
review is not known yet: …". They hold no numbers, so they do not expire by patch count, as checked
notes do. A name is pinned as the app stores it, trimmed (Data Dragon gives Bel'Veth's passive a
trailing space).

**Where they show**: as chips on the tiles, one per kind, whose tip quotes the clause and which text
it is ("Riot's tooltip for Apprehend"); in the assembled reference's groups; in the ability's Details
window ("Facts from Riot's ability text", with the label, when they were reviewed and each kind's
clause); in the panel's heading ("From Riot's ability text, reviewed automatically (not by a person)
· Reviewed against Riot's text of patch 26.22, on 19 Nov 2026"); and in the sources and notices, with
the process from the review record. What the review recorded with a fact shows with it, in fixed and
tested words (The ability tiles, above): its qualifier on its chip ("Stun · “Mega Gnar”", "Cooldown
refund of “Mantra”"), the conditional marker under the ability's chips naming them ("Conditional: see
Riot's text (Stun and Pull)"), "Riot's texts differ" with both quotes where its texts disagree, and,
in the Details window only, another kind Riot's description words it as ("Riot's description calls it
blink: “…”"). An ability with no fact says "No reviewed facts for this ability"; a group with none,
"No reviewed facts of this kind", or, on a side where an ability's facts are hidden, "No reviewed
facts of this kind outside W".

**What they never do**: give a number (a duration, an amount, a range), say who has the upper hand,
join the two kits, show before the review accepted them, show a fact without its qualifier or marker,
pick one of Riot's two texts where they differ, or replace a champion's checked notes, which win
wherever they exist. Riot's text does not state everything, and the review did not keep everything
it states: an ability with no fact means only that no fact of it passed the review. On the six
champions with checked notes, an extraction test of 18 Nov 2026 found Riot's text states 37 of their
44 checked crowd-control, mobility, defence and sustain facts (not, for example, Mordekaiser R's slow
and heal, Ornn E and R's stun or Ornn Q's knock-aside).

**How a later person's review upgrades a row.** A champion's row in the table (its file and its row
in `_index.json`) records who checked it. A person who checks a champion's facts, and its
disagreements, against Riot's text in Data Dragon (each quote is one tap away on the page, and
verbatim in Riot's text) would record it in that row's review record (`checkedByPerson: true`, in the
file and in its index row, which may carry its own record for that), and the import then carries it
to the page. Two things come first, both the owner's: the words the page shows for such facts, in
place of "reviewed automatically (not by a person)" for that champion (never "verified"), and whether
a person's check may also settle the review's open decisions for those facts
(MATCHUP_INTEL_RIOT_TEXT_REVIEW.md, "For the owner"). Until the label is decided, the importer refuses
a record that says a person checked it, and the page's reader leaves such a file out, so no page
claims more, or less, than was done (For the owner, step 11).

## Curated notes

Riot's Data Dragon gives every champion's ability names, icons, ranks and base cooldown arrays. It
does not say when a cooldown starts, what a recast needs, what crowd control an ability carries or
what cancels it. The curated notes add that, in two layers. Each file is written from cited
sources, in our own words, and changes only through a pull request. The owner alone curates the
notes and approves briefings (17 Nov 2026, Sydney). The first batch (16 Nov 2026) was drafted and
cross-checked by AI agents; the owner approved its three briefings "for now", as drafted, and set
the rule that a note says only what the wiki says, under which AI agents then audited and corrected
every note (For the owner, step 2). No person has checked each fact of the first batch against its
page, and the corrections reworded parts of the briefings after the owner approved them. From then
on the owner writes or checks each file, under the rules below.

| Layer | Files | What it holds |
|---|---|---|
| Champion notes (Layer 1) | `src/server/matchup-intel/curated/champions/<ChampionId>.ts`, one `ChampionNotes` each | For each ability (P, Q, W, E, R): Data Dragon's cooldown array and identity as checked, how the cooldown works (when it starts, charges, forms, recasts, refunds, resets, waits between casts), and facts, each with who has the effect and its source: crowd control, mobility, defences, sustain, empowerments, the damage that matters in lane, interactions and exceptions. Level notes where a source states one. |
| Matchup notes (Layer 2) | `src/server/matchup-intel/curated/matchups/<You>-vs-<Enemy>.ts`, one `MatchupNotes` each | Your champion against one enemy, in that direction only: a threat, an opportunity, lane points and interactions, each naming the abilities it rests on. |

The types are in `src/domain/matchup-intel/types.ts`. The page reads the notes through
`src/server/matchup-intel/curated/index.ts`:
- `getChampionNotes(id)` returns a champion's notes;
- `getMatchupNotes(you, enemy)` returns the notes for that direction only;
- `curatedEnemiesFor(you)` lists the enemies a matchup is written for.

They return `null` or an empty list where nothing is written. Without champion notes a champion's
tiles show Data Dragon's data, with its facts from Riot's text where they are committed. Without
matchup notes the page shows the assembled reference (What it is).

The index imports every file statically, and it is server-only. No client component imports it:
`src/app/client-imports.test.ts` refuses any path from browser code into `src/server`, apart from
the few shared modules it lists. The browser gets only the plain view built from it.

Curated so far, checked on 17 Nov 2026 for patch 26.22 (Data Dragon 16.22.1):
- champions: Ambessa, Gwen, Mordekaiser, Ornn, Renekton and Riven;
- matchups: the three validation pairs, Ambessa vs Renekton, Gwen vs Ornn and Riven vs Mordekaiser.

### Rules

These are the owner's and Riot's rules. `curated.test.ts` checks the ones a test can (below); the
review checks the rest.

**Sources**
- Every fact, level note and interaction names the `Source.id` it rests on. Every source gives its
  `kind`, and is one of these:
  - a League of Legends Wiki page, licence `CC BY-SA 3.0`, with the `revision` id it was read at
    and that revision's `revisionTime` (a time in UTC, from the page's history). It is an ability's
    data page (`wiki-ability`,
    `https://wiki.leagueoflegends.com/en-us/Template:Data_<Champion>/<Ability>`), the champion's
    own page (`wiki-champion`), or a page that defines a term or a field (`wiki-reference`, such as
    `Template:Ability_data`);
  - one of Riot's pages, licence `Riot Games` and no revision: Data Dragon's champion file
    (`ddragon`) or `developer.riotgames.com` (`riot-docs`).
- Titles take one style, from the address: "League of Legends Wiki: Ruthless Predator (Renekton)"
  for an ability's page, "League of Legends Wiki: Renekton" for a champion's, "League of Legends
  Wiki: Template:Ability data" for any other page, which may add a few words in brackets ("(what
  each field means)"). Data Dragon's file is "Data Dragon 16.22.1: Renekton".
- A fact read from a page's field (`spellshield`, `parry`, `grounded`, `knockdown`) uses the
  meaning `Template:Ability data` gives it ("Spell shield nullifies."; "Movement is interrupted and
  overridden by enemy knockdown or displacement."), so that page is one of the file's sources.
- From now on the wiki is read by hand, in a browser: its Terms of Use forbid automated use without
  consent, so no script, job or test reads it, and Matchup Intel loads nothing from it (Compliance,
  "No automated use", which also names the one request another part of the app makes there).

**Claims**
- Never invent a number, an interaction or a matchup claim. What no source states is left out.
- A claim may apply what a page states of a whole class (any damage shield, immobilising effects,
  dashes) to a member that a page names as one in words: Ruthless Predator destroys damage shields,
  and Repudiation's page calls its shield one, so the briefing may say it destroys Repudiation's.
  Anything else that only follows from two facts is left out: a comparison of two durations, a sum,
  a timing, a tactic, or a class read only from a template's markup (Death's Grasp's pull is marked
  "airborne", but no page calls it a displacement).
- A value the wiki marks as estimated, and anything read from a template whose definition was not
  read (an interaction table's columns), is left out.
- Where Riot's own text (Data Dragon's tooltip or description) and the wiki disagree, only what both
  say goes on the page: Gwen's R recast window (8 s on the wiki, 6 s in Riot's tooltip) is not
  shown, though the two more casts are. A curator reads Riot's tooltips only to find such
  disagreements, never as a source of numbers: most of their numbers are unresolved placeholders.
  (The facts from Riot's text read them for kinds of mechanic only, and are a layer of their own:
  Facts from Riot's text.)
- Each file's header says, in short lines, where each cooldown start comes from, what is disputed
  and left off, and what was left out and why. Fewer points are better than one that is not
  grounded.

**Text**
- Use UNIIVERSE's own words, short and plain, in British English. Never copy a wiki sentence.
- Plain text only: no wiki markup, no `<` or `>`, no control characters, and at most 300
  characters a text. A fact's label (its chip's word) is a few words, and a detail is one sentence. Numbers of 1,000
  and more take a comma ("1,350 units"), as the app writes them.
- A number and its unit take an ordinary space ("1.625 s", "300 units", "50 Fury"); no special
  space goes in the notes. Where the page draws a curated text, and Riot's short descriptions too,
  it joins every number to the word after it (`keepUnitsWithNumbers`, `src/lib/format.ts`, applied
  in `view.ts`: a no-break space after a number, or a number with "%" or "°", whenever a word
  follows, whatever the word), so a number and the word after it always share a line and a unit
  never starts one. A unit of several words can still wrap after its first word ("80% bonus", then
  "AD" on the next line), and a number before anything but a word ("6, 11", "8 / 7", "320 (by
  level)") keeps its ordinary space. Of the lines the page writes itself, the cooldown lines hold
  their units the same way ("8 s", "3 charges"; Cooldowns), and so do a recast's "2 more times" and
  a refund's "65% of the cooldown". Its other words keep ordinary spaces: counts such as the
  picker's "12 champions found" and the sources' "13 wiki pages", and dates ("23 Sep 2026").

**Cooldowns** (how they are shown: `src/domain/matchup-intel/cooldown.ts`)
- `ddragonCooldown` is Data Dragon's `cooldown` array for the version checked, copied exactly. The
  passive's is `[]`: Data Dragon never gives a passive a cooldown.
- `ddragonIdentity` is Data Dragon's spell id, name, ranks and charges for the version checked,
  copied from `ddragon-<version>.identity.json`; the passive's is `{ id: null, name, maxRank: 1,
  charges: null }`. Every ability gives it.
- A `per-rank` cooldown repeats that array. Its `starts` comes from the page's cooldown-start field
  (`cdstart`) or its cooldown note:
  - `null` where the page gives none (13 of the 24 abilities so far): nothing is assumed;
  - `"on-cast"` where the field says on-cast, and `"after-effect-ends"` where it says post-effect;
  - `"after-first-cast"` only where the page says so in words: Riven's Broken Wings ("Starts after
    first cast"), which reads "starts after the first cast". On an ability cast again, the field's
    on-cast alone does not say which cast, so Ambessa's Q, Renekton's E and Gwen's R keep
    `"on-cast"` and the page shows no start for them. The owner's rule (17 Nov 2026, Sydney): "Don't assume,
    if you don't know because the wiki doesn't say then don't use that data."
- `modifiers`, only as the page states them:
  - `refund`: a share (`percent`) or seconds per rank, and what gives it back, in our words (Gwen's
    E: 25 / 35 / 45 / 55 / 65%, "her first basic attack within the 4 seconds after the dash");
  - `resetsAttack`: the page says it resets the basic-attack timer (Riven's Q, Gwen's E,
    Renekton's W);
  - `static`: the cooldown itself is unaffected by ability haste;
  - `lockout`: a cooldown between casts that the page states as one, with `static` when ability
    haste does not shorten it (Riven's Q, 0.3125 s; Gwen's R, 1 s). A delay before a recast opens
    ("can be recast after 0.5 seconds") goes in the recast's note.
- Charges (per rank where they differ), recharge times and forms go in the `cooldown` spec, and a
  recast's count and window in `recast`. `cooldownNote` holds only words on the cooldown that fit
  nowhere else, as the page states them. It never says what "the effect" is for a start after it
  unless the page does: a post-effect field names no effect, so a duration such as Hallowed Mist's
  4 s goes in the details.
- A passive gets a cooldown spec only when the page gives the passive's own cooldown, with
  `perTarget`, `static` and `starts` as stated. A timer of something else is a detail: Ornn's 4 s
  "Forge Disable Time" is the forge's, not Brittle's. Without a spec the page says Riot's data has
  none, never "no cooldown".

**Facts** (`Fact.kind`, shown as a chip)
- `crowd-control`: the effect (stun, knock-up, slow, root, fear, pull…), and its duration where the
  source states it.
- `mobility`: dashes and blinks.
- `defence`: shields, damage reduction, unstoppable, untargetable, spell shields, displacement
  immunity.
- `sustain`: heals, life steal, omnivamp.
- `damage`: only damage that matters in the matchup (true damage, a share of maximum health).
- `empowerment`: what strengthens the champion itself (bonus attack damage, an empowered next
  attack or ability), which `damage` would misname as damage dealt.
- `interaction`: what cancels, blocks or interrupts it.
- `exception`: unusual mechanics.

Every fact says who has the effect (`appliesTo`), which the chip's tip adds only where its kind
would not say it:
- `self`: the champion whose ability it is: a dash, a shield, a heal, an immunity, an empowerment,
  a lockout of their own, a stat they steal;
- `target`: the enemy it hits or targets, one or several: crowd control, damage, a debuff, and a
  defence of theirs that stops it ("Fails on spell shields", "Health loss ignores shields");
- `allies`: the champion's allies;
- `area`: a zone, an aura or terrain rather than the enemies it happens to hit (Darkness Rise's
  aura, Volcanic Rupture's pillar).

Check the subject of each fact against the page's words, which can describe the target: Realm of
Death "will cancel and go on cooldown after its cast time if: The target is displacement immune,
crowd control immune or protected by a spell shield", so those immunities are the target's, not
Mordekaiser's. A fact with two subjects is split, or given the one its label names ("Steals 10% of
stats" is his).

`tags` name the mechanics a fact is about, from `FACT_TAGS` (`src/domain/matchup-intel/types.ts`),
each once, and only where one fits: `stun` for a stun, `spell-shield` for "a spell shield blocks
it", `ground` and `interrupt` for a dash that grounding disables and a displacement interrupts. The
page carries them as data, not words.

**Level notes**
- Only what a source states, such as an unlock or a step at a stated level.
- Each names the abilities of its champion it rests on (`basedOn: ["Q"]`; a passive's step,
  `["P"]`), each with notes in the file, so the note is flagged once Riot changes one of them.
- No power-spike rankings, and no "ultimate at 6, 11 and 16" unless a source states it for that
  champion. A level note does not add up two facts (Ornn's stat bonus at level 13).

**Matchup notes**
- One direction only: Ambessa against Renekton is not Renekton against Ambessa.
- A matchup has `briefing.threat`, `briefing.opportunity`, `briefing.lane` and `interactions`.
  Write two to four lane points where the two kits support them. The test refuses none, and more
  than four.
- Each point is one or two sentences: a consideration grounded in specific mechanics of the two
  kits. It names the abilities it rests on (`basedOn: ["Renekton.W", …]`), and each of those has
  notes in its champion's file.
- Considerations, never instructions or verdicts. Riot's policy lets a product "highlight decisions
  that are important and give multiple choices", and will not approve "Apps that dictate player
  decisions". No win rates, tiers, counter lists or guesses. The test refuses the words that
  dictate or claim too much (`REFUSED_WORDS`: always, never, must, should, you, easy, free win,
  can't lose, best, counters, punish and others) in every point and interaction, and the words
  that instruct the player or give a verdict (must, should, you, avoid, best, counters, punish,
  all-in and others: not always and never, since a mechanic may never do something) in every text
  of the champion notes the page shows: facts, details, cooldown and recast notes, refunds and level
  notes. A factual sentence that genuinely needs one goes in `ALLOWED_WORDS` with its file, place and
  reason. The list lives in `src/domain/matchup-intel/refused-words.ts`, shared with the assembled
  reference's fixed sentences (`wording.test.ts`), so the page's own words are held to it too.
- A matchup is checked against the same Data Dragon version as the champion notes it rests on. It
  holds no numbers of its own, so the page judges its freshness by those notes (Data, Freshness).
- Its sources are the champion notes' sources of the same ids, copied whole.

**Verification**
- Every file carries `verified: { patch: "26.22", ddragonVersion: "16.22.1", checkedOn: "2026-11-17" }`:
  the public patch, the Data Dragon version the arrays were compared with, and the day.

### Adding a champion

1. Read the champion's pages on the wiki by hand: `Template:Data_<Champion>/<Ability>` for the
   passive and each of the four abilities (the slot pages, `Template:Data_<Champion>/Q` and so on,
   redirect to them; older pages of a reworked champion remain under other titles). Note each
   page's revision id and when it was saved, which its history shows.
2. From Riot's champion file for the current version,
   `https://ddragon.leagueoflegends.com/cdn/<version>/data/en_US/champion/<ChampionId>.json`, where
   `spells[0]` to `spells[3]` are Q, W, E and R:
   - copy each `cooldown` array into the ability's `ddragonCooldown`, and into
     `ddragon-<version>.cooldowns.json` beside the index (one line per champion, `P` as `[]`);
   - copy each spell's `id`, `name`, `maxrank` and `maxammo` (as charges above 0, else `null`) into
     its `ddragonIdentity` and into `ddragon-<version>.identity.json`; the passive has no id, 1
     rank and no charges;
   - a new version gets its own files of the same shape, whose `_note` says where they came from;
   - read the tooltips and descriptions only to find where Riot and the wiki disagree.
3. Write `champions/<ChampionId>.ts`, named with Data Dragon's id (`MonkeyKing` for Wukong). It
   has `export default` a `ChampionNotes` with:
   - all five slots, each with its `ddragonCooldown`, `ddragonIdentity`, cooldown spec, modifiers
     and facts as the Rules say;
   - its sources, each with its kind, and for wiki pages the revision and its time;
   - a header that gives each cooldown start's source, the disputes left off, and what was left out
     and why.
4. Import it in `index.ts`, and add it to `CHAMPIONS`.
5. Run `pnpm exec vitest run src/server/matchup-intel`, then `pnpm verify`.

### Adding a matchup

1. Both champions need champion notes first, checked against the same Data Dragon version as the
   matchup, because a point can rest only on an ability with notes.
2. Write `matchups/<You>-vs-<Enemy>.ts` with Data Dragon's ids. The other direction is a separate
   file, written from that side.
3. List the pages the points rest on as its sources, each copied whole from the champion notes
   that cite it under the same id.
4. Re-read every point for tone: a consideration from the two kits, with none of the refused words.
   Its header says what was left out and why.
5. Import it in `index.ts`, add it to `MATCHUPS`, and run the tests.

### When a patch changes them

Riot's numbers refresh by themselves. The version-check job stores each new Data Dragon version's
abilities (`src/server/matchup-intel/abilities.ts`). The page compares each ability's current
record with the notes' `ddragonCooldown` and `ddragonIdentity` (its id, name, ranks and charges),
using `abilityFreshness` in `src/domain/matchup-intel/cooldown.ts`:
- **current**: checked against the version the page shows, and nothing compared has changed;
- **unchanged since**: checked on an earlier version, and nothing compared has changed since (or
  the data held is older than the check). It is shown as "checked on patch 26.22", never as
  current, because crowd-control durations, ranges and interactions can change without the record
  moving;
- **changed since**: the record moved after the check. The line shows only what Riot's data
  supports, the notes are flagged as possibly out of date, and the briefing points and matchup
  interactions that rest on the ability are hidden (Data, above).

A champion's label is its weakest ability's (`weakestFreshness`). A matchup's is judged against its
own check, ability by ability (Data, Freshness, above).

Re-checking is a person's work, in one pull request per pass:
1. Find the curated abilities whose record changed (the page labels them "Changed since the
   check"). Read the patch notes for changes the record does not show.
2. Read those abilities' wiki pages again by hand. Update the facts, the revision ids and times,
   `ddragonCooldown`, `ddragonIdentity` and `verified`.
3. Add `ddragon-<version>.cooldowns.json` and `ddragon-<version>.identity.json` for the version
   checked against. The test needs them for every version a champion's notes cite.
4. Re-read every matchup that rests on the champion, update or remove the points that rest on a
   changed ability (`basedOn`), and move its `verified` to the same version: the test refuses a
   matchup checked on another version than the notes it rests on.
5. Move the browser tests' pin (`E2E_DDRAGON_VERSION` in `e2e/ddragon-version.ts`) to the newest
   version the notes are now checked against: `curated.test.ts` refuses any other (What the browser
   tests pin, below). Their server then reads that version's data, so update a browser test that
   reads a number the new version changed ("13 s at every rank" for Riven's Q, in
   `e2e/matchup-intel.spec.ts`), and run the browser tests with the new pin before the pull request
   is ready.

Until that merges, the labels say what is known. Nothing is estimated.

### What the browser tests pin

The browser tests run against the in-memory demo, which stores Riot's Data Dragon at its first
start. Their server reads one version: `DDRAGON_VERSION`, set by `playwright.config.ts` to
`E2E_DDRAGON_VERSION` (`e2e/ddragon-version.ts`), 16.22.1, the version the curated notes were
checked on. CI's browser job and the WebKit workflow's Playwright step both start that server
through the config, so both read it; production never sets it. The WebKit workflow's other step,
the Safari 26 check (`scripts/webkit26-check.mjs`), starts a demo server of its own without the pin.
It opens Team, a player's profile and match history, and the public team page, never a Matchup
Intel page, and checks how each window is drawn, so nothing it checks depends on the version; a
Matchup Intel page added to it would need `DDRAGON_VERSION` passed as well.

- **Why.** Unpinned, a fresh demo stores Riot's newest version, so the specs would read whatever
  Riot had shipped: once its numbering ran more than two patches past the check (16.25, or 17.3 if
  16.24 is the year's last patch), `MAX_PATCHES_UNCHECKED` would hide every briefing, and the specs
  that read one (the threat, the opportunity and their chips, the threat on a phone's first screen,
  the announcement, and the WebKit spec's chip) would fail until the notes were re-checked: in CI on
  every pull request, and the WebKit spec in every run of the WebKit workflow, which is started by
  hand; a cooldown Riot changed (Riven's Q, "13 s at every rank") would fail at once.
  Pinned, the specs read the same data whatever Riot ships: the briefings as checked ("Checked on patch 26.22",
  with no "Not re-checked"), Riot's numbers as checked, and the sources' "Riot Data Dragon 16.22.1
  (patch 26.22)", which the spec asserts word for word.
- **How.** The live provider (`DataDragonProvider`, `src/server/riot/static/ddragon.ts`) returns
  only the pinned version once Data Dragon's own list of versions confirms it has it (Data Dragon
  keeps every version it has published), and the version check reads exactly that version's
  champions, abilities and item names. A pin that is not a version, or one Data Dragon does not list,
  fails the way an unreachable Data Dragon does: on a first start the offline copy, labelled as one
  (the sources' assertion then fails), otherwise the stored data kept and the run degraded with the
  reason; never another version instead. The version check's log says when it is pinned.
- **Kept honest.** `curated.test.ts` refuses a pin that is not the newest version the notes are
  checked against, or one without its `ddragon-<version>.cooldowns.json` and identity file, so a
  re-check on a newer version moves the pin in the same pull request (When a patch changes them,
  step 5), and the specs read the data the newest notes were checked on.
- **Not covered by them.** The page on later patches (the "Not re-checked for 26.23" labels, a
  briefing hidden for its age or for a change and said so above the assembled reference, a point
  hidden because Riot changed an ability, the bar's warning for it, an assembled side's flagged line
  and its notes' line, an empty group beside hidden facts from Riot's text, the notes panels'
  freshness, Riot's data newer than the notes) is the unit
  tests' (`view.test.ts`, `matchup-content.test.ts`, `src/domain/patch.test.ts`), with the patches and
  records injected; the Production check's own facts in those states are
  `src/server/ops/live-check-matchup-intel.test.ts`'s, from the page read in each. A server started by hand for
  the specs (`E2E_PORT`) needs the variable too, `DDRAGON_VERSION=16.22.1 pnpm start`: outside CI,
  Playwright uses a server already on the port and does not pass it its environment.

### What the test checks

`src/server/matchup-intel/curated/curated.test.ts` runs in `pnpm verify`. It refuses:
- a file in `champions/` or `matchups/` that the index does not serve under the ids in its name,
  or an index entry with no file;
- a champion id that is not in `src/server/riot/fixtures/champions.fixture.json`;
- champion notes without all of P, Q, W, E and R, or with any other slot;
- a `ddragonCooldown` that is not Data Dragon's array in `ddragon-<version>.cooldowns.json`, or
  notes checked against a version with no such file;
- an ability without its `ddragonIdentity`, or one whose id, name, ranks or charges are not Data
  Dragon's in `ddragon-<version>.identity.json`, or notes checked against a version with no such
  file;
- a saved Data Dragon file that is not well formed, or that disagrees with the committed offline
  fixture (`src/server/riot/fixtures/champion-abilities.fixture.json`) of the same version;
- a `per-rank` cooldown whose seconds differ from `ddragonCooldown`;
- a cooldown spec the page cannot show as written (it asks the display rules,
  `curatedCooldownDisplay`): numbers of seconds, whole charge counts above 0, one value or one per
  rank, levels from 1 to 18 paired with the values, two or more forms; a start outside the
  vocabulary, or forms with the same name;
- a modifier the page would leave out: a refund whose amount is not one value or one per rank, a
  share over 100%, or with nothing saying what gives it; a wait between casts that is not above 0;
- a fact without `appliesTo`, or with one that is not `self`, `target`, `allies` or `area`; a tag
  that is not in `FACT_TAGS`, or is named twice;
- any of these source faults:
  - a fact, level note or interaction that cites a source its file does not list;
  - a source listed twice, or one that is not an https page on the three hosts above;
  - a source with the wrong licence for its host, or without a `kind`, or whose kind does not fit
    its page;
  - a wiki page without its revision or its `revisionTime`, or a revision time that is not a time
    in UTC or comes after the day the notes were checked; a Riot page with a revision;
  - a wiki page's title that is not the house style for its address;
  - a matchup source that differs in any field from the champion notes' source of the same id;
- a `basedOn` or interaction reference that is not an ability, with notes, of one of the two
  champions;
- a matchup checked against another Data Dragon version than the notes of a champion it rests on;
- a word from `REFUSED_WORDS` in a briefing point or an interaction, unless `ALLOWED_WORDS` lists
  it there (by file and place) with its reason; an allowed word its text no longer uses, in a
  matchup's file or a champion's;
- any text that contains `{{`, `<`, `>` or a control character, is empty, or is over 300
  characters;
- `verified` fields of the wrong shape, or a patch that is not the Data Dragon version's;
- a matchup without a threat, an opportunity and at least one lane point, or with more than four;
- a level note outside levels 1 to 18, or one that names no ability it rests on (`basedOn`), a slot
  that is not one, a slot twice, or a slot with no notes in the file; a recast count below 1;
- a word that instructs the player or gives a verdict (the second and third groups of
  `REFUSED_WORDS`) in a text of the champion notes the page shows (a fact's label or detail, a
  detail, a cooldown or recast note, a refund, a level note), unless `ALLOWED_WORDS` lists it there
  with its reason;
- a text the page shows, in champion notes or a matchup, that gives a value as an estimate
  ("estimated", "estimate", "estimates", "approximately", "approximate" or "roughly", as whole
  words): a value the wiki marks as estimated is left out (Rules);
- a missing validation matchup;
- a browser tests' pin (`E2E_DDRAGON_VERSION`) that is not the newest Data Dragon version the notes
  are checked against, or has no committed cooldowns and identity, or that `playwright.config.ts`
  does not pass to their server as `DDRAGON_VERSION` (What the browser tests pin).

Three corrections from the review of 16 Nov 2026 are pinned too, so that they stay made: Riven's Q
gives no one window for its two recasts, Ornn's W no speed below which he does not lunge, and Gwen
vs Ornn credits the Renekton page its threat's stun rests on.

Each rule on the notes has a case that proves it fires. What no test can check is the review's:
the wording, copying, whether a point dictates play in words the list does not hold, whether a
claim is stated or only follows from two facts, and whether each fact matches the page it cites.

## Cooldowns

The rules are in `src/domain/matchup-intel/cooldown.ts` (`cooldownDisplay`, and
`ddragonCooldownDisplay` for Riot's data alone), the words in
`src/components/matchup-intel/wording.ts`, and the numbers are written by `formatCooldowns` and
`formatPerRank` in `src/lib/format.ts`. A number is shown only when the data holds it; what is not
known is said as not known, never estimated.

**Which line.** While an ability's curated notes still describe Riot's record (not "changed
since", Data above), their cooldown spec is the line, as checked. Otherwise, or where the notes
give no spec, or a spec the page cannot read, the line is what Riot's data alone supports, with no
claim about when it starts. Riot's array passes only these rules, in this order:

1. the passive: Data Dragon has no passive cooldown, so there is none to show;
2. the exception list (`NOT_THE_COOLDOWN`): arrays the saved evidence shows are not the cooldown,
   each pinned to the array that was checked, so a different array is judged by the rules below:
   - Rengar's Q, W and E, 0.25 s at every rank, reported to Riot as wrong (RiotGames/developer-relations
     issue 787, closed 26 Apr 2025, still 0.25 in 16.22.1);
   - Corki's R (2 s), Teemo's R (0.25 s) and Gangplank's E (0): the wait between casts of an
     ability that holds charges, whose recharge the wiki gives (20 s; 35 to 25 s; 17 to 13 s);
   - Taric's Q (3 s): it stores charges by Riot's own tooltip in 16.22.1 (a stack every
     `{{ stackcooldown }}` seconds, consumed by the active; its leveltip's "Max Charges"), though its
     `maxammo` is -1, so the time to regain one is not in Riot's data;
   - Aphelios's Q (9 s at six ranks): one slot for five weapon abilities, as Riot's own description
     says ("Aphelios has 5 different activated abilities, based on his main-hand weapon"), so its one
     array is no one ability's ("Several abilities share this slot in Riot's data");
   - Zoe's W (0.25 s): its active casts the spells she picks up (Riot's own tooltip), so the number
     is not their cooldown ("This slot casts spells picked up in a game").

   Riot's number is shown as it is where its own text names the ability it belongs to: Kled's Q
   (11 to 7 s, the mounted Bear Trap on a Rope, whose leveltip calls the array its cooldown), Hwei's
   subjects (one leveltip cooldown each) and Yasuo's E (its own cooldown; the limit per target is a
   separate number its description mentions).
3. `maxammo` above 0: with charges the array is the wait between casts, and the count is not
   reliable alone (Rengar's Q, W and E list 1; whether Warwick's W and LeBlanc's R, which list 2,
   hold charges is not verified), so neither a number nor a count is shown;
4. a value that is not a number of seconds (malformed data);
5. a name with two abilities (" / "): one array for the two forms of a champion who transforms
   (Jayce, Nidalee, Elise, Gnar, Rek'Sai) or the two parts of an ability cast again (Ambessa's Q,
   Lee Sin's Q, W and E); Data Dragon does not tell them apart. Where curated notes checked one
   array per rank for the slot, a later array is read as that ability's, unless Riot's id, name or
   ranks moved from what the notes recorded (`ddragonIdentity`);
6. an empty or all-zero array: a placeholder, not "no cooldown";
7. not one number per rank;
8. everything else: Riot's array per rank.

**What the line says, and under it where it comes from:**

| Case | The line | Under it |
| --- | --- | --- |
| Curated per rank, Riot's record unchanged | "16 / 14 / 12 / 10 / 8 s"; the same value at every rank "13 s at every rank" | "Checked on patch 26.22" ("Checked" where the patch is not known), with "· not re-checked for 26.23" once a later patch is out |
| When it starts, where the source states it (on cast, or no start stated, goes without saying) | "· starts after the first cast", "· starts after the last recast", "· starts when the effect ends", "· starts after the channel" | |
| A static cooldown (`modifiers.static`) | "· unaffected by ability haste" | |
| Curated charges, one count or one per rank | "3 / 4 / 5 charges · one back every 35 / 30 / 25 s"; "2 charges · one back every 20 s"; "1 charge" | "Checked on patch 26.22" |
| Curated forms, one line each | "Hammer: 16 / 14 / 12 / 10 / 8 / 6 s", then "Cannon: 8 s at every rank" | "Checked on patch 26.22" |
| A passive's own cooldown, where a source states one | by level: "12 / 9 / 6 s · at levels 1 / 7 / 13", or "· by level" without the levels, "6 s at every level"; by rank: "30 / 25 / 20 s · by its rank"; and "· per target", "· unaffected by ability haste", "· starts when it takes effect", "· starts when the effect ends" ("10 s · per target · unaffected by ability haste") | "Checked on patch 26.22" |
| No cooldown (curated) | "No cooldown" | "Checked on patch 26.22" |
| Riot's record changed after the check | Riot's own line (the rows below), never the notes' start; the row's name has "Changed since the check" | "Riot's data for patch 26.23, not re-checked" ("Riot's data, not re-checked" where the data's patch is not known; "Not re-checked" under a line without a number); then the notes, under "Notes from patch 26.22 · may be out of date: Riot changed its cooldown since" (its cooldown, spell id, name, ranks or charges), with "As checked: …" |
| Riot's data, a number | "18 / 17 / 16 / 15 / 14 s" | "Riot's data, not reviewed" |
| Riot's data, the passive | "Cooldown not in Riot's data", never "none" | "Not reviewed" |
| Riot's data, charges (rule 3, and Corki's R, Teemo's R, Gangplank's E, Taric's Q) | "Riot's data lists charges but not their recharge" | "Not reviewed" |
| Riot's data, known to be wrong (Rengar's Q, W, E) | "Riot's number for this ability is known to be wrong" | "Not reviewed" |
| Riot's data, a value that is not seconds | "Riot's cooldown data can't be read" | "Not reviewed" |
| Riot's data, two abilities in one slot | "Two abilities share this slot in Riot's data" | "Not reviewed" |
| Riot's data, several abilities in one slot (Aphelios's Q) | "Several abilities share this slot in Riot's data" | "Not reviewed" |
| Riot's data, a slot that casts picked-up spells (Zoe's W) | "This slot casts spells picked up in a game" | "Not reviewed" |
| Riot's data, an empty or all-zero array | "No cooldown number in Riot's data" | "Not reviewed" |
| Riot's data, not one number per rank | "Riot's data doesn't give one number per rank" | "Not reviewed" |
| No record of the ability | "No cooldown data held yet" (a champion with no abilities stored shows "Ability details aren't stored yet" instead of rows, and one whose stored copy cannot be read "Riot's ability data for … could not be read") | |

On the dashboard's tiles, "under it" is said once for a champion where it can be: when every line
with a number shares where it comes from, the panel's heading says it ("Cooldowns: Riot's data, not
reviewed"; a champion with checked notes, "Curated notes: checked on patch 26.22"), and a tile says
its own after its numbers only where it differs ("· Not reviewed" after a passive's "Cooldown not in
Riot's data"). The ability's Details window gives every line's source in full. The assembled
reference repeats a line only where it is one number per rank, tight ("14/12/10/8/6 s").

A line without a number has nothing under it where the ability has curated notes that are not
flagged: they are the place that says more (a passive whose wiki page gives no cooldown, for
example).

**The modifiers** follow the line, one short line each, only as the source states them:
- "0.3125 s between casts, unaffected by ability haste" (`lockout`);
- "Refunds 25 / 35 / 45 / 55 / 65% of the cooldown: her first basic attack within the 4 seconds
  after the dash", or "Refunds 2 s of the cooldown: …" (`refund`: a share or seconds, one value or
  one per rank, and what gives it back);
- "Resets the basic-attack timer" (`resetsAttack`).

`cooldownNote` holds the rest, in words. Once Riot's record changed, the modifiers go with the
flagged notes.

Decimals are written as the numbers have them, up to four ("0.25 s", "0.3125 s"): a checked value
is never rounded into another. The "s" follows its number after a no-break space (`formatPerRank`,
and the wait between casts and a recast's window in `wording.ts`), so a line never ends between
them.

## Compliance

What Riot's policies, the League of Legends Wiki's licence and its host's terms say about this
page, and how the page keeps to them. It is a reading of those pages, not legal advice. Riot's
pages were read on 16 Nov 2026: the League of Legends documentation
(https://developer.riotgames.com/docs/lol, "League docs" below), the General Policies
(https://developer.riotgames.com/policies/general) and the portal page
(https://developer.riotgames.com/docs/portal). The app-wide checklist is
[RIOT_COMPLIANCE.md](RIOT_COMPLIANCE.md), where Matchup Intel is item 9.

### What Riot allows

| Riot's words (where) | How the page keeps to them |
| --- | --- |
| Data Dragon's game data and assets: "All of which can be used by third-party developers." (League docs, Data Dragon) | Ability names, icons, ranks, base cooldowns and short descriptions come from Data Dragon, and only from the fields it publishes for them (below). |
| "Game overlays that provide static data that is available prior to the game." (League docs, approved use cases) | A web page rather than an overlay, with static data only, for two champions chosen by hand: the same before any game, and the same on a second screen during one (the owner's use, 18 Nov 2026), since nothing on it comes from a game or changes with time. |
| "Products should not remove game decisions, but may highlight decisions that are important and give multiple choices to help players make good decisions." (League docs and General Policies, Game Integrity) | A curated briefing names a threat, an opportunity and what to weigh in lane, each resting on named abilities. It points at decisions and leaves them to the player. The assembled reference only sets each champion's own facts side by side, grouped by kind: no verdict, no ranking, nothing about the pair (the owner's decision 2). |

### What Riot forbids

| Riot's words (where) | How the page stays clear of it |
| --- | --- |
| "Products must not use or incorporate information not present in the game client that would give players a competitive edge (e.g., automatically or manually allowing tracking enemy ultimate cooldowns)…" (League docs, Game Integrity). Riot Developer Relations banned "Enemy Ultimate Timers" from 13 March 2025. | Base values per rank only. No timer, countdown, "used" or "ready at" control, alert or shared timer, for ultimates or anything else, and nothing records when an ability was used. |
| "Products may not provide any game-session-specific information that would be previously unknown to the player." (League docs, unapproved use cases) | Nothing comes from a game in progress or from champion select: no live-game or Spectator request, and no detection of the enemy. Both champions are chosen by hand. |
| "Products cannot identify or analyze players who are deliberately hidden by the game." (League docs, Game Integrity) | The page names no player and scouts no one. |
| "Apps that dictate player decisions." (League docs, unapproved use cases); "Products should increase, and not decrease the diversity of game decisions" (Game Integrity) | Briefings are considerations, never instructions (Curated notes, Rules), and the review checks their wording. No win rates, tiers, counter-pick or ban lists, and no single answer. |
| "Products cannot create an unfair advantage for players, like a cheating program or giving some players an advantage that others would not otherwise have." (Game Integrity) | Everything on the page is public: Riot's published data and the wiki's pages, which anyone can read. |
| "Products cannot closely resemble Riot's games or products in style or function." (General Policies) | The app's own design, not the game's tooltip or HUD, and no Riot logo. |
| The League Client API "is not officially supported for use with third party applications." (League docs) | No client integration, overlay, memory reading or automatic pick. |

### What Riot requires

| Riot's words (where) | How the page meets them |
| --- | --- |
| "You must post the following legal boilerplate to your product in a location that is readily visible to players" (General Policies) | The sources and notices show the full notice (`riotLegal`, with the installation's name), one press away from their summary line, which is always on the screen and ends "Not endorsed by Riot Games" (the owner's decision 14), as well as the app's other places for it: the sidebar's "Not endorsed by Riot Games" → Details, on every page. |
| "Any new features or changes to a product must be audited through the product's page in the Developer Portal" (General Policies); "You must make sure its description and metadata are kept up to date with the current version of your product." (League docs) | Done for the first version: the owner reported on 17 Nov 2026 (Sydney) that the product's description in the Developer Portal is now the one in RIOT_COMPLIANCE.md, which includes Matchup Intel (For the owner, step 1). The redesign changes what is read (Riot's tooltips, for the hash of each ability's text) and what is shown (the assembled reference, and clauses of Riot's text: the reviewed facts, imported on this branch on 19 Nov 2026), so an updated description is proposed beside it, for the owner to paste: the owner's action, which does not block the merge (decision 6). |
| "Products should use supported services from Riot Games for data ingestion" (General Policies) | Data Dragon only: no CommunityDragon data, and no value taken from the game's files. |
| "You may not run your application for public consumption using a personal key" (portal page) | Signed-in accounts only. `/resources/*` is not a public path (`src/proxy.ts`), the page calls `requirePageAccess` itself, and the Production check proves that a signed-out request, or one with a forged session cookie, is sent to sign-in (LIVE_VALIDATION.md). |

### Data Dragon: data and icons

- **Data.** Read by the version-check job once per game version, never while a page renders.
  Riot warns that Data Dragon "is not always updated immediately after a patch" (League docs), so
  the page names the version and patch it shows ("Riot Data Dragon 16.22.1 (patch 26.22)"), each
  champion's own when they differ, and says so when Data Dragon already has a newer version than the
  abilities stored. It cannot tell when Data Dragon itself lags the game: the game's patch it knows
  comes from Data Dragon's own list of versions. The fields read, and those never read (ranges,
  costs and their placeholders; the tooltip is read only to hash it with the description, and is
  never stored or shown), are in [DATA_PIPELINES.md](DATA_PIPELINES.md), "Champion abilities
  (Matchup Intel)".
- **Icons.** Each ability's and passive's icon, and each champion's portrait, is linked from Riot's
  CDN (`ddragon.leagueoflegends.com/cdn/<version>/img/spell/`, `img/passive/` and `img/champion/`),
  never copied or hosted by the app.
- **Riot's words.** Each ability's short description is Riot's own text from Data Dragon, with its
  markup removed, in its Details window. The facts from Riot's text quote a clause of Riot's
  description or tooltip, each placeholder as "[…]", always labelled as Riot's and as reviewed
  automatically (Facts from Riot's text); they were made offline from Data Dragon's
  `championFull.json` (most drafted by fixed rules, 61 of the 1,112 added by a reviewer or with the
  consistency pass) and are committed, so no page asks Riot for them. Riot's tips (`allytips`,
  `enemytips`) are shown verbatim, in quotation marks, attributed "Riot's tip (may predate later
  changes)", read from the same champion files by the version-check job (Riot's tips, above).

### The League of Legends Wiki

- **Licence.** The wiki's text is under CC BY-SA 3.0 (as the wiki reported on 16 Nov 2026),
  "applied to all creative work added to the wiki with the exception of Riot Games' Intellectual
  Property" (the wiki's Copyrights page). Most of Weird Gloop's other wikis are under CC BY-NC-SA
  3.0, several of them since 2025–2026, so whoever re-checks the notes checks the licence in the
  wiki's footer; each source records its own.
- **Credit.** Weird Gloop, which hosts the wiki, asks for "A hyperlink (where possible) or URL to
  the page or pages you are re-using" (https://meta.weirdgloop.org/w/Meta:Copyrights). CC BY-SA
  3.0 (https://creativecommons.org/licenses/by-sa/3.0/legalcode.en) asks for the author, the title
  and the address, "reasonable to the medium" (section 4(c)), and the licence's address (4(a)), and
  forbids implying "any connection with, sponsorship or endorsement by the Original Author" (4(c)).
  The sources and notices (`matchup-footer.tsx`), one press away from their summary line, give
  each:
  - the pages the notes are written from, each by its title and linked, each once;
  - "League of Legends Wiki contributors" as their authors;
  - CC BY-SA 3.0, linked;
  - how they were used: "written in our own words from";
  - "The wiki and its contributors do not endorse this page."

  Each ability's details also link the page behind each fact. `matchup-footer.test.ts` proves
  each part of the credit, and the browser spec checks it on the demo.
- **Our own words.** The notes state facts in UNIIVERSE's own words and copy no sentence, so the
  page holds no adaptation of the wiki's text, and the credit never says "adapted". Share-alike
  ("If you make modifications or additions to the page you re-use, you must license them under the
  same, or a compatible license", Meta:Copyrights) is about adapted text. Whether to license the
  curated files anyway is an open question (below).
- **Images.** "Non-text media on our wikis should not be assumed to be available under the same
  license as the text." (Meta:Copyrights) No image on Matchup Intel comes from the wiki.
- **No automated use.** Weird Gloop's Terms of Use (https://weirdgloop.org/terms, updated 31
  January 2025) do not allow "Attempting to use our Sites in an automated fashion without prior
  consent from the Company, or other users on our platform where applicable", and the wiki's
  robots.txt disallows `/*api.php` and `/*?action=` for every crawler. From now on, curators read
  the wiki in a browser (Curated notes, Rules). No script, job or test of the app reads the wiki's
  pages, and Matchup Intel loads nothing from it: the page only links to it. The browser spec checks
  that it names and loads nothing from `wiki.leagueoflegends.com`, with Playwright's request events,
  the browser's own record of every request it starts (Chromium's DevTools protocol, which also sees
  the favicons Playwright never reports, and each redirect hop), the page's resource timing, and the
  page's markup.
  No request goes there from other parts of the app either since 20 Nov 2026 (PLAN S8a): the
  Library (Resources) and its manager in Admin Mode draw each link with an icon shipped with the
  app, or the host's initial, and the League of Legends Wiki's link (`src/domain/resources.ts`)
  shows its initial: nothing is loaded from `wiki.leagueoflegends.com`. Until then the browser of a
  visitor, an administrator in the manager, or a browser test opening either page loaded its
  `favicon.ico` (17 in CI's browser job and 2 in the WebKit workflow, counted on 16 Nov 2026).
  Since then a second Matchup Intel phone test of the top bar's Back (in a browser without the
  Navigation API, 18 Nov) opens the Library without blocking icons, so that figure is no longer
  exact.
  It is a small automated request, repeated in every run that can reach the internet, in CI and on
  developers' machines.
  The agents who built this feature loaded it too, on 16 Nov 2026: their probes of the Library on
  this branch loaded it at least six times (at least four between 19:36 and 19:39 UTC, while checking
  this very question, and twice at 20:08 in a review's probe whose block did not hold: the sandbox's
  HTTPS proxy bypasses a host name mapped to a closed port), and the tests above ran in their local
  browser runs, in CI (run 43951873455, started when the pull request opened at 20:38 UTC) and in
  the three WebKit workflow runs on this branch that day. Working on other
  branches that day, the same session's agents also opened the Library with nothing blocked: in a
  probe at 10:00 UTC, in a screenshot run from 13:16 to 13:24 UTC (11 page loads), in CI (seven runs'
  browser jobs, and two more cancelled part-way, 05:41 to 11:02 UTC), in eight WebKit workflow runs
  and in local runs of the same tests (Open compliance questions, "Scripted reads of
  the wiki"). The same tests ran again on 17 Nov, locally, in CI and in the WebKit workflow, for
  this pull request and other branches.

## Open compliance questions

Each has a default that the code follows today. Only the owner changes one.

| Question | The default the code follows now | Who decides |
| --- | --- | --- |
| **The Developer Portal description.** Riot audits every new feature through the product's registered description (above). | Done for the first version on 17 Nov 2026 (Sydney): the owner reported the registered description replaced with the one in [RIOT_COMPLIANCE.md](RIOT_COMPLIANCE.md) ("Description for the registration"), which includes Matchup Intel. For the redesign of 18 Nov (Riot's tooltips hashed, the assembled reference, and clauses of Riot's text, imported on 19 Nov 2026) an updated description is proposed there ("Proposed description for the registration") and in For the owner, step 1: the owner pastes it; it does not block the merge (the owner's decision 6). | The owner |
| **A licence header on the curated files.** The repository is public and has no licence of its own. | Our own words, credited, not relicensed: each file's header says its texts are UNIIVERSE's own summaries, its sources list each page with its revision, and the sources and notices credit them. No file declares a licence for itself. A scan of the notes against the pages they cite finds no copied sentence, only runs of numbers and game terms (six to ten words), so the risk that a passage counts as adapted is small, but not none. The recommended choice is a conditional header in each file ("Any material in this file adapted from the League of Legends Wiki is available under CC BY-SA 3.0"), which would cover any such passage without saying anything was adapted; it is not added, because a licence grant is the copyright holder's act. | The owner |
| **Scripted reads of the wiki** (for example drafts of changes on patch day). | None of its pages. Weird Gloop's prior consent would be needed first (its Terms of Use, above). If it were given, a script would only draft changes for a person to review in a pull request, never publish them. No automated request goes to the wiki today: the browser tests' Library and manager loaded its favicon until 20 Nov 2026, when the Library's icons began to ship with the app (No automated use, above). Blocking icons in those tests, or a built-in icon for the wiki's entry (the Library and the manager draw the same one), would end it. | The owner, after asking Weird Gloop |
| **Who curates, and who approves briefings.** The owner's rule is a briefing only where a person wrote and checked it. | Decided on 17 Nov 2026 (Sydney): the owner alone curates the notes and approves briefings. Notes change only through pull requests, reviewed there: the page generates nothing, and nothing is published by itself. The first notes (16 Nov 2026) were drafted and cross-checked by AI agents; the owner approved their three briefings "for now", as drafted, and set the rule for every note, "Don't assume, if you don't know because the wiki doesn't say then don't use that data", under which AI agents then audited and corrected every note; no person has checked each fact against its page (For the owner, step 2). | The owner (decided) |
| **How the first notes were researched.** On 16 Nov 2026, between 05:51 and 06:43 UTC, while researching the first batch, AI agents made 40 scripted requests to wiki.leagueoflegends.com and 8 to Weird Gloop's own sites. The wiki's: a first probe at 05:51 (one API request, the Ambessa page, then its robots.txt, which disallows `/*api.php` and `/*?action=` for every crawler), two API requests at 06:01 and 06:07, and from 06:13 the robots.txt again, 33 API requests and the Renekton page: 36 to its API in all, every one at `/en-us/api.php?action=…`, two pages and the robots.txt twice. Weird Gloop's: the robots.txt of meta.weirdgloop.org and of weirdgloop.org, Meta:Copyrights twice, and its Terms of Use four times (weirdgloop.org/terms twice, each answered with a redirect to /terms/, and /terms/ twice). They saved copies of the pages the notes cite and of others they consulted (other champions' ability data, the six champions' patch histories and main pages, the wiki's modules and policy pages), and drafted and cross-checked the notes from those copies, which were never committed; all 34 cited revisions come from them. The Terms of Use (above) do not allow automated use without prior consent. | Disclosed in this feature's pull request, and here. Nothing in the app, its jobs or its tests reads the wiki's pages (the one request they make there is the wiki's favicon, drawn by the Library and its manager: No automated use, above), and curators read it in a browser from now on. The remedy is not chosen: a person re-reads each cited revision in a browser and records it in the pull request, or Weird Gloop is asked for consent after the fact, or both. | The owner |
| **Riot's "Legal Jibber Jabber" sentence**: "[The title of your Project] was created under Riot Games' "Legal Jibber Jabber" policy using assets owned by Riot Games. Riot Games does not endorse or sponsor this project." (https://www.riotgames.com/en/legal) | Not shown. The app shows the Developer Portal's notice word for word, which the General Policies require. | The owner |

## The owner's decisions of 18 Nov 2026

The owner's request of 18 Nov 2026 (a second monitor while playing; every pair meaningful; one
desktop screen; curated and assembled kept apart; nothing invented) superseded the page's earlier
presentation and its limit of content to what a person had written. These are the decisions taken
from it, with their reasons. Each replaced a default this page followed until then.

| # | Decision | Why |
| --- | --- | --- |
| 1 | **Assembled content for every pair without a matchup file.** Its label always says it was put together from each champion's facts and that no person checked the pair. | Every pair must give a meaningful reference, and matchup files exist for 3 of 29,756 pairs; the label keeps the reader from taking it for a briefing. Until then "the page generates nothing" and an uncurated pair showed one line. |
| 2 | **Group, never judge.** No "biggest threat" or "best opportunity" chosen by code, no ranking, no sentence that joins the two kits: each side's facts grouped by kind in slot order, in fixed, tested sentences. The danger side shows the enemy's crowd control and burst, the opportunity side your tools, told apart by colour, icon and words. | A verdict on a pair needs a person's judgement of that pair, and Riot's policy allows highlighting decisions, never dictating them. Danger and opportunity are only where each champion's own facts sit. |
| 3 | **No pairings by rule** between the two kits (an ability of one meeting an ability of the other). | Anything that only follows from two facts is left out (Curated notes, Claims): a curator applies the one class rule by hand. |
| 4 | **Riot's tooltips are read for kinds only, never numbers.** Facts drafted from Riot's text show only after the review, labelled in words "From Riot's ability text, reviewed automatically (not by a person)", the quoted clause one hover or tap away. Never the word "verified". | Most numbers in Riot's text are unresolved placeholders, and its two texts disagree on some abilities; a kind with its quoted clause can be checked against Riot's own words. In the extraction tests of 18 Nov 2026, drafts that nobody reviewed were wrong in up to about one case in five. |
| 5 | **Two independent automated reviews and an adjudicator** accept each fact from Riot's text; the label and each file's data record it. | About 1,200 drafts could not wait for a person's review; saying who reviewed them keeps the label true. |
| 6 | **The registration's description**: the updated text is proposed in RIOT_COMPLIANCE.md ("Proposed description for the registration") and in For the owner, as the owner's action. It does not block the merge. | The page now reads Riot's tooltips (for the text's hash) and will show clauses of Riot's text; Riot asks that the registered description says what a product reads and shows. |
| 7 | **Curated briefings stay word for word.** Where space is short the page shows the threat and the opportunity and folds the remaining lane points behind a count. | The owner approved the texts as written; folding keeps every word one press away, never cut. |
| 8 | **Version sharing unchanged**: a matchup is checked on the same Data Dragon version as the notes it rests on. | So "changed since" means what it says (Data, Freshness). |
| 9 | **Two-patch freshness and expiry unchanged** (`MAX_PATCHES_UNCHECKED`). | Riot's record cannot show most balance changes. |
| 10 | **Riot's numbers shown as "Riot's data, not reviewed"**, unchanged (600 abilities). | A base cooldown per rank is the one number Data Dragon gives reliably, behind the cooldown rules. |
| 11 | **The Production check renders Matchup Intel signed in**, one page load (LIVE_VALIDATION.md). | So a change to the page can be production-verified, at the cost of one page load each run. |
| 12 | **Matchup Intel takes the width it needs**, `--content-wide`, as a destination of its own. | One screen on a desktop needs two columns of the dashboard's width. |
| 13 | **"A static reference: no live tracking" stays**, now on the sources' summary line. | Used on a second monitor while playing, the page stays static data available before any game: nothing counts down or comes from a game. |
| 14 | **The full attribution and Riot's notice behind one compact "Sources and notices" control**, always on the screen, its one-line summary visible; Riot's notice exactly the app's `riotLegal` text. | One screen leaves no room for the whole footer; the notice stays one press away on the page and in the app's sidebar, as on every page. |
| 15 | **The remedy for the scripted wiki reads of 16 Nov 2026 stays the owner's**, and its disclosure stays (Open compliance questions). | Unchanged. |
| 16 | **Coverage is said as it is**: matchup files for 3 pairs, checked facts for 6 champions, everything else assembled and labelled. | No coverage is made to look complete (Coverage). |

## Not built

For later, each its own decision:
- your own notes on a matchup (the notebook, below): it needs the owner's go-ahead and a change to
  the privacy notice (OD9).

Decided on 20 Nov 2026 (S7a): **sharing a briefing** is delivered by the address and "Copy link"
(Roles, above). **Favourite matchups** are not built: Recent and the remembered champion already
return to a pair in one tap, and a third list would be a control for the same need (the directive,
"no unnecessary controls").

Nothing here reads a player's games either: those are Matchups', in the champion window.

### The notebook: a member's own notes on a matchup

Described here, not built: no table, migration or code exists. Building it needs the owner's
go-ahead first. STANDARDS.md lists Patterns & Notes, the retired notes of the ranked focus, among
the features not to revive, and a notebook is close enough to ask. It would not reuse that
feature's retired column (`ranked_profiles.notes`).

**What it would be.** Under the briefing, a few lines a member writes for themselves about this
pair, in this direction only, with the patch they were written on. Plain text. Keeping it on the
device alone (like the remembered champion) would need no table, but a note would not follow its
author to another device and would vanish with the browser's data, so the design keeps it on the
server.

**Private, and owned by one account.**
- Private by default and never public: in the app, only its author sees a note. Administrators
  do not see members' notes there; the database and its encrypted backups hold them, as they hold
  everything else. Sharing with teammates is not part of it; if it were ever wanted, it would be a
  separate decision, off by default, and never on the public team page.
- Owned by the signed-in account that wrote it (`users.id`), not by a player profile, so an
  account without a profile (the verification account, a personal-use account) has its own.

**The table**, `matchup_intel_notes` (never "matchups": that name is the personal Matchups
feature's):

| Column | Type | What it holds |
| --- | --- | --- |
| `id` | `uuid`, primary key, random | |
| `user_id` | `uuid` not null, references `users(id)` on delete cascade | the author: the session's account, never a value from the browser |
| `champion_id` | `text` not null | your champion, by its Data Dragon id, checked against the roster when saved |
| `vs_id` | `text` not null | the enemy, checked the same way |
| `body` | `text` not null | the note: plain text, at most 2,000 characters |
| `patch` | `text` | the public patch when it was last saved ("26.22"), so the page can say how old it is |
| `created_at`, `updated_at` | `timestamptz` not null, default now | |

- A unique index on (`user_id`, `champion_id`, `vs_id`): one note per pair and direction.
- The migration carries the grants block of [DATABASE_PERMISSIONS.md](DATABASE_PERMISSIONS.md)
  ("How a new table gets its grants"): RLS on with no policies, nothing for the Data API's
  `anon` and `authenticated`, `SELECT` for `uniiverse_backup`. The id is a uuid, so there are no
  sequence lines. Then an `auth-audit` run after the deploy (CLAUDE.md §5).

**Ownership, on the server.**
- Every query names `user_id = session.userId` in the same statement, for a read, a save and a
  delete. The session comes from the server (`requireSession`); no id from the browser chooses
  whose note it is. A session without an account (`userId` null, the automatic local owner of a
  development machine) has no notes, and saving is refused.
- Two server actions in a `"use server"` module, `saveMatchupNoteAction(championId, vsId, body)`
  and `deleteMatchupNoteAction(championId, vsId)`, each with `requireSession()` first
  (`src/server/actions/guards.test.ts` checks it). They check the ids against the roster and the
  text as plain text (as `plainText` does for Resources, `src/domain/resources.ts`), cap its
  length, and log nothing of the text.
- Tests: a database test that one account can neither read, change nor delete another's note,
  whatever it sends; that a deleted or erased account's notes are gone; and the grants, which
  `src/server/db/migration-grants.test.ts` and `tests/db/data-api-grants.test.ts` already check in
  every new migration.

**How it joins the page.**
- A separate, member-only part, loaded beside the view and never inside it.
  `buildMatchupPageView` stays the same for everyone: the stored abilities are cached per champion
  (`cachedFor`), and a member's note must never pass through that or any other cache shared
  between requests.
- The page reads the note with one keyed query on each render, only when both champions are
  chosen, and hands it to a client component of its own (the editor). The page is already rendered
  on each request (`force-dynamic`), so nothing is kept across members.
- Saving changes only that part: no `revalidatePath` of a shared page.
- Its words say whose it is ("Only you can see this note"), and "Written on patch 26.22" once the
  patch has moved.

**With the member, when they leave or ask.**
- Deleted with the account: the foreign key cascades, and permanent erasure deletes the account
  (`src/server/privacy/erasure.ts`), so the notes would go too. The erasure's preview would count
  them.
- A note that names someone else: erasure already replaces an erased person's names in notes
  others wrote (`notesToEdit` in `erasure.ts`). The table would join that list. Its rows belong to
  an account (`user_id`), where that list's belong to profiles, so its owner filter would compare
  the account.
- After a restore from a backup: importing the erasure records (`pnpm privacy:records import`,
  `scripts/privacy-records.ts`) re-applies them before the app is used. That deletes the erased
  accounts again, and their notes with them.
- Access: a member reads all their own notes in the app, which is their copy. A request is
  answered as any other (docs/PRIVACY.md, "Handling a request"): the owner says what is stored,
  and never sends anyone another member's notes.
- The privacy notice (`src/app/privacy/page.tsx`, "What is stored") would gain a line: the notes, the
  two champions, the patch and when they were saved; for the member's own preparation; seen only
  by them; kept until they delete them or their account, and in the encrypted weekly backups for
  up to 28 days. It needs the owner's approval and a new `PRIVACY_UPDATED` (docs/PRIVACY.md,
  "Changing the notice").
- Riot: a member's own text is not Riot data and needs no Riot request, but it is a change to the
  product, so the registered description would gain a few words with it.

**No AI.** It is the member's own text, stored and shown back. Nothing reads, summarises, suggests
or generates from it, and building it needs no model, key or outside service.

**What must be stable first.**
- The address and its ids: notes are keyed on Data Dragon's champion ids, as the address is
  (`?champion=&vs=`), one direction per pair, as the briefings are.
- The page's layout on a phone, so the notes get a fixed place without moving what is there.
- The owner's open decisions on Matchup Intel (For the owner), and the privacy notice's new line.
- The held migrations: the next free number after them (0066 is held by PR #212).

## For the owner

The steps only the owner can take. Steps 1 to 4 were for the first version (16 Nov 2026), and the
first three came before its merge, because a merge deploys; steps 5 to 8 were decided on 18 Nov
2026 (The owner's decisions of 18 Nov 2026); step 9 is done on this branch (19 Nov 2026), and steps 10
to 12 are open.

1. **Update the product's description in Riot's Developer Portal.** Done by the owner on 17 Nov
   2026 (Sydney): the description is now the one in RIOT_COMPLIANCE.md ("Description for the
   registration"; Registering the product, step 2). No key or endpoint changes. Its Matchup Intel
   part, word for word (`src/server/riot/registration-description.test.ts` keeps the two copies
   the same):

   > Matchup Intel, for signed-in accounts, is a static reference for two champions chosen by hand: each ability's base cooldowns per rank from Data Dragon, and notes written from the League of Legends Wiki (cited, with the patch), with briefings for selected matchups. It makes no Riot API request and has no timers or tracking.

   **For the redesign of 18 Nov 2026, the owner's action** (decision 6; it does not block the
   merge): paste the proposed description in RIOT_COMPLIANCE.md ("Proposed description for the
   registration"), whose Matchup Intel part is, word for word (the same test keeps the two copies
   the same):

   > Matchup Intel, for signed-in accounts, is a static reference for two champions chosen by hand: each ability's base cooldowns per rank from Data Dragon; the kinds of mechanic Riot's own ability text in Data Dragon (descriptions and tooltips) names, such as crowd control, mobility and shields, each with the clause it quotes, labelled as reviewed automatically; and notes written from the League of Legends Wiki (cited, with the patch), with briefings for selected matchups and, for other pairs, each champion's facts set side by side. It makes no Riot API request and has no timers or tracking.
2. **Say who curates the notes, and who approves briefings.** Done on 17 Nov 2026 (Sydney; 16 Nov,
   21:16 UTC): the owner alone curates and approves them. The owner approved the three briefings
   (Ambessa vs Renekton, Gwen vs Ornn, Riven vs Mordekaiser, sent as screenshots) "for now", and
   set the rule for every note: "Don't assume, if you don't know because the wiki doesn't say then
   don't use that data." So the three readings that were not on their own pages (Ambessa's Q,
   Renekton's E and Gwen's R "starts after the first cast") were taken out (Cooldowns,
   `"after-first-cast"`), and AI agents then audited every note against the saved copies of the
   pages it cites, under that rule. By the nine auditors' tallies 59 items were not stated, among
   them words that add "only", "all", "each", "first" or a timing, cooldown notes that name which
   effect a post-effect start waits for, lists read from an interaction table whose template was
   not saved, effects, terms and tags no page gives, and header claims. Each was reworded to what
   its page states or removed, except nine the audit said to keep: eight header sentences, once the
   rest was fixed (seven) or once `verified.checkedOn` moved to 17 Nov (one), and Renekton's
   passive `maxRank: 1`, which Data Dragon does not give and its header now calls the app's
   placeholder. Re-audits of the changed lines, and of lines the editors flagged, returned 28
   findings (27 distinct, among them a sum, a disputed ratio and a sentence copied
   too closely from the wiki): 26 were applied (Gwen's added-up totals removed rather than
   recorded), and one was not: the request to restore the Ambessa vs Renekton opportunity's "only",
   which that file's audit had classed stated, and its "before ability haste" unless the qualifier
   went from every file; this pass dropped that sentence's "only" and the qualifier everywhere. Each file's `verified.checkedOn` is now 17 Nov 2026. No person
   has checked each fact against its page, and the corrections reworded parts of the three approved
   briefings. The owner's rule is also that a briefing appears only where a person wrote and
   checked it.
3. **Approve the Resources navigation change** (approved by the owner on 17 Nov 2026, Sydney):
   Resources becomes one sidebar entry for two
   sections, Library and Matchup Intel, with their tabs at the top of both pages, phones included.
   Superseded on 18 Nov 2026 by the owner's next decision: Matchup Intel is a sidebar entry of its
   own and Resources the Library alone, with no tabs (Where it is).
4. **Approve the merge** (approved by the owner on 17 Nov 2026, Sydney), which deploys to production (CLAUDE.md §4: within the deploy budget, the
   "merge" method and the exact head), then read the Production check on the deployed commit.
5. **The Production check opens Matchup Intel signed in.** Decided on 18 Nov 2026 (decision 11):
   one page load, Riven vs Mordekaiser at the check's desktop size, 1440 × 900 and again with the
   window made 1920 × 1080, which checks the heading, the layer and its label, the enemy's five tiles
   (or, with none stored or none readable, that the page says so, as a warning), no page scroll at
   1920 × 1080 and the five tiles and
   the sources' summary on the screen at 1440 × 900 (the fit the owner asked for; since 19 Nov 2026
   no longer "no page scroll at 1440 × 900", which production's patch 26.23 alone fails: the page is
   23px taller than 900 there, all of it in view), a briefing hidden as too old or for a change passing and saying what it found, the Data
   Dragon version, the wiki's licence and Riot's notice one press away, that nothing is requested from
   the wiki, and axe (LIVE_VALIDATION.md; `scripts/matchup-intel-facts.mjs` and its unit test). It costs one more page load of Vercel Active CPU on every run, after each
   deploy and daily (a member page took 37–105 ms of server CPU in the local measurements,
   HOSTING_USAGE.md). With it, a change to the page can be production-verified (CLAUDE.md §5).
6. **Decide whether Riot's own numbers show where nobody has checked them** (the design's D7).
   Today they do, on every champion without curated notes, only where they pass the guard
   (Cooldowns) and labelled "Riot's data, not reviewed": 600 of the 865 abilities in Data Dragon
   16.22.1. The other choice is curated numbers only, which needs a code change: no switch exists.
7. **Decide how long a check holds.** Today a briefing is hidden, and champion notes are flagged,
   once more than two patches have come since their check (`MAX_PATCHES_UNCHECKED`, Data,
   "Freshness"), the design's default; one or two patches on, they show with "Not re-checked for
   26.23".
8. **How long a briefing may be.** Decided on 18 Nov 2026 (decision 7): the curated texts stay word
   for word (178 to 243 words; up to 300 characters a text and four lane points, `curated.test.ts`).
   The dashboard shows the threat and the opportunity side by side and the first two lane points,
   and folds the rest behind their count; the briefing's title is "Curated briefing", no longer
   "The ten-second briefing".
9. **Import the reviewed facts from Riot's text.** Done on 19 Nov 2026 on this branch: all 173
   files of the completed review (1,112 facts, 7 disagreements), with the review record added to the
   table first (Facts from Riot's text); then `pnpm verify`, the build, the browser specs (the fit
   on one screen included, re-measured with the facts: The dashboard) and screenshots. The review's
   own summary, with the decisions it leaves to the owner (the count-like words, the C5 swaps, Fizz E,
   the K'Sante-shaped markers and the others), is
   [MATCHUP_INTEL_RIOT_TEXT_REVIEW.md](MATCHUP_INTEL_RIOT_TEXT_REVIEW.md), "For the owner": each
   decision there changes rows of the table, and a new import then changes the committed files.
10. **Paste the proposed description** (step 1) in the Developer Portal, **then switch the facts from
    Riot's text on.** The layer ships in the code, switched off (release 4, 19 Nov 2026: What it is),
    so the merge did not wait for the registration. Once the new text is pasted, the one-line change
    is `RIOT_TEXT_FACTS_ENABLED = true` in `src/server/matchup-intel/riot-text/switch.ts`, through a
    pull request like any other (its CI runs the layer's tests on as before); after its deploy, the
    Production check's Matchup Intel facts hold either way (Riven vs Mordekaiser has checked notes on
    both sides, so it shows no fact from Riot's text, on or off).
11. **Decide who may review the facts from Riot's text, and the words for a person's check.** Today
    two automated reviewers, an adjudicator and two consistency checkers did, and the label says "not
    by a person" (decision 5). A person's review of a champion would be recorded in its row of the
    table (`reviewRecord.checkedByPerson`) and change its label; until the owner decides those words,
    the importer refuses such a record and the page leaves such a file out (Facts from Riot's text,
    "How a later person's review upgrades a row").
12. **Confirm the second monitor's settings.** The single screen is measured at 100% zoom with the
    browser's usual text size: a maximised browser on a 1920 × 1080 screen leaves about 1920 × 950,
    and an operating system's display scale above 100% gives the browser fewer CSS pixels (a 2560 ×
    1440 screen at 125% is 2048 × 1152; a 1920 × 1080 screen at 125% is 1536 × 864). Measured on 19
    Nov 2026 on the final build for 8 pairs (the curated three and their reverse, Riven vs Darius,
    Garen vs Darius), each page loaded at each size: at 2048 × 1152 all fit; at 1536 × 864 seven fit,
    Ambessa vs Renekton scrolling by 3px, the page's own bottom padding; on production's patch 26.23
    (the notes "Not re-checked for 26.23") six, Ambessa vs Renekton by 48px (its sources' summary 9px
    under the window's foot) and Riven vs Mordekaiser by 26px; at 1366 × 768 and 1280 × 720 every
    pair scrolls, by up to 367px and 475px (402px and 510px on 26.23), the page reflowing rather than
    clipping. If the second monitor's window is smaller than 1920 × 950, saying which size it gives
    lets the layout be tuned for it.

The open compliance questions above keep their defaults unless the owner decides otherwise.
