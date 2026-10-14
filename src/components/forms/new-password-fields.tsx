"use client";

import { Check, Circle } from "lucide-react";
import { Input, Label } from "@/components/ui/input";
import { passwordChecks } from "@/domain/password-policy";
import { cn } from "@/lib/cn";

/**
 * New Password + Confirm Password, with the rules shown as a live checklist under the first field
 * and a mismatch message under the second. Shared by first sign-in, Account Settings and recovery.
 */
export function NewPasswordFields({ next, confirm, onNext, onConfirm, idPrefix = "new", autoFocus = false, nextLabel = "New password" }: { next: string; confirm: string; onNext: (v: string) => void; onConfirm: (v: string) => void; idPrefix?: string; autoFocus?: boolean; nextLabel?: string }) {
  const checks = passwordChecks(next);
  const mismatch = confirm.length > 0 && confirm !== next;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <Label htmlFor={`${idPrefix}-password`}>{nextLabel}</Label>
        <Input id={`${idPrefix}-password`} type="password" autoComplete="new-password" value={next} onChange={(e) => onNext(e.target.value)} autoFocus={autoFocus} aria-describedby={`${idPrefix}-password-rules`} maxLength={256} />
        <ul id={`${idPrefix}-password-rules`} className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs" aria-label="Password rules">
          {checks.map((c) => (
            <li key={c.label} className={cn("flex items-center gap-1 transition-colors", c.ok ? "text-good" : "text-fg-subtle")}>
              {c.ok ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Circle className="h-3 w-3" aria-hidden />}
              <span>{c.label}</span>
              <span className="sr-only">{c.ok ? "(met)" : "(not met yet)"}</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-confirm`}>Confirm password</Label>
        <Input id={`${idPrefix}-confirm`} type="password" autoComplete="new-password" value={confirm} onChange={(e) => onConfirm(e.target.value)} aria-invalid={mismatch} aria-describedby={mismatch ? `${idPrefix}-confirm-error` : undefined} maxLength={256} />
        {mismatch ? (
          <p id={`${idPrefix}-confirm-error`} className="mt-1.5 text-xs text-bad">
            The passwords do not match.
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** True when the pair is ready to submit (rules met and both entries equal). */
export function newPasswordReady(next: string, confirm: string): boolean {
  return passwordChecks(next).every((c) => c.ok) && next === confirm;
}
