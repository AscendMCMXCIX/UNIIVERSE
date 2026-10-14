import { z } from "zod";

/**
 * Riot static data (Data Dragon) provider interface. Kept small so a test double or a
 * CommunityDragon-backed implementation can replace it without touching the sync logic.
 */
export const ddragonChampionSchema = z.object({
  id: z.string().min(1),
  key: z.string().regex(/^\d+$/),
  name: z.string().min(1),
  title: z.string().default(""),
  tags: z.array(z.string()).default([]),
  partype: z.string().default(""),
  info: z
    .object({ attack: z.number(), defense: z.number(), magic: z.number(), difficulty: z.number() })
    .default({ attack: 0, defense: 0, magic: 0, difficulty: 0 }),
  stats: z.object({ attackrange: z.number().optional() }).passthrough().default({}),
  image: z.object({ full: z.string().min(1) }).passthrough(),
});

export const ddragonChampionListSchema = z.object({
  type: z.string().optional(),
  version: z.string().min(1),
  data: z.record(z.string(), ddragonChampionSchema),
});

export const ddragonChampionDetailSchema = z.object({
  version: z.string().optional(),
  data: z.record(
    z.string(),
    z
      .object({
        id: z.string(),
        passive: z.object({ name: z.string() }).passthrough().optional(),
        spells: z.array(z.object({ id: z.string(), name: z.string() }).passthrough()).default([]),
        stats: z.record(z.string(), z.number()).default({}),
        /** Skins with their art index (`num`); 0 is the default skin. */
        skins: z.array(z.object({ id: z.string(), num: z.number().int().nonnegative(), name: z.string(), parentSkin: z.number().int().nonnegative().optional() }).passthrough()).default([]),
      })
      .passthrough(),
  ),
});

export type DdragonChampion = z.infer<typeof ddragonChampionSchema>;
export type DdragonChampionDetail = z.infer<typeof ddragonChampionDetailSchema>["data"][string];

export interface StaticDataProvider {
  readonly name: string;
  /** Newest version first. */
  fetchVersions(): Promise<string[]>;
  fetchChampionList(version: string): Promise<{ version: string; champions: DdragonChampion[] }>;
  /** Detailed per-champion data used for rework fingerprinting and skins. May be omitted by providers. */
  fetchChampionDetail?(version: string, championId: string): Promise<DdragonChampionDetail | null>;
}

export class StaticDataError extends Error {
  constructor(
    message: string,
    public readonly kind: "network" | "schema" | "http",
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "StaticDataError";
  }
}
