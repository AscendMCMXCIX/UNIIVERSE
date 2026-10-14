"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Camera, ImageUp, Trash2 } from "lucide-react";
import { removeAvatarAction, uploadAvatarAction } from "@/server/actions/account";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Menu, MenuItem } from "@/components/ui/menu";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";

/** Square-crops and resizes an image file in the browser (256×256 WebP, PNG fallback) so uploads stay tiny. */
async function cropToSquare(file: File, zoom: number, offsetX: number, offsetY: number): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("unreadable"));
      i.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight) / zoom;
    const maxX = img.naturalWidth - side;
    const maxY = img.naturalHeight - side;
    const sx = Math.max(0, Math.min(maxX, maxX / 2 + offsetX * (maxX / 2)));
    const sy = Math.max(0, Math.min(maxY, maxY / 2 + offsetY * (maxY / 2)));
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, sx, sy, side, side, 0, 0, 256, 256);
    const webp = canvas.toDataURL("image/webp", 0.86);
    return webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * The one profile-picture flow (Settings and My Profile use it): choose a file, position the
 * square crop with a live preview, upload; or remove. The server action works on the signed-in
 * account only, so nobody can change someone else's picture. After a change the page data is
 * refreshed, so the sidebar, Team, Players and draft cards show the new picture.
 */
export function useAvatarUpload() {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [file, setFile] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [zoom, setZoom] = React.useState(1);
  const [offset, setOffset] = React.useState({ x: 0, y: 0 });
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!file) return;
    let alive = true;
    cropToSquare(file, zoom, offset.x, offset.y)
      .then((d) => alive && setPreview(d))
      .catch(() => {
        toast.error("That file could not be read as an image.");
        setFile(null);
      });
    return () => {
      alive = false;
    };
  }, [file, zoom, offset]);

  const pick = (f: File | null) => {
    if (inputRef.current) inputRef.current.value = "";
    if (!f) return;
    if (!/^image\/(png|jpeg|webp)$/.test(f.type)) return toast.error("Use a PNG, JPEG or WebP picture.");
    if (f.size > 15 * 1024 * 1024) return toast.error("That file is very large; choose one under 15 MB.");
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setPreview(null);
    setFile(f);
  };
  const upload = async () => {
    if (!preview) return;
    setBusy(true);
    const r = await uploadAvatarAction(preview);
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.success("Profile picture updated.");
    setFile(null);
    setPreview(null);
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
        open={!!file}
        onClose={() => setFile(null)}
        title="Position your picture"
        footer={
          <>
            <Button variant="ghost" onClick={() => setFile(null)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" onClick={upload} disabled={busy || !preview} data-testid="avatar-save">
              {busy ? "Uploading…" : "Use this picture"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col items-center gap-4">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Preview of your profile picture" className="h-40 w-40 rounded-full object-cover ring-2 ring-border-strong" data-testid="avatar-preview" />
          ) : (
            <div className="h-40 w-40 animate-pulse rounded-full bg-surface-3" />
          )}
          <div className="w-full max-w-xs space-y-2 text-sm">
            <label className="flex items-center gap-3">
              <span className="w-20 text-fg-muted">Zoom</span>
              <input type="range" min={1} max={3} step={0.05} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="flex-1 accent-[var(--color-accent)]" />
            </label>
            <label className="flex items-center gap-3">
              <span className="w-20 text-fg-muted">Left–right</span>
              <input type="range" min={-1} max={1} step={0.05} value={offset.x} onChange={(e) => setOffset({ ...offset, x: Number(e.target.value) })} className="flex-1 accent-[var(--color-accent)]" />
            </label>
            <label className="flex items-center gap-3">
              <span className="w-20 text-fg-muted">Up–down</span>
              <input type="range" min={-1} max={1} step={0.05} value={offset.y} onChange={(e) => setOffset({ ...offset, y: Number(e.target.value) })} className="flex-1 accent-[var(--color-accent)]" />
            </label>
          </div>
        </div>
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
      <Avatar name={name} src={src} size="hero" ring="accent" />
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
