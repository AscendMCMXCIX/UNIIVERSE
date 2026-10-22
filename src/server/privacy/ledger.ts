import { randomInt } from "node:crypto";
import { asc, eq, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { privacyErasures } from "@/server/db/schema";
import { cachedFor, invalidateCache } from "@/server/observability/cache";
import { erasureKey, keyCheckOf, riotIdToken, tagged } from "./tokens";

/*
  The erasure records (privacy_erasures) as the rest of the app uses them: the filter that keeps an
  erased person out of games stored later and out of new Riot account links, the list Admin Mode
  shows, and the export and import that carry the records across a restore (docs/BACKUPS.md).
*/

/** Why a Riot account is not linked (Admin Mode, Settings and the account sync say the same). */
export const ERASED_IDENTITY_MESSAGE = "This Riot account belongs to someone whose personal data was permanently erased from UNIIVERSE, so it cannot be linked. If its owner asked to come back, an administrator can release it under Admin Mode → Users & Permissions → Personal data.";

const CACHE_KEY = "privacy:erasures";
/** How long one server instance may use a list of records before reading it again. */
const CACHE_MS = 15_000;

interface StoredRecord {
  id: string;
  reference: string;
  erasedAt: Date;
  tokens: string[];
  keyCheck: string;
  releasedAt: Date | null;
}

/** Who a stored participant is, as far as the filter needs: Riot's id and the "Name#TAG" Riot gave. */
export interface ParticipantIdentity {
  puuid: string | null | undefined;
  name: string | null | undefined;
}

/**
 * Recognises erased people among Riot identities. Matching is by PUUID, or by Riot ID: Riot's
 * PUUIDs change when the server's API key changes, so a Riot ID match also remembers the new
 * PUUID (learned), which keeps the erasure in force if the person renames their Riot account
 * afterwards.
 */
export class ErasureFilter {
  private readonly owners = new Map<string, string[]>();
  private readonly learned = new Map<string, Set<string>>();

  constructor(
    records: ReadonlyArray<Pick<StoredRecord, "id" | "tokens">>,
    private readonly key: Buffer = erasureKey(),
  ) {
    for (const r of records)
      for (const t of r.tokens) {
        if (!t.startsWith("puuid:") && !t.startsWith("riotid:")) continue;
        const list = this.owners.get(t);
        if (list) list.push(r.id);
        else this.owners.set(t, [r.id]);
      }
  }

  /** No active erasure: nothing is ever matched (the usual case, checked first). */
  get empty(): boolean {
    return this.owners.size === 0;
  }

  puuid(puuid: string | null | undefined): boolean {
    return !!puuid && !this.empty && this.owners.has(tagged("puuid", puuid, this.key));
  }

  riotId(name: string | null | undefined): boolean {
    if (this.empty) return false;
    const t = riotIdToken(name, this.key);
    return !!t && this.owners.has(t);
  }

  /** Is this participant an erased person? */
  participant(p: ParticipantIdentity): boolean {
    if (this.empty) return false;
    if (this.puuid(p.puuid)) return true;
    const t = riotIdToken(p.name, this.key);
    const ids = t ? this.owners.get(t) : undefined;
    if (!ids) return false;
    if (p.puuid) {
      const pt = tagged("puuid", p.puuid, this.key);
      for (const id of ids) {
        const set = this.learned.get(id) ?? new Set<string>();
        set.add(pt);
        this.learned.set(id, set);
      }
    }
    return true;
  }

  /** Writes the PUUIDs learned from Riot ID matches onto their records (once each). */
  async remember(db: Db): Promise<void> {
    if (this.learned.size === 0) return;
    for (const [id, tokens] of this.learned) {
      const add = [...tokens];
      await db.execute(sql`
        UPDATE privacy_erasures SET tokens = tokens || (
          SELECT coalesce(jsonb_agg(t), '[]'::jsonb) FROM jsonb_array_elements_text(${JSON.stringify(add)}::jsonb) t WHERE NOT (privacy_erasures.tokens @> jsonb_build_array(t))
        ) WHERE id = ${id}::uuid`);
      for (const t of add) this.owners.set(t, [...(this.owners.get(t) ?? []), id]);
    }
    this.learned.clear();
    invalidateCache(CACHE_KEY);
  }
}

async function loadRecords(db: Db): Promise<StoredRecord[]> {
  return db
    .select({ id: privacyErasures.id, reference: privacyErasures.reference, erasedAt: privacyErasures.erasedAt, tokens: privacyErasures.tokens, keyCheck: privacyErasures.keyCheck, releasedAt: privacyErasures.releasedAt })
    .from(privacyErasures)
    .orderBy(asc(privacyErasures.erasedAt));
}

/** Records made with this deployment's key and not released: the ones that keep people out. */
function active(records: StoredRecord[]): StoredRecord[] {
  const check = keyCheckOf();
  return records.filter((r) => r.keyCheck === check && !r.releasedAt);
}

/** The filter for code that stores Riot data (a few seconds old at most on any server instance). */
export async function erasureFilter(db: Db): Promise<ErasureFilter> {
  const records = await cachedFor(CACHE_KEY, CACHE_MS, () => loadRecords(db), db);
  return new ErasureFilter(active(records));
}

/** After a change to the records: every reader on this instance sees it at once. */
export function forgetErasureCache(): void {
  invalidateCache(CACHE_KEY);
}

/** Every record with this deployment's key (released ones included), for reconciling a restored database. */
export async function usableRecords(db: Db): Promise<StoredRecord[]> {
  const check = keyCheckOf();
  return (await loadRecords(db)).filter((r) => r.keyCheck === check);
}

export interface ErasureRecordView {
  reference: string;
  erasedAt: string;
  /** False when the record was made under another UNIIVERSE_AUTH_SECRET: it can no longer be applied. */
  usable: boolean;
  releasedAt: string | null;
}

export async function listErasureRecords(db: Db): Promise<ErasureRecordView[]> {
  const check = keyCheckOf();
  return (await loadRecords(db))
    .map((r) => ({ reference: r.reference, erasedAt: r.erasedAt.toISOString(), usable: r.keyCheck === check, releasedAt: r.releasedAt?.toISOString() ?? null }))
    .reverse();
}

const REFERENCE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** A short reference an administrator can read out ("ER-7K2QF9"); random, so it says nothing about the person. */
export function newReference(): string {
  let s = "";
  for (let i = 0; i < 6; i++) s += REFERENCE_ALPHABET[randomInt(REFERENCE_ALPHABET.length)];
  return `ER-${s}`;
}

/** The person asked to come back: their Riot accounts may be linked again and their games are kept from now on. */
export async function releaseErasure(db: Db, reference: string): Promise<boolean> {
  const rows = await db.update(privacyErasures).set({ releasedAt: new Date() }).where(sql`${privacyErasures.reference} = ${reference} AND ${privacyErasures.releasedAt} IS NULL`).returning({ id: privacyErasures.id });
  forgetErasureCache();
  return rows.length > 0;
}

/** The records file kept beside offline backups (docs/BACKUPS.md): tokens only, nothing that names anyone. */
export interface ErasureExport {
  format: "uniiverse-erasures";
  version: 1;
  exportedAt: string;
  records: Array<{ reference: string; erasedAt: string; tokens: string[]; keyCheck: string; releasedAt: string | null }>;
}

export async function exportErasures(db: Db, now: Date = new Date()): Promise<ErasureExport> {
  const records = await loadRecords(db);
  return {
    format: "uniiverse-erasures",
    version: 1,
    exportedAt: now.toISOString(),
    records: records.map((r) => ({ reference: r.reference, erasedAt: r.erasedAt.toISOString(), tokens: r.tokens, keyCheck: r.keyCheck, releasedAt: r.releasedAt?.toISOString() ?? null })),
  };
}

const TOKEN = /^(user|player|account|puuid|riotid):[0-9a-f]{64}$/;

/**
 * Adds the records of an export to this database (a restored backup lacks the erasures made after
 * it): new references are inserted, known ones gain any tokens they lack and keep the earlier of
 * two release dates. Nothing else is touched; reconcileErasures then applies them.
 */
export async function importErasures(db: Db, file: unknown): Promise<{ added: number; updated: number }> {
  const f = file as Partial<ErasureExport> | null;
  if (!f || f.format !== "uniiverse-erasures" || f.version !== 1 || !Array.isArray(f.records)) throw new Error("This is not a UNIIVERSE erasure records file.");
  let added = 0;
  let updated = 0;
  for (const r of f.records) {
    if (!r || typeof r.reference !== "string" || !/^ER-[A-Z0-9]{6}$/.test(r.reference) || !Array.isArray(r.tokens) || typeof r.keyCheck !== "string" || !/^[0-9a-f]{16}$/.test(r.keyCheck)) throw new Error("The file has a malformed record.");
    const tokens = [...new Set(r.tokens.filter((t): t is string => typeof t === "string" && TOKEN.test(t)))];
    if (tokens.length !== r.tokens.length) throw new Error(`Record ${r.reference} has malformed tokens.`);
    const erasedAt = new Date(r.erasedAt);
    const releasedAt = r.releasedAt ? new Date(r.releasedAt) : null;
    if (Number.isNaN(erasedAt.getTime()) || (releasedAt && Number.isNaN(releasedAt.getTime()))) throw new Error(`Record ${r.reference} has a malformed date.`);
    const [existing] = await db.select({ id: privacyErasures.id, tokens: privacyErasures.tokens, releasedAt: privacyErasures.releasedAt }).from(privacyErasures).where(eq(privacyErasures.reference, r.reference));
    if (!existing) {
      await db.insert(privacyErasures).values({ reference: r.reference, erasedAt, tokens, keyCheck: r.keyCheck, releasedAt });
      added++;
      continue;
    }
    const merged = [...new Set([...existing.tokens, ...tokens])];
    const release = existing.releasedAt && releasedAt ? (existing.releasedAt < releasedAt ? existing.releasedAt : releasedAt) : (existing.releasedAt ?? releasedAt);
    if (merged.length !== existing.tokens.length || (release?.getTime() ?? null) !== (existing.releasedAt?.getTime() ?? null)) {
      await db.update(privacyErasures).set({ tokens: merged, releasedAt: release }).where(eq(privacyErasures.id, existing.id));
      updated++;
    }
  }
  forgetErasureCache();
  return { added, updated };
}
