"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Camera, Trash2 } from "lucide-react";
import { changeUsernameAction } from "@/server/actions/account";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { useAvatarUpload } from "@/components/profile/avatar-upload";

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

/** Optional profile picture: choose a file, adjust the square crop, upload. Remove any time (the same flow as on My Profile). */
export function AvatarEditor({ name, src }: { name: string; src: string | null }) {
  const { choose, remove, busy, ui } = useAvatarUpload();
  return (
    <div className="flex flex-wrap items-center gap-4" data-testid="avatar-editor">
      <Avatar name={name} src={src} size="xl" />
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={choose}>
          <Camera className="h-4 w-4" /> {src ? "Change picture" : "Add a picture"}
        </Button>
        {src ? (
          <Button variant="ghost" disabled={busy} onClick={() => void remove()}>
            <Trash2 className="h-4 w-4" /> Remove
          </Button>
        ) : null}
      </div>
      <p className="w-full text-xs text-fg-subtle">Optional. PNG, JPEG or WebP; it is cropped to a square and shown to teammates only. You can also change it from My Profile.</p>
      {ui}
    </div>
  );
}
