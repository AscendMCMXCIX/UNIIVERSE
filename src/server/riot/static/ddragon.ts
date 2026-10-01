import { z } from "zod";
import { ddragonChampionDetailSchema, ddragonChampionListSchema, StaticDataError, type DdragonChampion, type DdragonChampionDetail, type StaticDataProvider } from "./provider";

export interface DdragonOptions {
  baseUrl?: string;
  locale?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

const versionsSchema = z.array(z.string().min(1)).min(1);

/** Live Data Dragon provider. Versions and champion data are always resolved dynamically. */
export class DataDragonProvider implements StaticDataProvider {
  readonly name = "ddragon";
  private readonly baseUrl: string;
  private readonly locale: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: DdragonOptions = {}) {
    this.baseUrl = (options.baseUrl ?? process.env.DDRAGON_BASE_URL ?? "https://ddragon.leagueoflegends.com").replace(/\/$/, "");
    this.locale = options.locale ?? process.env.DDRAGON_LOCALE ?? "en_US";
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

  async fetchVersions(): Promise<string[]> {
    const json = await this.getJson(`${this.baseUrl}/api/versions.json`);
    const parsed = versionsSchema.safeParse(json);
    if (!parsed.success) throw new StaticDataError("Unexpected versions.json shape", "schema", parsed.error);
    return parsed.data;
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
