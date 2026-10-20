"use client";

import * as React from "react";
import { toast } from "@/components/ui/toast";
import type { ScreenshotKind } from "@/domain/clash-scout/types";
import type { DraftShot } from "./draft-store";
import type { OpenedShot, Recognizer, ShotResult } from "./recognizer";

/*
  The screenshots of a draft scout, from the moment one is pasted until its reading is in the
  cards. Each image gets a tile at once (a thumbnail held in this page only, as an object URL);
  images are then read one after another, in the order they arrived. The same picture twice is
  noticed from its pixels and dropped. Each of Clash's two screens has one place: a newer
  screenshot of a screen replaces the earlier one. A tile can be read again, read as the other
  screen, or removed; a reading that fails changes nothing that was already filled in.
*/

export type TileStatus = "waiting" | "reading" | "done" | "failed" | "unreadable";

export interface ShotTile {
  id: string;
  /** The screen it shows, once known. */
  kind: ScreenshotKind | null;
  status: TileStatus;
  /** What is being done now (while reading). */
  step: string | null;
  /** A thumbnail for this page only (object URL); none for screenshots restored from an earlier visit. */
  thumb: string | null;
  fingerprint: string | null;
  /** Whether its kind was clear from the picture (or chosen by the member). */
  sure: boolean;
  /** Why it could not be read. */
  message: string | null;
  readAt: string | null;
}

let recognizer: Promise<Recognizer> | null = null;
function loadRecognizer(mode: "real" | "fake", ddragonVersion: string | null): Promise<Recognizer> {
  // Text recognition is loaded the first time it is needed, never with the page.
  recognizer ??= (mode === "fake" ? import("./fake-recognizer").then((m) => m.createFakeRecognizer()) : import("./recognizer").then((m) => m.createRecognizer({ ddragonVersion }))).catch((err) => {
    recognizer = null;
    throw err;
  });
  return recognizer;
}

const isImage = (f: File) => f.type.startsWith("image/");
/** At most this many images from one paste or drop: the two screens, with room for a mistaken extra. */
const MAX_AT_ONCE = 4;

const NOT_RUN = "Text recognition could not run: it is downloaded from the jsDelivr CDN the first time, which this network may block. Try again, or fill the cards in by hand.";

export interface ScreenshotsOptions {
  recognition: "real" | "fake";
  ddragonVersion: string | null;
  /** Screenshots read on an earlier visit (no thumbnails: images are never kept). */
  initial: DraftShot[];
  /** A reading to put into the scout; `replaces` is the kind this screenshot was read as before, if different. */
  onRead: (kind: ScreenshotKind, result: ShotResult, replaces: ScreenshotKind | null) => void;
  /** A screenshot removed: what it filled in goes. */
  onRemove: (kind: ScreenshotKind) => void;
}

export function useScreenshots({ recognition, ddragonVersion, initial, onRead, onRemove }: ScreenshotsOptions) {
  const [tiles, setTilesState] = React.useState<ShotTile[]>(() =>
    initial.map((s) => ({ id: `saved-${s.kind}`, kind: s.kind, status: "done", step: null, thumb: null, fingerprint: s.hash, sure: true, message: null, readAt: s.readAt })),
  );
  const tilesRef = React.useRef(tiles);
  const setTiles = React.useCallback((next: ShotTile[]) => {
    tilesRef.current = next;
    setTilesState(next);
  }, []);
  const update = React.useCallback((id: string, patch: Partial<ShotTile>) => setTiles(tilesRef.current.map((t) => (t.id === id ? { ...t, ...patch } : t))), [setTiles]);
  // The decoded pictures, kept to read again (this page only).
  const opened = React.useRef(new Map<string, OpenedShot>());
  const queue = React.useRef<Promise<void>>(Promise.resolve());
  // The latest handlers, for readings that finish after a re-render.
  const callbacks = React.useRef({ onRead, onRemove });
  React.useLayoutEffect(() => {
    callbacks.current = { onRead, onRemove };
  });
  const [announcement, setAnnouncement] = React.useState("");

  const drop = React.useCallback(
    (id: string) => {
      const tile = tilesRef.current.find((t) => t.id === id);
      if (tile?.thumb) URL.revokeObjectURL(tile.thumb);
      opened.current.delete(id);
      setTiles(tilesRef.current.filter((t) => t.id !== id));
    },
    [setTiles],
  );

  // Thumbnails are released with the page.
  React.useEffect(
    () => () => {
      for (const t of tilesRef.current) if (t.thumb) URL.revokeObjectURL(t.thumb);
    },
    [],
  );

  const read = React.useCallback(
    async (id: string, chosen?: ScreenshotKind, expected?: ScreenshotKind) => {
      const shot = opened.current.get(id);
      const before = tilesRef.current.find((t) => t.id === id);
      if (!shot || !before) return;
      update(id, { status: "reading", step: "Starting", message: null });
      try {
        const r = await (await loadRecognizer(recognition, ddragonVersion)).read(shot, { kind: chosen, onStep: (step) => update(id, { step }) });
        if (!tilesRef.current.some((t) => t.id === id)) return; // removed while it was being read
        let result = r;
        // The member started from one screen's place and the picture does not clearly say otherwise: read it as that screen.
        if (!chosen && expected && (!r.read.kindSure || !r.read.kind) && r.read.kind !== expected && r.read.layout) {
          result = await (await loadRecognizer(recognition, ddragonVersion)).read(shot, { kind: expected, onStep: (step) => update(id, { step }) });
          if (!tilesRef.current.some((t) => t.id === id)) return;
        }
        const kind = result.read.kind;
        const anything = result.read.columns.some((c) => c.name || c.rank || c.ranked.length || c.mastery.length);
        if (!kind || !anything) {
          const message = before.readAt ? "No players could be read this way; the earlier reading is kept." : "No players could be read here. Is it one of Clash's two scouting screens (Ranked or Mastery)?";
          update(id, { status: "unreadable", step: null, message });
          setAnnouncement("No players could be read in that image.");
          return;
        }
        // Chosen from one screen's place, but clearly the other screen: used as what it is, and said so.
        if (!chosen && expected && kind !== expected) toast.info(`This is the ${kind} screen, so it was used as that.`, { duration: 3500 });
        // What this screenshot was read as before (being read as the other screen now).
        const previous = before.readAt ? before.kind : null;
        callbacks.current.onRead(kind, result, previous && previous !== kind ? previous : null);
        // One screenshot per screen: an earlier one of this screen is replaced.
        for (const other of tilesRef.current.filter((t) => t.id !== id && t.kind === kind && t.status !== "waiting" && t.status !== "reading")) drop(other.id);
        update(id, { status: "done", kind, step: null, sure: !!chosen || result.read.kindSure || kind === expected, readAt: new Date().toISOString() });
        const names = result.read.columns.filter((c) => c.name).length;
        setAnnouncement(`${kind === "ranked" ? "Ranked" : "Mastery"} screenshot read: ${names} of 5 names.`);
      } catch (err) {
        console.error(err);
        if (!tilesRef.current.some((t) => t.id === id)) return;
        // Whatever an earlier reading filled in stays.
        update(id, { status: "failed", step: null, message: before.readAt ? "It could not be read again; the earlier reading is kept." : NOT_RUN });
        setAnnouncement("The screenshot could not be read.");
      }
    },
    [recognition, ddragonVersion, update, drop],
  );

  /** New images, from a paste, a drop or the file picker. */
  const add = React.useCallback(
    (files: File[], expected?: ScreenshotKind) => {
      const images = files.filter(isImage).slice(0, MAX_AT_ONCE);
      if (!images.length) {
        if (files.length) toast.error("That is not an image. Paste or choose the Clash screenshots.");
        return;
      }
      for (const file of images) {
        const id = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
        setTiles([...tilesRef.current, { id, kind: null, status: "waiting", step: null, thumb: URL.createObjectURL(file), fingerprint: null, sure: false, message: null, readAt: null }]);
        queue.current = queue.current.then(async () => {
          if (!tilesRef.current.some((t) => t.id === id)) return;
          try {
            update(id, { status: "reading", step: "Opening the image" });
            const shot = await (await loadRecognizer(recognition, ddragonVersion)).open(file);
            if (tilesRef.current.some((t) => t.id !== id && t.fingerprint === shot.fingerprint)) {
              drop(id);
              toast.info("This screenshot is already added.", { duration: 2500 });
              return;
            }
            opened.current.set(id, shot);
            update(id, { fingerprint: shot.fingerprint });
          } catch (err) {
            console.error(err);
            update(id, { status: "failed", step: null, message: "This image could not be opened." });
            return;
          }
          await read(id, undefined, expected);
        });
      }
    },
    [recognition, ddragonVersion, read, update, drop, setTiles],
  );

  const enqueue = React.useCallback((id: string, chosen?: ScreenshotKind) => {
    update(id, { status: "waiting", step: null, message: null });
    queue.current = queue.current.then(() => read(id, chosen));
  }, [read, update]);

  return {
    tiles,
    announcement,
    add,
    /** Reads a tile again (after a failure, or as the screen the member chose). */
    retry: (id: string) => enqueue(id, tilesRef.current.find((t) => t.id === id)?.kind ?? undefined),
    readAs: (id: string, kind: ScreenshotKind) => enqueue(id, kind),
    /** Whether a tile can be read again in this page (its picture is still open). */
    canReadAgain: (id: string) => opened.current.has(id),
    remove: (id: string) => {
      const tile = tilesRef.current.find((t) => t.id === id);
      if (!tile) return;
      // What it filled in goes with it (a reading that failed afterwards left that in place).
      if (tile.kind && tile.readAt) callbacks.current.onRemove(tile.kind);
      drop(id);
    },
    /** Every tile cleared (the scout was discarded). */
    reset: () => {
      for (const t of tilesRef.current) if (t.thumb) URL.revokeObjectURL(t.thumb);
      opened.current.clear();
      setTiles([]);
    },
    warmUp: () => {
      void loadRecognizer(recognition, ddragonVersion)
        .then((r) => r.warmUp())
        .catch(() => {});
    },
  };
}
