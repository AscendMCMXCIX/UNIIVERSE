"use client";

import * as React from "react";
import { ChevronRight } from "lucide-react";
import type { Role } from "@/domain/roles";
import type { AccountView } from "@/server/auth/account-admin";
import type { PermissionPreset } from "@/server/repositories/permissions";
import type { RiotAccountRecord } from "@/server/accounts/repository";
import type { SocialKind } from "@/domain/social-links";
import { Avatar } from "@/components/ui/avatar";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Fold } from "@/components/ui/fold";
import { SearchInput } from "@/components/ui/search-input";
import { Select } from "@/components/ui/select";
import { useAddressItem } from "@/components/ui/address-item";
import { cn } from "@/lib/cn";
import { RelativeTime } from "@/components/ui/relative-time";
import { accountStatus } from "./account-actions";
import { ErasureResultHost } from "./erase-person";
import { PersonView } from "./person-view";
import { PagedFooter, rangeText, rangeWords, usePagedRows } from "@/components/ui/paged-list";
import { WorkspaceCard, WorkspaceSection, useWorkspaceMarks, wsTierClass } from "@/components/ui/workspace";

export interface PlayerAdminRow {
  id: string;
  displayName: string;
  riotId: string | null;
  /** Null until the player chooses it in their first-time setup. */
  primaryRole: Role | null;
  secondaryRole: Role | null;
  group: "main" | "other";
  /** Member of the competitive team; false = personal use only. */
  teamMember: boolean;
  archived: boolean;
  lineupRole: Role | null;
  account: AccountView | null;
  riot: {
    state: "synced" | "pending" | "verified" | "syncing" | "stale" | "error" | "none";
    label: string;
  };
  /** Their Riot accounts, for the person view's Riot accounts section. */
  riotAccounts: RiotAccountRecord[];
  /** Only the links they show publicly (moderation: hide or remove); the rest are theirs alone. */
  publicLinks: Array<{ kind: SocialKind; label: string; text: string }>;
}

/** One person of the list: a player profile (with or without an account) or an account without a profile. */
export interface PersonEntry {
  key: string;
  name: string;
  player: PlayerAdminRow | null;
  account: AccountView | null;
}

type StatusFilter = "all" | "attention" | "awaiting-login" | "setup" | "deactivated" | "personal" | "delayed";

/** Riot sync in the words an admin needs: synced, still syncing, delayed, or nothing linked. */
export function riotStatus(state: PlayerAdminRow["riot"]["state"]): {
  label: string;
  tone: BadgeTone;
} {
  if (state === "synced") return { label: "Riot up to date", tone: "good" };
  if (state === "error") return { label: "Riot needs attention", tone: "bad" };
  if (state === "stale") return { label: "Riot delayed", tone: "warn" };
  if (state === "none") return { label: "No Riot account", tone: "neutral" };
  if (state === "syncing") return { label: "Catching up on history", tone: "info" };
  return { label: "Riot updating", tone: "info" };
}

/** The one chip a row shows: the most urgent thing about the person, or nothing when all is well. */
export function urgentState(p: PersonEntry): { label: string; tone: BadgeTone } | null {
  const a = p.account;
  if (a && !a.isActive) return { label: "Deactivated", tone: "bad" };
  if (p.player?.riot.state === "error") return { label: "Riot needs attention", tone: "bad" };
  if (a?.password.state === "expired") return { label: "Password expired", tone: "warn" };
  if (a?.password.state === "none" && !a.keptAutomatically) return { label: "No password yet", tone: "warn" };
  if (a && accountStatus(a) === "awaiting-login") return { label: "Awaiting first login", tone: "info" };
  if (a && accountStatus(a) === "setup") return { label: "Setup incomplete", tone: "warn" };
  if (p.player?.riot.state === "stale") return { label: "Riot delayed", tone: "warn" };
  if (p.player?.archived) return { label: "Archived", tone: "neutral" };
  if (p.player && !a) return { label: "No account", tone: "neutral" };
  return null;
}

const matches = (p: PersonEntry, f: StatusFilter): boolean => {
  switch (f) {
    case "all":
      return true;
    case "attention":
      return urgentState(p) !== null && urgentState(p)!.tone !== "neutral";
    case "awaiting-login":
    case "setup":
    case "deactivated":
      return !!p.account && accountStatus(p.account) === f;
    case "personal":
      return !!p.player && !p.player.teamMember;
    case "delayed":
      return p.player?.riot.state === "stale" || p.player?.riot.state === "error";
  }
};

const FILTERS: Array<{ id: StatusFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "attention", label: "Needs attention" },
  { id: "awaiting-login", label: "Awaiting first login" },
  { id: "setup", label: "Setup incomplete" },
  { id: "deactivated", label: "Deactivated" },
  { id: "personal", label: "Personal use" },
  { id: "delayed", label: "Riot sync delayed" },
];
const isFilter = (v: string | null): v is StatusFilter => FILTERS.some((f) => f.id === v);

const fold = (s: string) => s.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();

/** Filters live in the address, replaced (never a new history entry), so a reload or a shared link keeps them. */
function replaceQuery(changes: Record<string, string | null>) {
  const url = new URL(window.location.href);
  for (const [k, v] of Object.entries(changes)) {
    if (v) url.searchParams.set(k, v);
    else url.searchParams.delete(k);
  }
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

function PersonRow({ p, onOpen, testId, you = false, className }: { p: PersonEntry; onOpen: (key: string) => void; testId: string; you?: boolean; className?: string }) {
  return (
    <li className={className}>
      <PersonButton p={p} onOpen={onOpen} testId={testId} you={you} />
    </li>
  );
}

/** A person's row: the whole row is the button that opens their view. */
function PersonButton({ p, onOpen, testId, you = false }: { p: PersonEntry; onOpen: (key: string) => void; testId: string; you?: boolean }) {
  const state = urgentState(p);
  const a = p.account;
  return (
      <button
        type="button"
        onClick={() => onOpen(p.key)}
        className={cn("flex min-h-13 w-full min-w-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-panel px-2 py-1 text-left transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 max-sm:min-h-16", p.player?.archived && "opacity-70")}
        data-testid={testId}
        data-person={p.key}
      >
        <Avatar name={p.name} src={a?.avatarUrl ?? null} size="sm" />
        <span className="min-w-0 flex-1 basis-24">
          <span className="block truncate font-medium text-fg">{p.name}</span>
          {a ? <span className="block truncate text-xs text-fg-subtle">@{a.username}{you ? " (you)" : ""}</span> : null}
        </span>
        {state ? (
          <Badge tone={state.tone} className="min-w-0 max-w-full shrink [overflow-wrap:anywhere]">
            {state.label}
          </Badge>
        ) : null}
        {a?.role === "owner" ? (
          <Badge tone="neutral" className="shrink-0">
            Owner
          </Badge>
        ) : a?.isAdmin ? (
          <Badge tone="neutral" className="shrink-0 max-sm:hidden">
            Administrator
          </Badge>
        ) : null}
        {a ? <span className="hidden w-24 shrink-0 text-right text-xs text-fg-subtle md:block">{a.lastLoginAt ? <RelativeTime date={a.lastLoginAt} /> : "Never signed in"}</span> : <span className="hidden w-24 shrink-0 md:block" />}
        <ChevronRight className="h-4 w-4 shrink-0 text-fg-subtle" aria-hidden />
      </button>
  );
}

/** A group's lines of the workspace's list: its rows; an empty group shown (`emptyKey`) its "Nobody yet." line. */
function listItems(rows: readonly PersonEntry[], group: ListItem["group"], testId: (p: PersonEntry) => string, currentUserId: string | null, emptyKey: string | null): ListItem[] {
  if (!rows.length) return emptyKey ? [{ key: emptyKey, p: null, group, testId: "", you: false }] : [];
  return rows.map((p) => ({ key: p.key, p, group, testId: testId(p), you: !!p.account && !!currentUserId && p.account.userId === currentUserId }));
}

/** A group's heading (its title, the count quiet, a small note), as the flow's groups draw it. */
function GroupHead({ title, count, note }: { title: React.ReactNode; count: number; note?: string }) {
  return (
    <>
      <h3 className="px-2 text-sm font-semibold text-fg">
        {title} <span className="font-normal text-fg-subtle">· {count}</span>
      </h3>
      {note ? <p className="px-2 text-xs text-fg-subtle">{note}</p> : null}
    </>
  );
}

/** One line of the paged list (the one-screen workspace): a person, or an empty group's "Nobody yet." line; each knows its group. */
interface ListItem {
  key: string;
  p: PersonEntry | null;
  group: { title: string; count: number; note?: string; testId: string };
  testId: string;
  you: boolean;
}

/** A page's lines in their groups, in order: each group whose lines the page holds, its heading drawn again on every page it is on. */
function inGroups(lines: readonly ListItem[]): Array<{ group: ListItem["group"]; lines: ListItem[] }> {
  const out: Array<{ group: ListItem["group"]; lines: ListItem[] }> = [];
  for (const line of lines) {
    const last = out[out.length - 1];
    if (last && last.group.testId === line.group.testId) last.lines.push(line);
    else out.push({ group: line.group, lines: [line] });
  }
  return out;
}

/** The first paint's rows in the workspace before the list measures (wsTierClass): fewer than fit the floor's room under the toolbar. */
const PEOPLE_TIERS = { gate: 5, mid: 8, tall: 11 };
const ACCOUNT_WORDS = { one: "account", many: "accounts" };

function Group({ title, count, note, testId, className, paged = false, children }: { title: string; count: number; note?: string; testId: string; className?: string; /** A group of the workspace's paged list: its element marks the group (data-ws-group) for the cumulative measure. */ paged?: boolean; children: React.ReactNode }) {
  return (
    <section className={cn("space-y-1", className)} data-testid={testId} {...(paged ? { "data-ws-group": testId } : {})}>
      <GroupHead title={title} count={count} note={note} />
      {children}
    </section>
  );
}

/**
 * Users & Permissions → Accounts (the overhaul's S9a): everyone in one quiet list of 52px rows
 * (64px on phones), grouped, each with the one most urgent state and no action buttons. A row
 * opens the person view, kept in the address (?person=): every action on an account lives there.
 * The Production check's account is kept automatically: Deactivate and Delete only
 * (auth/account-admin.ts guardVerificationAccount refuses the rest).
 *
 * On a desktop window (the one-screen workspace, docs/RESPONSIVE.md, "One-screen desktop pages":
 * Accounts) the groups are one list paged to the room under the search row (usePagedRows, cumulative:
 * the pages cut once over the whole list, by the lines' own heights and the headings each page draws;
 * a page draws its rows in their groups, each group's heading again on every page it is on), the
 * inline Pager in its foot; Profiles without an account are a group there like the others (no fold:
 * the list pages instead of growing). The range counts accounts and profiles, not an empty group's
 * line. Elsewhere the groups are drawn as always.
 */
export function PeoplePanel({
  players,
  adminAccounts = [],
  presets = [],
  currentUserId,
  viewerIsOwner = false,
  canManageAccounts = true,
  canManageRoster = true,
  riotConfigured = false,
  initial = {},
  addAccount = null,
}: {
  players: PlayerAdminRow[];
  adminAccounts?: AccountView[];
  presets?: PermissionPreset[];
  currentUserId: string | null;
  viewerIsOwner?: boolean;
  canManageAccounts?: boolean;
  canManageRoster?: boolean;
  riotConfigured?: boolean;
  /** The address the server rendered: the open person and the filters. */
  initial?: {
    person?: string | null;
    status?: string | null;
    q?: string | null;
  };
  /** The Add account button (its sheet), at the end of the search row. */
  addAccount?: React.ReactNode;
}) {
  const [filter, setFilterState] = React.useState<StatusFilter>(isFilter(initial.status ?? null) ? (initial.status as StatusFilter) : "all");
  const [query, setQueryState] = React.useState(initial.q ?? "");
  const setFilter = (f: StatusFilter) => {
    setFilterState(f);
    replaceQuery({ status: f === "all" ? null : f });
  };
  const setQuery = (q: string) => {
    setQueryState(q);
    replaceQuery({ q: q.trim() || null });
  };

  const everyone: PersonEntry[] = React.useMemo(
    () => [
      ...players.map((p) => ({
        key: p.account?.userId ?? p.id,
        name: p.displayName,
        player: p,
        account: p.account,
      })),
      ...adminAccounts.map((a) => ({
        key: a.userId,
        name: a.displayName || a.username,
        player: null,
        account: a,
      })),
    ],
    [players, adminAccounts],
  );
  const byKey = React.useMemo(() => new Map(everyone.map((p) => [p.key, p])), [everyone]);
  const person = useAddressItem("person", {
    initial: initial.person ?? null,
    valid: (id) => byKey.has(id),
  });

  const q = fold(query.trim());
  const found = (p: PersonEntry) => !q || fold(p.name).includes(q) || fold(p.account?.username ?? "").includes(q) || fold(p.player?.riotId ?? "").includes(q);
  const shown = everyone.filter((p) => found(p) && matches(p, filter));
  const counts = Object.fromEntries(FILTERS.map((f) => [f.id, everyone.filter((p) => found(p) && matches(p, f.id)).length])) as Record<StatusFilter, number>;

  const kept = shown.filter((p) => p.account?.keptAutomatically);
  const withProfile = shown.filter((p) => p.player && p.account);
  const groups = [
    {
      key: "team",
      title: "Team members",
      rows: withProfile.filter((p) => p.player!.teamMember),
    },
    {
      key: "personal",
      title: "Personal use",
      rows: withProfile.filter((p) => !p.player!.teamMember),
    },
    {
      key: "no-profile",
      title: "Accounts without a player profile",
      rows: shown.filter((p) => !p.player && !p.account?.keptAutomatically),
      note: "An account from before automatic profiles, or the Owner's after a recovery, which the Owner completes under My Profile.",
    },
  ];
  const accountless = shown.filter((p) => p.player && !p.account);
  // ‹ › walk the people in the order shown.
  const order = [...groups.flatMap((g) => g.rows), ...accountless, ...kept].map((p) => p.key);
  const open = person.id ? (byKey.get(person.id) ?? null) : null;

  // The workspace's list: every group's rows in the flow's order (an empty group's "Nobody yet." a line of its own).
  const marks = useWorkspaceMarks();
  const visibleGroups = groups.filter((g) => g.rows.length || (g.key !== "no-profile" && filter === "all" && !q));
  const items: ListItem[] = [
    ...visibleGroups.flatMap((g) => listItems(g.rows, { title: g.title, count: g.rows.length, note: g.note, testId: `people-group-${g.key}` }, (p) => (p.player ? "admin-player-row" : "admin-user-row"), currentUserId, `empty-${g.key}`)),
    ...listItems(accountless, { title: "Profiles without an account", count: accountless.length, note: "Nobody can sign in to these profiles (a test, a placeholder or a deleted account). Adding a player with the same Riot ID reuses it.", testId: "people-group-accountless" }, () => "admin-player-row", null, null),
    ...(canManageAccounts ? listItems(kept, { title: "Kept automatically", count: kept.length, note: "The account the Production check signs in with. Deactivate it to turn the signed-in checks off; deleted, the check makes it again.", testId: "people-group-kept" }, () => "admin-kept-row", null, null) : []),
  ];
  // The measure's refs are this component's own (the React compiler's lint refuses refs read from the hook's result).
  const listRef = React.useRef<HTMLDivElement>(null);
  const footRef = React.useRef<HTMLDivElement>(null);
  const cardRef = React.useRef<HTMLElement>(null);
  const toolbarRef = React.useRef<HTMLDivElement>(null);
  const { shown: pageItems, paged, range, pages, live, regionProps, listProps, rowProps, pagerProps, footTestId, onListKeyDown } = usePagedRows({
    rows: items,
    keyOf: (i) => i.key,
    words: ACCOUNT_WORDS,
    testId: "people",
    probeRem: 3.25,
    lastLess: 1,
    mode: "cumulative",
    active: marks.paged && items.length > 0,
    listRef,
    footRef,
    cardRef,
    observe: () => [toolbarRef.current],
    selected: open?.key ?? null,
    search: q,
    data: filter,
  });
  // The range and the words read out count people (an empty group's heading is a line, not an account).
  const people = items.filter((i) => i.p);
  const pageIndexes = range ? items.slice(range.from - 1, range.to).flatMap((i) => (i.p ? [people.indexOf(i)] : [])) : [];
  const peopleRange = pageIndexes.length ? { from: pageIndexes[0]! + 1, to: pageIndexes[pageIndexes.length - 1]! + 1 } : null;
  const pager = { ...pagerProps, range: rangeText(ACCOUNT_WORDS, peopleRange, pages, people.length), widest: `${people.length}–${people.length} of ${people.length}`, live: live && peopleRange ? rangeWords(ACCOUNT_WORDS, peopleRange.from, peopleRange.to, people.length) : "" };
  // The flow's rows, each with its place in the list (the first paint's tiers in the workspace).
  const flatIndex = new Map(items.flatMap((i, n) => (i.p ? [[i.p.key, n] as const] : [])));

  return (
    <ErasureResultHost>
      <WorkspaceSection as="section" marks={marks} testId="players-admin">
        <div ref={toolbarRef} className="flex flex-wrap items-center gap-2">
          <SearchInput value={query} onChange={setQuery} placeholder="Find a person, username or Riot ID" label="Find a person" className="min-w-0 flex-1 basis-32 sm:max-w-xs" testId="people-search" />
          {/* The status filter is a select in the search row, so the list starts high in the first screen. */}
          <Select aria-label="Filter by status" value={filter} onValueChange={(v) => setFilter(v as StatusFilter)} className="w-32 min-w-0 shrink sm:w-56" data-testid="status-filter-select" options={FILTERS.map((f) => ({ value: f.id, label: `${f.label} (${counts[f.id]})` }))} />
          <span className="flex-1 max-sm:hidden" />
          {addAccount}
        </div>
        

        {marks.paged && items.length ? (
          // The workspace: one list, a page of it at a time, its card reaching the frame's foot.
          <WorkspaceCard bare ref={cardRef} {...regionProps} testId="people-list">
            <div ref={listRef} className="space-y-3" {...listProps} onKeyDown={onListKeyDown}>
              {inGroups(paged ? pageItems : items).map(({ group, lines }) => (
                <Group key={group.testId} title={group.title} count={group.count} note={group.note} testId={group.testId} paged>
                  <ul className="divide-y divide-border">
                    {lines.map((i) =>
                      i.p ? (
                        <li key={i.key} {...rowProps(i, { position: false })} {...(paged ? { "aria-posinset": people.indexOf(i) + 1, "aria-setsize": people.length } : {})}>
                          <PersonButton p={i.p} onOpen={person.open} testId={i.testId} you={i.you} />
                        </li>
                      ) : (
                        <li key={i.key} {...rowProps(i, { position: false })}>
                          <p className="px-2 text-sm text-fg-muted">Nobody yet.</p>
                        </li>
                      ),
                    )}
                  </ul>
                </Group>
              ))}
            </div>
            <PagedFooter footRef={footRef} pager={pager} testId={footTestId} />
          </WorkspaceCard>
        ) : (
          <>
        {visibleGroups.map((g) => (
            <Group key={g.key} title={g.title} count={g.rows.length} note={g.note} testId={`people-group-${g.key}`} className={wsTierClass(g.rows.length ? (flatIndex.get(g.rows[0]!.key) ?? 0) : 0, PEOPLE_TIERS)}>
              {g.rows.length ? (
                <ul className="divide-y divide-border">
                  {g.rows.map((p) => (
                    <PersonRow key={p.key} p={p} onOpen={person.open} testId={p.player ? "admin-player-row" : "admin-user-row"} you={!!p.account && p.account.userId === currentUserId} className={wsTierClass(flatIndex.get(p.key) ?? 0, PEOPLE_TIERS)} />
                  ))}
                </ul>
              ) : (
                <p className="px-2 text-sm text-fg-muted">Nobody yet.</p>
              )}
            </Group>
        ))}

        {accountless.length ? (
          <Fold
            // Drawn like its sibling groups' headings (G4-4): unboxed, the count quiet, the note small.
            variant="row"
            summaryClassName="px-2"
            summary={
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-fg">
                  Profiles without an account <span className="font-normal text-fg-subtle">· {accountless.length}</span>
                </span>
                <span className="mt-1 block text-xs text-fg-subtle">Nobody can sign in to these profiles (a test, a placeholder or a deleted account). Adding a player with the same Riot ID reuses it.</span>
              </span>
            }
            testId="people-group-accountless"
            // Open while searching or filtering, so a match inside is never hidden.
            key={q || filter !== "all" ? "found" : "all"}
            defaultOpen={!!q || filter !== "all" || (!!open && !open.account && !!open.player)}
          >
            <ul className="divide-y divide-border">
              {accountless.map((p) => (
                <PersonRow key={p.key} p={p} onOpen={person.open} testId="admin-player-row" />
              ))}
            </ul>
          </Fold>
        ) : null}

        {canManageAccounts && kept.length ? (
          <Group title="Kept automatically" count={kept.length} note="The account the Production check signs in with. Deactivate it to turn the signed-in checks off; deleted, the check makes it again." testId="people-group-kept">
            <ul className="divide-y divide-border">
              {kept.map((p) => (
                <PersonRow key={p.key} p={p} onOpen={person.open} testId="admin-kept-row" />
              ))}
            </ul>
          </Group>
        ) : null}
          </>
        )}

        {shown.length === 0 ? (
          <div className="space-y-2 px-2 text-sm text-fg-muted">
            <p>Nobody matches.</p>
            <Button size="sm" variant="ghost" onClick={() => (setFilter("all"), setQuery(""))}>
              Show everyone
            </Button>
          </div>
        ) : null}

        <PersonView
          person={open}
          onClose={person.close}
          onStep={(dir) => {
            const at = open ? order.indexOf(open.key) : -1;
            const next = at < 0 ? null : order[at + dir];
            if (next) person.open(next);
          }}
          position={open ? { at: order.indexOf(open.key), of: order.length } : null}
          presets={presets}
          currentUserId={currentUserId}
          viewerIsOwner={viewerIsOwner}
          canManageAccounts={canManageAccounts}
          canManageRoster={canManageRoster}
          riotConfigured={riotConfigured}
        />
      </WorkspaceSection>
    </ErasureResultHost>
  );
}
