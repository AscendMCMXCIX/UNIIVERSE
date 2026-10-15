import type { PickerChampion } from "@/components/champion-picker";
import { SetPasswordForm } from "./set-password-form";
import { SetupForm, type SetupValues } from "./setup-form";

/*
  The two steps of a new player's first sign-in, as the card content: the real /welcome page and
  Admin → Previews both render these, so the preview never drifts from what players see.
*/

export const WELCOME_EYEBROW = "WELCOME TO UNIIVERSE";

/** Step 1: replace the temporary password from the admin. */
export function WelcomePasswordStep({ username, preview = false, onPreviewSaved }: { username: string; preview?: boolean; onPreviewSaved?: (password: string) => string | null }) {
  return (
    <>
      <h1 className="mt-1 text-xl font-bold tracking-[0.2em]">Choose your password</h1>
      <p className="mt-2 text-sm text-fg-muted">
        You signed in as <span className="font-medium text-fg">{username}</span> with a temporary password. Choose your own now; the temporary one stops working as soon as you save.
      </p>
      <SetPasswordForm username={username} preview={preview} onPreviewSaved={onPreviewSaved} />
    </>
  );
}

/** Step 2: roles and champion pools. */
export function WelcomeSetupStep({ username, riotId, champions, initial, preview = false, onPreviewFinish, onPreviewChange }: { username: string; riotId: string | null; champions: PickerChampion[]; initial: SetupValues; preview?: boolean; onPreviewFinish?: (values: SetupValues) => void; onPreviewChange?: (values: SetupValues) => void }) {
  return (
    <>
      <h1 className="mt-1 text-xl font-bold tracking-[0.2em]">Set up your player profile</h1>
      <p className="mt-2 text-sm text-fg-muted">Choose the role you play and the champions you are ready to draft. This is required once, takes about a minute, and is saved as you go.</p>
      <SetupForm username={username} riotId={riotId} champions={champions} initial={initial} preview={preview} onPreviewFinish={onPreviewFinish} onPreviewChange={onPreviewChange} />
    </>
  );
}
