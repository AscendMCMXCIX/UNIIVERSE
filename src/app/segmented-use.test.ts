import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/*
  One look for a choice of a few (Release 17, the owner's brief §9, 24 Nov 2026): the shared,
  text-led controls of src/components/ui (segmentedGroupClass and segmentClass, SubTabs, chipClass),
  never a page's own boxed group. This test reads every component and page outside
  src/components/ui and refuses the two parts of the old boxed look written by hand:
  - a boxed group: one class list with a fill (bg-bg-elevated or bg-surface*), a 2px inset (p-0.5)
    and an outline (border or ring), the frame the segments sat in;
  - a boxed selection: an item marked chosen by an accent ring (ring-accent at any opacity, not
    the violet ring-accent-2) or by the accent fill bg-accent/15.
  A genuine exception goes in ALLOWED with its reason: a picture or colour chosen from a grid,
  where the picture itself is the choice and a ring round it is the mark, or something that is not
  a control at all (a badge, the phone's bottom tab bar, which is navigation and keeps its pill).
*/

const ROOT = path.join(__dirname, "../..");
const SCAN = ["src/components", "src/app"];
const SHARED = "src/components/ui/";

type Kind = "boxed-group" | "accent-ring" | "accent-fill";

/** Exceptions: the file, what it may draw, and why. Each must still match something (a stale entry fails). */
const ALLOWED: Array<{ file: string; kind: Kind; reason: string; optional?: true }> = [
  { file: "src/components/players/customise-card.tsx", kind: "accent-ring", reason: "Card Studio's frames, skins, emblems and the chosen champion's portrait (a picture chosen from a grid, ringed); its text choices are being rebuilt on the shared helpers in Release 17's Card Studio overhaul", optional: true },
  { file: "src/components/players/customise-card.tsx", kind: "accent-fill", reason: "a chosen skin's caption under its picture, part of the picture's tile; the rest goes with Release 17's Card Studio overhaul", optional: true },
  { file: "src/components/mobile-nav.tsx", kind: "accent-fill", reason: "the phone's bottom tab bar: navigation, its current tab's pill is the installed app's convention (docs/MOBILE.md)" },
  { file: "src/components/match-history/multikill-tag.tsx", kind: "accent-fill", reason: "a pentakill's badge, not a control" },
  { file: "src/components/install/install-app.tsx", kind: "accent-fill", reason: "the number of an install step, not a control" },
  { file: "src/components/settings/branding-panel.tsx", kind: "accent-fill", reason: "a sample of the accent in Branding's preview, not a control" },
  { file: "src/components/champions/champion-grid.tsx", kind: "accent-ring", reason: "a champion's portrait chosen from the grid, ringed" },
  { file: "src/components/champions/sortable-pool.tsx", kind: "accent-ring", reason: "a pool's champion while it is dragged, not a choice" },
  { file: "src/components/team/team-roster.tsx", kind: "accent-ring", reason: "a lineup card lifted while it is dragged, not a choice" },
  { file: "src/components/profile/profile-editor.tsx", kind: "accent-ring", reason: "the champion search's panel while it is open, not a choice" },
  { file: "src/components/profile/profile-editor.tsx", kind: "accent-fill", reason: "a pool's drag handle while its champion is picked up, not a choice" },
  { file: "src/components/profile/add-champion.tsx", kind: "accent-ring", reason: "the champion search field's focus, not a choice" },
  { file: "src/components/mobile-nav.tsx", kind: "accent-ring", reason: "your own picture on the phone's current tab: navigation" },
  { file: "src/components/match-history/team-composition.tsx", kind: "accent-ring", reason: "a member's champion portrait, marked: not a control" },
  { file: "src/components/match-history/match-history-view.tsx", kind: "accent-fill", reason: "the pager's current page: a numbered button among buttons, not a choice of a few" },
  { file: "src/components/match-history/performance-panel.tsx", kind: "accent-ring", reason: "the opened game's timeline, rewritten in Release 17 (the opened game)", optional: true },
  { file: "src/components/match-history/scoreboard.tsx", kind: "accent-ring", reason: "the scoreboard's selected participant: a table row, not a choice of a few (the opened game, docs/MATCH_NOTES.md)", optional: true },
];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return files(full);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

/** A class without its variants ("hover:bg-accent/15" → "bg-accent/15"). */
const utility = (token: string) => token.slice(token.lastIndexOf(":") + 1).replace(/^!/, "");

/** The class lists of a source: every string literal with at least one space or a Tailwind-looking token. */
function literals(source: string): string[] {
  return [...source.matchAll(/"([^"\n]*)"|`([^`]*)`|'([^'\n]*)'/g)].map((m) => m[1] ?? m[2] ?? m[3] ?? "");
}

/** What a class list draws of the old boxed look. */
export function boxedParts(list: string): Kind[] {
  const tokens = list.split(/\s+/).filter(Boolean);
  const plain = tokens.filter((t) => !t.includes(":")).map(utility);
  const all = tokens.map(utility);
  const kinds: Kind[] = [];
  const fill = plain.some((t) => t === "bg-bg-elevated" || /^bg-surface(-\d)?(\/\d+)?$/.test(t));
  const outline = plain.some((t) => /^(border|ring)(-\d)?$/.test(t) || t === "ring-inset");
  if (fill && outline && plain.includes("p-0.5")) kinds.push("boxed-group");
  if (all.some((t) => /^ring-accent(\/\d+)?$/.test(t))) kinds.push("accent-ring");
  if (all.some((t) => t === "bg-accent/15")) kinds.push("accent-fill");
  return kinds;
}

describe("shared selection controls", () => {
  it("recognises the old boxed group and selection", () => {
    expect(boxedParts("inline-flex rounded-lg border border-border-control bg-bg-elevated p-0.5")).toEqual(["boxed-group"]);
    expect(boxedParts("bg-accent/15 font-semibold text-fg ring-1 ring-inset ring-accent/60")).toEqual(["accent-ring", "accent-fill"]);
    expect(boxedParts("ring-1 ring-inset ring-accent-2/60")).toEqual([]);
    expect(boxedParts("text-fg after:bg-accent")).toEqual([]);
    expect(boxedParts("rounded-lg border bg-bg-elevated p-3")).toEqual([]);
  });

  it("pages draw no boxed group or boxed selection of their own (src/components/ui draws them all)", () => {
    const found: string[] = [];
    const used = new Set<string>();
    for (const dir of SCAN) {
      for (const file of files(path.join(ROOT, dir))) {
        const rel = path.relative(ROOT, file).split(path.sep).join("/");
        if (rel.startsWith(SHARED)) continue;
        for (const list of literals(readFileSync(file, "utf8"))) {
          for (const kind of boxedParts(list)) {
            const allowed = ALLOWED.find((a) => a.file === rel && a.kind === kind);
            if (allowed) used.add(`${rel} ${kind}`);
            else found.push(`${rel}: ${kind} in "${list.slice(0, 120)}"`);
          }
        }
      }
    }
    expect(found, "use segmentedGroupClass / segmentClass, SubTabs or chipClass (src/components/ui/segmented.tsx), or add an exception with its reason").toEqual([]);
    const stale = ALLOWED.filter((a) => !a.optional && !used.has(`${a.file} ${a.kind}`)).map((a) => `${a.file} ${a.kind}`);
    expect(stale, "exceptions that no longer match anything: remove them").toEqual([]);
  });
});
