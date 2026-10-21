"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { loginAction } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

/**
 * The sign-in form. `preview` (Admin → Previews) keeps everything the same on screen but sends
 * nothing: submitting only says so.
 *
 * Sign in follows the password straight away (the notes come after it), so on a phone the fields
 * and the button stay in view together while the keyboard is up. Return in the username moves on
 * to the password; an error is brought into view, and the field to fill again takes the focus.
 */
export function LoginForm({ next, preview = false, onPreviewSignIn }: { next: string; preview?: boolean; onPreviewSignIn?: (username: string, password: string) => string | null }) {
  const [state, action, pending] = useActionState(loginAction, undefined);
  const [previewNote, setPreviewNote] = React.useState(false);
  const [previewError, setPreviewError] = React.useState<string | null>(null);
  const error = state?.error ?? previewError;
  const usernameRef = React.useRef<HTMLInputElement>(null);
  const passwordRef = React.useRef<HTMLInputElement>(null);
  const errorRef = React.useRef<HTMLParagraphElement>(null);
  // Each answer is a new object, so the same error twice is still brought into view.
  React.useEffect(() => {
    if (!error) return;
    (usernameRef.current?.value ? passwordRef.current : usernameRef.current)?.focus();
    errorRef.current?.scrollIntoView({ block: "nearest" });
  }, [error, state]);
  return (
    <form
      action={preview ? undefined : action}
      onSubmit={
        preview
          ? (e) => {
              e.preventDefault();
              // Admin → Previews: nothing is sent. The onboarding preview checks the mock account instead.
              if (!onPreviewSignIn) return setPreviewNote(true);
              const form = new FormData(e.currentTarget);
              setPreviewError(onPreviewSignIn(String(form.get("username") ?? ""), String(form.get("password") ?? "")));
            }
          : undefined
      }
      className="mt-5 space-y-3"
      data-testid="login-form"
    >
      <input type="hidden" name="next" value={next} />
      <div>
        <Label htmlFor="username">Username</Label>
        <Input
          ref={usernameRef}
          id="username"
          name="username"
          autoComplete={preview ? "off" : "username"}
          autoFocus={!preview}
          required
          defaultValue={state?.values?.username ?? ""}
          spellCheck={false}
          autoCapitalize="none"
          autoCorrect="off"
          enterKeyHint="next"
          onKeyDown={(e) => {
            // Return moves on to the password while it is empty (a phone keyboard's "next").
            if (e.key !== "Enter" || e.nativeEvent.isComposing || passwordRef.current?.value) return;
            e.preventDefault();
            passwordRef.current?.focus();
          }}
        />
      </div>
      <div>
        <Label htmlFor="password">Password</Label>
        <Input ref={passwordRef} id="password" name="password" type="password" autoComplete={preview ? "off" : "current-password"} required enterKeyHint="go" aria-describedby={error ? "login-error" : undefined} />
      </div>
      {error ? (
        <p ref={errorRef} id="login-error" className="scroll-my-4 text-sm text-bad" role="alert" data-testid="login-error">
          {error}
        </p>
      ) : null}
      {previewNote ? (
        <p className="rounded-md border border-accent/40 bg-accent/10 px-2.5 py-1.5 text-sm text-fg" role="status" data-testid="preview-note">
          Preview: nothing was sent. On the real page this signs the person in.
        </p>
      ) : null}
      <Button type="submit" variant="primary" className="w-full" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
      <p className="text-xs text-fg-subtle">New player? Use the temporary password from your admin; you choose your own right after.</p>
      <p className="text-xs text-fg-subtle">
        You stay signed in for 24 hours, then sign in again. Forgot your password? Ask an admin to reset it: you get a temporary one. Owners who lost theirs:{" "}
        <Link href={preview ? "#" : "/recover"} className="text-accent underline-offset-2 hover:underline">
          owner recovery
        </Link>{" "}
        with the setup key.
      </p>
    </form>
  );
}
