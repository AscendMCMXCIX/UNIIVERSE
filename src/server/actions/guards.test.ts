import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

/*
  Every server action is a public HTTP endpoint: anyone can call it with any arguments, whatever the
  page shows them. So each exported action must check who is asking before it does anything, by
  calling one of the session checks below itself or through a helper in its own file (resources.ts's
  change(), ranked.ts's owner()). The few actions meant for people who are not signed in yet (signing
  in, setting up the first account, recovery) are listed in PUBLIC with the reason. A new action that
  checks nothing fails here, so the check cannot be forgotten. What the check then allows (which
  permission, whose profile) is tested with each feature; this only makes sure there is one.
*/

/** Calls that establish who is asking (server/auth/session.ts). getSession's callers refuse a null session. */
const GUARDS = new Set(["requirePermission", "requireSession", "requireSessionForSetup", "requireTeamMember", "requireOwner", "requireRiotAccountEditor", "requirePlayerEditor", "getSession"]);

/** Actions anyone may call ("file: action"), and what protects them instead. */
const PUBLIC: Record<string, string> = {
  "auth.ts: loginAction": "signing in: throttled per username and address, a failed attempt waits",
  "auth.ts: logoutAction": "signing out ends only the caller's own session",
  "auth.ts: setupOwnerAction": "the first owner account: only while no account exists, and in production only with the setup key (throttled)",
  "recovery.ts: recoveryAction": "owner recovery: the setup key on every call, throttled per address",
  "recovery.ts: recoveryAvailable": "says only whether the recovery page applies (setup or locked mode); no account data",
};

const ACTIONS_DIR = path.join(__dirname);

/** The exported functions of a "use server" module that reach no session check. */
export function unguardedActions(source: string, fileName = "actions.ts"): string[] {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const first = file.statements[0];
  if (!first || !ts.isExpressionStatement(first) || !ts.isStringLiteral(first.expression) || first.expression.text !== "use server") return [];

  const bodies = new Map<string, ts.Node>();
  const exported = new Set<string>();
  const isExported = (n: ts.Node) => ts.canHaveModifiers(n) && !!ts.getModifiers(n)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
  for (const st of file.statements) {
    if (ts.isFunctionDeclaration(st) && st.name && st.body) {
      bodies.set(st.name.text, st.body);
      if (isExported(st)) exported.add(st.name.text);
    } else if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && d.initializer && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))) {
          bodies.set(d.name.text, d.initializer.body);
          if (isExported(st)) exported.add(d.name.text);
        }
      }
    }
  }

  // Which names each function calls (directly, anywhere in its body).
  const calls = new Map<string, Set<string>>();
  for (const [name, body] of bodies) {
    const called = new Set<string>();
    const visit = (n: ts.Node) => {
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) called.add(n.expression.text);
      ts.forEachChild(n, visit);
    };
    visit(body);
    calls.set(name, called);
  }
  const guarded = new Set<string>();
  for (let changed = true; changed; ) {
    changed = false;
    for (const [name, called] of calls) {
      if (guarded.has(name)) continue;
      if ([...called].some((c) => GUARDS.has(c) || guarded.has(c))) {
        guarded.add(name);
        changed = true;
      }
    }
  }
  return [...exported].filter((name) => !guarded.has(name)).sort();
}

describe("server actions", () => {
  const files = readdirSync(ACTIONS_DIR).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));

  it("each checks who is asking, unless it is listed as public with its reason", () => {
    const unguarded = files.flatMap((f) => unguardedActions(readFileSync(path.join(ACTIONS_DIR, f), "utf8"), f).map((name) => `${f}: ${name}`));
    expect(unguarded.filter((a) => !(a in PUBLIC))).toEqual([]);
    // An entry that no longer applies (renamed, removed, or now checking a session) leaves the list.
    expect(Object.keys(PUBLIC).filter((a) => !unguarded.includes(a))).toEqual([]);
  });

  it("finds an action that checks nothing, directly or through a helper in its file", () => {
    const source = `"use server";
import { requirePermission } from "@/server/auth/session";
async function admin() { return requirePermission("manage-users"); }
const viaHelper = async () => { await admin(); };
export async function guarded() { await viaHelper(); return 1; }
export async function direct() { const s = await requirePermission("manage-data"); return s; }
export async function open(id: string) { return id; }
export const openArrow = async () => 2;
async function helperOnly() { return 3; }
export async function viaUnguardedHelper() { return helperOnly(); }`;
    expect(unguardedActions(source)).toEqual(["open", "openArrow", "viaUnguardedHelper"]);
    expect(unguardedActions(`export async function notAnActionModule() {}`)).toEqual([]);
  });
});
