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
import { InfoTip } from "@/components/ui/info-tip";
import { toast } from "@/components/ui/toast";
import { useAvatarUpload } from "@/components/profile/avatar-upload";
import { SectionIndex, type SectionIndexItem } from "@/components/ui/section-index";
import { subTabClass } from "@/components/ui/sub-tabs";
import { cn } from "@/lib/cn";

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
    <form onSubmit={save} className="min-w-0" data-testid="display-name-form">
      <Label htmlFor="display-name">Display name</Label>
      {/* The field and its Save on one row (44px on a phone): "Save" shows, "Save display name" is read out. */}
      <div className="flex items-start gap-2">
        <Input
          id="display-name"
          className="min-w-0 flex-1"
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
        <SaveButton busy={busy} disabled={busy || !changed || !!local} what="display name" />
      </div>
      <p id="display-name-help" className={shown ? "mt-1.5 text-xs text-bad" : "mt-1.5 text-pretty text-xs text-fg-subtle"} role={shown ? "alert" : undefined}>
        {shown ?? (
          <>
            Shown to teammates; it needn&apos;t be unique.{" "}
            <InfoTip label="Where it shows" text={`Across the app, and ${ON_THE_PUBLIC_PAGE}. It needn't match your Riot ID.`} testId="display-name-help-info" />
          </>
        )}
      </p>
    </form>
  );
}

/** A field's own Save, beside it: "Save" on screen, "Save <what>" for screen readers and speech control (it starts with the visible word). */
function SaveButton({ busy, disabled, what }: { busy: boolean; disabled: boolean; what: string }) {
  return (
    <Button type="submit" variant="outline" className="shrink-0" wrap disabled={disabled}>
      {busy ? (
        "Saving…"
      ) : (
        <>
          Save<span className="sr-only"> {what}</span>
        </>
      )}
    </Button>
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
    <form onSubmit={save} className="min-w-0" data-testid="username-form">
      <Label htmlFor="username">Username</Label>
      <div className="flex items-start gap-2">
        <Input
          id="username"
          className="min-w-0 flex-1"
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
        <SaveButton busy={busy} disabled={busy || !changed || !!local} what="username" />
      </div>
      <p id="username-help" className={shown ? "mt-1.5 text-xs text-bad" : "mt-1.5 text-xs text-fg-subtle"}>
        {shown ?? (
          <>
            What you sign in with; not case-sensitive.{" "}
            <InfoTip label="Who sees it" text="Teammates see your display name, not your username." testId="username-help-info" />
          </>
        )}
      </p>
    </form>
  );
}

/** One line under the field, the rest behind ⓘ (the phone header budget, docs/MOBILE.md). */
const PICTURE_HELP = (
  <>
    Optional. PNG, JPEG or WebP, cropped to a square.{" "}
    <InfoTip label="Who sees the picture" text={`Shown to teammates, and ${ON_THE_PUBLIC_PAGE}. Change it from My Profile too.`} testId="avatar-help-info" />
  </>
);

/**
 * The picture part of Settings' account card: the picture, who you are (`children`: the name,
 * @username and role), then `afterIdentity` (the card's quiet links on a phone), Change and Remove,
 * and what the picture is for. Who you are sits beside the picture on a phone and in a window 480px
 * tall or less, and under it, the card's whole width, from md in a taller window and wherever a
 * larger text size leaves the card under 11rem inside (the card is a container: the longest role,
 * "Administrator", then keeps its line whole). It adds no box of its own (display: contents): each
 * part is a cell of the card's grid, in the order it is drawn, so reading and the keyboard follow
 * what is seen (account-settings.tsx). The same editor as My Profile's (useAvatarUpload).
 */
export function AccountPicture({ name, seed, src, children, afterIdentity }: { name: string; /** The account's user id: the picture's colour, as in the sidebar (ui/avatar). */ seed?: string; src: string | null; children: React.ReactNode; afterIdentity?: React.ReactNode }) {
  const { choose, remove, busy, ui } = useAvatarUpload();
  return (
    <div className="contents" data-testid="avatar-editor">
      {/* 56px on a phone and in a window 480px tall or less, 80px in the card's column from md. */}
      <Avatar name={name} seed={seed} src={src} size="xl" className="max-md:h-14 max-md:w-14 max-md:text-lg short:h-14 short:w-14 short:text-lg" />
      <div className="min-w-0 @max-[11rem]:col-span-2 md:not-short:col-span-2" data-testid="account-card-identity">
        {children}
      </div>
      {afterIdentity}
      <div className="col-span-2 flex flex-wrap items-start gap-2">
        <Button variant="outline" size="sm" onClick={choose} wrap>
          <Camera className="h-4 w-4" aria-hidden />{" "}
          {src ? (
            <>
              Change<span className="sr-only"> picture</span>
            </>
          ) : (
            <>
              Add<span className="sr-only"> a picture</span>
            </>
          )}
        </Button>
        {src ? (
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => void remove()} wrap>
            <Trash2 className="h-4 w-4" aria-hidden /> Remove<span className="sr-only"> picture</span>
          </Button>
        ) : null}
      </div>
      <p className="col-span-2 text-pretty text-xs text-fg-subtle" data-testid="avatar-help">
        {PICTURE_HELP}
      </p>
      {ui}
    </div>
  );
}

/**
 * Optional profile picture: choose a file, adjust the square crop, upload. Remove any time (the
 * same flow as on My Profile). Teammates see it, and the public team page while the member is in
 * the lineup or a substitute (ON_THE_PUBLIC_PAGE). The first sign-in's Personalise step uses it;
 * Settings has AccountPicture.
 */
export function AvatarEditor({ name, src }: { name: string; src: string | null }) {
  const { choose, remove, busy, ui } = useAvatarUpload();
  return (
    <div className="flex flex-wrap items-center gap-4" data-testid="avatar-editor">
      <Avatar name={name} src={src} size="xl" />
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={choose} wrap>
          <Camera className="h-4 w-4" /> {src ? "Change picture" : "Add a picture"}
        </Button>
        {src ? (
          <Button variant="ghost" disabled={busy} onClick={() => void remove()}>
            <Trash2 className="h-4 w-4" /> Remove
          </Button>
        ) : null}
      </div>
      <p className="w-full text-pretty text-xs text-fg-subtle" data-testid="avatar-help">
        {PICTURE_HELP}
      </p>
      {ui}
    </div>
  );
}

/**
 * Settings' sections, in the account card: Leaderboards' SectionIndex (plain links whose click jumps
 * through the router's history, jumpToAnchor), restyled. On a phone, and in a window 480px tall or
 * less, words in a row as a section's views are (Name, Links, Password; 44px on a touch screen, no
 * dots between them), the section being read underlined (chips until Release 17); from md in a
 * taller window a list down the card, the section being read marked.
 */
export function SettingsIndex({ items }: { items: readonly SectionIndexItem[] }) {
  return (
    <SectionIndex
      label="Settings sections"
      items={items}
      spy
      listClassName="gap-y-2 max-md:gap-x-2 short:gap-x-2 md:not-short:flex-col md:not-short:items-stretch md:not-short:gap-0.5"
      separatorClassName="hidden"
      linkClassName={(on) =>
        cn(
          subTabClass(on, "px-2 text-xs"),
          "md:not-short:flex md:not-short:w-full md:not-short:justify-start md:not-short:px-2 md:not-short:text-sm md:not-short:after:hidden",
          // The section being read: surface-3, a step above the surface-2 of a pointed-at entry, so the two marks differ by more than the weight.
          on ? "md:not-short:bg-surface-3 md:not-short:font-semibold" : "md:not-short:hover:bg-surface-2",
        )
      }
      testId="settings-index"
    />
  );
}
