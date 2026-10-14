"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Camera, Trash2 } from "lucide-react";
import { changeUsernameAction, removeAvatarAction, uploadAvatarAction } from "@/server/actions/account";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";

const USERNAME_RULE = /^[\p{L}\p{N}][\p{L}\p{N} ._-]{0,30}[\p{L}\p{N}]$/u;

function usernameProblem(value: string): string | null {
  const v = value.trim().replace(/\s+/g, " ");
  if (v.length < 2) return "At least 2 characters.";
  if (v.length > 32) return "32 characters at most.";
  if (!USERNAME_RULE.test(v)) return "Letters, digits, spaces, dots, underscores and hyphens.";
  return null;
}

/** Username: checked as you type, saved with an explicit button (it is what you sign in with). */
export function UsernameEditor({ username }: { username: string }) {
  const router = useRouter();
  const [value, setValue] = React.useState(username);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const local = value.trim() === username ? null : usernameProblem(value);
  const changed = value.trim().replace(/\s+/g, " ") !== username;
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!changed || local) return;
    setBusy(true);
    setError(null);
    const r = await changeUsernameAction(value);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setValue(r.data.username);
    toast.success("Username changed.", { description: `Sign in as “${r.data.username}” from now on. Your password stays the same.` });
    router.refresh();
  };
  const shown = error ?? local;
  return (
    <form onSubmit={save} className="flex flex-wrap items-start gap-2" data-testid="username-form">
      <div className="min-w-0 flex-1 basis-56">
        <Label htmlFor="username">Username</Label>
        <Input
          id="username"
          value={value}
          autoComplete="username"
          maxLength={32}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          aria-invalid={!!shown}
          aria-describedby="username-help"
        />
        <p id="username-help" className={shown ? "mt-1.5 text-xs text-bad" : "mt-1.5 text-xs text-fg-subtle"}>
          {shown ?? "What you sign in with and what teammates see. Not case-sensitive."}
        </p>
      </div>
      <Button type="submit" variant="outline" className="mt-5" disabled={busy || !changed || !!local}>
        {busy ? "Saving…" : "Save username"}
      </Button>
    </form>
  );
}

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

/** Optional profile picture: choose a file, adjust the square crop, upload. Remove any time. */
export function AvatarEditor({ name, src }: { name: string; src: string | null }) {
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
    if (!f) return;
    if (!/^image\/(png|jpeg|webp)$/.test(f.type)) return toast.error("Use a PNG, JPEG or WebP picture.");
    if (f.size > 15 * 1024 * 1024) return toast.error("That file is very large; choose one under 15 MB.");
    setZoom(1);
    setOffset({ x: 0, y: 0 });
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
  return (
    <div className="flex flex-wrap items-center gap-4" data-testid="avatar-editor">
      <Avatar name={name} src={src} size="xl" />
      <div className="flex flex-wrap gap-2">
        <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" id="avatar-file" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
        <Button variant="outline" onClick={() => inputRef.current?.click()}>
          <Camera className="h-4 w-4" /> {src ? "Change picture" : "Add a picture"}
        </Button>
        {src ? (
          <Button
            variant="ghost"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const r = await removeAvatarAction();
              setBusy(false);
              if (!r.ok) return toast.error(r.error);
              toast.success("Profile picture removed.");
              router.refresh();
            }}
          >
            <Trash2 className="h-4 w-4" /> Remove
          </Button>
        ) : null}
      </div>
      <p className="w-full text-xs text-fg-subtle">Optional. PNG, JPEG or WebP; it is cropped to a square and shown to teammates only.</p>
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
            <img src={preview} alt="Preview of your profile picture" className="h-40 w-40 rounded-full object-cover ring-2 ring-border-strong" />
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
    </div>
  );
}
