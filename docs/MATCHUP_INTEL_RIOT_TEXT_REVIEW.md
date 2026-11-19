# Matchup Intel: the review of the facts from Riot's text

The reviewed table the facts from Riot's text (Matchup Intel's L3) were imported from, as the review
summarised it for the owner on 19 Nov 2026: Data Dragon 16.22.1, 1,223 drafts on 173 champions, 1,112
facts. It is kept here because the table itself lives outside the repository; what the app does with
it is in [MATCHUP_INTEL.md](MATCHUP_INTEL.md), "Facts from Riot's text".

**How it was made, and by whom.** Every draft was made by fixed rules from Riot's own text in Data
Dragon 16.22.1's `championFull.json` (a passive's description, a spell's description or tooltip, with
markup removed), read from a local file: nothing was fetched, and nothing was read from the League of
Legends Wiki or any Weird Gloop site. Two independent automated reviewers read every draft (they gave
the same decision on 1,178 of 1,223, 96.3%) and proposed additions of their own (34 accepted), an
automated adjudicator settled each batch (1,092 accepted), and a consistency pass across all nine
batches, which added, removed and changed facts, was checked by two further independent automated
checkers (5 objections, all upheld; 27 missed instances applied in their safe form), giving 1,112
facts. So not every fact is a draft of the rules: 61 came in as a reviewer's addition or with the
consistency pass. **No person has checked any of it.** The review recorded this as a sentence in every
file ("two independent automated reviews and an adjudicator, then a consistency pass checked by two
more; not checked by a person"). For the import (19 Nov 2026) that sentence was also written as data,
`"reviewRecord": {"automatedReviewers": 2, "adjudicated": true, "consistencyCheckers": 2, "checkedByPerson": false}`,
in every file and in its index: the record is the import's reading of the review's own sentence, not
something the review wrote. The page says so on every fact ("From Riot's ability text, reviewed
automatically (not by a person)") and states the process in its sources, from that record, for the
facts as a whole ("Reviewed by two independent automated reviewers and an adjudicator, then a
consistency pass checked by two more independent automated checkers; no person has checked them.").

**What the import checked** (`scripts/matchup-intel/import-riot-text.mjs`, 19 Nov 2026): all 173
files, all or nothing; the review record in every file and in the index; every ability's hashes
against Data Dragon 16.22.1's text cleaned exactly as the drafts were (1,557 hashes, all equal); every
clause, qualifier, `alsoDescribedAs` clause and disagreement clause verbatim on one line of the text
it names (1,205 spans, all present); no digit outside Riot's placeholders, which are stored as "[…]"
and never resolved. Nothing was refused and no fact was changed.

The sections below are the review's own words, with its working file names left out.

## Counts

- Champions: 173, every champion of Data Dragon 16.22.1, each with its own file in the table.
- Facts: 1,112, one per champion, slot and kind. Disagreements: 7.
- Markers: 68 facts carry a qualifier (4 of them from the other text, with `qualifierSource`), 44 are `conditional`, 4 carry both (cooldown refunds only), and 11 carry `alsoDescribedAs`.
- 224 clauses hold Riot placeholders (`{{ }}`). No clause, qualifier or quote holds a digit outside a placeholder.
- Slots with no fact: 212 of 865.

### From drafts to the final table

| Stage | Count |
|---|---|
| Drafts (rules v3 over Data Dragon 16.22.1) | 1,223 |
| Both reviewers accepted | 1,055 |
| Both reviewers rejected | 123 |
| Reviewers split | 45 (3 accepted by the adjudicator, all in batch 5; 42 rejected) |
| Reviewer additions (distinct, as adjudicated) | 46: 34 accepted, 12 rejected |
| Accepted after adjudication | 1,092 (1,055 + 3 disputed + 34 additions) |
| Rejected after adjudication | 177 (165 drafts, 12 additions) |
| Consistency pass | 27 facts added, 7 removed, 107 changed in place, 978 untouched |
| Final | 1,112 |

Reviewers' agreement: the two reviewers gave the same decision on 1,178 of 1,223 drafts (96.3%); they split on 45.

### Per batch

| Batch | Champions | Drafts | Agreement | Accepted (adjudicated) | Final facts |
|---|---|---|---|---|---|
| 0 | 20 | 135 | 128/135 (94.8%) | 120 | 122 |
| 1 | 20 | 143 | 140/143 (97.9%) | 125 | 127 |
| 2 | 19 | 149 | 146/149 (98.0%) | 131 | 133 |
| 3 | 19 | 153 | 146/153 (95.4%) | 131 | 135 |
| 4 | 19 | 132 | 129/132 (97.7%) | 113 | 115 |
| 5 | 19 | 128 | 122/128 (95.3%) | 124 | 124 |
| 6 | 19 | 120 | 114/120 (95.0%) | 108 | 114 |
| 7 | 19 | 141 | 133/141 (94.3%) | 125 | 129 |
| 8 | 19 | 122 | 120/122 (98.4%) | 115 | 113 |
| All | 173 | 1,223 | 1,178/1,223 (96.3%) | 1,092 | 1,112 |

### Per kind

| Group | Kind: facts |
|---|---|
| Crowd control on enemies (409) | slow 174, stun 65, knockup 43, knockback 34, root 30, pull 21, fear 8, silence 6, suppression 6, charm 4, flee 3, ground 3, nearsight 3, taunt 3, drowsy 2, sleep 2, blind 1, polymorph 1, disarm 0 |
| Mobility (144) | dash 85, leap 31, teleport 18, unstoppable 8, blink 2 |
| Defence (139) | shield 65, damagereduction 19, stealth 19, untargetable 15, cleanse 6, invulnerable 5, stasis 5, spellshield 2, tenacity 2, parry 1 |
| Sustain (109) | heal 94, regeneration 7, lifesteal 6, omnivamp 2 |
| Other (311) | recast 95, cooldownrefund 92, empower 80, transform 27, charges 12, toggle 5, reset 0 |

Kinds with no fact: disarm, reset.

## The consistency conventions

The consistency pass held the nine batches to seven conventions:

- **C1, one effect worded as two kinds.** Where Riot's description and tooltip word the same effect
  as two kinds of one family (one movement as a dash and a leap, a fear and a flee), one fact is kept,
  of the tooltip's kind, and the description's wording rides along as `alsoDescribedAs`, which is not
  a fact of its own ("keep-one"); a rejected row that was the one to keep is reinstated.
- **C2, Riot's two texts disagree.** Where the description and the tooltip state different effects
  for one ability (a knock-up against a knock-back), a disagreement is recorded with both quotes and
  no fact of either kind exists there; the other facts on that ability are cut so that they do not
  quote the disputed effect.
- **C3, a fact that holds only for a form, an upgrade, a condition or a recipient** the clause leaves
  out: a verbatim, number-free `qualifier` from the same ability's text ("Mega Gnar", "Max Ferocity",
  "nearby ally champions"); where no number-free span names it, `conditional: true`, which the app
  shows with its fixed marker "Conditional: see Riot's text".
- **C4, a cooldown refund of another ability:** the qualifier names the abilities whose cooldown is
  cut ("Mantra", "his other basic abilities"); a cooldown refund without one refunds the ability's
  own cooldown.
- **C5, counts:** an accepted clause holding a spelled-out count is swapped for a number-free clause
  of the same ability, and facts the reviewers named from number-free clauses are added.
- **C6, placeholders:** clauses keep Riot's `{{ }}` placeholders exactly; the app never resolves them.
- **C7:** everything else stays as the batches accepted it.

### How the pass was applied

The consistency proposal (115 changes) was applied except where a checker objected. The five objected changes were verified in the final pass; the instances the checkers found missed were applied in their safe form. The review kept a change log, one entry per change with its reason, with its working files (not in this repository).

| Convention | Changes |
|---|---|
| C1 | 11: 7 keep-one (proposal); 3 reinstate (proposal); 1 keep-one (checker correction) |
| C2 | 8: 7 disagreement (proposal); 1 cut before disputed effect (missed instance) |
| C3 | 83: 34 qualifier (proposal); 20 conditional (proposal); 10 qualifier (missed instance); 8 reinstate (proposal); 7 conditional (missed instance); 2 conditional (instead of qualifier) (checker correction); 1 conditional + clause cut before the disputed effect (checker correction); 1 qualifier (instead of conditional) (checker correction) |
| C4 | 20: 10 qualifier (proposal); 10 reinstate (proposal) |
| C5 | 20: 11 add (proposal); 5 replace counted clause (missed instance); 4 replace counted clause + conditional (missed instance) |
| C6 | none needed: 224 clauses keep their placeholders exactly |
| C7 | 978 facts untouched |

Facts removed (7): Briar R fear, Fizz E leap, Pantheon W dash, Yone R blink, Yone R knockup, Yone R pull, Zoe R blink.

Facts added (27): Aurelion Sol R slow, Bel'Veth W cooldownrefund, Evelynn P stealth, Fizz E dash, Hecarim R fear, Karma P cooldownrefund, Kha'Zix R recast, Kha'Zix W slow, Maokai E cooldownrefund, Master Yi R cooldownrefund, Nasus R cooldownrefund, Nunu & Willump E slow, Qiyana W cooldownrefund, Renata Glasc E shield, Renata Glasc E slow, Renekton E recast, Rengar W cleanse, Syndra E slow, Syndra Q charges, Tahm Kench Q stun, Vayne R cooldownrefund, Vex E cooldownrefund, Vi W cooldownrefund, Warwick E fear, Xin Zhao Q cooldownrefund, Yasuo R teleport, Zoe R teleport.

#### The checkers' objections (5), as verified

- **Fizz E (both checkers): upheld.** Both texts give E one movement and word it as one kind each (description "hops" / "jump again", tooltip "hops" / "dash again"). Keeping batch 8's leap and adding the dash recorded it under two kinds, each stated by one text. Applied C1: the leap is replaced by the tooltip's dash ("Fizz can Recast this Ability while Untargetable to dash again") with `alsoDescribedAs` leap ("Fizz can either slam the ground or choose to jump again before smashing back down."). Net 0 rows against batch 8.
- **Riven Q leap (consistency checker): upheld.** The marked leap kept quoting "Knocks Up", the disputed effect. The clause is now "Recast: Riven leaps forward and slams", still `conditional` (only the last recast leaps).
- **Sion W recast (consistency checker): upheld.** The tooltip names the condition without a number, so C3 takes the qualifier: "if the shield still holds" (`qualifierSource: tooltip`) instead of `conditional`. The recast delay is a number in both texts and is not named.
- **Dr. Mundo P and Pantheon Q cooldown refunds (accuracy checker): upheld.** Both refund the ability's own cooldown; on a cooldown refund the qualifier names the refunded abilities, so their C3 qualifiers ("Dr. Mundo resists the first Immobilizing effect that hits him", "Tap") would have read as the refunded ability. Both are `conditional` instead.

#### Instances the checkers found missed, as applied

- Kha'Zix P slow (C3, both checkers): qualifier "When Kha'Zix is not visible to the enemy team". The clause starts after its trigger; Unseen Threat exists only while he is unseen.
- Kha'Zix P empower (C3, both checkers): qualifier "When Kha'Zix is not visible to the enemy team". Same sentence and trigger as the slow row.
- Evelynn W slow (C3, both checkers): qualifier "If Evelynn hits the target with an Attack or Ability". The slow comes only when she hits the marked target; the clause starts after that condition.
- Caitlyn W empower (C3, both checkers): qualifier "a trap that, when sprung, reveals and immobilizes the enemy champion". The empowered Headshot comes from a sprung trap; the clause starts after it. The consistency checker's span is used (it contains the accuracy checker's 'when sprung' and says what is sprung and on whom).
- Renata Glasc Q stun (C3, consistency checker): qualifier "Recast". The stun is the recast's (the throw); the clause starts after the tooltip's 'Recast:' label. The label is used, as 'Mounted' and 'Max Ferocity' are.
- Ashe R slow (C3, consistency checker (lower confidence)): qualifier "If the arrow collides with an enemy Champion". 'In addition' depends on the collision named in the sentence before (as Naafiri R's shield depends on the takedown).
- Jarvan IV Q knockup (C3, consistency checker (lower confidence)): qualifier "If the lance connects with Demacian Standard" (tooltip). The pull to the Standard and its knock-up happen only if the lance reaches the Demacian Standard; the description's 'Additionally' reads as every cast. The tooltip names the condition, so qualifierSource is set.
- Jarvan IV Q dash (C3, consistency checker (lower confidence)): qualifier "If the lance connects with Demacian Standard" (tooltip). The pull to the Standard and its knock-up happen only if the lance reaches the Demacian Standard; the description's 'Additionally' reads as every cast. The tooltip names the condition, so qualifierSource is set.
- Nilah R shield (C3, accuracy checker): qualifier "Nilah and her nearby allies". The overheal shield goes to Nilah and her nearby allies; the clause names no recipient (as Yuumi-R-1).
- Yuumi E shield (C3, accuracy checker (weaker case)): qualifier "If she's attached, she passes it to her ally instead". The clause names only Yuumi; while attached the shield goes to her ally. The description's next sentence says so.
- Udyr W lifesteal (C3, both checkers): conditional. The Life Steal is on Udyr's next attacks only; that subject holds the count 'two', so no span names it.
- Urgot R fear (C3, consistency checker): conditional. The fear follows only the execution recast on a victim below a health threshold. The suggested qualifier 'If that champion falls below a health threshold' (description) names only part of it (the recast is also needed) and its 'that champion' points outside the span, so the safe marker is used.
- Shaco R fear (C3, consistency checker): conditional. The fear comes from the mini Jack in the Boxes that spawn when the clone dies. The suggested spans ('detonates when it dies', 'Upon death, it explodes') name the clone only as 'it', so the safe marker is used.
- Fizz E slow (C3, consistency checker): conditional. Same shape as K'Sante W (whose markers stay): the optional recast ends the effect early and 'doesn't Slow'. No span names the no-recast case.
- Ryze W slow (C3, consistency checker (named under Fizz E)): conditional. Same shape: on a target with Flux the ability roots instead of slowing. No span names the no-Flux case.
- Jayce R empower (C3, accuracy checker (lower confidence)): conditional. The quoted shred is the Mercury Hammer side only (the description's Cannon Stance side gives bonus magic damage instead). The label 'Mercury Hammer' could be read as the hammer's next attack, while the shred is on the cannon's first attack after the switch, so the safe marker is used.
- Nunu & Willump E root (C3, accuracy checker (lower confidence; proposer unsure)): conditional. The description roots champions 'hit by a snowball'; the tooltip roots enemies 'Slowed by the snowballs', and the slow needs every snowball of a throw to hit (a count). Same kind, different condition: marked.
- Gragas E dash (C2, consistency checker (also the accuracy checker)): clause now "Gragas charges to a location and collides with the first enemy unit he comes across" (description). The dash row quoted 'and stunning them', the effect Gragas-E-1 records as disputed. Cut to the description's own verbatim span (same source, as the consistency checker proposed).
- Hecarim Q cooldownrefund (C5, both checkers): clause now "If this Ability hits, he gains a stack that decreases its Cooldown by {{ rampagecooldownreduction }} seconds and increases its damage by {{ rampagebonusdamageperc }}% for {{ buffduration }} seconds." (tooltip). 'at least one' replaced by the tooltip's number-free sentence, which keeps the condition ('If this Ability hits'). Own cooldown: no C4 qualifier.
- Kalista E cooldownrefund (C5, both checkers): clause now "its Cooldown is refreshed and it refunds {{ manarefund }} Mana." (tooltip); conditional. 'at least one' cut away; the cut drops the kill condition, so conditional: true (as Renekton-E-1).
- Tahm Kench W cooldownrefund (C5, both checkers): clause now "refunds {{ champrefund*100 }}% of the Cooldown and Mana cost." (tooltip); conditional. 'at least one' cut away; the cut drops the hit-a-champion condition, so conditional: true (as Renekton-E-1).
- Thresh Q dash (C5, both checkers): clause now "Thresh can Recast this Ability to pull himself to the enemy." (tooltip). 'a second time' (twice) replaced by the tooltip's number-free sentence for the same self-pull (kind kept, C7).
- Sivir E spellshield (C5, both checkers): clause now "Sivir creates a magical barrier for {{ spellshieldduration }} seconds that blocks the next incoming enemy Ability." (tooltip). 'a single enemy ability' replaced by the tooltip's number-free sentence (as Nocturne W).
- Azir E dash (C5, both checkers (they differ on the dash)): clause now "Azir shields himself briefly and dashes" (description); conditional. 'one of his Sand Soldiers' (a count) cut away: the description's own 'Azir shields himself briefly and dashes' states both kinds (accuracy checker). The cut drops the dash's destination (a Sand Soldier), so the dash is marked conditional; the consistency checker held the dash has no number-free clause, and the marker covers that.
- Azir E shield (C5, both checkers (they differ on the dash)): clause now "Azir shields himself briefly and dashes" (description). 'one of his Sand Soldiers' (a count) cut away: the description's own 'Azir shields himself briefly and dashes' states both kinds (accuracy checker).
- Sett E slow (C5, consistency checker): clause now "they are slowed instead of stunned." (description); conditional. 'only on one side' cut away. The checker's tooltip sentence was not used: it slows in every case, which the description contradicts (slowed 'instead of stunned'), so it is not what both texts say. The description's own number-free 'they are slowed instead of stunned.' agrees with both; it drops the condition, so conditional: true.
- Shaco R fear (C5, both checkers (count lists)): clause now "and Fear for {{ boxfearduration }} second." (tooltip). 'if firing at only one enemy' (a count) cut away: the clause is now the sentence's number-free tail 'and Fear for {{ boxfearduration }} second.' ('second' is the unit). It loses its subject, the mini Jack in the Boxes; the conditional marker stays and the full tooltip is one tap away.

## Verification

Run over the final table by two independent verification scripts of the review (one over the drafts' cleaned text, one over the raw `championFull.json`):

- Every clause (1,112), qualifier (68), `alsoDescribedAs` clause (11) and disagreement clause (14) is verbatim, on one line, in its stated source in Data Dragon 16.22.1 with markup removed as in the drafts (the drafts' text equals rules-v3 `prepare()` output for all 173 champions). A second cleaner (Python `html.parser` over the raw `championFull.json`) agrees for all 1,205 spans, in 16.22.1 and in 16.23.1.
- No digit outside `{{ }}`. No spelled-out count from the check's list (cardinal numbers, "once" as a count, "twice", "thrice", ordinals from "third" up, "pair", "couple", "dozen", "single", "triple"), with two reviewed exceptions: Volibear Q stun's "the first one he Attacks" (a pronoun) and Gwen R slow's "A Thousand Cuts" (her passive's name). Ambessa P's "once the ability is cast" means "when". The count-like words the batches ruled count-free are listed under "For the owner".
- One fact per (champion, slot, kind); every kind, `alsoDescribedAs` kind and disagreement kind is in the vocabulary; clauses have 3 to 30 words and qualifiers at most 12.
- No fact of a disputed kind on a disagreement slot, and no fact there quotes the disputed effect.
- No cooldown refund whose clause names the ability's own cooldown ("this Ability's Cooldown", "its Cooldown", "the Cooldown and Mana cost") carries a qualifier; Dr. Mundo P and Pantheon Q were the two cases, now `conditional`.

## Champions with few facts

Champions by number of facts: 1: 1; 2: 7; 3: 12; 4: 23; 5: 24; 6: 34; 7: 13; 8: 21; 9: 16; 10: 11; 11: 8; 12: 1; 14: 1; 18: 1. Mean 6.43 facts per champion.

- 1 fact: Kog'Maw.
- 2 facts: Aphelios, Brand, Corki, Ezreal, Jinx, Miss Fortune, Veigar.
- 3 facts: Ashe, Karthus, Katarina, Kennen, Lillia, Malzahar, Orianna, Smolder, Twitch, Xayah, Yunara, Zyra.

Nothing was added to fill them. A short list means that few clauses of their abilities' texts state a kind in the vocabulary and passed the review; it does not mean the abilities lack such effects.

## For the owner

Every flag from the adjudicators' notes, the consistency proposal's list of unsure cases, the two checkers and the final pass, deduplicated. Open items come first; the last list shows the flags the consistency pass settled, so each one can be traced.

### Open: decisions only you can make

1. **Count-like words the batches ruled count-free (11 facts, kept unchanged; no number-free clause states them).** Your rule lists "third" as a count, so you may read the ordinal "second" as one too. If you do, these facts go:
   - ordinal "second": Akshan E recast ("Second Cast: Akshan swings around the terrain, repeatedly firing at the nearest enemy"), Wukong R recast ("This Ability can be cast a second time within {{ recastwindow }} seconds before going on cooldown."), Naafiri R shield ("The second cast grants a shield."), Fiora E slow and empower ("The first attack slows the target, and the second attack will critically strike."), Riven Q recast ("The first Recast is the same as the original, but the second has a different effect:");
   - "both": Zac Q knockup ("... he Knocks Up both towards each other."), Bard Q stun ("... if it strikes another enemy, it will stun them both.");
   - "half": Camille W slow and heal ("Enemies in the outer half are slowed ...");
   - "double": Lucian P empower ("... his next attack becomes a double-shot."), Lucian's only passive fact.
   - Read as no count and kept: "first" in 55 quotes ("the first enemy hit": which enemy, not how many); Volibear Q stun's "the first one he Attacks" (a pronoun; the tooltip's number-free "Stuns the target" could replace it); Gwen R slow's "A Thousand Cuts" (her passive's name); Ambessa P dash and empower, "once the ability is cast" (meaning "when").
2. **C5 used on accepted rows, beyond its letter (16 facts).** Accepted clauses that held a spelled-out count were swapped for a number-free clause of the same ability: 7 in the proposal (Darius R, Naafiri R and Twisted Fate W recast; Udyr W shield, heal and recast; Udyr E recast) and 9 here (Hecarim Q, Kalista E and Tahm Kench W cooldown refunds; Thresh Q dash; Sivir E spell shield; Azir E dash and shield; Sett E slow; Shaco R fear). Neither checker objected, because your rule lists "once". If you would rather keep the old clauses, these are the facts to revert, and the count goes back with each one. Four of the nine cuts drop their condition and carry `conditional` (Kalista E, Tahm Kench W, Azir E dash, Sett E slow). Shaco R's new quote ("and Fear for {{ boxfearduration }} second.") has lost its subject: the whole sentence holds "if firing at only one enemy". For Sett E, the checker's tooltip sentence was not used. It slows in every case, but the description says enemies are "slowed instead of stunned" only when they are on one side, so the fact quotes the description's "they are slowed instead of stunned." with the marker.
3. **Fizz E.** One dash row (the tooltip's "dash again", also described as the description's "jump again") replaces batch 8's leap, as C1 requires (both checkers). If you read the recast as a separate move, restore the leap alone, never both. Like the old leap, the dash quote names no destination. Batch 4 rejected Xayah R's leap for that.
4. **Markers that follow the same shape as K'Sante W.** K'Sante W's stun and knockback are marked `conditional` because All Out removes them. By the same logic, Fizz E's slow (the recast "doesn't Slow") and Ryze W's slow (Flux turns it into a root) are marked too. Drop all four markers if the base form needs none.
5. **Cooldown refunds with both a qualifier and the marker** (Maokai E, Vi W, Taric P, Xin Zhao Q). The qualifier names the refunded ability and the marker covers the condition. Taric P and Xin Zhao Q are fragments whose subject (the empowered attacks) was cut away with a count. If you reject such fragments, both go.
6. **Renekton E recast** carries the marker. Reviewer A's "Hitting at least one enemy allows Renekton to Recast this Ability" would state the condition if "at least one" counts as no count.
7. **Tahm Kench Q stun** was reinstated with the marker, and its clause starts at the pronoun "they".
8. **Kind readings left for your tier-2 review:**
   - Tristana W: dash or leap? No fact for her movement.
   - Taliyah W: knock-back or pull? No fact.
   - Aurora R: the description's "teleport" is not recorded; the tooltip calls the same move a jump.
   - Thresh Q: "binds" in the description against "Stunning" in the tooltip, not recorded as a disagreement.
   - Ekko R and Lissandra R: "untargetable" and "invulnerable" against "Stasis", read as agreeing.
   - Talon E: "vaults" against "cannot dash", C1 not applied.
   - Cross-batch readings: "lunge(s)" counts as a dash for Kalista P, Elise Q, Fiora Q and Warwick Q, but not for Rek'Sai R or Sylas W. "flies" counts as a dash for Corki W, but not for Galio R, Aurelion Sol W or Briar R. "tumbles" is a dash for Vayne Q but not for Kindred Q. "blasting himself backwards" is a dash for Graves R, but "knocks Caitlyn back" was rejected for Caitlyn E. "knocking them aside" is a knock-back for Draven E but not for Vi R. "pulls Thresh to the enemy" is a dash, but "pulls Nautilus towards it" was rejected.
   - Zoe E and Locke R are read as refunds of their own cooldown, with no C4 qualifier.
9. **Riot's two texts name different conditions for the same kind.** Each fact is marked `conditional`:
   - Nunu E root: the description says champions "hit by a snowball"; the tooltip says enemies "Slowed by the snowballs", which needs every snowball of a throw to hit.
   - Sett E slow: see item 2.
10. **Qualifier choices you may prefer to make differently.** Each was the safe option:
    - Caitlyn W empower: "a trap that, when sprung, reveals and immobilizes the enemy champion". The other checker offered "when sprung", or the tooltip's "Targets rooted by this Ability".
    - Urgot R fear is marked `conditional`. The description's "If that champion falls below a health threshold" names only part of the condition, and its "that champion" points outside the span.
    - Shaco R fear is marked `conditional`. "detonates when it dies" names the clone only as "it".
    - Jayce R empower is marked `conditional`. The label "Mercury Hammer" could read as the hammer's attack, but the shred lands on the cannon's first attack after the switch.
    - Renata Q stun has the label "Recast". The other option was "Recast: Renata Pulls the enemy in a direction".
11. **Possible further C3 cases seen in this final pass, not changed (no checker named them):**
    - Zaahen Q heal: the clause starts after "Zaahen slashes twice on his next attack,".
    - Udyr E dash: "Udyr's Attacks dash him to the target and Stun" leaves out the per-target cooldown. The description's stun says "his first attack against each target".
    - Yorick R recast: the delay before the recast ("After 10 seconds") is a digit, as Sion W's delay is.
12. **Rejected rows that a reviewer's reasons improved but nobody proposed, so they were not reinstated:**
    - Yuumi R heal: both reviewers named "Ally champions are healed for ... health per wave."
    - Zyra E slow: reviewer B named the description's Vine Lasher sentence.

### Open: quote quality (kept as the rules require)

- Fragments:
  - Warwick R heal, "Warwick heals for".
  - Nidalee P empower, which starts in the middle of a bracket.
  - Gragas W empower, which starts on "brew,".
  - Twisted Fate W empower, "cards and enhance his next Attack.", which starts at the noun left after "one of three".
  - Vel'Koz Q recast, "on reactivation or upon hitting an enemy.".
  - Kled R knockback, "(based on distance travelled) and briefly Knocking Back.".
  - The charge fragments "charges ({{ ... }} second refresh)." on Kalista W, Vel'Koz W, Vi E and Jhin E, and Zyra W's "charges with a ...".
- Evelynn P heal ends "and grants Camouflage" without "after level 6". Both reviewers suggested ending at "health". The stealth fact carries the marker.
- Braum P and Kennen P stun are cut before their stack and hit counts. They are now marked, and reviewer B asked that the page show them as cut quotes.
- Placeholders whose names name another kind: Nilah Q heal holds {{ critlifesteal }}, and Diana R pull holds two placeholders named for slow (its sentence states the slow in words).
- Riven P empower is the first empower that rests on its meaning rather than on "empower", "enhance" or "next".
- Kindred R heal's quote says "units are healed". Its qualifier, "all living things inside a zone", is the only sign that enemies inside are healed too (the tooltip: "all units inside heal").

### Data and tooling notes

- 16.22.1 → 16.23.1: only Mel W's tooltip text changed ("{{ buffduration }}s" became "{{ buffduration }} seconds"). No fact quotes it, but its tooltipHash will differ. Syndra E's cooldown array changed, while its text did not.
- The drafter's NUMBER_WORD list (rules-v3.mjs) lacks "once", "pair", "couple", "single" and "one", which is how these counts reached the drafts.
- Evidence strings in the proposal and the change log quote Riot's numbers to show why a condition could not be a qualifier. They are review material, never display text.

### Settled by the consistency pass (traceability)

- Udyr's four "a couple seconds" quotes now use number-free clauses (C5).
- Kha'Zix R recast and Renata E slow and shield were added from the number-free clauses the reviewers named (C5).
- One row each, by C1: Briar R (flee), Pantheon W (leap), Zoe R and Yasuo R (teleport), Hecarim R and Warwick E (fear), Yone R (teleport), Camille R (leap), Camille E (dash), Pyke R (teleport) and Fizz E (dash).
- Disagreements recorded, by C2: Camille E, Gragas E, Janna Q, Riven Q, Sion R, Yone R and Zac R. The Gragas E dash and Riven Q leap quotes are now cut before the disputed effect, as Yone R's and Camille E's are.
- Forms, conditions and recipients named or marked, by C3: Aurelion Sol R (Falling Star, The Skies Descend), Gnar W, E and R (Mega or Mini Gnar), Kindred R, Milio R, Yuumi R, Warwick P, Yasuo Q, Yone Q, Fiora R, Annie P, Viego Q, Rengar W, Syndra Q and E, Tahm Kench Q, and the checkers' missed instances.
- Refunds of another ability's cooldown name that ability, by C4 (20 facts): Kayn R, Rek'Sai R, Zilean W, Sivir R and six more accepted rows now carry the qualifier, and Master Yi R, Nasus R, Karma P and seven more rejected rows were reinstated with it.

## For the app

The table is one file per champion (`champions/<championId>.json`, one for every champion of Data Dragon 16.22.1) and `_index.json` (each champion's fact and disagreement counts), with `DONE` beside them; since 19 Nov 2026 each file and the index also carry the structured `reviewRecord` (below).

- **Placeholders are never resolved.** Clauses, qualifiers, `alsoDescribedAs` clauses and disagreement clauses keep Riot's `{{ ... }}` placeholders exactly. The app must never turn them into numbers, whether from `effectBurn`, `datavalues`, `vars` or any other field. Twisted Fate W's `{{ e3 }}` and R's `{{ e4 }}` and `{{ e1 }}` would resolve from effectBurn into numbers. Show a placeholder as Riot's own token, or as one neutral mark, and never compute with it. Some placeholder names contain digits (`{{ spell.vipassive:cdreductionon3hit }}`, `{{ maxduration.1 }}`). Those digits are part of the name, not a number to show. No clause holds a digit outside a placeholder.
- **A fact** is `{slot, kind, clause, source, alsoDescribedAs?, qualifier?, qualifierSource?, conditional?}`. There is one fact per (slot, kind), sorted by slot (P, Q, W, E, R) and then by kind, alphabetically. `clause` is verbatim from `source` (`description` or `tooltip`) of that slot. Show the kind as the chip and the clause as Riot's words, quoted, and never paraphrase either.
- **`qualifier`** is a verbatim, number-free span (at most 12 words) of the same ability's text. On every kind except `cooldownrefund`, it names the form, upgrade, condition or recipient that the clause leaves out ("Mega Gnar", "Max Ferocity", "nearby ally champions", "If the spirit dies or the target leaves its range"). Show it with the fact, in Riot's words, so the fact reads as holding only then or only for them. On `cooldownrefund`, the qualifier names the abilities whose cooldown is cut ("Mantra", "his other basic abilities"). A cooldown refund without a qualifier refunds the ability's own cooldown.
- **`qualifierSource`** appears only when the qualifier comes from the slot's other text (4 facts: Jarvan IV Q dash and knockup, Sion W recast, Vladimir Q empower). Otherwise the qualifier comes from the fact's own `source`.
- **`conditional: true`** means the fact holds only under a condition that no number-free span names. Show the fixed marker "Conditional: see Riot's text", with the quote one tap away, and never write a condition of your own. On a `cooldownrefund` row it can sit beside a qualifier (Maokai E, Taric P, Vi W, Xin Zhao Q). There the qualifier names the refunded ability and the marker stands for the condition.
- **`alsoDescribedAs: {kind, source: "description", clause}`** means Riot's description words the same effect with another kind of the same family (one movement, or fear and flee). It is not a fact of its own. Do not count it, filter on it or show a second chip for it. Show it as "also described as <kind>", with its quote. The fact itself is the tooltip's wording (11 facts).
- **`disagreements: [{slot, description: {kind, clause}, tooltip: {kind, clause}}]`** means Riot's two texts state different effects for that slot (7: Camille E, Gragas E, Janna Q, Riven Q, Sion R, Yone R, Zac R). No fact of either kind exists there. Say that Riot's two texts differ, show both quotes, and never pick one. The other facts on those slots are cut so that they do not quote the disputed effect.
- **Change detection.** `abilityText.<slot>` holds `name`, `descriptionHash` and `tooltipHash`: the sha256 (hex, UTF-8) of the exact description and tooltip strings with markup removed as in the drafts (the drafting rules' `prepare(raw).text`, lines joined by `\n`). `tooltipHash` is `null` for passives, which have no tooltip. Clean the live patch's text the same way and compare. When a hash differs, the facts quoting that text were checked against older text and must read as changed since the check, or be hidden; treating the whole slot that way is the cautious choice. Against 16.23.1 only Mel W's tooltip differs, and Mel W's one fact (shield) quotes the unchanged description.
- **Empty is not "none".** A slot with no fact means only that no fact passed the review, not that the ability has no crowd control, mobility or defence. 212 of 865 slots have no fact.
- **Provenance line.** Every file carries `version` ("16.22.1"), `reviewedAt` ("2026-11-19") and `review` ("two independent automated reviews and an adjudicator, then a consistency pass checked by two more; not checked by a person"). Show the last one where the page explains its sources.
- **The review record** (added on 19 Nov 2026 for the import, the same in every file and in `_index.json`): `"reviewRecord": {"automatedReviewers": 2, "adjudicated": true, "consistencyCheckers": 2, "checkedByPerson": false}`, beside the sentence above, which it states as data. Nothing else in the table changed with it.
