"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { RESOURCE_ICONS, RESOURCE_ICON_LABELS, RESOURCE_LIMITS, RESOURCE_SECTIONS, checkResourceUrl, orderedBySection, resourceHost, sectionLabel, type Resource, type ResourceIcon as IconKey, type ResourceSection } from "@/domain/resources";
import { addResourceAction, moveResourceAction, removeResourceAction, restoreResourceDefaultsAction, setResourceHiddenAction, updateResourceAction, type ManagedResources } from "@/server/actions/resources";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { ResourceIcon } from "./resource-icon";

/*
  Admin Mode → Platform Settings → Resources: the library members see under Resources, section by
  section, each entry with its controls (move up or down within its section, hide or show, edit,
  remove). Removed defaults are listed apart and come back only when restored here. Every change is
  saved at once by its server action, which checks the administrator permission again.
*/

interface Draft {
  title: string;
  url: string;
  description: string;
  section: ResourceSection;
  icon: IconKey;
}

const draftOf = (r: Resource | null): Draft => (r ? { title: r.title, url: r.url, description: r.description, section: r.section, icon: r.icon } : { title: "", url: "", description: "", section: "league", icon: "favicon" });

export function ResourcesManager({ initial }: { initial: ManagedResources }) {
  const [data, setData] = React.useState(initial);
  const [editing, setEditing] = React.useState<string | "new" | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [removing, setRemoving] = React.useState<Resource | null>(null);
  const entries = orderedBySection(data.entries);
  const hidden = data.entries.filter((e) => e.hidden).length;

  const run = async (work: () => Promise<{ ok: true; data: ManagedResources } | { ok: false; error: string }>, done?: string): Promise<boolean> => {
    setBusy(true);
    const r = await work();
    setBusy(false);
    if (!r.ok) {
      toast.error(r.error);
      return false;
    }
    setData(r.data);
    if (done) toast.success(done, { duration: 2000 });
    return true;
  };

  return (
    <div className="space-y-6" data-testid="resources-manager">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-fg-muted" data-testid="resources-manager-count">
          {data.entries.length} resource{data.entries.length === 1 ? "" : "s"}
          {hidden ? ` · ${hidden} hidden from members` : ""}
        </p>
        <Button variant="primary" size="sm" onClick={() => setEditing("new")} disabled={editing === "new"} data-testid="resource-add">
          <Plus className="h-4 w-4" aria-hidden /> Add resource
        </Button>
      </div>

      {editing === "new" ? (
        <ResourceForm
          initial={draftOf(null)}
          busy={busy}
          submitLabel="Add resource"
          onCancel={() => setEditing(null)}
          onSubmit={async (d) => {
            if (await run(() => addResourceAction(d), "Resource added")) setEditing(null);
          }}
        />
      ) : null}

      <div className="space-y-5">
        {RESOURCE_SECTIONS.map((s) => {
          const list = entries.filter((e) => e.section === s.key);
          if (!list.length) return null;
          return (
            <section key={s.key} aria-labelledby={`manage-${s.key}`} className="space-y-2" data-testid="resources-manager-section" data-section={s.key}>
              <h2 id={`manage-${s.key}`} className="text-sm font-semibold text-fg">
                {s.label}
              </h2>
              <ul className="space-y-2">
                {list.map((e, i) =>
                  editing === e.id ? (
                    <li key={e.id}>
                      <ResourceForm
                        initial={draftOf(e)}
                        busy={busy}
                        submitLabel="Save"
                        onCancel={() => setEditing(null)}
                        onSubmit={async (d) => {
                          if (await run(() => updateResourceAction(e.id, d), "Saved")) setEditing(null);
                        }}
                      />
                    </li>
                  ) : (
                    <li key={e.id} className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-border bg-surface p-2.5", e.hidden && "border-dashed bg-surface/50")} data-testid="managed-resource" data-id={e.id} data-hidden={e.hidden ? "true" : "false"}>
                      <div className={cn("flex min-w-0 flex-[1_1_16rem] items-start gap-2.5", e.hidden && "opacity-60")}>
                        <ResourceIcon icon={e.icon} url={e.url} />
                        <div className="min-w-0">
                          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                            <a href={e.url} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate text-sm font-medium text-fg underline-offset-2 hover:underline">
                              {e.title}
                            </a>
                            {e.hidden ? <Badge tone="neutral">Hidden</Badge> : null}
                            {e.id.startsWith("d-") ? <span className="text-[11px] text-fg-subtle">Default</span> : null}
                          </div>
                          <div className="truncate text-xs text-fg-subtle">{resourceHost(e.url)}</div>
                          {e.description ? <div className="text-xs text-fg-muted">{e.description}</div> : null}
                        </div>
                      </div>
                      <div className="ml-auto flex shrink-0 items-center gap-1">
                        <IconButton label={`Move ${e.title} up`} onClick={() => void run(() => moveResourceAction(e.id, "up"))} disabled={busy || i === 0} testId="resource-up">
                          <ArrowUp className="h-4 w-4" aria-hidden />
                        </IconButton>
                        <IconButton label={`Move ${e.title} down`} onClick={() => void run(() => moveResourceAction(e.id, "down"))} disabled={busy || i === list.length - 1} testId="resource-down">
                          <ArrowDown className="h-4 w-4" aria-hidden />
                        </IconButton>
                        <IconButton label={e.hidden ? `Show ${e.title} to members` : `Hide ${e.title} from members`} pressed={e.hidden} onClick={() => void run(() => setResourceHiddenAction(e.id, !e.hidden), e.hidden ? "Shown to members" : "Hidden from members")} disabled={busy} testId="resource-hide">
                          {e.hidden ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
                        </IconButton>
                        <IconButton label={`Edit ${e.title}`} onClick={() => setEditing(e.id)} disabled={busy} testId="resource-edit">
                          <Pencil className="h-4 w-4" aria-hidden />
                        </IconButton>
                        <IconButton label={`Remove ${e.title}`} onClick={() => setRemoving(e)} disabled={busy} testId="resource-remove" danger>
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </IconButton>
                      </div>
                    </li>
                  ),
                )}
              </ul>
            </section>
          );
        })}
        {data.entries.length === 0 ? <p className="text-sm text-fg-muted">The library is empty: members see no resources. Add one, or restore the defaults below.</p> : null}
      </div>

      {data.removed.length ? (
        <section aria-labelledby="removed-defaults" className="space-y-2 rounded-panel border border-border bg-surface/60 p-3" data-testid="resources-removed">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="removed-defaults" className="text-sm font-semibold text-fg">
              Removed defaults <span className="font-normal text-fg-muted">· {data.removed.length}</span>
            </h2>
            <Button size="sm" variant="ghost" onClick={() => void run(() => restoreResourceDefaultsAction(null), "Defaults restored")} disabled={busy} data-testid="resources-restore-all">
              <RotateCcw className="h-4 w-4" aria-hidden /> Restore all
            </Button>
          </div>
          <p className="text-xs text-fg-muted">Defaults you removed stay removed through every update. Restored, one comes back as first published, at the end of its section.</p>
          <ul className="space-y-1">
            {data.removed.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-2 text-sm" data-testid="removed-resource" data-id={d.id}>
                <span className="min-w-0 truncate text-fg">{d.title}</span>
                <span className="text-xs text-fg-subtle">
                  {sectionLabel(d.section)} · {resourceHost(d.url)}
                </span>
                <Button size="sm" variant="ghost" className="ml-auto" onClick={() => void run(() => restoreResourceDefaultsAction([d.id]), `${d.title} restored`)} disabled={busy} data-testid="resource-restore">
                  Restore
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <ConfirmDialog
        open={!!removing}
        onCancel={() => setRemoving(null)}
        busy={busy}
        title={removing ? `Remove “${removing.title}”?` : "Remove?"}
        description={removing?.id.startsWith("d-") ? "Members will no longer see it. It is one of the defaults, so it can be restored later under Removed defaults." : "Members will no longer see it. To bring it back, add it again."}
        confirmLabel="Remove"
        onConfirm={async () => {
          const r = removing;
          if (!r) return;
          if (await run(() => removeResourceAction(r.id), "Removed")) setRemoving(null);
        }}
      />
    </div>
  );
}

function IconButton({ label, onClick, disabled, children, testId, pressed, danger }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode; testId: string; pressed?: boolean; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      className={cn("grid h-8 w-8 place-items-center rounded-md text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40 max-md:h-11 max-md:w-11", danger && "hover:text-bad")}
      data-testid={testId}
    >
      {children}
    </button>
  );
}

/** Adding or editing one resource. The address is checked as it is typed, and again on the server. */
function ResourceForm({ initial, busy, submitLabel, onSubmit, onCancel }: { initial: Draft; busy: boolean; submitLabel: string; onSubmit: (d: Draft) => Promise<void>; onCancel: () => void }) {
  const [d, setD] = React.useState(initial);
  const id = React.useId();
  const url = d.url.trim() ? checkResourceUrl(d.url) : null;
  const titleLeft = RESOURCE_LIMITS.title - d.title.trim().length;
  const descriptionLeft = RESOURCE_LIMITS.description - d.description.trim().length;
  const valid = !!d.title.trim() && titleLeft >= 0 && descriptionLeft >= 0 && url?.ok === true;
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setD((x) => ({ ...x, [key]: value }));
  return (
    // noValidate: the checks above decide (an address typed without https:// is fine and gets it);
    // the browser's own url check would silently refuse to submit "u.gg".
    <form
      noValidate
      className="space-y-3 rounded-panel border border-accent/40 bg-surface p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) void onSubmit(d);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
      data-testid="resource-form"
    >
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`${id}-title`}>Title</Label>
          <Input id={`${id}-title`} value={d.title} onChange={(e) => set("title", e.target.value)} maxLength={RESOURCE_LIMITS.title + 20} autoComplete="off" required data-testid="resource-title" />
          {titleLeft < 0 ? <p className="text-xs text-bad">{-titleLeft} characters too long.</p> : null}
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${id}-url`}>Address</Label>
          <Input id={`${id}-url`} type="url" inputMode="url" value={d.url} onChange={(e) => set("url", e.target.value)} placeholder="https://" autoComplete="off" spellCheck={false} required aria-invalid={url?.ok === false || undefined} aria-describedby={`${id}-url-help`} data-testid="resource-url" />
          <p id={`${id}-url-help`} className={cn("text-xs", url?.ok === false ? "text-bad" : "text-fg-subtle")} role={url?.ok === false ? "alert" : undefined}>
            {url?.ok === false ? url.error : "An https:// address. It opens in a new tab."}
          </p>
        </div>
        <div className="space-y-1 md:col-span-2">
          <Label htmlFor={`${id}-description`}>Short description</Label>
          <Input id={`${id}-description`} value={d.description} onChange={(e) => set("description", e.target.value)} maxLength={RESOURCE_LIMITS.description + 40} autoComplete="off" data-testid="resource-description" />
          <p className={cn("text-xs", descriptionLeft < 0 ? "text-bad" : "text-fg-subtle")}>{descriptionLeft < 0 ? `${-descriptionLeft} characters too long.` : `${descriptionLeft} characters left. Plain text.`}</p>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${id}-section`}>Section</Label>
          <Select id={`${id}-section`} value={d.section} onChange={(e) => set("section", e.target.value as ResourceSection)} data-testid="resource-section">
            {RESOURCE_SECTIONS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${id}-icon`}>Icon</Label>
          <div className="flex items-center gap-2">
            {/* The preview loads a favicon only for a valid address (keyed by it, so a new address tries again). */}
            <ResourceIcon key={url?.ok ? url.url : "none"} icon={url?.ok || d.icon !== "favicon" ? d.icon : "globe"} url={url?.ok ? url.url : ""} />
            <Select id={`${id}-icon`} value={d.icon} onChange={(e) => set("icon", e.target.value as IconKey)} className="min-w-0 flex-1" data-testid="resource-icon">
              {RESOURCE_ICONS.map((k) => (
                <option key={k} value={k}>
                  {RESOURCE_ICON_LABELS[k]}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" size="sm" disabled={busy || !valid} data-testid="resource-save">
          {busy ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
