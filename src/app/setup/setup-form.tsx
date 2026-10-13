"use client";

import { setupOwnerAction } from "@/server/actions/auth";
import { SignupForm } from "@/components/auth/signup-form";

export function SetupForm({ needsKey, defaultPlatform }: { needsKey: boolean; defaultPlatform: string }) {
  return <SignupForm action={setupOwnerAction} kind="owner" needsKey={needsKey} defaultPlatform={defaultPlatform} />;
}
