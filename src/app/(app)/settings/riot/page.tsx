import { redirect } from "next/navigation";

/** Riot accounts moved to My Profile → Riot Accounts; old links keep working. */
export default function RiotSettingsRedirect() {
  redirect("/overview/accounts");
}
