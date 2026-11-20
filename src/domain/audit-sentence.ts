import { auditLabel } from "./audit";

/*
  Audit Logs in sentences (the overhaul's S9b): who did what to whom, and the details kept with it
  in words. Never `key: value`, never a key as stored (camelCase): a key without its own wording
  here is put into words from its name, so a new detail still reads as text. Numbers are written
  as the record holds them (whole counts); dates belong to the row, not the sentence.
*/

export interface AuditSentenceInput {
  actorName: string | null;
  action: string;
  targetName: string | null;
  details: Record<string, string | number | boolean | null>;
}

/** What each action did, with `{t}` where the target's name goes; without a target the label is used. */
const WITH_TARGET: Record<string, string> = {
  "account.create": "created the account {t}",
  "account.password-reset": "issued a temporary password to {t}",
  "account.password-withdrawn": "withdrew the password of {t}",
  "account.activate": "reactivated {t}",
  "account.deactivate": "deactivated {t}",
  "account.delete": "deleted the account {t}",
  "account.role": "changed the role of {t}",
  "account.access": "changed the access of {t}",
  "account.groups": "changed the extra access of {t}",
  "account.permissions": "changed the permissions of {t}",
  "account.team-member": "changed the team membership of {t}",
  "account.admin-grant": "made {t} an administrator",
  "account.admin-revoke": "removed administrator access from {t}",
  "account.display-name": "changed the display name of {t}",
  "account.sign-out-everywhere": "signed {t} out everywhere",
  "account.picture-replace": "replaced the picture of {t}",
  "account.picture-remove": "removed the picture of {t}",
  "account.link-hide": "hid a public link of {t}",
  "account.link-remove": "removed a link of {t}",
  "profile.delete": "deleted the profile {t}",
  "profile.archive": "archived the profile {t}",
  "profile.restore": "restored the profile {t}",
  "password.change": "changed their own password",
  "preset.save": "saved the access level {t}",
  "preset.delete": "deleted the access level {t}",
  "resources.add": "added the resource {t}",
  "resources.edit": "changed the resource {t}",
  "resources.remove": "removed the resource {t}",
  "jobs.schedule": "changed the schedule of {t}",
  "jobs.run": "ran {t}",
  "privacy.erase": "permanently erased a person's personal data, reference {t}",
  "privacy.release": "released the Riot accounts of {t}",
};

const lowerFirst = (s: string) => (s ? s[0]!.toLowerCase() + s.slice(1) : s);

/** "Founder made Captain an administrator." */
export function auditSentence(e: AuditSentenceInput): string {
  const who = e.actorName ?? "The local owner";
  const template = WITH_TARGET[e.action];
  const what = template && e.targetName ? template.replace("{t}", e.targetName) : template && !template.includes("{t}") ? template : lowerFirst(auditLabel(e.action)) + (e.targetName ? ` (${e.targetName})` : "");
  return `${who} ${what}.`;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const minutes = (v: unknown) => (typeof v === "number" ? (v === 0 ? "off" : `every ${plural(v, "minute")}`) : "unknown");

/** Words for one detail, or null to leave it out (shown elsewhere in the sentence, or not worth a phrase). */
function phrase(key: string, value: string | number | boolean | null, all: AuditSentenceInput["details"]): string | null {
  switch (key) {
    case "teamMember":
      return value ? "joins the team" : "personal use";
    case "profileErased":
      return value ? "the profile was deleted too" : "the profile was kept";
    case "level":
      return value === "custom" ? "a custom level" : value === "owner" ? "Owner" : `the ${String(value)} level`;
    case "capabilities":
      return typeof value === "number" ? plural(value, "permission") : null;
    case "groups":
      return typeof value === "number" ? (value === 0 ? "no extra access" : plural(value, "extra access group")) : value === "none" || value === "" ? "no extra access" : `extra access ${String(value)}`;
    case "role":
      return `now ${String(value)}`;
    case "fromMinutes":
      return `from ${minutes(value)} to ${minutes(all.toMinutes)}`;
    case "toMinutes":
      return "fromMinutes" in all ? null : `now ${minutes(value)}`;
    case "ok":
      return value ? "it finished" : "it failed";
    case "kind":
      return value === "member" ? "a member" : value === "former" ? "a former member" : `a ${String(value)} job`;
    case "purpose":
      return `for ${String(value)}`;
    case "reason":
      return `because ${String(value)}`;
    case "profile":
      return value === false ? "no player profile" : null;
    case "change":
      return value === "seed-roster" ? "the demo roster was added" : String(value);
    case "link":
      return `their ${String(value)}`;
    case "usernameChanged":
      return value ? "the username changed" : null;
    case "riotAccounts":
      return typeof value === "number" ? plural(value, "Riot account") : null;
    case "gamesDeleted":
      return typeof value === "number" ? `${plural(value, "game")} deleted` : null;
    case "gamesDeidentified":
      return typeof value === "number" ? `${plural(value, "game")} made anonymous` : null;
    case "notes":
      return typeof value === "number" ? plural(value, "note") : null;
    case "auditEntries":
      return typeof value === "number" ? `${plural(value, "activity entry", "activity entries")} cleared` : null;
    case "records":
      return typeof value === "number" ? plural(value, "record") : null;
    case "unusable":
      return typeof value === "number" && value > 0 ? `${value} unusable` : null;
    case "added":
      return typeof value === "number" ? `${value} added` : null;
    case "updated":
      return typeof value === "number" ? `${value} updated` : null;
    case "people":
      return typeof value === "number" ? plural(value, "person", "people") : null;
    case "traces":
      return typeof value === "number" ? plural(value, "trace") : null;
    default:
      return generic(key, value);
  }
}

/** A detail with no wording of its own: its name in words, then the value ("profile kept" for a true flag). */
function generic(key: string, value: string | number | boolean | null): string | null {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_.-]+/g, " ")
    .toLowerCase()
    .trim();
  if (!words) return null;
  if (value === true) return words;
  if (value === false) return `not ${words}`;
  if (value === null || value === "") return null;
  return `${words} ${String(value)}`;
}

/** The details in one line of words ("joins the team; 3 permissions"), or "" when there are none. */
export function auditDetailsSentence(details: AuditSentenceInput["details"]): string {
  const parts = Object.entries(details ?? {})
    .map(([k, v]) => phrase(k, v, details))
    .filter((p): p is string => !!p);
  if (!parts.length) return "";
  const text = parts.join("; ");
  return text[0]!.toUpperCase() + text.slice(1) + ".";
}
