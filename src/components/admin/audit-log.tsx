"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { AuditEntry } from "@/server/audit/log";
import { loadOlderAuditAction } from "@/server/actions/audit";
import { AUDIT_CATEGORIES } from "@/domain/audit";
import { auditDetailsSentence, auditSentence } from "@/domain/audit-sentence";
import { FilterBar, FilterField } from "@/components/ui/filter-bar";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { RelativeTime } from "@/components/ui/relative-time";

export interface AuditFilterValues {
  category: string | null;
  person: string | null;
  from: string | null;
  to: string | null;
}

/** One entry as a sentence, its time in words beside it and the exact time on hover. */
export function AuditRow({ entry }: { entry: AuditEntry }) {
  const at = new Date(entry.at);
  const details = auditDetailsSentence(entry.details);
  return (
    <li className="flex min-w-0 gap-3 py-2 text-sm" data-testid="admin-activity-row">
      <RelativeTime date={at} className="w-20 shrink-0 pt-px text-xs tabular-nums text-fg-subtle" />
      <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
        <span className="block text-fg">{auditSentence(entry)}</span>
        {details ? <span className="block text-xs text-fg-subtle">{details}</span> : null}
      </span>
    </li>
  );
}

/**
 * Audit Logs (the overhaul's S9b): filters by person, category and date in the address (replaced),
 * entries as sentences, and Load older by keyset, 50 at a time.
 */
export function AuditLog({ entries: first, more: firstMore, filters, people }: { entries: AuditEntry[]; more: boolean; filters: AuditFilterValues; people: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const [older, setOlder] = React.useState<AuditEntry[]>([]);
  const [more, setMore] = React.useState(firstMore);
  const [busy, setBusy] = React.useState(false);
  const [pending, start] = React.useTransition();
  const entries = [...first, ...older];
  const set = (key: keyof AuditFilterValues, value: string | null) => {
    const q = new URLSearchParams();
    const next = { ...filters, [key]: value || null };
    for (const [k, v] of Object.entries(next)) if (v) q.set(k, v);
    setOlder([]);
    start(() => router.replace(`/admin/audit${q.size ? `?${q}` : ""}`, { scroll: false }));
  };
  const active = Object.values(filters).filter(Boolean).length;
  const loadOlder = async () => {
    const last = entries.at(-1);
    if (!last) return;
    setBusy(true);
    const r = await loadOlderAuditAction({ ...filters }, { at: new Date(last.at).toISOString(), id: last.id });
    setBusy(false);
    if (!r.ok) return toast.error("Could not load older entries", { description: r.error });
    setOlder((cur) => [...cur, ...r.data.entries]);
    setMore(r.data.more);
  };
  const summary = [filters.category ? AUDIT_CATEGORIES[filters.category as keyof typeof AUDIT_CATEGORIES]?.label : "Everything", filters.person ? people.find((p) => p.id === filters.person)?.name : null, filters.from || filters.to ? "chosen dates" : null].filter(Boolean).join(" · ");
  return (
    <div className="space-y-3">
      <FilterBar summary={summary} activeCount={active} resetHref="/admin/audit" pending={pending} testId="audit-filters">
        <FilterField label="Category" htmlFor="audit-category">
          <Select id="audit-category" value={filters.category ?? ""} onChange={(e) => set("category", e.target.value)} data-testid="audit-category">
            <option value="">All categories</option>
            {Object.entries(AUDIT_CATEGORIES).map(([key, c]) => (
              <option key={key} value={key}>
                {c.label}
              </option>
            ))}
          </Select>
        </FilterField>
        <FilterField label="Person" htmlFor="audit-person">
          <Select id="audit-person" value={filters.person ?? ""} onChange={(e) => set("person", e.target.value)} data-testid="audit-person">
            <option value="">Everyone</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </FilterField>
        <FilterField label="From" htmlFor="audit-from">
          <Input id="audit-from" type="date" value={filters.from ?? ""} onChange={(e) => set("from", e.target.value)} data-testid="audit-from" />
        </FilterField>
        <FilterField label="To" htmlFor="audit-to">
          <Input id="audit-to" type="date" value={filters.to ?? ""} onChange={(e) => set("to", e.target.value)} data-testid="audit-to" />
        </FilterField>
      </FilterBar>
      <section className="rounded-card border border-border bg-surface px-3 sm:px-4" data-testid="admin-activity">
        {entries.length ? (
          <ul className="divide-y divide-border">
            {entries.map((e) => (
              <AuditRow key={e.id} entry={e} />
            ))}
          </ul>
        ) : (
          <p className="py-4 text-sm text-fg-muted">{active ? "Nothing recorded with these filters." : "Nothing recorded yet."}</p>
        )}
      </section>
      {more ? (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => void loadOlder()} disabled={busy} data-testid="audit-load-older">
            {busy ? "Loading…" : "Load older"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
