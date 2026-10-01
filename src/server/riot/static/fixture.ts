import fixture from "../fixtures/champions.fixture.json";
import type { DdragonChampion, StaticDataProvider } from "./provider";

export const FIXTURE_VERSION = "0.0.0-fixture";

/**
 * Offline fixture provider. Only used when the database has never been populated and the real
 * provider is unreachable, so local development and demo mode keep working. Clearly labelled as
 * a fixture in the database (`source = "fixture"`); the next successful sync replaces it.
 */
export class FixtureStaticProvider implements StaticDataProvider {
  readonly name = "fixture";

  async fetchVersions(): Promise<string[]> {
    return [FIXTURE_VERSION];
  }

  async fetchChampionList(): Promise<{ version: string; champions: DdragonChampion[] }> {
    const champions: DdragonChampion[] = fixture.champions.map((c) => ({
      id: c.id,
      key: String(c.key),
      name: c.name,
      title: "",
      tags: c.tags,
      partype: "",
      info: { attack: 0, defense: 0, magic: 0, difficulty: 0 },
      stats: { attackrange: c.attackRange },
      image: { full: `${c.id}.png` },
    }));
    return { version: FIXTURE_VERSION, champions };
  }
}
