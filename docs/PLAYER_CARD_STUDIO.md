# Player Card Studio

The Studio is the editor behind **Customise** on a player's card. It opens from your own Team card or from a profile header. It changes how one card looks everywhere it appears:
- the Team card;
- the Players directory card;
- the profile header;
- the Studio's own preview.

## Using it

- **Seven sections**, in the order most players go. Links appears on your own card only.
  1. **Style**: a preset, the background (champion art, your banner or colours only) and the frame.
  2. **Artwork**: the champion and skin.
  3. **Position**: focus, zoom, darkness, blur and vignette.
  4. **Colours**: a palette, custom colours, the colour wash, highlight, border and avatar frame.
  5. **Identity**: tagline, emblem, name style and theme.
  6. **Links**: your YouTube, Twitch and Discord, each with who may see it.
  7. **Effects**: glow, shimmer, moving colour wash, motif and intensity.
- **Presets.** One tap sets a whole look: UNIIVERSE, Minimal, Competitive, Arcane, Crimson, Monochrome or Neon.
  - A preset sets colours, frame, effects, name style, theme and the background veil.
  - It never changes your champion, skin, banner, focal point, tagline or emblem.
  - Anything can be changed afterwards.
- **One draft.** Every change stays until Save or Cancel, whichever section you move to, and when a phone turns.
- **Moving between sections.**
  - Desktops: the numbered step bar in the header, and Back and Next in the action bar.
  - Phones and tablets: one section bar above the controls. It shows the section you are in (its number, name and what it holds), with previous and next beside it. Tapping it lists every section; the ones you changed are marked **Changed**. Escape or a tap outside closes the list.
- **Live preview.** Team card, Phone and Players views. It follows every change at once.
  - Desktops and phones held sideways: beside the controls.
  - Phones and tablets held upright: compact above the controls, at one scale for every view.
    - **Hide** puts it away to a small live strip, so the controls get the screen. Each device remembers the choice.
    - **Full card** shows the whole card at its real size in any view, over the controls. The action bar stays; **Done** returns to the section.
  - While the on-screen keyboard is up, the preview moves to the strip and the window fits above the keyboard, so the field and Save stay in view.
- **Sections on phones.**
  - Artwork shows the chosen champion with **Change**. The champion grid opens in place and closes when you pick one. Skins are large thumbnails; the chosen one has a check and its name beside the heading.
  - Sliders have a large track with the value beside each one.
  - An effect that needs something else says so. The moving colour wash needs a colour wash and links to Colours; the intensity waits until an effect is on.
- **Saving.** Nothing is saved until **Save**.
  - **Cancel**, Escape, the close button, Android's back gesture and the browser's Back all ask before discarding changes ("Discard your changes?", in the action bar). Without changes they simply close.
  - Going back a second time while that question shows leaves without asking again. Android lets a page hold back only one back gesture at a time, and Back behaves the same everywhere.
  - Reloading or closing the tab with changes asks the browser's own question.
  - Each changed setting has its own **Reset**. **Reset look** asks first, then returns to the standard card but keeps your champion, tagline and emblem.

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
  - unknown fields are dropped;
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
| Browser behaviour | `e2e/card-studio.spec.ts` |
| Phones: the section bar, preview, confirmations, keyboard, held sideways | `e2e/studio-mobile.spec.ts` |
| Every control by touch on five devices, and Save keeping it all | `e2e/studio-touch.spec.ts` |

The browser tests cover:
- presets and live preview;
- Cancel, Escape and the browser's Back;
- the saved look on the profile, Team and Players;
- equal card heights and aligned figures;
- reduced motion;
- on phones:
  - the section bar and its list;
  - hiding and remembering the preview, and the full card in every view;
  - edits kept across sections and when the phone turns;
  - Reset look and Discard asking first;
  - the keyboard: emulated by shortening the browser's visual viewport, as headless Chromium has no on-screen keyboard;
  - every control by touch on Chromium's emulation of an iPhone SE, an iPhone 15 held either way, a Pixel 7 and an iPad Mini (not real devices).
