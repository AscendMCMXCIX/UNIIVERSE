# The owner's manual check

Only what no automated check can see: real touch and Safari on a real iPhone, the installed app, and Admin Mode, which no automated account may open. Everything else (every page at three widths, the layouts, the security boundaries, the Admin refusals for members, the iPhone sizes in WebKit and Chromium, Leaderboards' 30-day rule, the builds' thresholds) is checked by the Production check after each deploy (docs/LIVE_VALIDATION.md, "What it checks").

**When:** once after a release's Production check has passed (its run in Actions → Production check is green). About 15 minutes. Tick each line; a line that is not as described is not "good": say which line, on which page, and attach a screenshot if you can.

## iPhone, Safari (signed in as yourself)

1. ☐ **Team:** swipe the lineup cards both ways, past Support and past Top. Good: one card at a time, the dots follow, nothing jumps, and an upward swipe still scrolls the page.
2. ☐ **Leaderboards:** tap a multikill **Score**, then tap outside it. Good: the breakdown opens whole beside the row; the outside tap closes it and opens nothing else.
3. ☐ **Champion Intel:** tap the haste field and type 20, then tap the ⓘ beside a build's win rate. Good: no page zoom; the keyboard covers neither the field nor the numbers; the bubble opens inside the screen and a second tap closes it.
4. ☐ **A profile → All Champions:** tap a champion, then pull its sheet's header down. Good: the sheet opens with every opponent row reachable by scrolling; the pull closes it, and the list is where you left it.
5. ☐ **Match History:** open a game, scroll within it, then swipe back from the screen's left edge. Good: the page behind does not move, and the swipe closes the game, not the whole page.
6. ☐ **Turn the phone sideways** on Team and on a profile. Good: one compact bar at the top, no bottom bar, and nothing under the notch or the home indicator.
7. ☐ **Safari's aA → 150% text** on Team, Leaderboards and Match History. Good: names whole, nothing cut off, no sideways scrolling.

## The installed app (Safari → Share → Add to Home Screen)

8. ☐ **Home Screen.** Good: the icon and name are your Branding's, and it opens full screen, clear of the notch and the home indicator.
9. ☐ **Sign in inside the app,** close it from the app switcher, reopen it. Good: still signed in.
10. ☐ **After a deploy,** open the app → Admin → System Health → Diagnostics. Good: "build" shows the commit the latest Production check names (no old version).
11. ☐ **Airplane mode on,** then open the app or pull to reload. Good: UNIIVERSE's offline notice, not Safari's error. Back online, the page loads.
12. ☐ **Tap your avatar.** Good: the account screen fills the screen under the status bar; every row and Sign out answer a tap; × closes it with the page unmoved.

## Admin Mode (signed in as the Owner; a computer is fine)

13. ☐ **Switch to Admin Mode,** then open the Dashboard, People, Audit Logs, System Health, Data & Integrations, Branding, Previews, Resources, Settings and Platform Settings → Matchup notes. Good: each opens with no error screen and with your team's real figures.
14. ☐ **People.** Good: you are the only Owner, and `verify` is under "Kept automatically" with only Deactivate and Delete.
15. ☐ **System Health and Data & Integrations.** Good: no job failing, recent successful runs of the account sync and the tick, the rank schedule in the state you chose, the Master+ builds' collection shown as off, and "Ability ranges at <patch>" with no warning line.
16. ☐ **Audit Logs.** Good: today's entries are there, including your mode switch; nothing you did not do.
17. ☐ **Switch back to Player Mode.** Good: Team shows, with no admin controls left on screen.

This list replaces "A real iPhone" in docs/RESPONSIVE.md and the device lines in docs/MOBILE.md, which point here. The other actions only you can take (settings, decisions, readings) are in docs/OWNER_ACTIONS.md.
