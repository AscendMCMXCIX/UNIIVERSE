import type { Role } from "./roles";

/**
 * Riot's position icons as League's client ships them (served by CommunityDragon, the community
 * mirror of the client's own assets). The single place these URLs live: change them here and every
 * role icon follows. If they cannot be reached, RoleIcon draws built-in shapes after them.
 */
const BASE = "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions";

export const ROLE_ICON_URLS: Record<Role, string> = {
  TOP: `${BASE}/icon-position-top.png`,
  JUNGLE: `${BASE}/icon-position-jungle.png`,
  MID: `${BASE}/icon-position-middle.png`,
  ADC: `${BASE}/icon-position-bottom.png`,
  SUPPORT: `${BASE}/icon-position-utility.png`,
};
