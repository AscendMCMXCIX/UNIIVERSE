/** Riot platform ids with the labels players know them by. */
export const PLATFORMS: Array<{ id: string; label: string }> = [
  { id: "oc1", label: "OCE" },
  { id: "euw1", label: "EUW" },
  { id: "eun1", label: "EUNE" },
  { id: "na1", label: "NA" },
  { id: "kr", label: "KR" },
  { id: "br1", label: "BR" },
  { id: "la1", label: "LAN" },
  { id: "la2", label: "LAS" },
  { id: "tr1", label: "TR" },
  { id: "ru", label: "RU" },
  { id: "jp1", label: "JP" },
  { id: "me1", label: "ME" },
  { id: "sg2", label: "SEA" },
  { id: "tw2", label: "TW" },
  { id: "vn2", label: "VN" },
];

export function platformLabel(id: string): string {
  return PLATFORMS.find((p) => p.id === id)?.label ?? id.toUpperCase();
}
