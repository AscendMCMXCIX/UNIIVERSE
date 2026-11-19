/*
  Wording follows the viewer (PLAN §1.12): "you" and "your" on one's own pages; "they" and "their",
  or the champion's name where one is given, on a teammate's. Every template with a person in it
  goes through this, so a teammate's page never says "you".
*/

export interface ViewerWords {
  /** The sentence's subject: "you", the champion's name, or "they". */
  subject: string;
  /** "your" or "their". */
  possessive: string;
}

export function viewerWords(isOwn: boolean, champion?: string | null): ViewerWords {
  if (isOwn) return { subject: "you", possessive: "your" };
  return { subject: champion || "they", possessive: "their" };
}
