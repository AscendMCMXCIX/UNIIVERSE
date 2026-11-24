import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CONTEXT_PLACE, FRAME_CLASS, MAIN_CLASS, PREVIEW_CONTEXTS, PUBLIC_MAIN_CLASS, TEAM_PAGE_CLASS } from "./studio-preview";

/*
  Card Studio's previews are the pages' own components, never copies (studio-preview.tsx). These
  checks read the sources: each preview imports the component its page draws, the page still draws
  it, and the page frame the previews put around a component is still the app shell's.
*/

const src = (path: string) => readFileSync(join(process.cwd(), "src", path), "utf8");
const preview = src("components/players/studio-preview.tsx");

describe("each preview is the page's own component", () => {
  it("the profile header: ProfileHeader, as the profile's frame draws it", () => {
    expect(preview).toMatch(/import \{ ProfileHeader \} from "\.\/profile-header"/);
    expect(preview).toMatch(/<ProfileHeader preview /);
    expect(src("components/players/profile-sections.tsx")).toMatch(/<ProfileHeader identity=/);
  });

  it("the Team card and the public page's card: RosterCard, laid out by the lineup's own track (LineupPreview)", () => {
    const roster = src("components/team/team-roster.tsx");
    expect(preview).toMatch(/import \{ LineupPreview, playerDetail \} from "@\/components\/team\/team-roster"/);
    // LineupPreview draws RosterCard in the same track and slide classes as TeamRoster.
    const lineupPreview = roster.slice(roster.indexOf("export function LineupPreview"));
    expect(lineupPreview).toMatch(/<RosterCard /);
    expect(lineupPreview).toMatch(/trackClass\(/);
    expect(lineupPreview).toMatch(/cellClass\(/);
    const teamRoster = roster.slice(roster.indexOf("export function TeamRoster"));
    expect(teamRoster).toMatch(/className=\{trackClass\(!!guest\)\}/);
    expect(teamRoster).toMatch(/className=\{cellClass\(!!guest\)\}/);
    expect(teamRoster).toMatch(/<LineupCard /);
    expect(roster).toMatch(/<RosterCard \{\.\.\.props\}|<RosterCard[\s\S]*?\/>/);
    // The public page is TeamRoster as a guest.
    expect(src("app/public/page.tsx")).toMatch(/<TeamRoster[\s\S]*?guest=\{\{/);
  });

  it("the Players row: RosterRow in the list's own panel and grid", () => {
    expect(preview).toMatch(/import \{ DIRECTORY_GRID, DIRECTORY_PANEL, RosterRow \} from "\.\/roster-row"/);
    const directory = src("components/players/players-directory.tsx");
    expect(directory).toMatch(/<RosterRow/);
    expect(directory).toMatch(/className=\{DIRECTORY_PANEL\}/);
    expect(directory).toMatch(/className=\{DIRECTORY_GRID\}/);
  });

  it("the Peek: the hero playerDetail gives Team's and Players' Peek", () => {
    expect(preview).toMatch(/playerDetail\(\{/);
    expect(src("components/players/player-peek.tsx")).toMatch(/playerDetail\(\{/);
  });

  it("the setup's preview is the Team card too (no card built of its own)", () => {
    const setup = src("components/players/card-preview.tsx");
    expect(setup).toMatch(/<LineupPreview /);
    expect(setup).not.toMatch(/CardIdentity|CardArtLayer/);
  });
});

describe("the page around a previewed component is the app's", () => {
  it("main and the frame are the app shell's own classes", () => {
    const shell = src("components/app-shell.tsx");
    expect(shell).toContain(`className="${MAIN_CLASS}"`);
    expect(shell).toContain(`const FRAME = "${FRAME_CLASS}"`);
    expect(src("app/public/layout.tsx")).toContain(`className="${PUBLIC_MAIN_CLASS}"`);
    expect(src("app/(app)/team/page.tsx")).toContain(`className="${TEAM_PAGE_CLASS}"`);
  });

  it("every preview names the artwork place it shows, the same on the page", () => {
    for (const c of PREVIEW_CONTEXTS) expect(Object.keys(CONTEXT_PLACE[c]).sort()).toEqual(["desktop", "mobile"]);
    expect(src("components/players/profile-header.tsx")).toMatch(/place="header" narrow=\{HEADER_NARROW\}/);
    expect(src("components/team/team-roster.tsx")).toMatch(/place="card" narrow=\{CARD_NARROW\}/);
    expect(src("components/team/team-roster.tsx")).toMatch(/place="peek"/);
    expect(src("components/players/card-art.tsx")).toMatch(/placeVars\(look\?\.style \?\? null, "row"/);
  });
});
