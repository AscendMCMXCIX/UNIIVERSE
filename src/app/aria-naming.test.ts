import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

/*
  A name (aria-label, aria-labelledby) only on an element whose role may be named (ARIA 1.2 §5.2.8.6,
  "Roles which cannot be named"). A div, a span, a p and the other elements with no role of their
  own (generic, paragraph, emphasis, …) may not be: axe reports it (aria-prohibited-attr, serious)
  and screen readers drop the name, so what it says is lost. Release 5's loading placeholder for a
  game's notes (`<div aria-busy aria-label="Loading the notes">`) failed Production check axe while
  the notes loaded (issue #323).

  The accessible ways: a loading placeholder is a polite status whose text says what loads (the
  pulsing shapes hidden from assistive technology); a group of things is role="group" (which may be
  named); a mark that means something ("—" for not counted yet) is hidden and its meaning written in
  sr-only text beside it.

  This test reads every component and page and refuses aria-label or aria-labelledby on one of
  these elements with no role, or with a role that cannot be named. An element whose props spread
  in (`{...props}`) may get its role from them and is not judged; a role written as an expression
  is not judged either.
*/

const ROOT = path.join(__dirname, "..");

/** Elements whose own role (none, generic, paragraph, emphasis, code, …) may not be named. */
const UNNAMEABLE_TAGS = new Set(["div", "span", "p", "b", "i", "em", "strong", "small", "code", "pre", "sub", "sup", "del", "ins", "s", "u", "q", "time", "data", "abbr", "mark", "kbd", "samp", "var", "cite", "bdi", "bdo", "br", "wbr"]);

/** Roles that may not be named (ARIA 1.2), when written on an element. */
const UNNAMEABLE_ROLES = new Set(["caption", "code", "deletion", "emphasis", "generic", "insertion", "mark", "none", "paragraph", "presentation", "strong", "subscript", "superscript", "suggestion", "term", "time"]);

/** Genuine exceptions, as `file:line` with the reason. None so far. */
const ALLOWED = new Map<string, string>([]);

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return files(full);
    return name.endsWith(".tsx") && !name.endsWith(".test.tsx") ? [full] : [];
  });
}

function attrName(a: ts.JsxAttribute): string {
  return a.name.getText();
}

export function unnameableNames(source: string, fileName = "x.tsx"): { line: number; tag: string; role: string | null }[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: { line: number; tag: string; role: string | null }[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText();
      const props = node.attributes.properties;
      const named = props.some((p) => ts.isJsxAttribute(p) && ["aria-label", "aria-labelledby"].includes(attrName(p)));
      const spread = props.some((p) => ts.isJsxSpreadAttribute(p));
      if (named && !spread && /^[a-z]/.test(tag)) {
        const roleAttr = props.find((p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && attrName(p) === "role");
        let role: string | null = null;
        let judged = true;
        if (roleAttr) {
          const init = roleAttr.initializer;
          if (init && ts.isStringLiteral(init)) role = init.text;
          else if (init && ts.isJsxExpression(init) && init.expression && ts.isStringLiteral(init.expression)) role = init.expression.text;
          else judged = false;
        }
        const bad = role === null ? UNNAMEABLE_TAGS.has(tag) : UNNAMEABLE_ROLES.has(role.split(/\s+/)[0] ?? "");
        if (judged && bad) out.push({ line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1, tag, role });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

describe("names only where a role may be named", () => {
  it("finds the pattern (the check fires)", () => {
    expect(unnameableNames(`const a = <div className="x" aria-busy="true" aria-label="Loading the notes" />;`)).toHaveLength(1);
    expect(unnameableNames(`const a = <span aria-labelledby="t">—</span>;`)).toHaveLength(1);
    expect(unnameableNames(`const a = <div role="presentation" aria-label="x" />;`)).toHaveLength(1);
    expect(unnameableNames(`const a = <div role="status" aria-label="x" />;`)).toHaveLength(0);
    expect(unnameableNames(`const a = <div role="group" aria-label="x" />;`)).toHaveLength(0);
    expect(unnameableNames(`const a = <nav aria-label="x" />;`)).toHaveLength(0);
    expect(unnameableNames(`const a = <div {...p} aria-label="x" />;`)).toHaveLength(0);
    expect(unnameableNames(`const a = <Panel aria-label="x" />;`)).toHaveLength(0);
  });

  it("no component or page names an element that may not be named", () => {
    const found = files(ROOT).flatMap((f) => {
      const rel = path.relative(path.join(ROOT, ".."), f);
      return unnameableNames(readFileSync(f, "utf8"), f)
        .map((h) => `${rel}:${h.line} <${h.tag}${h.role ? ` role="${h.role}"` : ""}>`)
        .filter((k) => !ALLOWED.has(k.split(" ")[0] ?? ""));
    });
    expect(found).toEqual([]);
  });
});
