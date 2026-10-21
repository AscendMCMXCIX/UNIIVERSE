import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

/*
  Every server action is a public HTTP endpoint: anyone can call it with any arguments, whatever the
  page shows them. So each exported action must establish who is asking before it does anything:
  its first asynchronous step (an await, or a call whose promise it returns) must be a session
  check, made directly or through a helper in its own file (resources.ts's change(), ranked.ts's
  owner()). Only the calls in HARMLESS, which change nothing, may come before it. getSession counts
  only where a missing session is refused at once (`if (!session) return …`, or a throw), because
  getSession itself lets everyone through.

  Checked: every module that starts with "use server", anywhere under src, and every function with
  its own "use server". An export this check cannot read (a function wrapped in an unknown helper,
  a re-export) fails until it is written as a plain function. The few actions meant for people who
  are not signed in (signing in, first-owner setup, recovery) are listed in PUBLIC with what
  protects them instead. What a check allows (which permission, whose profile) is tested with each
  feature; this makes sure there is one, and that it comes first.
*/

/** Calls that refuse a caller who is not allowed (server/auth/session.ts, server/ranked/owner.ts). */
const GUARDS = new Set(["requirePermission", "requireSession", "requireSessionForSetup", "requireTeamMember", "requireOwner", "requireRiotAccountEditor", "requirePlayerEditor", "journalOwnerFor"]);
/** Asynchronous calls that may come before the check: they read the request or open the database, and change nothing. */
const HARMLESS = new Set(["getAppDb", "headers", "cookies", "clientIp"]);
/** Helpers that run the function they are given (server/observability/log.ts): that function is what is checked. */
const WRAPPERS = new Set(["traced"]);

/** Actions anyone may call ("path under src: action"), and what protects them instead. */
const PUBLIC: Record<string, string> = {
  "server/actions/auth.ts: loginAction": "signing in: throttled per username and address, a failed attempt waits",
  "server/actions/auth.ts: logoutAction": "signing out ends only the caller's own session",
  "server/actions/auth.ts: setupOwnerAction": "the first owner account: only while no account exists, and in production only with the setup key (throttled)",
  "server/actions/players.ts: currentSessionAction": "returns the caller's own session, or null when signed out; nothing else",
  "server/actions/recovery.ts: recoveryAction": "owner recovery: the setup key on every call, throttled per address",
  "server/actions/recovery.ts: recoveryAvailable": "says only whether the recovery page applies (setup or locked mode); no account data",
};

const SRC = path.resolve(__dirname, "../..");

type FnLike = ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction;
const isFn = (n: ts.Node): n is FnLike => ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n);
const unwrap = (e: ts.Expression): ts.Expression => (ts.isParenthesizedExpression(e) ? unwrap(e.expression) : e);
const calleeName = (call: ts.CallExpression): string => {
  const c = call.expression;
  if (ts.isIdentifier(c)) return c.text;
  if (ts.isPropertyAccessExpression(c)) return `${c.expression.getText()}.${c.name.text}`;
  return "(expression)";
};

/** A statement that leaves at once: return, throw, or redirect()/notFound(). */
function refuses(st: ts.Statement): boolean {
  if (ts.isBlock(st)) return st.statements.length > 0 && refuses(st.statements[0]!);
  if (ts.isReturnStatement(st) || ts.isThrowStatement(st)) return true;
  return ts.isExpressionStatement(st) && ts.isCallExpression(st.expression) && ["redirect", "notFound"].includes(calleeName(st.expression));
}

/** Whether a condition is true for a missing value: `!x`, `!x?.prop`, or such a test anywhere in an `||` chain. */
function testsMissing(cond: ts.Expression, matches: (operand: ts.Expression) => boolean): boolean {
  const c = unwrap(cond);
  if (ts.isBinaryExpression(c) && c.operatorToken.kind === ts.SyntaxKind.BarBarToken) return testsMissing(c.left, matches) || testsMissing(c.right, matches);
  if (!ts.isPrefixUnaryExpression(c) || c.operator !== ts.SyntaxKind.ExclamationToken) return false;
  let operand = unwrap(c.operand);
  while (ts.isPropertyAccessExpression(operand)) operand = unwrap(operand.expression);
  return matches(operand);
}

/** Whether this `await getSession()` is refused at once when there is no session. */
function sessionRefused(node: ts.AwaitExpression): boolean {
  let up: ts.Node = node.parent;
  while (ts.isParenthesizedExpression(up)) up = up.parent;
  // guard(await getSession()): the guard refuses a missing session itself.
  if (ts.isCallExpression(up) && GUARDS.has(calleeName(up))) return true;
  // if (!(await getSession())) return …
  if (ts.isPrefixUnaryExpression(up) && up.operator === ts.SyntaxKind.ExclamationToken) {
    let cond: ts.Node = up;
    while (cond.parent && (ts.isBinaryExpression(cond.parent) || ts.isParenthesizedExpression(cond.parent))) cond = cond.parent;
    return ts.isIfStatement(cond.parent) && cond.parent.expression === cond && refuses(cond.parent.thenStatement);
  }
  // const session = await getSession(); if (!session …) return …
  if (ts.isVariableDeclaration(up) && ts.isIdentifier(up.name) && ts.isVariableStatement(up.parent.parent)) {
    const name = up.name.text;
    const statement = up.parent.parent;
    const siblings = (statement.parent as ts.Block | ts.SourceFile).statements;
    const next = siblings[siblings.indexOf(statement) + 1];
    return !!next && ts.isIfStatement(next) && testsMissing(next.expression, (e) => ts.isIdentifier(e) && e.text === name) && refuses(next.thenStatement);
  }
  return false;
}

type Verdict = "guarded" | "unguarded";

/**
 * Whether a function's first asynchronous step is a session check. Arguments run before the call
 * they are passed to, so their awaits come first; functions defined inside run later and are not
 * steps, except the one a WRAPPERS helper runs.
 */
function verdictOf(fn: FnLike, guardedLocal: Set<string>): Verdict {
  let verdict: Verdict | null = null;
  const decide = (v: Verdict) => {
    if (verdict === null) verdict = v;
  };
  const step = (call: ts.CallExpression, awaited: ts.AwaitExpression | null) => {
    const name = calleeName(call);
    if (HARMLESS.has(name)) return;
    if (GUARDS.has(name) || guardedLocal.has(name)) return decide("guarded");
    if (name === "getSession") return decide(awaited && sessionRefused(awaited) ? "guarded" : "unguarded");
    if (WRAPPERS.has(name)) {
      const inner = call.arguments.find((a): a is ts.ArrowFunction | ts.FunctionExpression => ts.isArrowFunction(a) || ts.isFunctionExpression(a));
      if (inner) return decide(verdictOf(inner, guardedLocal));
    }
    decide("unguarded");
  };
  const visit = (n: ts.Node): void => {
    if (verdict !== null || (isFn(n) && n !== fn)) return;
    if (ts.isAwaitExpression(n)) {
      const e = unwrap(n.expression);
      if (ts.isCallExpression(e)) {
        e.arguments.forEach(visit);
        visit(e.expression);
        step(e, n);
      } else visit(e);
      return;
    }
    if (ts.isReturnStatement(n) && n.expression && ts.isCallExpression(unwrap(n.expression))) {
      const e = unwrap(n.expression) as ts.CallExpression;
      e.arguments.forEach(visit);
      visit(e.expression);
      step(e, null);
      return;
    }
    ts.forEachChild(n, visit);
  };
  const body = fn.body!;
  if (ts.isBlock(body)) visit(body);
  else {
    const e = unwrap(body);
    if (ts.isCallExpression(e)) {
      e.arguments.forEach(visit);
      step(e, null);
    } else visit(e);
  }
  return verdict ?? "unguarded";
}

const directive = (statements: ts.NodeArray<ts.Statement>): string | null => {
  const first = statements[0];
  return first && ts.isExpressionStatement(first) && ts.isStringLiteral(first.expression) ? first.expression.text : null;
};

/** The actions in a source file that are not checked first, as "name" or "name (cannot be read)". */
export function unguardedActions(source: string, fileName = "actions.ts"): string[] {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const serverModule = directive(file.statements) === "use server";

  // The module's own functions, by name, and its exported actions.
  const local = new Map<string, FnLike>();
  const actions = new Map<string, FnLike | null>();
  const isExported = (n: ts.Node) => ts.canHaveModifiers(n) && !!ts.getModifiers(n)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
  for (const st of file.statements) {
    if (ts.isFunctionDeclaration(st) && st.body) {
      const name = st.name?.text ?? "default";
      local.set(name, st);
      if (serverModule && isExported(st)) actions.set(name, st);
    } else if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (!ts.isIdentifier(d.name)) continue;
        const init = d.initializer && unwrap(d.initializer);
        let fn: FnLike | null = null;
        if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) fn = init;
        else if (init && ts.isCallExpression(init) && WRAPPERS.has(calleeName(init))) {
          // export const x = traced("…", async () => …): the wrapped function is the action.
          fn = init.arguments.find((a): a is ts.ArrowFunction | ts.FunctionExpression => ts.isArrowFunction(a) || ts.isFunctionExpression(a)) ?? null;
        }
        if (fn) local.set(d.name.text, fn);
        if (serverModule && isExported(st)) actions.set(d.name.text, fn);
      }
    } else if (serverModule && ts.isExportDeclaration(st) && !st.isTypeOnly) {
      if (st.moduleSpecifier || !st.exportClause || !ts.isNamedExports(st.exportClause)) actions.set(`export … from …`, null);
      else for (const el of st.exportClause.elements) if (!el.isTypeOnly) actions.set(el.name.text, local.get((el.propertyName ?? el.name).text) ?? null);
    } else if (serverModule && ts.isExportAssignment(st)) {
      const e = unwrap(st.expression);
      actions.set("default", ts.isArrowFunction(e) || ts.isFunctionExpression(e) ? e : ts.isIdentifier(e) ? (local.get(e.text) ?? null) : null);
    }
  }
  // Functions with their own "use server", in any module.
  const inline: Array<[string, FnLike]> = [];
  const findInline = (n: ts.Node): void => {
    if (isFn(n) && n.body && ts.isBlock(n.body) && directive(n.body.statements) === "use server") {
      const name = ts.isFunctionDeclaration(n) && n.name ? n.name.text : ts.isVariableDeclaration(n.parent) && ts.isIdentifier(n.parent.name) ? n.parent.name.text : `line ${file.getLineAndCharacterOfPosition(n.getStart()).line + 1}`;
      inline.push([name, n]);
    }
    ts.forEachChild(n, findInline);
  };
  findInline(file);

  // Local helpers whose first step is a check, to a fixed point (helpers can call helpers).
  const guardedLocal = new Set<string>();
  for (let changed = true; changed; ) {
    changed = false;
    for (const [name, fn] of local) {
      if (!guardedLocal.has(name) && verdictOf(fn, guardedLocal) === "guarded") {
        guardedLocal.add(name);
        changed = true;
      }
    }
  }
  const problems: string[] = [];
  for (const [name, fn] of [...actions, ...inline]) {
    if (!fn) problems.push(`${name} (cannot be read)`);
    else if (verdictOf(fn, guardedLocal) !== "guarded") problems.push(name);
  }
  return [...new Set(problems)].sort();
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(p);
    return /\.tsx?$/.test(e.name) && !/\.(test|d)\.tsx?$/.test(e.name) ? [p] : [];
  });
}

describe("server actions", () => {
  it("each checks who is asking before anything else, unless it is listed as public with its reason", () => {
    const unguarded = sourceFiles(SRC).flatMap((f) => {
      const source = readFileSync(f, "utf8");
      if (!source.includes("use server")) return [];
      const rel = path.relative(SRC, f).split(path.sep).join("/");
      return unguardedActions(source, f).map((name) => `${rel}: ${name}`);
    });
    expect(unguarded.filter((a) => !(a in PUBLIC))).toEqual([]);
    // An entry that no longer applies (renamed, removed, or now checking a session) leaves the list.
    expect(Object.keys(PUBLIC).filter((a) => !unguarded.includes(a))).toEqual([]);
  });

  it("finds an action that checks nothing, checks too late, or lets a missing session through", () => {
    const source = `"use server";
import { requirePermission, getSession } from "@/server/auth/session";
async function admin() { return requirePermission("manage-users"); }
const viaHelper = async () => { await admin(); };
export async function guarded() { await viaHelper(); return 1; }
export async function direct() { const s = await requirePermission("manage-data"); return s; }
export async function returned(id: string) { const clean = id.trim(); if (!clean) return null; return admin(); }
export async function harmlessFirst() { const db = await getAppDb(); await requirePermission("manage-data"); return db; }
export async function refused() { const s = await getSession(); if (!s) return null; return s.userId; }
export async function refusedInline() { if (!(await getSession())) throw new Error("no"); return 1; }
export async function refusedWithMore() { const s = await getSession(); if (!s || !s.admin) return null; return 1; }
export async function wrapped(id: string) { return traced("x", () => inner(id)); }
async function inner(id: string) { await requirePermission("manage-data"); return id; }
export const wrappedConst = traced("y", async () => { await requirePermission("manage-data"); });
export async function open(id: string) { return id; }
export const openArrow = async () => 2;
async function helperOnly() { return 3; }
export async function viaUnguardedHelper() { return helperOnly(); }
export async function checkedTooLate(id: string) { await deleteRow(id); await requirePermission("manage-data"); }
export async function argumentFirst(id: string) { return requirePermission(await deleteRow(id)); }
export async function inParallel() { await Promise.all([requirePermission("manage-data"), loadAll()]); }
export async function sessionNotRefused(id: string) { const s = await getSession(); await saveNote(id, s?.userId ?? null); }
export async function refusedTooLate(id: string) { const s = await getSession(); await saveNote(id); if (!s) return; }
export const unknownWrapper = withAudit(async () => { await requirePermission("manage-data"); });
export { open as alsoOpen };
export * from "./elsewhere";`;
    expect(unguardedActions(source)).toEqual(
      ["alsoOpen", "argumentFirst", "checkedTooLate", "export … from … (cannot be read)", "inParallel", "open", "openArrow", "refusedTooLate", "sessionNotRefused", "unknownWrapper (cannot be read)", "viaUnguardedHelper"].sort(),
    );
    // Not a "use server" module: only functions with their own "use server" are actions.
    expect(unguardedActions(`export async function notAnAction() {}`)).toEqual([]);
    expect(unguardedActions(`export default function Page() { async function save() { "use server"; await write(); } return null; }`, "page.tsx")).toEqual(["save"]);
  });
});
