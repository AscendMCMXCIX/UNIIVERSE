/**
 * Resolves champion names from external datasets (pro sites, CSV exports) to Data Dragon ids.
 * Normalisation strips punctuation and case, and a small alias table covers the few names that
 * differ structurally (Wukong → MonkeyKing, Nunu & Willump → Nunu, Renata Glasc → Renata…).
 */
export function normaliseChampionName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const ALIASES: Record<string, string> = {
  wukong: "MonkeyKing",
  monkeyking: "MonkeyKing",
  nunuwillump: "Nunu",
  nunu: "Nunu",
  renataglasc: "Renata",
  renata: "Renata",
  drmundo: "DrMundo",
  mundo: "DrMundo",
  belveth: "Belveth",
  chogath: "Chogath",
  kaisa: "Kaisa",
  khazix: "Khazix",
  kogmaw: "KogMaw",
  leblanc: "Leblanc",
  reksai: "RekSai",
  velkoz: "Velkoz",
  ksante: "KSante",
  jarvan: "JarvanIV",
  jarvaniv: "JarvanIV",
  fiddlesticks: "Fiddlesticks",
  aurelionsol: "AurelionSol",
  asol: "AurelionSol",
  tahmkench: "TahmKench",
  twistedfate: "TwistedFate",
  tf: "TwistedFate",
  xinzhao: "XinZhao",
  missfortune: "MissFortune",
  mf: "MissFortune",
  masteryi: "MasterYi",
  leesin: "LeeSin",
};

export class ChampionNameResolver {
  private readonly byKey = new Map<string, string>();

  constructor(champions: Array<{ id: string; name: string }>) {
    for (const c of champions) {
      this.byKey.set(normaliseChampionName(c.id), c.id);
      this.byKey.set(normaliseChampionName(c.name), c.id);
    }
  }

  resolve(raw: string | null | undefined): string | null {
    if (!raw) return null;
    const key = normaliseChampionName(raw);
    if (!key) return null;
    const alias = ALIASES[key];
    if (alias && this.byKey.has(normaliseChampionName(alias))) return alias;
    return this.byKey.get(key) ?? null;
  }
}
