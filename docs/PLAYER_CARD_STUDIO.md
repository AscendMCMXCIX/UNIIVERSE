# Card Studio

Card Studio (Player Card Studio until Release 17) is the editor behind **Customise** on a player's card. It opens from your own Team card or from a profile header. It changes how one card looks everywhere it appears:
- the profile header (the phone's card and the desktop's band);
- the Team card (five across on a desktop, the carousel on a phone) and the public team page's card;
- the Players row (from tablets up a faint strip of the chosen art, `RowArtStrip`) and the Leaderboards names (name style and emblem, through `CardName` under `cardColourVars`);
- the player Peek's hero.

Rows carry no card frame or effect, and phones download nothing for a row's look.

## Using it (Release 17, 24 Nov 2026)

- **Four sections, open in any order.** No steps, numbering, counters, Next or Back: choose a section, change something, Save. Socials appears on your own card only.
  - **Appearance**: the style presets, drawn on your own artwork with each preset's veil, wash, frame and name style (one picture for all seven: the preview's, already loaded); the palettes. Folded: custom colours, the colour wash, highlight and card surface; frame, border and avatar frame; effects (open by itself while an effect is on).
  - **Artwork**: background (champion art, your banner or colours only), champion and skin (the chosen champion with Change; skins the first twelve and Show all, in the section's own scrolling), position, and readability (darkness; folded: blur and vignette).
  - **Identity**: tagline, emblem, name style.
  - **Socials**: YouTube, Twitch and Discord, each with its Show publicly switch (off until you switch it on; on, teammates and the public team page see it).
- **Presets** set the look only (colours, frame, effects, name style, card surface and the veil). They never change the champion, skin, banner, artwork position, places' own positions, tagline, emblem or links.
- **One draft.** Every change stays until Save or Cancel, whichever section you move to, and when a phone turns. A section with changes is marked on its tab, and the header says **Unsaved changes**.
- **Undo and Redo** (buttons in the header; Ctrl/⌘ Z, Shift Ctrl/⌘ Z and Ctrl Y outside a text field, which keeps its own) step through the look, the artwork and the banner. A burst of changes (a drag, a word typed) is one step. Client state only, emptied when the Studio closes.
- **Resets.** Each changed setting has its own Reset (to the standard value); each part of a section has **Undo changes** (back to the saved card); **Reset look** returns to the standard card at once, keeping your artwork, tagline and emblem (Undo brings the look back, so it no longer asks first).
- **Saving.** Nothing is saved until **Save**. Cancel, Escape, the close button, Android's back gesture and the browser's Back ask before discarding changes ("Discard your changes?", in the action bar); without changes they close. Reloading or closing the tab with changes asks the browser's own question.

## The preview

- **Large.** On desktops the preview column is 45% of the window (`lg:grid-cols-[9fr_11fr]`; the window is `min(100% − 3rem, 100rem)` by `min(100% − 3rem, 64rem)`), the controls the rest. Measured at 1440 × 900: the window 1392 × 852, the preview pane 626px (45%). Phones and tablets: above the controls, up to a third of the screen (`clamp(8.5rem, 32dvh, 19rem)`) and in Fit no taller than the place at the scale the width allows (`StudioPreview`'s `hug`: a phone's header for Demo Mid takes 197px, not 272), shrinking to a strip while the on-screen keyboard is up; held sideways it stands beside the controls. The page budgets (studio@i15, 1.3 screens with an iPhone's safe areas) measured 1.43 with the stage at its full height and the section's parts 24px apart; 1.29 now (the stage hugging, the parts 16px apart below sm).
- **One chooser, one switch.** The place (Profile header, Team card, Players list, Player Peek, Public team page), Desktop or Mobile, and **Fit** (the whole place, as large as the room allows, up to 1.6× its size) or **Actual size** (its CSS size, the stage scrolling where it is larger). Neither changes the saved zoom. Fit or Actual size is remembered on the device (Settings → On this device). The Studio opens on the place it was opened from, on the screen it is on.
- **The pages' own components** (`studio-preview.tsx`): `ProfileHeader`, Team's `RosterCard` laid out by `LineupPreview` in the lineup's own track and slide classes, the Players row in the list's own panel and grid (`DIRECTORY_PANEL`, `DIRECTORY_GRID`), the Peek's hero from `playerDetail`, the public page's card (the same card as a guest, with the public page's rules: no figures unless the server shows Riot data publicly). Each is drawn with the draft look inside a same-origin `<iframe>` as wide and tall as the screen it stands for (this window on a desktop with its sidebar as it is, else 1440 × 900; this phone held upright, else 390 × 844), whose document carries the app's own stylesheets, with React rendering into it (a portal). Media queries, container queries, viewport units and fonts are therefore the real screen's: a phone's header previewed on a desktop is laid out as a phone lays it out. The page around the component is the app shell's (`MAIN_CLASS`, `FRAME_CLASS`, `TEAM_PAGE_CLASS`, `PUBLIC_MAIN_CLASS`: checked against their sources by `studio-preview.test.ts`), and a phone's bars (97px), so the Team card on a phone is exactly as tall as on Team.
  - The frame is inert and hidden from screen readers; the stage is an image named after what it shows.
  - Nothing new is downloaded or requested: the stylesheets, fonts and pictures are the page's own addresses (cached), one context is drawn at a time, and the preview asks the server for nothing. The figures the profile does not load are fetched once when the Studio opens, as before (`cardPreviewFiguresAction`, which now also returns the season's label).
  - Known differences, by design: the Team card five across shares its row's height with its teammates (`align`), which a one-card preview cannot know; the Peek's line of ranked progress over 30 days is Team's data, absent when the Studio is opened from a profile; the public page's card assumes the player is shown there.

## Artwork position

- **In the preview.** The artwork's box (the crop) has a fine outline. Drag the artwork (mouse or finger), pinch or use the wheel to zoom, or focus it and use the arrow keys (Shift for larger steps) and + and −. While it moves, the rest of the picture shows faintly around the crop. The sliders under Artwork → Position set the same values precisely.
- **Shared, or a layout of its own.** Every place uses the shared focal point and zoom until one is given its own (**Every layout** / **⟨place⟩ only**). Places: the profile header on a desktop (its band) and on a phone, the Team card five across (a portrait) and on a phone or tablet (a landscape), the Players row's strip, the Peek. The public page's card shares the Team card's two. **Use shared position** (or the chip's reset in the list of layouts with their own) takes a place back to the shared position.
- **Stored** as `card_style.art.places` (optional; left out when there are none, so every style saved before reads, renders and saves exactly as it did; `normaliseCardStyle` keeps known places only, clamped). A save always sends the field (`{}` when every place was reset). The components read it through CSS variables chosen by the same queries their layout uses (`CardArtLayer`'s `place` and `narrow`: `band` for the header, `lineup` for the Team card), so the server's page is right at every width.

## The profile header

- **Desktop band taller** (TALL_BAND, `profile-header.tsx`, from lg): in a window 1000px tall or more, 6.5rem of content around a 5rem picture, 44% more than the 72px before: 117px at 1920 × 1080 (82 before). Where the root text grows past 18.5px (2560 wide and more) it stops at 120px of content around a 96px picture: 122px at 2560 × 1440 (95 before, 28% more) and at 3440 × 1440 (about 101 before); uncapped, 145px there took Match History to 1.369 screens against the plan's 1.35 (1.353 capped). In a shorter window (1440 × 900, the owner's 1920 × 950) 5.25rem, 17% more: 86px at 1440 (74 before), 95px at 1920. The identity is drawn over a shade rising from the band's left edge, the art clear on the right. The other sections draw the same band (UD.PO1).
- **The trade-off.** The profile's Overview fits 1920 × 950 (sidebar open or folded), 1920 × 1080 and 1440 × 900 whole (Release 16). Before this change its tallest member left 6px at 1920 × 950 and 13px at 1440 × 900; the full 44% ran 29px and 19px past those windows. So shorter windows get 17% more, and the tabs give back 10px of the gap under them on desktops (`ProfileFrame`). Measured with every seeded member: nothing scrolls at the five sizes.
- **Tablets and phones unchanged**: a tablet keeps the 74px band (106px on an iPad at 810 × 1080 took Encounters to 1.026 screens against the plan's one screen); a phone's card is 142px for Demo Top at 390 wide, as before.

## Options

| Category | Options |
|---|---|
| Artwork | Background: champion art (any champion, any distinct skin), your own banner, or colours only. Horizontal and vertical focus (or automatic), zoom 100–200%, background darkness 25–90%, blur 0–12 px, vignette 0–80%. |
| Colours | 10 palettes, or any primary and secondary colour (#rrggbb). Colour wash: none, diagonal, across, halo. Highlight strength. Border: subtle, primary, secondary, gradient. Avatar frame: primary, secondary, gradient, neutral, none. |
| Frame | No frame, Minimal, Clean outline, Double line, Angular, Soft glow, Premium. |
| Identity | Tagline (plain text without line breaks, 40 characters; on the card it closes the identity, under the rank, wrapping and whole). Emblem from 24 curated icons. Name style: standard, bold, wide caps, italic. Card theme: midnight, deep, tinted. |
| Effects | Ambient glow, accent shimmer, moving colour wash, motif (corners, lines, dots, rings), intensity. |

## Compatibility

- **Existing cards.** Champion, skin and accent stay in their existing columns.
  - The Studio's settings are in `players.card_style`, a JSON column.
  - A card with no saved style is drawn by `legacyCardStyle(card_accent)`, which produces the same veil, accent glow and border as before.
- **No data rewrite.** Migration 0032 only adds:
  - `card_style`;
  - `card_banner_version`;
  - the `player_card_banners` table.
- **Older readers.** `card_accent` is still written when the primary colour is one of the old accents. Code that only knows accents keeps working.
- **Avatar ring.** It now follows the card's avatar frame, which by default is the card's primary colour. On cards with a non-cyan accent the ring takes that accent instead of the theme cyan.

## Safety

- **Validation.** Every stored or submitted value passes through `normaliseCardStyle`:
  - unknown fields of a submission are dropped (a save keeps the unknown fields the server itself stored before, `keepStoredExtras`: a newer version's field survives a save by an older one);
  - numbers are clamped;
  - options are checked against fixed lists;
  - colours must be `#rrggbb`.

  CSS, URLs and HTML cannot get into a card.
- **Taglines.** They are cleaned (invisible and direction-override characters removed, whitespace collapsed, 40 characters) and rendered as text. A tagline is refused if it claims:
  - an official title or app role (Riot, official, verified, admin, owner, Draft Lead…);
  - a rank or result (Challenger, "Diamond 2", "850 LP", "Rank 1", "World champion"…).
- **Readable colours.** Text and icons drawn in a custom colour use `readableColour`, a shade lightened only until it reaches 4.5:1 on the card surface. The veil darkness has a floor of 25%.
- **Banners.**
  - The browser crops very tall pictures to landscape, scales to 1600 px wide and encodes as WebP or JPEG under 440 KB.
  - The server checks the real type from the bytes (PNG, JPEG or WebP), the size (450 KB) and the dimensions (at least 320 px wide, landscape, at most 2000 px).
  - Banners are stored in the database like profile pictures.
  - They are served at `/api/card-banners/<player>?v=<version>` to signed-in members only, with `nosniff` and `Content-Security-Policy: default-src 'none'`.
  - The public team page shows the cards of the lineup and the substitutes, banner included: `/api/public/card-banners/<player>` serves it to anyone for a player on that page, and nobody else's (docs/UNIIVERSE_TECHNICAL_HANDOVER.md §C4). The Studio's banner help says so.
  - Deleting a player deletes their banner.
- **Permissions.** Style, banner upload and banner removal all go through `requirePlayerEditor`:
  - a player edits only their own card, and personal-use accounts can too;
  - the Owner and player managers may edit any card.

## Performance

- **No extra downloads.** Frames, washes, motifs and glow are CSS layers and shadows. A banner is downloaded only when a card uses one.
- **Directory cards.** They leave out motifs, the shimmer and the glow.
- **Animations.** The shimmer and the moving wash are the only animations. Each is one slow CSS loop that moves with transforms only (composited, no repaint each frame) and stops for `prefers-reduced-motion`. On pages with several cards (Team) they play only while a card is hovered or focused, so five cards never animate at once; a single card (profile header, Studio preview) plays them.
- **Responsive editing.** The champion grid and skin thumbnails are kept apart from the style (memoised, stable callbacks), so a slider or a colour never re-renders them. The preview image sits on its own layer with a short zoom transition. The Studio dialog's backdrop is a plain dim (a full-screen backdrop blur was recomposited on every frame of every change).
- **Measured** (demo server, synthetic data, five styled cards, 4x CPU throttling, before → after Phase 15): slider input to paint 127 → 33 ms median (p95 195 → 35); colour 137 → 34 ms; preset 355 → 180 ms; idle main-thread work on Team 186 → 36 ms per 3 s.
- **Fresh pages after a save.** A save revalidates Team, Players (including every profile under it), Overview, Leaderboards and Matches, so every page shows the new look on its next request. Other caching is unchanged.

## Tests

| Area | File |
|---|---|
| Rules: defaults for old cards, validation, presets, taglines, contrast | `src/domain/card-style.test.ts` |
| Storage and banners | `tests/db/card-studio.test.ts` |
| Permissions and what a save accepts | `tests/db/card-studio-actions.test.ts` |
| Places' own positions, saved styles round-tripped (load → save → load), stored fields kept | `src/domain/card-style.test.ts` |
| Each preview imports the page's component; the page frame is the app shell's | `src/components/players/studio-preview.test.ts` |
| Browser behaviour: four sections, Undo and Redo, positioning, the saved look, proportions | `e2e/card-studio.spec.ts` |
| Each preview against its page (sizes, the art's box, position and zoom, picture, name, shades), and nothing downloaded | `e2e/studio-previews.spec.ts` |
| Phones: tabs, preview, touch positioning and pinch, confirmations, keyboard, held sideways | `e2e/studio-mobile.spec.ts` |
| Every control by touch on five devices, and Save keeping it all | `e2e/studio-touch.spec.ts` |
| Players: every row whole, a row of two lines 4rem tall, rows side by side level, its pool whole, at nine sizes; one toolbar row with any role chosen; pools that follow the role filter; short narrow windows; 200% text | `e2e/players-directory.spec.ts` |
| The pool on a row (both portrait sizes): whole portraits, the rest counted, never "+1", at every width | `src/components/players/pool-fit.test.ts` |

The phone tests use Chromium's emulation (touch events through CDP, the keyboard emulated by shortening the visual viewport) of an iPhone SE, an iPhone 15 held either way, a Pixel 7 and an iPad Mini, not real devices; WebKit's run (`webkit.spec.ts`) opens the Studio and switches its tabs on an iPhone-sized WebKit.
