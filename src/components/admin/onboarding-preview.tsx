"use client";

import * as React from "react";
import { ArrowLeft, Check, RotateCcw } from "lucide-react";
import type { Branding } from "@/domain/branding";
import { ROLE_LABELS } from "@/domain/roles";
import { explainLoginFailure } from "@/domain/login-messages";
import type { PickerChampion } from "@/components/champion-picker";
import { BrandFrameView } from "@/components/auth/brand-frame-view";
import { WELCOME_EYEBROW, WelcomePasswordStep, WelcomeSetupStep } from "@/components/auth/welcome-steps";
import type { SetupValues } from "@/components/auth/setup-form";
import { LoginCard } from "@/app/login/login-card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { ONBOARDING_STEPS, PREVIEW_ACCOUNT, type OnboardingStep } from "./onboarding-steps";

/*
  Admin → Previews → New player setup: the whole first sign-in, end to end, with the real sign-in
  card, password form and setup form and the live branding. A made-up account (shown on screen)
  stands in for the new player; every check runs with the real rules and words, and nothing leaves
  the page: no request is sent, no account, password or profile changes, nobody is signed in.
*/

const EMPTY: SetupValues = { primaryRole: null, primaryPool: [], secondaryRole: null, secondaryPool: [] };

export function OnboardingPreview({ branding, champions, initialStep }: { branding: Branding; champions: PickerChampion[]; initialStep: OnboardingStep }) {
  const [step, setStepState] = React.useState<OnboardingStep>(initialStep);
  const [values, setValues] = React.useState<SetupValues>(EMPTY);
  const [teamMember, setTeamMember] = React.useState(true);
  // Remounts the real forms on restart so every field starts empty again.
  const [run, setRun] = React.useState(0);
  const index = ONBOARDING_STEPS.findIndex((s) => s.key === step);

  const setStep = (next: OnboardingStep) => {
    setStepState(next);
    // Keeps ?step in the address (a link to a step still works) without a server round trip.
    const url = new URL(window.location.href);
    url.searchParams.set("step", next);
    window.history.replaceState(null, "", url);
    window.scrollTo({ top: 0 });
  };
  const restart = () => {
    setValues(EMPTY);
    setRun((n) => n + 1);
    setStep("signin");
  };

  const signIn = (username: string, password: string) => {
    if (username.trim().toLowerCase() !== PREVIEW_ACCOUNT.username.toLowerCase() || password !== PREVIEW_ACCOUNT.temporaryPassword) return explainLoginFailure(username.trim());
    setStep("password");
    return null;
  };
  const savePassword = (password: string) => {
    // The server's own refusal, in its words: the temporary password cannot become the permanent one.
    if (password === PREVIEW_ACCOUNT.temporaryPassword) return "Choose your own password, not the temporary one.";
    setStep("profile");
    return null;
  };
  const finish = (v: SetupValues) => {
    setValues(v);
    setStep("done");
  };

  const narrow = step === "signin" || step === "password";
  return (
    <BrandFrameView branding={branding} eyebrow={step === "signin" ? "PRIVATE" : WELCOME_EYEBROW} width={narrow ? "max-w-md" : "max-w-2xl"} className="pt-14">
      <div key={`${run}-${step}`} data-testid={`onboarding-step-${step}`}>
        {step === "signin" ? <LoginCard next="" preview onPreviewSignIn={signIn} /> : null}
        {step === "password" ? <WelcomePasswordStep username={PREVIEW_ACCOUNT.username} preview onPreviewSaved={savePassword} /> : null}
        {step === "profile" ? <WelcomeSetupStep username={PREVIEW_ACCOUNT.username} riotId={PREVIEW_ACCOUNT.riotId} champions={champions} initial={values} preview onPreviewChange={setValues} onPreviewFinish={finish} /> : null}
        {step === "done" ? <SetupComplete values={values} champions={champions} teamMember={teamMember} /> : null}
      </div>

      <div className="mt-5 space-y-3 border-t border-border pt-3 text-xs" data-testid="onboarding-preview-controls">
        <nav aria-label="Preview steps" className="flex flex-wrap justify-center gap-1" data-testid="preview-steps">
          {ONBOARDING_STEPS.map((s, i) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setStep(s.key)}
              aria-current={step === s.key ? "step" : undefined}
              className={cn("inline-flex min-h-8 items-center gap-1 rounded-full px-2.5 py-1", step === s.key ? "bg-accent/15 font-medium text-accent" : "text-fg-muted hover:text-fg")}
              data-testid={`preview-step-${s.key}`}
            >
              {i < index ? <Check className="h-3 w-3" aria-hidden /> : <span aria-hidden>{i + 1}.</span>} {s.label}
            </button>
          ))}
        </nav>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button type="button" size="sm" variant="ghost" disabled={index === 0} onClick={() => setStep(ONBOARDING_STEPS[Math.max(0, index - 1)]!.key)} data-testid="preview-back">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Back
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={restart} data-testid="preview-restart">
            <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Restart
          </Button>
        </div>
        <div className="rounded-md border border-dashed border-border bg-bg-elevated/60 px-3 py-2 text-fg-muted" data-testid="preview-account">
          <p className="font-medium text-fg">Practice account (preview only)</p>
          <p className="mt-0.5">
            Username <code className="text-fg">{PREVIEW_ACCOUNT.username}</code> · temporary password <code className="text-fg">{PREVIEW_ACCOUNT.temporaryPassword}</code>
          </p>
          <div role="radiogroup" aria-label="Account type" className="mt-2 flex flex-wrap items-center gap-1">
            <span className="mr-1">Account type:</span>
            {[
              { v: true, label: "Team member" },
              { v: false, label: "Personal use" },
            ].map((o) => (
              <button key={o.label} type="button" role="radio" aria-checked={teamMember === o.v} onClick={() => setTeamMember(o.v)} className={cn("min-h-7 rounded-full border px-2.5", teamMember === o.v ? "border-accent/60 bg-accent/10 text-fg" : "border-border hover:text-fg")} data-testid={`preview-kind-${o.v ? "team" : "personal"}`}>
                {o.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-fg-subtle">Nothing here is sent or saved: no account, password or profile changes, and nobody is signed in.</p>
        </div>
      </div>
    </BrandFrameView>
  );
}

/** The last screen: what they set up and where UNIIVERSE opens next (the real start page for their account type). */
function SetupComplete({ values, champions, teamMember }: { values: SetupValues; champions: PickerChampion[]; teamMember: boolean }) {
  const names = new Map(champions.map((c) => [c.id, c.name]));
  const list = (ids: string[]) => (ids.length ? ids.map((id) => names.get(id) ?? id).join(", ") : "none yet");
  return (
    <div data-testid="onboarding-done">
      <h1 className="mt-1 text-xl font-bold tracking-[0.2em]">You&apos;re all set</h1>
      <p className="mt-2 text-sm text-fg-muted">Setup is complete. Their own password now replaces the temporary one, and their Riot account starts syncing in the background.</p>
      <dl className="mt-4 space-y-1.5 rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm" data-testid="onboarding-summary">
        <div className="flex flex-wrap justify-between gap-x-3">
          <dt className="text-fg-subtle">Primary role</dt>
          <dd className="font-medium">{values.primaryRole ? ROLE_LABELS[values.primaryRole] : "not chosen"}</dd>
        </div>
        <div className="flex flex-wrap justify-between gap-x-3">
          <dt className="text-fg-subtle">Champions</dt>
          <dd className="text-right">{list(values.primaryPool)}</dd>
        </div>
        {values.secondaryRole ? (
          <>
            <div className="flex flex-wrap justify-between gap-x-3">
              <dt className="text-fg-subtle">Off Role</dt>
              <dd className="font-medium">{ROLE_LABELS[values.secondaryRole]}</dd>
            </div>
            <div className="flex flex-wrap justify-between gap-x-3">
              <dt className="text-fg-subtle">Off Role champions</dt>
              <dd className="text-right">{list(values.secondaryPool)}</dd>
            </div>
          </>
        ) : null}
      </dl>
      <div className="mt-4 rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-sm" data-testid="onboarding-next">
        <p className="font-medium text-fg">Where they go next: {teamMember ? "Team" : "My Profile"}</p>
        <p className="mt-0.5 text-fg-muted">
          {teamMember
            ? "UNIIVERSE opens on the Team page: the lineup, players and matches, plus their own profile under My Profile."
            : "UNIIVERSE opens on My Profile (Overview): their stats, match history and Solo Queue Blocks, plus Meta & Trends and Settings. Team pages are not part of a personal-use account."}
        </p>
        <p className="mt-1 text-fg-subtle">More roles and champions can be added later under My Profile.</p>
      </div>
    </div>
  );
}
