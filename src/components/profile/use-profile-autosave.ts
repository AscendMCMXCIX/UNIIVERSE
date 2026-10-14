"use client";

import * as React from "react";
import type { Role } from "@/domain/roles";
import type { RolePool } from "@/domain/roster/types";
import { saveProfilePatchAction } from "@/server/actions/players";
import { toast } from "@/components/ui/toast";

export interface ProfileState {
  primaryRole: Role;
  secondaryRole: Role | null;
  primaryPool: string[];
  secondaryPool: string[];
  /** Further roles in preference order, each with its own pool. */
  additionalRoles: RolePool[];
}

export type ProfilePatchInput = Partial<ProfileState>;

/** The pool for one of the profile's roles (empty when the role is not configured). */
export function poolOfRole(state: ProfileState, role: Role): string[] {
  if (role === state.primaryRole) return state.primaryPool;
  if (role === state.secondaryRole) return state.secondaryPool;
  return state.additionalRoles.find((a) => a.role === role)?.pool ?? [];
}

/** The patch that sets the pool of one configured role. */
export function setPoolOfRole(state: ProfileState, role: Role, ids: string[]): ProfilePatchInput {
  if (role === state.primaryRole) return { primaryPool: ids };
  if (role === state.secondaryRole) return { secondaryPool: ids };
  return { additionalRoles: state.additionalRoles.map((a) => (a.role === role ? { ...a, pool: ids } : a)) };
}

/** The editable part of a player record. */
export function profileStateOf(p: ProfileState): ProfileState {
  return { primaryRole: p.primaryRole, secondaryRole: p.secondaryRole, primaryPool: p.primaryPool, secondaryPool: p.secondaryPool, additionalRoles: p.additionalRoles ?? [] };
}
export type SaveStatus = "idle" | "saving" | "saved" | "error";

/**
 * Autosave for roles and champion pools.
 *  - Every edit shows at once; edits made in quick succession are merged and sent together.
 *  - One request at a time: later edits wait and go out with the newest version, so an older
 *    request can never overwrite a newer one.
 *  - Each save carries the version it was based on; if the profile changed elsewhere (another
 *    tab, an admin), the server refuses and the latest state is shown instead.
 *  - A failed save keeps the edit on screen with a Retry (sent by itself when the connection
 *    returns); leaving the page with unsaved edits asks first.
 *  - "Saved" appears only after the server confirmed it.
 */
export function useProfileAutosave(playerId: string, initial: ProfileState, initialVersion: string, options: { delay?: number; onSaved?: () => void } = {}) {
  const delay = options.delay ?? 350;
  const [state, setState] = React.useState(initial);
  const [status, setStatus] = React.useState<SaveStatus>("idle");
  const [error, setError] = React.useState<string | null>(null);
  const version = React.useRef(initialVersion);
  const pending = React.useRef<ProfilePatchInput>({});
  const inFlight = React.useRef(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSaved = React.useRef(options.onSaved);
  React.useEffect(() => {
    onSaved.current = options.onSaved;
  });

  const stateRef = React.useRef(state);
  React.useEffect(() => {
    stateRef.current = state;
  });

  const flush = React.useCallback(async (): Promise<void> => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (inFlight.current) return;
    // Send what is queued; edits made meanwhile go out next, always on the newest version.
    while (Object.keys(pending.current).length > 0) {
      const patch = pending.current;
      pending.current = {};
      inFlight.current = true;
      setStatus("saving");
      let r: Awaited<ReturnType<typeof saveProfilePatchAction>>;
      try {
        r = await saveProfilePatchAction(playerId, patch, version.current);
      } catch {
        r = { ok: false, error: "No connection. Your change is kept here; retry when you are back online." };
      }
      inFlight.current = false;
      if (r.ok) {
        version.current = r.version;
        continue;
      }
      if (r.conflict) {
        // Someone else saved first: show their version, drop ours (it was based on old data).
        version.current = r.conflict.version;
        pending.current = {};
        const latest = { primaryRole: r.conflict.primaryRole, secondaryRole: r.conflict.secondaryRole, primaryPool: r.conflict.primaryPool, secondaryPool: r.conflict.secondaryPool, additionalRoles: r.conflict.additionalRoles };
        stateRef.current = latest;
        setState(latest);
        setStatus("idle");
        toast.warning("This profile was changed in another tab or by an admin.", { description: "The latest version is shown; make your change again if it is still needed." });
        return;
      }
      // Keep the failed edit queued (newer edits merged over it) so Retry sends it again.
      pending.current = { ...patch, ...pending.current };
      setStatus("error");
      setError(r.error);
      return;
    }
    setStatus("saved");
    setError(null);
    onSaved.current?.();
  }, [playerId]);

  const update = React.useCallback(
    (input: ProfilePatchInput) => {
      let patch = input;
      const next = { ...stateRef.current, ...patch };
      // A primary role equal to the secondary one replaces it; no secondary role means no secondary pool.
      if (patch.primaryRole && next.secondaryRole === patch.primaryRole) patch = { ...patch, secondaryRole: null };
      if (patch.secondaryRole === null) patch = { ...patch, secondaryPool: [] };
      // A role chosen as primary or secondary leaves the additional roles (the server does the same).
      const taken = [patch.primaryRole ?? next.primaryRole, patch.secondaryRole === undefined ? next.secondaryRole : patch.secondaryRole];
      if ((patch.primaryRole || patch.secondaryRole) && next.additionalRoles.some((a) => taken.includes(a.role))) patch = { ...patch, additionalRoles: next.additionalRoles.filter((a) => !taken.includes(a.role)) };
      const applied = { ...stateRef.current, ...patch };
      stateRef.current = applied;
      setState(applied);
      pending.current = { ...pending.current, ...patch };
      setStatus("saving");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), delay);
    },
    [delay, flush],
  );

  // Back online after a dropped connection: send what is still queued without waiting for Retry.
  React.useEffect(() => {
    const onOnline = () => {
      if (Object.keys(pending.current).length > 0 && !inFlight.current) void flush();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [flush]);

  // Warn before leaving with edits that have not reached the server.
  React.useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (Object.keys(pending.current).length > 0 || inFlight.current) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  return { state, status, error, update, retry: flush };
}
