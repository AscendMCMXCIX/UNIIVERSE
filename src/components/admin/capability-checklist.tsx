"use client";

import { CAPABILITIES } from "@/server/auth/permissions";
import { Switch } from "@/components/ui/switch";

const GROUPS = [...new Set(CAPABILITIES.map((c) => c.group))];

/** Every capability as a plain-English switch, grouped (View · Own profile · Team management · Site settings). */
export function CapabilityChecklist({ value, onChange, idPrefix, disabled }: { value: readonly string[]; onChange: (next: string[]) => void; idPrefix: string; disabled?: boolean }) {
  const set = new Set(value);
  return (
    <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2" data-testid="capability-checklist">
      {GROUPS.map((g) => (
        <fieldset key={g} className="min-w-0">
          <legend className="mb-1 px-2 text-xs font-semibold uppercase tracking-label text-fg-subtle">{g}</legend>
          {CAPABILITIES.filter((c) => c.group === g).map((c) => (
            <Switch
              key={c.key}
              id={`${idPrefix}-${c.key}`}
              label={c.label}
              description={c.description}
              checked={set.has(c.key)}
              disabled={disabled}
              onChange={(on) => {
                const next = new Set(set);
                if (on) next.add(c.key);
                else next.delete(c.key);
                onChange(CAPABILITIES.map((x) => x.key).filter((k) => next.has(k)));
              }}
            />
          ))}
        </fieldset>
      ))}
      <p className="px-2 text-xs text-fg-subtle sm:col-span-2">Accounts, passwords and permissions always stay with Owners and cannot be delegated.</p>
    </div>
  );
}
