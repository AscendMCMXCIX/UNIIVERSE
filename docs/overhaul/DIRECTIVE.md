# The owner's directive of 19 Nov 2026 (verbatim)

UNIIVERSE — Comprehensive Platform Overhaul & Autonomous Development Directive
Primary Mission
Transform UNIIVERSE into a cohesive, premium, modern League of Legends platform that delivers an exceptional experience across desktop, mobile, installed PWA and administration.
The overarching standard is a premium, modern, intuitive user experience across absolutely everything.
This is an implementation directive, not merely a request for recommendations or planning.
Independently investigate the existing application, challenge previous design decisions, implement justified improvements, test them thoroughly and deploy safely.
Operate proactively within the authorised development scope. Do not repeatedly request approval for routine, reversible improvements.
0. Audit Existing Work Before Implementation
Inspect the current repository, open pull requests, branches, deployment history, CI results and production application.
Determine:

* What is currently live.
* What has been merged but not deployed.
* What is partially implemented.
* What has been requested previously but remains incomplete.
* What existing functionality could be affected by this overhaul.

Specifically investigate previously submitted Leaderboards consolidation, Matchup Intel improvements, Ranked Progress cleanup and outstanding interface refinements.
Finish or reconcile safe outstanding work without duplicating implementations.
Preserve production data, security, privacy controls and existing working functionality.
Do not automatically execute deliberately held destructive database changes, including PR #212.
1. Site-Wide Premium UX Overhaul
Conduct a comprehensive retrospective UX audit across every existing feature.
Include Team Overview, Players, Leaderboards, Encounters, All Champions, Matchup Intel, Resources, profiles, settings, administration and any other implemented areas.
Assess and improve:

* Visual hierarchy and readability.
* Typography, colours, spacing and layout.
* Navigation consistency.
* Information density.
* Unnecessary scrolling and nested scroll areas.
* Modal, drawer, panel and dropdown behaviour.
* Animations and transitions.
* Accessibility and responsiveness.
* Discoverability of features.
* Unnecessary clicks and complicated workflows.

Establish shared interaction components and consistent behaviour across the application.
Similar actions should behave similarly wherever practical.
Quick previews should feel naturally connected to their parent page, preserve browsing position and close predictably.
Avoid disruptive page transitions, unexpected layout shifts and unnecessarily complicated interfaces.
Challenge previous design decisions whenever the actual user experience suggests a better approach.
Do not blindly preserve earlier instructions simply because they were previously approved.
2. Complete Mobile Experience Overhaul
Desktop UNIIVERSE is the established visual-quality benchmark.
Mobile must look and feel equally premium while remaining genuinely intuitive on a smaller touchscreen.
It must feel like the same application, not a stripped-down alternative.
Visual consistency
Preserve the desktop application's:

* Visual identity.
* Typography and colour system.
* Layout hierarchy.
* Component styling.
* Premium presentation.
* Interaction patterns.
* Overall design language.

Adapt layouts intelligently for mobile without sacrificing visual quality.
Begin with Team Overview, using its desktop design as the benchmark, then assess every other mobile page.
Navigation parity
Desktop and mobile should share a coherent navigation structure.
Preserve familiar page names, icons, groupings and navigation logic.
Users should not need to relearn where features are located when switching devices.
Resources and other ordinary destinations must not be hidden inside account/profile settings.
Reassess existing mobile navigation patterns, including the bottom bar, rather than automatically preserving previous choices.
Choose the most intuitive, efficient and visually polished solution.
Compact, low-friction layouts
Every mobile page should prioritise the information users actually need.
Avoid:

* Endless vertical scrolling.
* Oversized cards.
* Redundant statistics.
* Unnecessary headings.
* Awkward nested scrollbars.
* Excessive padding.
* Complicated tab structures.
* Having to scroll repeatedly to open and close content.

Aim to present the most important information within the initial screen wherever practical.
Do not sacrifice readability or hide essential information merely to enforce a one-screen limit.
Use thoughtful information hierarchy and progressive disclosure where genuinely beneficial.
Opening, inspecting, closing and switching between items should be effortless.
These requirements apply across the entire website, not just Match History.
Mobile and PWA testing
Test representative real mobile viewport sizes and the installed PWA.
Verify navigation, safe areas, touch targets, overlays, scrolling, responsive layouts and accessibility.
Do not consider mobile complete simply because the interface technically fits on a phone.
Mobile must look premium, feel premium and be intuitive.
3. Matchup Intel — Autonomous Pre-Game Intelligence
Develop Matchup Intel into an evidence-driven, automatically maintained preparation tool supporting all five League of Legends roles.
Matchup structures

* Top: 1v1 against the opposing top laner.
* Jungle: 1v1 against the opposing jungler.
* Mid: 1v1 against the opposing mid laner.
* ADC: allied ADC/support versus opposing ADC/support.
* Support: the same bot-lane 2v2 from the support perspective.

Do not require full-team selection or additional jungle inputs for lane matchups.
Keep champion selection quick, persistent and easy to change.
Briefing information
Provide concise, role-specific recommendations covering:

* Complete recommended rune pages, including stat shards.
* Summoner spells.
* Starting items.
* Early recall purchases.
* Relevant core build progression, up to approximately three completed items where useful.
* Starting ability and early skill order.
* Enemy ability cooldowns, accounting for ranks and relevant modifiers.
* Champion ability interactions.
* Trading opportunities and threats.
* Power spikes.
* Wave management and recall objectives.
* Jungle clear, duelling, invade and objective considerations.
* Bot-lane coordination and 2v2 interactions.
* Short adjustments for playing ahead or behind.
* Matchup-known and matchup-uncertain preparation where appropriate.

Prioritise actionable advice over walls of statistics.
Explain what information means for the player's next decision.
Keep the desktop briefing compact enough to reference quickly during champion select or gameplay.
Evidence and accuracy
Investigate legitimate, permitted Riot data and other appropriately licensed sources.
Validate matchup identification, role assignments, patch relevance and sample quality.
Do not confuse champion co-occurrence with confirmed lane matchups.
Do not invent mechanics, statistics, curated notes or strategic conclusions.
Distinguish reliable evidence from uncertain recommendations.
When evidence is insufficient, provide honest, useful fallback guidance.
Avoid assuming that every matchup has enough evidence for a unique, highly specific recommendation.
Autonomous intelligence
Implement a reliable pipeline that:

* Detects relevant patches.
* Refreshes supported champion information.
* Reassesses recommendations as evidence changes.
* Identifies outdated or unreliable advice.
* Validates updates before publication.
* Retries transient failures.
* Uses safe fallbacks.
* Monitors data pipeline health.

Use high-elo match evidence where appropriate and available.
Video analysis may be considered as an enhancement but must not block the core system.
Do not arbitrarily define the end of laning phase by a fixed minute or champion level.
4. All Champions Redesign
Preserve the convenience of browsing champions without repeatedly navigating away from the main page.
Investigate replacing the existing desktop champion pop-up with a smooth, integrated right-side preview panel.
The interaction should feel naturally connected to the champion list, almost like unfolding a page.
Avoid exaggerated animations or disruptive layout movement.
Allow users to:

* Open a champion quickly.
* Switch directly between champions.
* Dismiss the panel intuitively.
* Preserve their browsing position.
* Understand the information immediately.

Simplify the displayed information substantially.
Prioritise personal champion performance and matchup history:

* Champion identity.
* Games played.
* Overall personal win rate.
* Personal win rate against each opposing champion.
* Number of games supporting each matchup percentage.

Default to meaningful sample sizes, with simple sorting where useful.
Avoid unnecessary statistical panels, excessive colour coding and complicated tab structures.
Keep All Champions distinct from the pre-game Matchup Intel feature.
Adapt the presentation appropriately for mobile.
5. Encounters / Match History Redesign
Reassess the entire expanded-match experience.
Use League of Legends' familiar post-game presentation as a reference while retaining UNIIVERSE's premium visual identity.
Prioritise:

* Match result.
* KDA and key performance statistics.
* Relevant CS, gold and damage information.
* Lane or role performance where supported by data.
* Recognisable six-slot item inventory.
* Runes and summoner spells.
* A small number of meaningful performance observations.

Present items and related information in a visually coherent arrangement resembling the actual League client.
Avoid interfaces that feel like unrelated icons placed beside complicated statistics.
Analysis
Rewrite the analysis experience to answer:

* What went well?
* What went wrong?
* What should the player focus on improving?

Use short, natural explanations.
Do not invent causal conclusions unsupported by available match data.
Remove unnecessary subtabs and repetitive statistics wherever a cleaner layout is possible.
Mobile interaction
Expanded matches must be compact, readable and easy to navigate.
Users should not have to scroll through several screens to inspect one match and then scroll all the way back to close it.
Make closing, switching and returning intuitive.
Apply the same low-friction principles across the entire website.
6. Site-Wide Tooltip and Information Bubble Overhaul
Audit every existing tooltip, information icon, hover explanation and contextual help message throughout UNIIVERSE.
This includes older features, recently redesigned pages, administration and mobile interfaces.
Tooltips must explain information to ordinary League of Legends players, not to developers or AI systems.
Writing standards
Every tooltip should:

* Use simple, natural language.
* Explain what the information means.
* Explain why it matters only when useful.
* Be immediately understandable.
* Be relevant to the specific statistic or feature.
* Be concise, preferably one short sentence.
* Avoid unnecessary jargon, technical terminology and filler.

For example:
Bad: "Aggregated economic differential derived from participant timeline telemetry."
Good: "How much more or less gold you had than your opponent."
Bad: "Percentage-based contribution to aggregate team elimination events."
Good: "The percentage of your team's kills you helped secure."
Do not replace technical jargon with vague explanations that provide no useful information.
Where an actual value is available and contextually appropriate, explanations may use it.
Interaction and design
Use consistent tooltip styling, placement, animation and dismissal behaviour.
Desktop should support appropriate hover and keyboard interactions.
Mobile should support tap interactions with easily dismissed explanations.
Prevent tooltips from being clipped, obscured or extending outside the viewport.
Avoid awkward nested scrolling or oversized tooltip panels.
Remove unnecessary tooltips
If a label can be made immediately understandable, improve the label rather than requiring an information icon.
Remove redundant explanations.
Do not create tooltips simply because a statistic exists.
The acceptance test is straightforward:
Can an ordinary League player understand the explanation immediately, without needing technical knowledge?
If not, rewrite or remove it.
7. Comprehensive Administration and Profile Management
Expand the existing administration system into a complete, secure and intuitive management experience.
Member self-service
Members should be able to manage appropriate aspects of their own profiles, including:

* Display names.
* Avatars.
* Supported personal settings.
* Other safe profile customisation.

Owner administration
The sole owner administrator should be able to manage member accounts comprehensively.
Include appropriate capabilities for:

* Editing usernames.
* Editing display names.
* Managing supported profile details.
* Updating avatars.
* Managing linked Riot accounts.
* Secure password resets.
* Activating, disabling and reactivating accounts.
* Revoking active sessions.
* Managing appropriate permissions.
* Reviewing administrative activity.
* Monitoring account and data synchronisation health.
* Safely retrying failed operations.

Preserve immutable internal identifiers and data relationships when names change.
Do not permit arbitrary modification of authentic Riot match statistics.
Protect the owner account from accidental deletion or privilege loss.
Never expose existing passwords or weaken authorisation controls.
Proactive admin improvements
Independently audit the existing administration system for genuinely useful missing capabilities.
Implement justified, low-risk improvements without requesting approval for every routine enhancement.
Do not add unnecessary controls merely to increase feature count.
Keep everyday tasks simple and advanced operations appropriately protected.
Admin design consistency
The admin area must meet the same premium visual and interaction standards as the rest of UNIIVERSE.
Review older admin screens that may have missed previous design improvements.
Ensure future shared design changes also apply to relevant admin interfaces.
Admin must never feel like a separate, outdated application.
8. Autonomous Development Philosophy
Operate proactively within the established product direction.
Do not repeatedly ask the owner whether to implement routine, justified improvements.
Independently identify opportunities to improve usability, functionality, consistency, reliability and maintainability.
Implement and deploy safe changes through the authorised development workflow.
However, autonomy does not override security or safety.
Require explicit authorisation for:

* Destructive production data operations.
* Irreversible migrations.
* Major permission or privacy changes.
* Unexpected expenditure.
* Actions outside the authorised development scope.

Preserve privacy-first behaviour, row-level security, secure authentication, backups, security headers and existing data protections.
Do not expose secrets, private databases, backups or sensitive information.
Use appropriate testing, feature branches, deployment verification and rollback procedures.
Respect infrastructure budgets and avoid unnecessarily expensive automated jobs.
The objective is minimal routine owner intervention, not an unrealistic guarantee of zero maintenance.
9. Implementation and Delivery Standards
Execute this work in coordinated, independently verifiable stages rather than one uncontrolled change.
Before declaring completion:

1. Reconcile previously submitted work.
2. Implement and integrate the requested improvements.
3. Validate functionality and data integrity.
4. Test desktop and mobile user journeys.
5. Verify the installed PWA.
6. Test permissions and privacy protections.
7. Verify responsive layouts and accessibility.
8. Review performance and infrastructure impact.
9. Confirm CI and deployment results.
10. Verify changes on the actual production application.

A merged pull request does not automatically mean a feature is live.
Provide a concise final status report distinguishing:

* Live and verified work.
* Partially completed work.
* Blocked work.
* Unimplemented requirements.
* Remaining evidence or data limitations.

Do not claim success without verification.
Final Product Standard
UNIIVERSE must feel like one complete, premium, modern application.
Desktop and mobile must deliver equally refined experiences.
Every interaction should feel natural, responsive and predictable.
Every statistic, explanation and tooltip should be useful and immediately understandable.
Every feature should prioritise player value over unnecessary complexity.
Administration should be comprehensive, secure and effortless.
Matchup Intel should provide reliable, evidence-driven guidance without fabricated confidence.
Previous design decisions should be challenged when better solutions exist.
The ultimate objective is a platform that looks exceptional, feels effortless to use, improves proactively and requires minimal routine intervention from its owner.
Proceed autonomously within the stated safeguards. Implement, validate and deploy rather than stopping at recommendations.
