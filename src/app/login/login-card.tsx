import { LoginForm } from "./login-form";

/** The sign-in card's content: the real sign-in page and Admin → Previews both render this. */
export function LoginCard({ next, preview = false, onPreviewSignIn, add = false, current }: { next: string; preview?: boolean; onPreviewSignIn?: (username: string, password: string) => string | null; /** Adding another account while `current` stays signed in. */ add?: boolean; current?: string }) {
  return (
    <>
      <h1 className="mt-1 text-xl font-bold tracking-[0.2em]">{add ? "Add an account" : "Sign in"}</h1>
      <p className="mt-2 text-sm text-fg-muted">
        {add ? (
          <>
            Sign in to another account with its own username and password. <span className="font-medium text-fg">{current}</span> stays signed in on this browser, and you switch between them from your account menu.
          </>
        ) : (
          "Sign in with your username and password. There is no sign-up: admins create every account."
        )}
      </p>
      <LoginForm next={next} preview={preview} onPreviewSignIn={onPreviewSignIn} add={add} />
    </>
  );
}
