import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/*
  Every member and admin page establishes access itself, with requirePageAccess
  (src/server/auth/page-access.ts). A layout's check does not protect its pages: Next.js renders a
  layout and its page at the same time, so a page without its own check still runs, and what it
  renders is sent in the response even when the layout redirects. On 2 Nov 2026 a made-up session
  cookie read a teammate's linked Riot accounts (Riot IDs, PUUIDs, ranks) from the body of the
  redirect to /login that /players/[id]/accounts answered with.

  Pages that only redirect, and the "no access" page, need no check and are listed with the reason.
*/

const APP = join(process.cwd(), "src/app");
const ROOTS = ["(app)", "(admin)"];
const GUARD = "requirePageAccess(";

/** Pages that render no member data, with the reason. Redirect-only entries are checked below. */
const EXEMPT: Record<string, { reason: string; redirectOnly: boolean }> = {
  "(app)/no-access/page.tsx": { reason: "where a refused page sends you: shows only the links this session may open", redirectOnly: false },
  "(app)/overview/matchups/page.tsx": { reason: "only redirects (Matchups moved into All Champions)", redirectOnly: true },
  "(app)/players/[id]/edit/page.tsx": { reason: "only redirects (editing moved onto the profile)", redirectOnly: true },
  "(app)/players/[id]/matchups/page.tsx": { reason: "only redirects (Matchups moved into All Champions)", redirectOnly: true },
  "(app)/players/[id]/stats/page.tsx": { reason: "only redirects (statistics moved onto the profile)", redirectOnly: true },
  "(app)/settings/riot/page.tsx": { reason: "only redirects", redirectOnly: true },
  "(admin)/admin/players/page.tsx": { reason: "only redirects", redirectOnly: true },
  "(admin)/admin/public-access/page.tsx": { reason: "only redirects", redirectOnly: true },
  "(admin)/admin/users/page.tsx": { reason: "only redirects", redirectOnly: true },
};

function pages(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return pages(path);
    return name === "page.tsx" ? [path] : [];
  });
}

/** What is wrong with one page's source, or null when it follows the rule. */
export function pageGuardProblem(file: string, source: string): string | null {
  const exempt = EXEMPT[file];
  if (exempt) {
    if (!exempt.redirectOnly) return null;
    if (!source.includes("redirect(")) return `${file} is listed as redirect-only but does not redirect`;
    if (/getAppDb\(|getDb\(/.test(source)) return `${file} is listed as redirect-only but opens the database`;
    return null;
  }
  return source.includes(GUARD) ? null : `${file} does not call requirePageAccess itself`;
}

describe("every member and admin page checks access itself", () => {
  const files = ROOTS.flatMap((root) => pages(join(APP, root))).map((path) => ({ file: relative(APP, path), source: readFileSync(path, "utf8") }));

  it("finds the pages", () => {
    expect(files.length).toBeGreaterThan(30);
  });

  it("calls requirePageAccess on every page that is not listed with a reason", () => {
    expect(files.map(({ file, source }) => pageGuardProblem(file, source)).filter(Boolean)).toEqual([]);
  });

  it("lists only pages that exist", () => {
    const known = new Set(files.map((f) => f.file));
    expect(Object.keys(EXEMPT).filter((file) => !known.has(file))).toEqual([]);
  });

  it("fires on a page that relies on its layout", () => {
    const before = `export default async function Page({ params }) {\n  const [{ id }, session, db] = await Promise.all([params, getSession(), getAppDb()]);\n  return <ProfileAccountsTab db={db} session={session} />;\n}`;
    expect(pageGuardProblem("(app)/players/[id]/accounts/page.tsx", before)).toMatch(/does not call requirePageAccess/);
    expect(pageGuardProblem("(app)/players/[id]/stats/page.tsx", "const db = await getAppDb(); redirect('/x');")).toMatch(/opens the database/);
  });
});

/*
  A personal-use profile (not on the team) opens only for its player and administrators
  (canOpenProfile in src/server/auth/permissions.ts). Every page under /players/[id] that loads a
  profile, and their layout, does so through viewableProfileHeader, which answers null (the page's
  notFound()) for anyone else: the raw loader would open the profile to every member.
*/
describe("a teammate's profile pages load it through the personal-use rule", () => {
  const dir = join(APP, "(app)", "players", "[id]");
  const files = [...pages(dir), join(dir, "layout.tsx")].map((path) => ({ file: relative(APP, path), source: readFileSync(path, "utf8") }));

  it("never call the raw profileHeader loader", () => {
    expect(files.filter(({ source }) => /\bprofileHeader\(/.test(source)).map((f) => f.file)).toEqual([]);
  });

  it("every page that opens the database loads the profile with viewableProfileHeader", () => {
    const loading = files.filter(({ source }) => /getAppDb\(/.test(source));
    expect(loading.length).toBeGreaterThanOrEqual(5);
    expect(loading.filter(({ source }) => !source.includes("viewableProfileHeader(")).map((f) => f.file)).toEqual([]);
  });
});
