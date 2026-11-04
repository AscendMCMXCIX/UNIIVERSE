"use server";

import { publicErrorMessage } from "@/server/errors";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getAppDb } from "@/server/bootstrap";
import { requirePermission } from "@/server/auth/session";
import { recordAudit } from "@/server/audit/log";
import type { AuditAction } from "@/domain/audit";
import { changeResourceLibrary, readResourceLibrary } from "@/server/resources/library";
import {
  addResource,
  cleanResourceInput,
  moveResource,
  removeResource,
  removedDefaults,
  restoreDefaults,
  setResourceHidden,
  updateResource,
  type Resource,
  type ResourceInput,
  type ResourceLibrary,
} from "@/domain/resources";

/*
  Admin Mode → Platform Settings → Resources. Every action checks the administrator permission
  itself (manage-branding: the same as branding, which is the platform's look and content); the
  page hiding the controls is not the protection. Each change is applied under a row lock
  (changeResourceLibrary) and recorded in Audit Logs.
*/

/** What the manager shows: the whole library in its order, and the removed defaults it can restore. */
export interface ManagedResources {
  entries: Resource[];
  removed: Resource[];
}

type Result = { ok: true; data: ManagedResources } | { ok: false; error: string };

const managed = (lib: ResourceLibrary): ManagedResources => ({ entries: lib.entries, removed: removedDefaults(lib) });
const idOf = (value: unknown): string => {
  if (typeof value !== "string" || !/^[dc]-[a-z0-9-]{1,40}$/.test(value)) throw new Error("That resource is not valid.");
  return value;
};

async function change(action: AuditAction, apply: (lib: ResourceLibrary) => { lib: ResourceLibrary; target: { id: string; name: string } | null; details?: Record<string, string> }): Promise<Result> {
  try {
    const session = await requirePermission("manage-branding");
    const db = await getAppDb();
    let audit: ReturnType<typeof apply> | null = null;
    const lib = await changeResourceLibrary(db, (current) => {
      audit = apply(current);
      return audit.lib;
    });
    const done = audit as ReturnType<typeof apply> | null;
    await recordAudit(db, session, { action, target: done?.target ? { type: "resource", id: done.target.id, name: done.target.name } : undefined, details: done?.details });
    revalidatePath("/resources");
    revalidatePath("/admin/resources");
    return { ok: true, data: managed(lib) };
  } catch (err) {
    return { ok: false, error: publicErrorMessage(err) };
  }
}

/** The library as the manager shows it (administrators only). */
export async function getManagedResourcesAction(): Promise<Result> {
  try {
    await requirePermission("manage-branding");
    return { ok: true, data: managed(await readResourceLibrary(await getAppDb())) };
  } catch (err) {
    return { ok: false, error: publicErrorMessage(err) };
  }
}

export async function addResourceAction(input: ResourceInput): Promise<Result> {
  return change("resources.add", (lib) => {
    const fields = cleanResourceInput(input);
    const id = `c-${randomUUID().slice(0, 12)}`;
    return { lib: addResource(lib, fields, id), target: { id, name: fields.title } };
  });
}

export async function updateResourceAction(id: string, input: ResourceInput): Promise<Result> {
  return change("resources.edit", (lib) => {
    const fields = cleanResourceInput(input);
    return { lib: updateResource(lib, idOf(id), fields), target: { id, name: fields.title } };
  });
}

export async function setResourceHiddenAction(id: string, hidden: boolean): Promise<Result> {
  return change("resources.edit", (lib) => {
    const next = setResourceHidden(lib, idOf(id), hidden === true);
    return { lib: next, target: { id, name: next.entries.find((e) => e.id === id)?.title ?? id }, details: { change: hidden ? "hidden" : "shown" } };
  });
}

export async function moveResourceAction(id: string, direction: "up" | "down"): Promise<Result> {
  return change("resources.edit", (lib) => {
    const next = moveResource(lib, idOf(id), direction === "up" ? "up" : "down");
    return { lib: next, target: { id, name: next.entries.find((e) => e.id === id)?.title ?? id }, details: { change: `moved ${direction === "up" ? "up" : "down"}` } };
  });
}

export async function removeResourceAction(id: string): Promise<Result> {
  return change("resources.remove", (lib) => {
    const name = lib.entries.find((e) => e.id === id)?.title ?? id;
    return { lib: removeResource(lib, idOf(id)), target: { id, name } };
  });
}

/** Puts back removed defaults: the ones listed, or all of them (null). */
export async function restoreResourceDefaultsAction(ids: string[] | null): Promise<Result> {
  return change("resources.restore", (lib) => {
    const wanted = ids === null ? null : ids.slice(0, 100).map(idOf);
    const before = new Set(lib.entries.map((e) => e.id));
    const next = restoreDefaults(lib, wanted);
    const restored = next.entries.filter((e) => !before.has(e.id));
    return { lib: next, target: null, details: { restored: restored.map((e) => e.title).join(", ").slice(0, 80) || "none" } };
  });
}
