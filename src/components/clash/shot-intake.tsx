"use client";

import * as React from "react";
import { AlertTriangle, Check, ClipboardPaste, ImageIcon, ImagePlus, Loader2, MoreHorizontal, RefreshCw, Replace, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/menu";
import { toast } from "@/components/ui/toast";
import type { ScreenshotKind } from "@/domain/clash-scout/types";
import { cn } from "@/lib/cn";
import type { ShotTile } from "./use-screenshots";

/*
  Where screenshots come in. Pasting works anywhere on the page (the workspace listens); this panel
  says so, takes drops and offers the file picker (and, where the browser allows it, a Paste button
  for touch screens). Once screenshots are in, it shrinks to their two places, Ranked and Mastery,
  each a small thumbnail with what is happening to it and what can be done with it.
*/

export const KIND_LABEL: Record<ScreenshotKind, string> = { ranked: "Ranked", mastery: "Mastery" };
const noopSubscribe = () => () => {};
const KINDS: ScreenshotKind[] = ["ranked", "mastery"];

/** The images on the clipboard, read through the asynchronous clipboard (a Paste button; Ctrl+V needs none of this). */
async function clipboardImages(): Promise<File[] | null> {
  try {
    const items = await navigator.clipboard.read();
    const files: File[] = [];
    for (const item of items) {
      const type = item.types.find((t) => t.startsWith("image/"));
      if (type) files.push(new File([await item.getType(type)], `pasted.${type.split("/")[1] ?? "png"}`, { type }));
    }
    return files;
  } catch {
    return null;
  }
}

export interface ShotIntakeProps {
  tiles: ShotTile[];
  announcement: string;
  canReadAgain: (id: string) => boolean;
  onFiles: (files: File[], expected?: ScreenshotKind) => void;
  onRetry: (id: string) => void;
  onReadAs: (id: string, kind: ScreenshotKind) => void;
  onRemove: (id: string) => void;
  onWarmUp: () => void;
  /** Files are being dragged over the page. */
  dragging: boolean;
}

export function ShotIntake({ tiles, announcement, canReadAgain, onFiles, onRetry, onReadAs, onRemove, onWarmUp, dragging }: ShotIntakeProps) {
  const input = React.useRef<HTMLInputElement>(null);
  const expected = React.useRef<ScreenshotKind | undefined>(undefined);
  // A Paste button where the browser can read images from the clipboard (Ctrl+V needs none).
  const canPaste = React.useSyncExternalStore(
    noopSubscribe,
    () => typeof navigator.clipboard?.read === "function",
    () => false,
  );

  const choose = (kind?: ScreenshotKind) => {
    expected.current = kind;
    onWarmUp();
    input.current?.click();
  };
  const paste = async () => {
    onWarmUp();
    const files = await clipboardImages();
    if (files === null) return void toast.error("The browser did not allow reading the clipboard. Press Ctrl+V (⌘V on a Mac) instead.");
    if (!files.length) return void toast.info("There is no image on the clipboard. Copy a screenshot first.", { duration: 4000 });
    onFiles(files);
  };

  const placed = (kind: ScreenshotKind) => tiles.find((t) => t.kind === kind && (t.readAt || t.status === "done"));
  const loose = tiles.filter((t) => !KINDS.some((k) => placed(k)?.id === t.id));
  const empty = tiles.length === 0;

  return (
    <section
      aria-labelledby="clash-shots-h"
      className={cn(
        "rounded-panel border-2 border-dashed transition-colors motion-reduce:transition-none",
        dragging ? "border-accent bg-accent/5" : empty ? "border-border bg-surface/40" : "border-border/70 bg-surface/30",
        empty ? "p-5 sm:p-8" : "p-3",
      )}
      onPointerEnter={onWarmUp}
      onFocus={onWarmUp}
      data-testid="clash-dropzone"
    >
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        data-testid="clash-file-input"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          onFiles(files, expected.current);
          expected.current = undefined;
        }}
      />
      <p className="sr-only" role="status" aria-live="polite" data-testid="clash-announce">
        {announcement}
      </p>

      {empty ? (
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-surface-2 text-accent" aria-hidden>
            <ClipboardPaste className="h-5 w-5" />
          </span>
          <h2 id="clash-shots-h" className="text-base font-semibold text-fg">
            Paste the two Clash screenshots
          </h2>
          <p className="max-w-xl text-sm text-fg-muted">
            Press <Kbd>Ctrl</Kbd> <Kbd>V</Kbd> anywhere on this page (<Kbd>⌘</Kbd> <Kbd>V</Kbd> on a Mac), drop the images here, or choose them. The Ranked and the Mastery screen, in either order: they are read on this device and never uploaded.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {canPaste ? (
              <Button variant="primary" onClick={() => void paste()} data-testid="clash-paste">
                <ClipboardPaste className="h-4 w-4" aria-hidden /> Paste
              </Button>
            ) : null}
            <Button variant={canPaste ? "secondary" : "primary"} onClick={() => choose()} data-testid="clash-choose">
              <ImagePlus className="h-4 w-4" aria-hidden /> Choose screenshots
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h2 id="clash-shots-h" className="text-sm font-semibold text-fg">
              Screenshots
            </h2>
            <p className="text-xs text-fg-subtle">
              <span className="max-md:hidden">
                Paste (<Kbd>Ctrl</Kbd> <Kbd>V</Kbd>) or drop another to add or replace one.
              </span>
              <span className="md:hidden">Read on this device, never uploaded.</span>
            </p>
          </div>
          <ul className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap" data-testid="clash-shots">
            {KINDS.map((kind) => {
              const tile = placed(kind);
              return tile ? (
                <Tile key={tile.id} tile={tile} canReadAgain={canReadAgain(tile.id)} onRetry={onRetry} onReadAs={onReadAs} onRemove={onRemove} onReplace={() => choose(kind)} />
              ) : (
                <li key={kind} className="sm:w-40">
                  <button
                    type="button"
                    onClick={() => choose(kind)}
                    className="flex aspect-video w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border-strong/60 bg-bg/40 px-2 text-center text-xs text-fg-muted transition-colors hover:border-accent hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
                    data-testid={`clash-slot-${kind}`}
                  >
                    <ImagePlus className="h-4 w-4" aria-hidden />
                    <span>
                      {KIND_LABEL[kind]} screen
                      <span className="block text-fg-subtle">Paste, drop or choose</span>
                    </span>
                  </button>
                </li>
              );
            })}
            {loose.map((tile) => (
              <Tile key={tile.id} tile={tile} canReadAgain={canReadAgain(tile.id)} onRetry={onRetry} onReadAs={onReadAs} onRemove={onRemove} onReplace={null} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border border-border bg-surface-2 px-1 py-px font-sans text-[0.7rem] font-medium text-fg">{children}</kbd>;
}

const STATUS: Record<ShotTile["status"], string> = { waiting: "Waiting", reading: "Reading", done: "Read", failed: "Not read", unreadable: "Not recognised" };

function Tile({
  tile,
  canReadAgain,
  onRetry,
  onReadAs,
  onRemove,
  onReplace,
}: {
  tile: ShotTile;
  canReadAgain: boolean;
  onRetry: (id: string) => void;
  onReadAs: (id: string, kind: ScreenshotKind) => void;
  onRemove: (id: string) => void;
  onReplace: (() => void) | null;
}) {
  const working = tile.status === "waiting" || tile.status === "reading";
  const label = tile.kind ? KIND_LABEL[tile.kind] : "Screenshot";
  const other: ScreenshotKind | null = tile.kind === "ranked" ? "mastery" : tile.kind === "mastery" ? "ranked" : null;
  return (
    <li className="min-w-0 sm:w-40" data-testid="clash-shot" data-kind={tile.kind ?? ""} data-status={tile.status}>
      <div className="relative aspect-video overflow-hidden rounded-md border border-border bg-bg">
        {tile.thumb ? (
          // eslint-disable-next-line @next/next/no-img-element -- the member's own screenshot, held in this page only
          <img src={tile.thumb} alt="" className={cn("h-full w-full object-cover transition-opacity", working && "opacity-40")} />
        ) : (
          <span className="grid h-full w-full place-items-center text-fg-subtle" title="Read on an earlier visit: screenshots are never kept.">
            <ImageIcon className="h-5 w-5" aria-hidden />
          </span>
        )}
        {working ? (
          <span className="absolute inset-0 grid place-items-center bg-bg/40 px-2 text-center">
            <span className="flex flex-col items-center gap-1 text-[11px] font-medium leading-tight text-fg">
              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
              {tile.status === "waiting" ? "Waiting…" : `${tile.step ?? "Reading"}…`}
            </span>
          </span>
        ) : tile.status === "done" ? (
          <span className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-good text-bg" aria-hidden>
            <Check className="h-3 w-3" />
          </span>
        ) : (
          <span className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-warn text-bg" aria-hidden>
            <AlertTriangle className="h-3 w-3" />
          </span>
        )}
      </div>
      <div className="mt-1 flex items-center gap-1">
        <p className="min-w-0 flex-1 truncate text-xs">
          <span className="font-medium text-fg">{label}</span> <span className="text-fg-subtle">· {tile.kind && !tile.sure && tile.status === "done" ? "Read (screen guessed)" : STATUS[tile.status]}</span>
        </p>
        {working ? null : (
          <Menu
            label={`${label} screenshot`}
            testId="clash-shot-menu"
            trigger={(t) => (
              <button
                {...t}
                type="button"
                className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-10 pointer-coarse:w-10"
                aria-label={`Options for the ${label.toLowerCase()} screenshot`}
              >
                <MoreHorizontal className="h-4 w-4" aria-hidden />
              </button>
            )}
          >
            {other && canReadAgain ? (
              <MenuItem icon={<RefreshCw className="h-4 w-4" />} onSelect={() => onReadAs(tile.id, other)}>
                It is the {KIND_LABEL[other]} screen
              </MenuItem>
            ) : null}
            {canReadAgain && tile.status !== "unreadable" ? (
              <MenuItem icon={<RefreshCw className="h-4 w-4" />} onSelect={() => onRetry(tile.id)}>
                Read again
              </MenuItem>
            ) : null}
            {onReplace ? (
              <MenuItem icon={<Replace className="h-4 w-4" />} onSelect={onReplace}>
                Replace…
              </MenuItem>
            ) : null}
            <MenuSeparator />
            <MenuItem icon={<Trash2 className="h-4 w-4" />} tone="danger" onSelect={() => onRemove(tile.id)}>
              Remove
            </MenuItem>
          </Menu>
        )}
      </div>
      {tile.status === "failed" || tile.status === "unreadable" ? (
        <div className="mt-1 space-y-1">
          <p className="text-[11px] leading-snug text-fg-muted" data-testid="clash-shot-message">
            {tile.message}
          </p>
          <div className="flex flex-wrap gap-1">
            {tile.status === "failed" && canReadAgain ? (
              <Button size="sm" onClick={() => onRetry(tile.id)} data-testid="clash-shot-retry">
                <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Try again
              </Button>
            ) : null}
            {tile.status === "unreadable" && canReadAgain
              ? KINDS.map((k) => (
                  <Button key={k} size="sm" onClick={() => onReadAs(tile.id, k)} data-testid={`clash-shot-as-${k}`}>
                    Read as {KIND_LABEL[k]}
                  </Button>
                ))
              : null}
            {!tile.readAt ? (
              <Button size="sm" variant="ghost" onClick={() => onRemove(tile.id)} aria-label="Remove this screenshot">
                <X className="h-3.5 w-3.5" aria-hidden />
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </li>
  );
}
