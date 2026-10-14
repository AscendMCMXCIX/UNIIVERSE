import Link from "next/link";
import { BrandFrame } from "@/components/auth/brand-frame";
import { WELCOME_EYEBROW, WelcomePasswordStep, WelcomeSetupStep } from "@/components/auth/welcome-steps";
import { getAppDb } from "@/server/bootstrap";
import { loadPickerChampions } from "@/server/champions/picker";
import { requirePreviewAccess } from "../guard";
import { PreviewBadge } from "../preview-badge";

export const dynamic = "force-dynamic";

/**
 * Admin → Previews: what a new player sees at their first sign-in, step by step, with the real
 * components and the current branding. Choices stay in the page (roles, champions, validation all
 * work); nothing is sent: no account, password or profile is touched, and nobody is signed in.
 */
export default async function SetupPreviewPage({ searchParams }: { searchParams: Promise<{ step?: string }> }) {
  await requirePreviewAccess();
  const { step } = await searchParams;
  const steps = [
    { key: "password", label: "1. Choose a password" },
    { key: "profile", label: "2. Roles and champions" },
  ];
  const current = step === "profile" ? "profile" : "password";
  const champions = current === "profile" ? await loadPickerChampions(await getAppDb()) : [];
  const stepper = (
    <nav aria-label="Preview steps" className="mt-4 flex flex-wrap justify-center gap-1.5 border-t border-border pt-3 text-xs" data-testid="preview-steps">
      {steps.map((s) => (
        <Link key={s.key} href={`/preview/setup?step=${s.key}`} aria-current={current === s.key ? "step" : undefined} className={current === s.key ? "rounded-full bg-accent/15 px-2.5 py-1 font-medium text-accent" : "rounded-full px-2.5 py-1 text-fg-muted hover:text-fg"}>
          {s.label}
        </Link>
      ))}
    </nav>
  );
  return (
    <>
      <PreviewBadge />
      {current === "password" ? (
        <BrandFrame eyebrow={WELCOME_EYEBROW} width="max-w-md">
          <WelcomePasswordStep username="NewPlayer" preview />
          {stepper}
        </BrandFrame>
      ) : (
        <BrandFrame eyebrow={WELCOME_EYEBROW} width="max-w-2xl">
          <WelcomeSetupStep username="NewPlayer" riotId="NewPlayer#OCE" champions={champions} initial={{ primaryRole: null, primaryPool: [], secondaryRole: null, secondaryPool: [] }} preview />
          {stepper}
        </BrandFrame>
      )}
    </>
  );
}
