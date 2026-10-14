import type { PortraitChampion } from "@/components/champion-portrait";
import type { Role } from "@/domain/roles";

export interface PickerChampion extends PortraitChampion {
  /** Roles the champion is commonly played in (for the role filter); empty = unknown. */
  roles?: Role[];
}

/** Search key: case, accents, spaces and punctuation ignored (Kai'Sa = kaisa, Nunu & Willump = nunu). */
export function normalise(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

