import { parseScoutContent } from "@/domain/clash-scout/schema";
import type { ScoutContent, ScreenshotKind } from "@/domain/clash-scout/types";

/*
  The unsaved scout, kept in this browser only (localStorage) so a refresh does not lose it. It
  holds the structured values and which screenshots were read (their hashes, so the same image is
  not read twice): never an image, and nothing reaches the server or the team's history until a
  member saves. Discarding removes it. Storage can be unavailable (private windows, blocked site
  data): then the draft simply lives as long as the page.
*/

const KEY = "uniiverse.clash-scout.draft.v1";

export interface DraftShot {
  kind: ScreenshotKind;
  hash: string;
  /** When it was read (ISO). */
  readAt: string;
}

export interface StoredDraft {
  /** The team the draft belongs to (a member of two teams on one browser keeps them apart). */
  teamId: string;
  content: ScoutContent;
  shots: DraftShot[];
  updatedAt: string;
}

export function loadDraft(teamId: string): StoredDraft | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as StoredDraft;
    if (draft?.teamId !== teamId) return null;
    const parsed = parseScoutContent(draft.content);
    if (!parsed.ok) return null;
    // Proofs are kept as they came (the schema keeps them): the server checks them on save.
    const shots = Array.isArray(draft.shots) ? draft.shots.filter((s) => (s?.kind === "ranked" || s?.kind === "mastery") && typeof s.hash === "string").slice(0, 2) : [];
    return { teamId, content: parsed.content, shots, updatedAt: String(draft.updatedAt ?? "") };
  } catch {
    return null;
  }
}

export function saveDraft(draft: StoredDraft): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    // Storage full or blocked: the draft stays in the page only.
  }
}

export function clearDraft(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}
