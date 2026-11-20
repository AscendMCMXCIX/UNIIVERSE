import { DUO_ROLES, type Role } from "@/domain/matchup-intel/types";
import type { PickerSlot } from "./preferences";

/** A champion slot of the page: yours and the enemy's, and in the bot lane your duo partner and the other enemy. */
export type FrameSlot = "you" | "ally" | "enemy" | "enemy2";
/** The Recent row a slot shares: your side's or the enemy's. */
export const RECENT_OF: Record<FrameSlot, PickerSlot> = { you: "you", ally: "you", enemy: "enemy", enemy2: "enemy" };

/** What each slot is called, and what an empty one asks for, by role (docs/MATCHUP_INTEL.md, "Roles"). */
export function slotWords(role: Role, slot: FrameSlot): { label: string; choose: string; picker: string; description: string } {
  const duo = DUO_ROLES.has(role);
  const mine = role === "support" ? "support" : "ADC";
  const partner = role === "support" ? "ADC" : "support";
  switch (slot) {
    case "you":
      return duo ? { label: `Your ${mine}`, choose: `Choose your ${mine}`, picker: `Your ${mine}`, description: `The ${mine} you play: remembered on this device.` } : { label: "Your champion", choose: "Choose your champion", picker: "Your champion", description: "The champion you play: remembered on this device." };
    case "ally":
      return { label: `Your ${partner}`, choose: `Choose your ${partner}`, picker: `Your ${partner}`, description: `Your duo partner in the bot lane.` };
    case "enemy":
      return duo ? { label: `Enemy ${mine}`, choose: `Choose the enemy ${mine}`, picker: `The enemy ${mine}`, description: `The enemy ${mine} you face in the bot lane.` } : { label: "Enemy", choose: "Choose the enemy", picker: "The enemy", description: "The champion you face in lane." };
    default:
      return { label: `Enemy ${partner}`, choose: `Choose the enemy ${partner}`, picker: `The enemy ${partner}`, description: `The enemy ${partner} in the bot lane.` };
  }
}

