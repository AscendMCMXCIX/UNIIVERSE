"use server";

import { z } from "zod";
import { getAppDb } from "@/server/bootstrap";
import { NotAuthorizedError, requireSession } from "@/server/auth/session";
import { isAdmin } from "@/server/auth/permissions";
import { getOrCreateTeam } from "@/server/repositories/team";
import { listChampions } from "@/server/repositories/champions";
import { erasureFilter } from "@/server/privacy/ledger";
import { clashScoutEnabled } from "@/server/clash/access";
import { candidateRiot } from "@/server/clash/candidate-riot";
import { generateBlindTest, runBlindTest, runManualTest, runVariants, type BlindRun, type LabContext, type LabRun, type VariantRun } from "@/server/clash/lab";
import { labScenarioSchema, parseScenario, type LabInput, type LabIssue, type LabScenario, type VariantKind } from "@/domain/clash-scout/lab";
import { formatMastery } from "@/domain/clash-scout/mastery-input";
import { OPGG_PLATFORMS } from "@/domain/opgg";

/*
  CLASH SCOUT TESTING LAB (/clash/lab): the Owner and administrators only, checked here on every
  call. Each test runs the real identification engine (server/clash/lab.ts) on what the tester
  typed or on a blind test's accounts; nothing is written to the database, and a test's data lives
  in the tester's page until they leave it or export it themselves.
*/

type Result<T> = { ok: true; data: T } | { ok: false; error: string; issues?: LabIssue[] };

const fail = (err: unknown): { ok: false; error: string } => {
  if (err instanceof NotAuthorizedError) return { ok: false, error: err.message };
  console.error(err);
  return { ok: false, error: "The test could not run. Try again." };
};

// One run every 1.5 seconds, 120 an hour; one blind test generated every 5 seconds, 30 an hour.
const runs = new Map<string, number[]>();
const generations = new Map<string, number[]>();
function throttled(per: Map<string, number[]>, key: string, gapMs: number, hourly: number): boolean {
  const now = Date.now();
  const list = (per.get(key) ?? []).filter((t) => now - t < 3_600_000);
  if (list.length >= hourly || (list.length && now - list[list.length - 1]! < gapMs)) return true;
  list.push(now);
  per.set(key, list);
  return false;
}

async function lab(platform: string): Promise<LabContext & { user: string; knownChampion: (id: string) => boolean }> {
  const session = await requireSession();
  if (!clashScoutEnabled()) throw new NotAuthorizedError("Clash Scout is switched off.");
  if (!isAdmin(session)) throw new NotAuthorizedError("The Testing Lab is for the Owner and administrators.");
  if (!OPGG_PLATFORMS.includes(platform)) throw new NotAuthorizedError("Choose a server.");
  const db = await getAppDb();
  const [team, champions, erased, riot] = await Promise.all([getOrCreateTeam(db), listChampions(db), erasureFilter(db), candidateRiot(db)]);
  if (!riot) throw new NotAuthorizedError("Riot lookups are not available: the server has no Riot API key.");
  const names = new Map(champions.map((c) => [c.id, c.name]));
  return { db, teamId: team.id, platform, riot, erased, now: Date.now(), championName: (id) => names.get(id) ?? id, user: session.userId ?? session.label, knownChampion: (id) => names.has(id) };
}

const platformOf = (input: unknown) => String((input as { platform?: unknown })?.platform ?? "").toLowerCase();

/** A manual test: the five players as typed, through the real pipeline. */
export async function runManualTestAction(input: unknown): Promise<Result<{ run: LabRun; inputs: LabInput[] }>> {
  try {
    const ctx = await lab(platformOf(input));
    const parsed = labScenarioSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "This test could not be read." };
    const { inputs, issues } = parseScenario(parsed.data as LabScenario, ctx.now, ctx.knownChampion);
    if (issues.length) return { ok: false, error: "Some entries need a look.", issues };
    if (throttled(runs, ctx.user, 1_500, 120)) return { ok: false, error: "Too many runs in a short time. Wait a moment." };
    return { ok: true, data: { run: await runManualTest(ctx, inputs), inputs } };
  } catch (err) {
    return fail(err);
  }
}

const blindOptionsSchema = z.object({ platform: z.string(), players: z.number().int().min(1).max(5), rounding: z.enum(["client", "thousands", "exact"]), includeTotal: z.boolean() });

/** The generated test as the editor shows it: names and figures only, as the screens would. */
function toScenario(inputs: LabInput[], platform: string): LabScenario {
  return {
    teamName: "Blind test",
    platform,
    referenceDate: "",
    dateUnknown: false,
    players: Array.from({ length: 5 }, (_, slot) => {
      const i = inputs.find((x) => x.slot === slot);
      return {
        name: i?.name ?? "",
        champions: Array.from({ length: 5 }, (_, k) => {
          const c = i?.shown.champions[k];
          return c ? { championId: c.championId, points: c.points === null ? "" : formatMastery(c.points, c.precision) } : { championId: null, points: "" };
        }),
        totalScore: i?.shown.totalScore ? String(i.shown.totalScore) : "",
        rank: null,
      };
    }),
  };
}

/** Builds a blind test from accounts UNIIVERSE knows; the answers come back sealed. */
export async function generateBlindTestAction(input: unknown): Promise<Result<{ scenario: LabScenario; key: string; skipped: number; standIn: boolean; players: number }>> {
  try {
    const ctx = await lab(platformOf(input));
    const options = blindOptionsSchema.safeParse(input);
    if (!options.success) return { ok: false, error: "These options could not be read." };
    if (throttled(generations, ctx.user, 5_000, 30)) return { ok: false, error: "Too many blind tests in a short time. Wait a moment." };
    const test = await generateBlindTest(ctx, options.data);
    if (!test.inputs.length) return { ok: false, error: "No known account on this server could be used: UNIIVERSE needs recorded games with players outside the team, and Riot's figures for them." };
    return { ok: true, data: { scenario: toScenario(test.inputs, ctx.platform), key: test.key, skipped: test.skipped, standIn: test.standIn, players: test.inputs.length } };
  } catch (err) {
    return fail(err);
  }
}

const blindRunSchema = z.object({ scenario: labScenarioSchema, key: z.string().max(64_000) });

/** Runs a blind test under both conditions (A: real discovery, B: the controlled pool), graded apart. */
export async function runBlindTestAction(input: unknown): Promise<Result<BlindRun>> {
  try {
    const raw = input as { scenario?: { platform?: unknown } };
    const ctx = await lab(platformOf(raw?.scenario));
    const parsed = blindRunSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "This test could not be read." };
    const { inputs, issues } = parseScenario(parsed.data.scenario as LabScenario, ctx.now, ctx.knownChampion);
    if (issues.length) return { ok: false, error: "Some entries need a look.", issues };
    if (throttled(runs, ctx.user, 1_500, 120)) return { ok: false, error: "Too many runs in a short time. Wait a moment." };
    const run = await runBlindTest(ctx, inputs, parsed.data.key);
    if (!run) return { ok: false, error: "This blind test has expired (a day) or does not belong to this server. Generate a new one." };
    return { ok: true, data: run };
  } catch (err) {
    return fail(err);
  }
}

const variantSchema = z.object({
  kind: z.enum(["baseline", "aged", "top-five-change", "reordered", "rounded", "missing", "incomplete", "renamed", "decoys"] satisfies [VariantKind, ...VariantKind[]]),
  days: z.number().int().min(1).max(730).optional(),
  growth: z.number().min(0).max(500).optional(),
  uneven: z.boolean().optional(),
  count: z.number().int().min(1).max(5).optional(),
  spread: z.number().min(1).max(50).optional(),
});
const variantsRunSchema = z.object({ scenario: labScenarioSchema, key: z.string().max(64_000).nullable(), variants: z.array(variantSchema).min(1).max(9) });

/** Runs the chosen variants of a test (blind: graded under both conditions; manual: outcomes only). */
export async function runVariantsAction(input: unknown): Promise<Result<VariantRun[]>> {
  try {
    const raw = input as { scenario?: { platform?: unknown } };
    const ctx = await lab(platformOf(raw?.scenario));
    const parsed = variantsRunSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "This test could not be read." };
    const { inputs, issues } = parseScenario(parsed.data.scenario as LabScenario, ctx.now, ctx.knownChampion);
    if (issues.length) return { ok: false, error: "Some entries need a look.", issues };
    if (throttled(runs, ctx.user, 1_500, 120)) return { ok: false, error: "Too many runs in a short time. Wait a moment." };
    const out = await runVariants(ctx, inputs, parsed.data.variants, parsed.data.key);
    if (!out) return { ok: false, error: "This blind test has expired (a day) or does not belong to this server. Generate a new one." };
    return { ok: true, data: out };
  } catch (err) {
    return fail(err);
  }
}
