"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Camera, ImageUp, RotateCcw, Trash2 } from "lucide-react";
import { removeAvatarAction, uploadAvatarAction } from "@/server/actions/account";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Menu, MenuItem } from "@/components/ui/menu";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { AVATAR_ZOOM_MAX, AVATAR_ZOOM_MIN, clampCrop, clampZoom, cropRect, DEFAULT_CROP, dragCrop, viewportLayout, type CropState } from "@/domain/avatar-crop";

/** A chosen picture, decoded once: the editor and the final crop both draw from it. */
interface Source {
  url: string;
  image: HTMLImageElement;
  width: number;
  height: number;
}

function loadSource(file: File): Promise<Source> {
  const url = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => (image.naturalWidth > 0 && image.naturalHeight > 0 ? resolve({ url, image, width: image.naturalWidth, height: image.naturalHeight }) : reject(new Error("empty")));
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("unreadable"));
    };
    image.src = url;
  });
}

/** The saved picture: the crop drawn once into a 256×256 square (WebP, PNG fallback), so uploads stay tiny. */
function renderCrop(source: Source, crop: CropState): string {
  const { sx, sy, side } = cropRect(crop, source.width, source.height);
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source.image, sx, sy, side, side, 0, 0, 256, 256);
  const webp = canvas.toDataURL("image/webp", 0.86);
  return webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/png");
}

/** Arrow keys move the picture by this share of the crop (Shift: the larger step). */
const KEY_STEP = 0.02;
const KEY_STEP_LARGE = 0.1;

interface CropperHandle {
  crop: () => CropState;
}

/**
 * The crop editor: a fixed circle over the picture. The picture follows a mouse or finger (pointer
 * capture keeps the drag in the editor), arrow keys move it when the circle has focus, and one
 * slider zooms. Moving writes the transform straight to the image (once per frame) instead of
 * re-rendering, and the state is clamped every time, so no empty space can show in the circle. A
 * small preview beside it shows the picture at the size it is mostly seen.
 */
const AvatarCropper = React.forwardRef<CropperHandle, { source: Source }>(function AvatarCropper({ source }, ref) {
  const frameRef = React.useRef<HTMLDivElement>(null);
  const imageRef = React.useRef<HTMLImageElement>(null);
  const thumbFrameRef = React.useRef<HTMLDivElement>(null);
  const thumbRef = React.useRef<HTMLImageElement>(null);
  const crop = React.useRef<CropState>(DEFAULT_CROP);
  const drag = React.useRef<{ id: number; x: number; y: number } | null>(null);
  const frame = React.useRef(0);
  const [zoom, setZoom] = React.useState(DEFAULT_CROP.zoom);
  const [dragging, setDragging] = React.useState(false);
  const hintId = React.useId();

  const apply = React.useCallback(() => {
    frame.current = 0;
    for (const [box, img] of [
      [frameRef.current, imageRef.current],
      [thumbFrameRef.current, thumbRef.current],
    ] as const) {
      if (!box || !img) continue;
      const l = viewportLayout(crop.current, source.width, source.height, box.clientWidth);
      img.style.width = `${l.w}px`;
      img.style.height = `${l.h}px`;
      img.style.transform = `translate3d(${l.x}px, ${l.y}px, 0)`;
    }
  }, [source]);
  const schedule = React.useCallback(() => {
    if (!frame.current) frame.current = requestAnimationFrame(apply);
  }, [apply]);
  React.useLayoutEffect(() => {
    apply();
    const box = frameRef.current;
    if (!box || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => apply());
    ro.observe(box);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(frame.current);
    };
  }, [apply]);
  React.useImperativeHandle(ref, () => ({ crop: () => clampCrop(crop.current, source.width, source.height) }), [source]);

  const moveBy = (dx: number, dy: number) => {
    const size = frameRef.current?.clientWidth ?? 256;
    crop.current = dragCrop(crop.current, dx, dy, source.width, source.height, size);
    schedule();
  };
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (drag.current || (e.pointerType === "mouse" && e.button !== 0)) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // A pointer the browser no longer tracks: the drag still works while it stays over the circle.
    }
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    setDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    d.x = e.clientX;
    d.y = e.clientY;
    moveBy(dx, dy);
  };
  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id !== e.pointerId) return;
    drag.current = null;
    setDragging(false);
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = (frameRef.current?.clientWidth ?? 256) * (e.shiftKey ? KEY_STEP_LARGE : KEY_STEP);
    const move: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const m = move[e.key];
    if (!m) return;
    e.preventDefault();
    moveBy(m[0], m[1]);
  };
  const zoomTo = (value: number) => {
    crop.current = clampCrop({ ...crop.current, zoom: clampZoom(value) }, source.width, source.height);
    setZoom(crop.current.zoom);
    schedule();
  };
  const reset = () => {
    crop.current = DEFAULT_CROP;
    setZoom(DEFAULT_CROP.zoom);
    schedule();
  };

  // eslint-disable-next-line @next/next/no-img-element -- a local, not-yet-uploaded picture
  const picture = (r: React.Ref<HTMLImageElement>, testId?: string) => <img ref={r} src={source.url} alt="" draggable={false} className="pointer-events-none absolute left-0 top-0 max-w-none origin-top-left select-none" data-testid={testId} />;
  return (
    <div className="flex flex-col items-center gap-4" data-testid="avatar-cropper">
      <div
        ref={frameRef}
        tabIndex={0}
        role="group"
        aria-roledescription="picture position"
        aria-label="Picture position"
        aria-describedby={hintId}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
        onKeyDown={onKeyDown}
        className={cn("relative aspect-square w-[min(16rem,68vw)] touch-none select-none overflow-hidden rounded-full bg-surface-3 shadow-lg shadow-black/40 ring-2 ring-border-strong focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent", dragging ? "cursor-grabbing" : "cursor-grab")}
        data-dragging={dragging || undefined}
        data-testid="avatar-crop-frame"
      >
        {picture(imageRef, "avatar-crop-image")}
      </div>
      <p id={hintId} className="text-center text-xs text-fg-muted">
        Drag the picture to position it.<span className="pointer-coarse:hidden"> Arrow keys move it too (Shift for bigger steps).</span>
      </p>
      <div className="flex w-full max-w-xs items-center gap-3">
        <div ref={thumbFrameRef} aria-hidden className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full bg-surface-3 ring-1 ring-border-strong" data-testid="avatar-crop-preview">
          {picture(thumbRef)}
        </div>
        <label className="flex flex-1 items-center gap-3 text-sm">
          <span className="text-fg-muted">Zoom</span>
          <input type="range" min={AVATAR_ZOOM_MIN} max={AVATAR_ZOOM_MAX} step={0.01} value={zoom} onChange={(e) => zoomTo(Number(e.target.value))} aria-valuetext={`${Math.round(zoom * 100)}%`} className="flex-1 accent-[var(--color-accent)]" data-testid="avatar-zoom" />
        </label>
      </div>
      <Button size="sm" variant="ghost" onClick={reset} data-testid="avatar-crop-reset">
        <RotateCcw className="h-4 w-4" aria-hidden /> Reset position
      </Button>
    </div>
  );
});

/**
 * The one profile-picture flow (Settings and My Profile use it): choose a file, position it in the
 * circle (drag, arrow keys, zoom), save; or remove. Cancel discards everything. The server action
 * works on the signed-in account only, so nobody can change someone else's picture. After a change
 * the page data is refreshed, so the sidebar, Team, Players and draft cards show the new picture:
 * the saved file is the crop itself, so it looks the same everywhere.
 */
export function useAvatarUpload() {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const cropper = React.useRef<CropperHandle>(null);
  const [source, setSource] = React.useState<Source | null>(null);
  const [busy, setBusy] = React.useState(false);

  // The local picture's address is released when it is no longer edited.
  React.useEffect(() => (source ? () => URL.revokeObjectURL(source.url) : undefined), [source]);

  const pick = (f: File | null) => {
    if (inputRef.current) inputRef.current.value = "";
    if (!f) return;
    if (!/^image\/(png|jpeg|webp)$/.test(f.type)) return toast.error("Use a PNG, JPEG or WebP picture.");
    if (f.size > 15 * 1024 * 1024) return toast.error("That file is very large; choose one under 15 MB.");
    loadSource(f)
      .then(setSource)
      .catch(() => toast.error("That file could not be read as an image."));
  };
  const close = () => setSource(null);
  const upload = async () => {
    const crop = cropper.current?.crop();
    if (!source || !crop) return;
    setBusy(true);
    const r = await uploadAvatarAction(renderCrop(source, crop));
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.success("Profile picture updated.");
    close();
    router.refresh();
  };
  const remove = async () => {
    setBusy(true);
    const r = await removeAvatarAction();
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.success("Profile picture removed.");
    router.refresh();
  };

  const ui = (
    <>
      <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label="Choose a profile picture" tabIndex={-1} onChange={(e) => pick(e.target.files?.[0] ?? null)} data-testid="avatar-file" />
      <Dialog
        open={!!source}
        onClose={close}
        title="Position your picture"
        footer={
          <>
            <Button variant="ghost" onClick={close} disabled={busy} data-testid="avatar-cancel">
              Cancel
            </Button>
            <Button variant="primary" onClick={upload} disabled={busy || !source} data-testid="avatar-save">
              {busy ? "Saving…" : "Save"}
            </Button>
          </>
        }
      >
        {source ? <AvatarCropper key={source.url} ref={cropper} source={source} /> : null}
      </Dialog>
    </>
  );
  return { choose: () => inputRef.current?.click(), remove, busy, ui };
}

/**
 * Your own picture on My Profile, editable where it is shown: a camera badge (always visible on
 * touch screens, on hover or focus elsewhere) opens "Change picture" / "Remove picture", or the
 * file picker straight away when there is no picture yet.
 */
export function ProfileAvatarEditable({ name, src }: { name: string; src: string | null }) {
  const { choose, remove, busy, ui } = useAvatarUpload();
  const face = (
    <>
      <Avatar name={name} src={src} size="hero" />
      <span className={cn("absolute inset-0 grid place-items-center rounded-full bg-black/45 text-white opacity-0 transition-opacity group-hover/avatar:opacity-100 group-focus-visible/avatar:opacity-100")} aria-hidden>
        <Camera className="h-6 w-6" />
      </span>
      <span className="absolute -bottom-0.5 -right-0.5 grid h-8 w-8 place-items-center rounded-full border-2 border-surface bg-accent text-bg shadow-md" aria-hidden>
        <Camera className="h-4 w-4" />
      </span>
    </>
  );
  const buttonClass = "group/avatar relative shrink-0 rounded-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent disabled:opacity-70";
  return (
    <>
      {src ? (
        <Menu
          label="Profile picture"
          align="start"
          testId="avatar-menu"
          trigger={(p) => (
            <button {...p} type="button" disabled={busy} className={buttonClass} aria-label="Change your profile picture" title="Change your profile picture" data-testid="profile-avatar-edit">
              {face}
            </button>
          )}
        >
          <MenuItem icon={<ImageUp className="h-4 w-4" />} onSelect={choose}>
            Change picture
          </MenuItem>
          <MenuItem icon={<Trash2 className="h-4 w-4" />} tone="danger" onSelect={() => void remove()}>
            Remove picture
          </MenuItem>
        </Menu>
      ) : (
        <button type="button" disabled={busy} onClick={choose} className={buttonClass} aria-label="Add a profile picture" title="Add a profile picture" data-testid="profile-avatar-edit">
          {face}
        </button>
      )}
      {ui}
    </>
  );
}
