"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Camera, Trash2 } from "lucide-react";
import { changeDisplayNameAction, changeUsernameAction } from "@/server/actions/account";
import { DISPLAY_NAME_MAX, displayNameProblem, normaliseDisplayName } from "@/domain/display-name";
import { ON_THE_PUBLIC_PAGE } from "@/domain/privacy";
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

/**
 * Display name: the name teammates see (Team, Players, your profile, cards, Leaderboards,
 * Matches), and the public team page while they are in the lineup or a substitute. Checked as you
 * type with the server's rule, saved with an explicit button; changing it never changes the
 * username, links or anything that belongs to the account.
 */
export function DisplayNameEditor({ displayName }: { displayName: string }) {
  const router = useRouter();
  const [value, setValue] = React.useState(displayName);
  const [saved, setSaved] = React.useState(displayName);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const changed = normaliseDisplayName(value) !== saved;
  const local = changed ? displayNameProblem(value) : null;
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!changed || local) return;
    setBusy(true);
    setError(null);
    const r = await changeDisplayNameAction(value);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setValue(r.data.displayName);
    setSaved(r.data.displayName);
    toast.success("Display name changed.", { description: `Teammates now see “${r.data.displayName}”. Your username stays the same.` });
    router.refresh();
  };
  const shown = error ?? local;
  return (
    <form onSubmit={save} className="flex flex-wrap items-start gap-2" data-testid="display-name-form">
      <div className="min-w-0 flex-1 basis-56">
        <Label htmlFor="display-name">Display name</Label>
        <Input
          id="display-name"
          value={value}
          autoComplete="nickname"
          maxLength={DISPLAY_NAME_MAX + 8}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          aria-invalid={!!shown}
          aria-describedby="display-name-help"
        />
        <p id="display-name-help" className={shown ? "mt-1.5 text-xs text-bad" : "mt-1.5 text-pretty text-xs text-fg-subtle"} role={shown ? "alert" : undefined}>
          {shown ?? `Shown to teammates across the app, and ${ON_THE_PUBLIC_PAGE}. It doesn't have to be unique or match your Riot ID.`}
        </p>
      </div>
      <Button type="submit" variant="outline" className="mt-5" disabled={busy || !changed || !!local}>
        {busy ? "Saving…" : "Save display name"}
      </Button>
    </form>
  );
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
          {shown ?? "What you sign in with. Not case-sensitive. Teammates see your display name, not this."}
        </p>
      </div>
      <Button type="submit" variant="outline" className="mt-5" disabled={busy || !changed || !!local}>
        {busy ? "Saving…" : "Save username"}
      </Button>
    </form>
  );
}

/**
 * Optional profile picture: choose a file, adjust the square crop, upload. Remove any time (the
 * same flow as on My Profile). Teammates see it, and the public team page while the member is in
 * the lineup or a substitute (ON_THE_PUBLIC_PAGE).
 */
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
      <p className="w-full text-pretty text-xs text-fg-subtle" data-testid="avatar-help">{`Optional. PNG, JPEG or WebP, cropped to a square. Shown to teammates, and ${ON_THE_PUBLIC_PAGE}. You can also change it from My Profile.`}</p>
      {ui}
    </div>
  );
}
