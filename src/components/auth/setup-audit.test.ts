import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RoleFields } from "./role-fields";
import { SignupForm } from "./signup-form";

/*
  Release 10's /setup audit (scripts/setup-audit.mjs, run by hand against a server with no owner):
  its two fixes, pinned in CI. "Add an off role" is 44px on a touch screen like every other control,
  and the setup key is labelled as the other fields are, what it is said under the field and read
  with it.
*/

const decoded = (html: string) => html.replace(/&gt;/g, ">").replace(/&amp;/g, "&");

describe("the /setup form's audit", () => {
  it("offers the off role with a 44px target on touch screens", () => {
    const html = decoded(renderToStaticMarkup(createElement(RoleFields, { initialPrimary: "TOP" })));
    const button = html.match(/<button[^>]*data-testid="add-secondary-role"[^>]*>/)?.[0] ?? "";
    expect(button).toContain("pointer-coarse:min-h-11");
  });

  it("labels the setup key as a field and describes it under the field", () => {
    const html = renderToStaticMarkup(createElement(SignupForm, { action: async () => ({ ok: false, error: "" }) as never, kind: "owner", needsKey: true, defaultPlatform: "oc1" }));
    expect(html).toMatch(/<label[^>]*for="setupKey"[^>]*>SETUP KEY \*<\/label>/);
    expect(html).toMatch(/<input[^>]*id="setupKey"[^>]*aria-describedby="setupKey-hint"/);
    expect(html).toMatch(/<p id="setupKey-hint"[^>]*>The UNIIVERSE_<wbr\/>ACCESS_<wbr\/>PASSWORD value you configured\.<\/p>/);
  });
});
