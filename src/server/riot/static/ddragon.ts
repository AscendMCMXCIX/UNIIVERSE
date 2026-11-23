import { z } from "zod";
import { ddragonChampionDetailSchema, ddragonChampionListSchema, StaticDataError, type DdragonChampion, type DdragonChampionDetail, type StaticDataProvider } from "./provider";

export interface DdragonOptions {
  baseUrl?: string;
  locale?: string;
  /**
   * The one version to read instead of Data Dragon's newest (default `DDRAGON_VERSION`; empty means
   * none). The browser tests' server pins one (e2e/ddragon-version.ts), so their pages, Champion
   * Lookup's numbers among them, stay the same as Riot ships patches. Never set in production.
   */
  version?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

const versionsSchema = z.array(z.string().min(1)).min(1);

/** A Data Dragon version as Riot publishes them ("16.22.1"): three whole numbers. */
const PINNABLE_VERSION = /^\d{1,4}\.\d{1,4}\.\d{1,12}$/;

/**
 * Live Data Dragon provider. Versions and champion data are resolved dynamically: the newest version
 * Data Dragon lists, or exactly the pinned one (`version`, `DDRAGON_VERSION`) once Data Dragon's list
 * confirms it has it.
 */
export class DataDragonProvider implements StaticDataProvider {
  readonly name = "ddragon";
  /** The version this provider reads instead of the newest (null: none, as in production). Not checked until `fetchVersions`. */
  readonly pinnedVersion: string | null;
  private readonly baseUrl: string;
  private readonly locale: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: DdragonOptions = {}) {
    this.baseUrl = (options.baseUrl ?? process.env.DDRAGON_BASE_URL ?? "https://ddragon.leagueoflegends.com").replace(/\/$/, "");
    this.locale = options.locale ?? process.env.DDRAGON_LOCALE ?? "en_US";
    this.pinnedVersion = (options.version ?? process.env.DDRAGON_VERSION ?? "").trim() || null;
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private async getJson(url: string): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(url, { signal: controller.signal, headers: { accept: "application/json" } });
      if (!res.ok) throw new StaticDataError(`Data Dragon responded ${res.status} for ${url}`, "http");
      return await res.json();
    } catch (err) {
      if (err instanceof StaticDataError) throw err;
      throw new StaticDataError(`Could not reach Data Dragon (${url}): ${(err as Error).message}`, "network", err);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Data Dragon's versions, newest first. Pinned, only the pinned version: the static sync reads
   * exactly that one (Data Dragon keeps every version it has published). A pin that is not a version,
   * or one Data Dragon does not list, throws as an unreachable Data Dragon does, so the sync keeps
   * what it has (or seeds the offline fixture on a first start) and says why; it never reads
   * another version instead.
   */
  async fetchVersions(): Promise<string[]> {
    const pinned = this.pinnedVersion;
    if (pinned !== null && !PINNABLE_VERSION.test(pinned)) throw new StaticDataError(`DDRAGON_VERSION ${JSON.stringify(pinned.slice(0, 40))} is not a Data Dragon version (three numbers, such as 16.22.1)`, "pin");
    const json = await this.getJson(`${this.baseUrl}/api/versions.json`);
    const parsed = versionsSchema.safeParse(json);
    if (!parsed.success) throw new StaticDataError("Unexpected versions.json shape", "schema", parsed.error);
    if (pinned === null) return parsed.data;
    if (!parsed.data.includes(pinned)) throw new StaticDataError(`Data Dragon does not list the pinned version ${pinned} (DDRAGON_VERSION)`, "pin");
    return [pinned];
  }

  async fetchChampionList(version: string): Promise<{ version: string; champions: DdragonChampion[] }> {
    const json = await this.getJson(`${this.baseUrl}/cdn/${version}/data/${this.locale}/champion.json`);
    const parsed = ddragonChampionListSchema.safeParse(json);
    if (!parsed.success) throw new StaticDataError("Unexpected champion.json shape", "schema", parsed.error);
    return { version: parsed.data.version, champions: Object.values(parsed.data.data) };
  }

  async fetchChampionDetail(version: string, championId: string): Promise<DdragonChampionDetail | null> {
    const json = await this.getJson(`${this.baseUrl}/cdn/${version}/data/${this.locale}/champion/${championId}.json`);
    const parsed = ddragonChampionDetailSchema.safeParse(json);
    if (!parsed.success) throw new StaticDataError(`Unexpected champion detail shape for ${championId}`, "schema", parsed.error);
    return parsed.data.data[championId] ?? Object.values(parsed.data.data)[0] ?? null;
  }
}

/** Portrait URL for a champion at a given Data Dragon version. */
export function championPortraitUrl(ddragonVersion: string, imageFull: string, baseUrl = "https://ddragon.leagueoflegends.com"): string {
  return `${baseUrl}/cdn/${ddragonVersion}/img/champion/${imageFull}`;
}

/** Small splash/loading art for a champion (centred). */
export function championLoadingUrl(championId: string, baseUrl = "https://ddragon.leagueoflegends.com"): string {
  return `${baseUrl}/cdn/img/champion/loading/${championId}_0.jpg`;
}
