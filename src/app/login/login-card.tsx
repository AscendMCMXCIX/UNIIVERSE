import { LoginForm } from "./login-form";

/** The sign-in card's content: the real sign-in page and Admin → Previews both render this. */
export function LoginCard({ next, preview = false, onPreviewSignIn }: { next: string; preview?: boolean; onPreviewSignIn?: (username: string, password: string) => string | null }) {
  return (
    <>
      <h1 className="mt-1 text-xl font-bold tracking-wordmark">Sign in</h1>
      <p className="mt-2 text-sm text-fg-muted">Sign in with your username and password. There is no sign-up: admins create every account.</p>
      <LoginForm next={next} preview={preview} onPreviewSignIn={onPreviewSignIn} />
    </>
  );
}
