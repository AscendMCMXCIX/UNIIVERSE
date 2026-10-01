import type { PlayerProfile } from "@/domain/roster";

/** A deterministic five-player lineup used across domain tests. */
export const PLAYER_A: PlayerProfile = {
  id: "player-a",
  displayName: "Player A",
  group: "main",
  primaryRole: "TOP",
  secondaryRole: "MID",
  primaryPool: ["Riven", "Gwen", "Ambessa"],
  secondaryPool: ["Ahri", "Lissandra"],
};

export const PLAYER_B: PlayerProfile = {
  id: "player-b",
  displayName: "Player B",
  group: "main",
  primaryRole: "MID",
  secondaryRole: "TOP",
  primaryPool: ["Orianna", "Syndra", "Azir", "Galio"],
  secondaryPool: ["Jax", "KSante"],
};

export const PLAYER_C: PlayerProfile = {
  id: "player-c",
  displayName: "Player C",
  group: "main",
  primaryRole: "JUNGLE",
  secondaryRole: null,
  primaryPool: ["Viego", "LeeSin", "Vi", "JarvanIV", "Sejuani"],
  secondaryPool: [],
};

export const PLAYER_D: PlayerProfile = {
  id: "player-d",
  displayName: "Player D",
  group: "main",
  primaryRole: "ADC",
  secondaryRole: "SUPPORT",
  primaryPool: ["Jinx", "Kaisa", "Ezreal", "Sivir", "Xayah"],
  secondaryPool: ["Nautilus", "Leona"],
};

export const PLAYER_E: PlayerProfile = {
  id: "player-e",
  displayName: "Player E",
  group: "main",
  primaryRole: "SUPPORT",
  secondaryRole: "ADC",
  primaryPool: ["Nautilus", "Rakan", "Thresh", "Alistar", "Lulu", "Braum"],
  secondaryPool: ["Varus", "Jhin"],
};

export const PLAYER_SUB: PlayerProfile = {
  id: "player-sub",
  displayName: "Sub Top",
  group: "other",
  primaryRole: "TOP",
  secondaryRole: null,
  primaryPool: ["Ornn", "Sion", "Malphite"],
  secondaryPool: [],
};

export const LINEUP: PlayerProfile[] = [PLAYER_A, PLAYER_B, PLAYER_C, PLAYER_D, PLAYER_E];

export const DEFAULT_ASSIGNMENT = {
  TOP: "player-a",
  JUNGLE: "player-c",
  MID: "player-b",
  ADC: "player-d",
  SUPPORT: "player-e",
} as const;
