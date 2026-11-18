import { createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import MatchupIntelError from "./error";

/*
  Matchup Intel's own error state (error.tsx): said for this page, with Try again (the server's page
  read again, then the boundary lets go) and Start again (the page with no champions chosen), not
  the app-wide boundary's way to Team.
*/

const calls = vi.hoisted(() => [] as string[]);
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => calls.push("refresh"), push: () => undefined }) }));

type Element = ReactElement<{ children?: ReactNode; onClick?: () => void; href?: string }>;

/** The first element in a tree that passes `test`, looking through children. */
function find(node: ReactNode, test: (el: Element) => boolean): Element | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = find(child, test);
      if (found) return found;
    }
    return null;
  }
  if (!isValidElement(node)) return null;
  const el = node as Element;
  return test(el) ? el : find(el.props.children, test);
}

const failure = () => Object.assign(new Error("relation does not exist"), { digest: "1234567890" });

afterEach(() => {
  calls.length = 0;
  vi.unstubAllEnvs();
});

describe("Matchup Intel's error state", () => {
  it("names the page, keeps the error's message out of production, and offers Try again and Start again, not Team", () => {
    vi.stubEnv("NODE_ENV", "production");
    const html = renderToStaticMarkup(createElement(MatchupIntelError, { error: failure(), reset: () => undefined }));
    expect(html).toContain("Matchup Intel could not load");
    expect(html).not.toContain("relation does not exist");
    expect(html).toContain("reference 1234567890");
    expect(html).toMatch(/<button[^>]*>Try again<\/button>/);
    expect(html).toMatch(/<a[^>]*href="\/resources\/matchups"[^>]*>Start again<\/a>/);
    expect(html).not.toContain("Team");
  });

  it("Try again reads the server's page again before the boundary lets go", () => {
    const tree = MatchupIntelError({ error: failure(), reset: () => calls.push("reset") });
    const retry = find(tree, (el) => el.props.children === "Try again");
    expect(retry?.props.onClick).toBeTypeOf("function");
    retry!.props.onClick!();
    expect(calls).toEqual(["refresh", "reset"]);
  });
});
