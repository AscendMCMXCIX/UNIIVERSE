# Matchup Intel: roster audit

What Matchup Intel can show for each of the 173 champions in any matchup, from the committed data (Data Dragon 16.22.1's abilities, the 1,112 reviewed facts from Riot's text) and Riot's tips at Data Dragon 16.23.1. Made by `scripts/matchup-intel/roster-audit.ts` on 23 Nov 2026; run it again after an import or a patch.

## Summary

| Measure | Champions |
|---|---|
| A cooldown shown for all four basic abilities | 124 of 173 |
| At least one basic ability without a cooldown shown (the guard's reason in the table) | 49 |
| Reviewed facts from Riot's text | 173 of 173 (median 6 a champion) |
| No crowd-control fact recorded | 10 |
| No mobility fact recorded | 74 |
| Riot's tips (ally and enemy) | 149 of 173 |
| Curated notes (AI reviewers, owner-approved rule) | 6 of 173 |

## What every matchup has, and what only curated ones have

- **Every pair:** each ability's base cooldowns where Riot's data gives a true one (the guard below), the cooldown at a chosen ability haste, the kinds of mechanic Riot's own ability text names (crowd control, mobility, defence, sustain, power), each with its clause, labelled "reviewed automatically (not by a person)", Riot's tips (quoted and dated), and the team's own games.
- **Only curated pairs (3) and champions (6):** trading windows, threats and opportunities in words, level spikes and ability interactions. These need a source that states them (the wiki, read by a person or with its consent): Riot's data does not, so they are not assembled for other pairs, and nothing is inferred.
- **With OD4's high-elo statistics (once compliant):** observed choices and results, with samples, for every champion with enough games.

## Gaps to work on, in order

1. **Abilities without a cooldown shown (49 champions).** Riot's data gives no true cooldown there (charges, two abilities in one slot, a picked-up spell, a known wrong value). Only a checked source can fill them: they stay "Cooldown not in Riot's data" until then.
2. **Champions with no crowd-control or mobility fact (2).** Either the kit has none in Riot's text, or the review left a fact out; a person's review of those files (owner's step 11) would settle which.
3. **Curated notes beyond the top lane.** Jungle, Mid, ADC and Support have none; each new champion's notes follow the existing rules (sources, patch, AI-reviewed label, owner approval).

## Every champion

| Champion | Cooldowns shown | Without | Facts | Crowd control | Mobility | Defence | Sustain | Tips | Curated |
|---|---|---|---|---|---|---|---|---|---|
| Aatrox | 4/4 | — | 9 | 3 | 1 | 0 | 2 | 6 | — |
| Ahri | 4/4 | — | 4 | 1 | 1 | 0 | 1 | 5 | — |
| Akali | 4/4 | — | 8 | 1 | 3 | 1 | 0 | 5 | — |
| Akshan | 4/4 | — | 5 | 0 | 0 | 2 | 0 | 1 | — |
| Alistar | 4/4 | — | 7 | 3 | 0 | 2 | 1 | 6 | — |
| Ambessa | 3/4 | Q (two-abilities-in-ddragon) | 10 | 3 | 2 | 2 | 1 | 0 | yes |
| Amumu | 3/4 | Q (charges-in-ddragon) | 6 | 2 | 1 | 1 | 0 | 6 | — |
| Anivia | 4/4 | — | 6 | 3 | 0 | 0 | 0 | 6 | — |
| Annie | 4/4 | — | 4 | 1 | 0 | 1 | 0 | 6 | — |
| Aphelios | 2/4 | Q (several-abilities-in-ddragon), E (no-number-in-ddragon) | 2 | 1 | 0 | 0 | 0 | 2 | — |
| Ashe | 2/4 | Q (no-number-in-ddragon), E (charges-in-ddragon) | 3 | 3 | 0 | 0 | 0 | 5 | — |
| AurelionSol | 3/4 | R (two-abilities-in-ddragon) | 7 | 4 | 0 | 0 | 0 | 0 | — |
| Aurora | 4/4 | — | 10 | 2 | 3 | 1 | 1 | 0 | — |
| Azir | 3/4 | W (charges-in-ddragon) | 5 | 2 | 1 | 1 | 0 | 7 | — |
| Bard | 3/4 | W (charges-in-ddragon) | 6 | 3 | 0 | 1 | 1 | 6 | — |
| Belveth | 4/4 | — | 9 | 3 | 1 | 1 | 1 | 0 | — |
| Blitzcrank | 4/4 | — | 5 | 3 | 0 | 1 | 0 | 4 | — |
| Brand | 4/4 | — | 2 | 2 | 0 | 0 | 0 | 6 | — |
| Braum | 4/4 | — | 6 | 4 | 1 | 1 | 0 | 6 | — |
| Briar | 3/4 | W (two-abilities-in-ddragon) | 14 | 5 | 2 | 1 | 4 | 0 | — |
| Caitlyn | 3/4 | W (charges-in-ddragon) | 4 | 2 | 0 | 0 | 0 | 5 | — |
| Camille | 4/4 | — | 10 | 2 | 2 | 2 | 1 | 4 | — |
| Cassiopeia | 4/4 | — | 5 | 4 | 0 | 0 | 1 | 4 | — |
| Chogath | 4/4 | — | 5 | 4 | 0 | 0 | 1 | 6 | — |
| Corki | 3/4 | R (charges-in-ddragon) | 2 | 0 | 1 | 0 | 0 | 5 | — |
| Darius | 4/4 | — | 10 | 4 | 1 | 0 | 1 | 5 | — |
| Diana | 4/4 | — | 5 | 2 | 1 | 1 | 0 | 6 | — |
| Draven | 4/4 | — | 5 | 2 | 0 | 0 | 0 | 4 | — |
| DrMundo | 4/4 | — | 10 | 1 | 0 | 0 | 6 | 5 | — |
| Ekko | 4/4 | — | 11 | 3 | 3 | 3 | 1 | 6 | — |
| Elise | 1/4 | Q (two-abilities-in-ddragon), W (two-abilities-in-ddragon), E (two-abilities-in-ddragon) | 4 | 1 | 1 | 0 | 1 | 6 | — |
| Evelynn | 4/4 | — | 11 | 2 | 2 | 2 | 1 | 6 | — |
| Ezreal | 4/4 | — | 2 | 0 | 1 | 0 | 0 | 6 | — |
| Fiddlesticks | 4/4 | — | 6 | 3 | 1 | 0 | 1 | 0 | — |
| Fiora | 4/4 | — | 9 | 3 | 1 | 1 | 2 | 4 | — |
| Fizz | 3/4 | E (two-abilities-in-ddragon) | 11 | 4 | 2 | 2 | 0 | 5 | — |
| Galio | 4/4 | — | 8 | 3 | 1 | 3 | 0 | 6 | — |
| Gangplank | 3/4 | E (charges-in-ddragon) | 4 | 2 | 0 | 1 | 1 | 5 | — |
| Garen | 4/4 | — | 8 | 1 | 0 | 4 | 1 | 7 | — |
| Gnar | 1/4 | Q (two-abilities-in-ddragon), W (two-abilities-in-ddragon), E (two-abilities-in-ddragon) | 9 | 6 | 1 | 0 | 0 | 6 | — |
| Gragas | 4/4 | — | 8 | 2 | 1 | 1 | 1 | 5 | — |
| Graves | 4/4 | — | 5 | 2 | 2 | 0 | 0 | 4 | — |
| Gwen | 4/4 | — | 8 | 1 | 1 | 1 | 1 | 6 | yes |
| Hecarim | 4/4 | — | 6 | 2 | 1 | 0 | 1 | 4 | — |
| Heimerdinger | 3/4 | Q (charges-in-ddragon) | 5 | 2 | 0 | 0 | 0 | 5 | — |
| Hwei | 4/4 | — | 11 | 6 | 0 | 1 | 0 | 5 | — |
| Illaoi | 4/4 | — | 4 | 1 | 1 | 0 | 1 | 8 | — |
| Irelia | 4/4 | — | 7 | 2 | 1 | 1 | 1 | 6 | — |
| Ivern | 3/4 | W (charges-in-ddragon) | 8 | 3 | 1 | 1 | 0 | 6 | — |
| Janna | 4/4 | — | 6 | 2 | 0 | 1 | 1 | 6 | — |
| JarvanIV | 4/4 | — | 6 | 2 | 2 | 1 | 0 | 5 | — |
| Jax | 4/4 | — | 5 | 1 | 1 | 1 | 0 | 4 | — |
| Jayce | 0/4 | Q (two-abilities-in-ddragon), W (two-abilities-in-ddragon), E (two-abilities-in-ddragon), R (two-abilities-in-ddragon) | 5 | 2 | 1 | 0 | 0 | 6 | — |
| Jhin | 3/4 | E (charges-in-ddragon) | 4 | 3 | 0 | 0 | 0 | 6 | — |
| Jinx | 4/4 | — | 2 | 2 | 0 | 0 | 0 | 6 | — |
| Kaisa | 4/4 | — | 5 | 0 | 1 | 2 | 0 | 6 | — |
| Kalista | 2/4 | W (charges-in-ddragon), E (no-number-in-ddragon) | 6 | 2 | 1 | 1 | 0 | 6 | — |
| Karma | 4/4 | — | 6 | 2 | 0 | 1 | 1 | 6 | — |
| Karthus | 3/4 | Q (charges-in-ddragon) | 3 | 1 | 0 | 0 | 0 | 4 | — |
| Kassadin | 4/4 | — | 6 | 1 | 1 | 2 | 0 | 6 | — |
| Katarina | 4/4 | — | 3 | 0 | 1 | 0 | 0 | 5 | — |
| Kayle | 4/4 | — | 4 | 1 | 0 | 1 | 1 | 6 | — |
| Kayn | 4/4 | — | 11 | 2 | 1 | 1 | 3 | 5 | — |
| Kennen | 4/4 | — | 3 | 1 | 0 | 0 | 0 | 5 | — |
| Khazix | 4/4 | — | 9 | 2 | 1 | 1 | 1 | 5 | — |
| Kindred | 4/4 | — | 6 | 1 | 1 | 0 | 2 | 6 | — |
| Kled | 4/4 | — | 7 | 3 | 1 | 1 | 0 | 6 | — |
| KogMaw | 4/4 | — | 1 | 1 | 0 | 0 | 0 | 7 | — |
| KSante | 4/4 | — | 18 | 6 | 3 | 3 | 1 | 6 | — |
| Leblanc | 3/4 | R (charges-in-ddragon) | 5 | 1 | 1 | 1 | 0 | 7 | — |
| LeeSin | 1/4 | Q (two-abilities-in-ddragon), W (two-abilities-in-ddragon), E (two-abilities-in-ddragon) | 10 | 3 | 2 | 1 | 1 | 6 | — |
| Leona | 4/4 | — | 7 | 4 | 1 | 1 | 0 | 5 | — |
| Lillia | 4/4 | — | 3 | 3 | 0 | 0 | 0 | 0 | — |
| Lissandra | 4/4 | — | 11 | 5 | 1 | 3 | 1 | 6 | — |
| Locke | 4/4 | — | 9 | 2 | 2 | 0 | 1 | 0 | — |
| Lucian | 4/4 | — | 4 | 0 | 1 | 0 | 0 | 7 | — |
| Lulu | 4/4 | — | 5 | 4 | 0 | 1 | 0 | 4 | — |
| Lux | 4/4 | — | 5 | 2 | 0 | 1 | 0 | 5 | — |
| Malphite | 4/4 | — | 6 | 2 | 1 | 2 | 0 | 4 | — |
| Malzahar | 4/4 | — | 3 | 2 | 0 | 1 | 0 | 6 | — |
| Maokai | 4/4 | — | 10 | 5 | 1 | 1 | 1 | 6 | — |
| MasterYi | 4/4 | — | 6 | 0 | 1 | 2 | 1 | 6 | — |
| Mel | 4/4 | — | 4 | 2 | 0 | 1 | 0 | 4 | — |
| Milio | 3/4 | E (charges-in-ddragon) | 9 | 2 | 0 | 3 | 2 | 6 | — |
| MissFortune | 4/4 | — | 2 | 1 | 0 | 0 | 0 | 5 | — |
| MonkeyKing | 4/4 | — | 8 | 1 | 2 | 1 | 1 | 4 | — |
| Mordekaiser | 4/4 | — | 4 | 1 | 0 | 1 | 1 | 6 | yes |
| Morgana | 4/4 | — | 6 | 3 | 0 | 1 | 1 | 6 | — |
| Naafiri | 4/4 | — | 8 | 1 | 2 | 2 | 1 | 1 | — |
| Nami | 4/4 | — | 6 | 4 | 0 | 0 | 1 | 6 | — |
| Nasus | 4/4 | — | 4 | 1 | 0 | 0 | 1 | 6 | — |
| Nautilus | 4/4 | — | 7 | 6 | 0 | 1 | 0 | 4 | — |
| Neeko | 4/4 | — | 5 | 3 | 0 | 1 | 0 | 4 | — |
| Nidalee | 1/4 | Q (two-abilities-in-ddragon), W (two-abilities-in-ddragon), E (two-abilities-in-ddragon) | 6 | 0 | 1 | 0 | 1 | 6 | — |
| Nilah | 3/4 | E (charges-in-ddragon) | 7 | 1 | 1 | 3 | 2 | 0 | — |
| Nocturne | 4/4 | — | 8 | 2 | 1 | 1 | 1 | 5 | — |
| Nunu | 4/4 | — | 9 | 4 | 0 | 1 | 1 | 6 | — |
| Olaf | 4/4 | — | 6 | 1 | 0 | 2 | 1 | 5 | — |
| Orianna | 4/4 | — | 3 | 2 | 0 | 1 | 0 | 5 | — |
| Ornn | 4/4 | — | 9 | 5 | 2 | 1 | 0 | 5 | yes |
| Pantheon | 4/4 | — | 8 | 2 | 2 | 1 | 0 | 6 | — |
| Poppy | 4/4 | — | 9 | 7 | 1 | 1 | 0 | 5 | — |
| Pyke | 4/4 | — | 8 | 3 | 2 | 1 | 1 | 7 | — |
| Qiyana | 3/4 | Q (two-abilities-in-ddragon) | 8 | 4 | 2 | 1 | 0 | 0 | — |
| Quinn | 4/4 | — | 7 | 3 | 2 | 0 | 0 | 8 | — |
| Rakan | 3/4 | E (no-number-in-ddragon) | 8 | 2 | 2 | 2 | 1 | 6 | — |
| Rammus | 4/4 | — | 8 | 5 | 1 | 0 | 0 | 5 | — |
| RekSai | 1/4 | Q (two-abilities-in-ddragon), W (two-abilities-in-ddragon), E (two-abilities-in-ddragon) | 7 | 1 | 1 | 2 | 1 | 6 | — |
| Rell | 4/4 | — | 7 | 3 | 0 | 1 | 0 | 0 | — |
| Renata | 4/4 | — | 6 | 4 | 0 | 1 | 0 | 0 | — |
| Renekton | 4/4 | — | 6 | 1 | 1 | 0 | 1 | 5 | yes |
| Rengar | 1/4 | Q (known-wrong-in-ddragon), W (known-wrong-in-ddragon), E (known-wrong-in-ddragon) | 9 | 2 | 2 | 2 | 1 | 6 | — |
| Riven | 4/4 | — | 8 | 1 | 3 | 1 | 0 | 5 | yes |
| Rumble | 3/4 | E (charges-in-ddragon) | 4 | 2 | 0 | 1 | 0 | 6 | — |
| Ryze | 4/4 | — | 4 | 2 | 1 | 0 | 0 | 6 | — |
| Samira | 4/4 | — | 4 | 0 | 2 | 0 | 1 | 0 | — |
| Sejuani | 4/4 | — | 6 | 5 | 1 | 0 | 0 | 6 | — |
| Senna | 4/4 | — | 6 | 2 | 0 | 2 | 1 | 0 | — |
| Seraphine | 4/4 | — | 7 | 4 | 0 | 1 | 1 | 0 | — |
| Sett | 4/4 | — | 7 | 5 | 0 | 1 | 1 | 0 | — |
| Shaco | 4/4 | — | 6 | 3 | 1 | 1 | 0 | 5 | — |
| Shen | 4/4 | — | 8 | 2 | 2 | 2 | 0 | 4 | — |
| Shyvana | 3/4 | R (no-number-in-ddragon) | 12 | 2 | 1 | 2 | 1 | 7 | — |
| Singed | 3/4 | Q (no-number-in-ddragon) | 6 | 4 | 0 | 0 | 1 | 6 | — |
| Sion | 4/4 | — | 11 | 5 | 1 | 2 | 1 | 5 | — |
| Sivir | 4/4 | — | 4 | 0 | 0 | 1 | 1 | 6 | — |
| Skarner | 3/4 | Q (two-abilities-in-ddragon) | 9 | 4 | 1 | 1 | 0 | 6 | — |
| Smolder | 4/4 | — | 3 | 2 | 0 | 0 | 1 | 7 | — |
| Sona | 4/4 | — | 6 | 1 | 0 | 1 | 1 | 5 | — |
| Soraka | 4/4 | — | 6 | 3 | 0 | 0 | 3 | 6 | — |
| Swain | 4/4 | — | 8 | 4 | 0 | 0 | 1 | 7 | — |
| Sylas | 3/4 | E (two-abilities-in-ddragon) | 6 | 2 | 1 | 0 | 1 | 5 | — |
| Syndra | 4/4 | — | 6 | 4 | 0 | 0 | 0 | 6 | — |
| TahmKench | 3/4 | R (no-number-in-ddragon) | 9 | 3 | 0 | 2 | 2 | 4 | — |
| Taliyah | 4/4 | — | 5 | 3 | 0 | 0 | 0 | 5 | — |
| Talon | 3/4 | E (no-number-in-ddragon) | 6 | 1 | 2 | 1 | 1 | 6 | — |
| Taric | 3/4 | Q (charges-in-ddragon) | 5 | 1 | 0 | 2 | 1 | 5 | — |
| Teemo | 2/4 | E (no-number-in-ddragon), R (charges-in-ddragon) | 4 | 2 | 0 | 1 | 0 | 4 | — |
| Thresh | 4/4 | — | 10 | 6 | 1 | 1 | 0 | 6 | — |
| Tristana | 4/4 | — | 4 | 3 | 0 | 0 | 0 | 5 | — |
| Trundle | 4/4 | — | 5 | 3 | 0 | 0 | 1 | 5 | — |
| Tryndamere | 4/4 | — | 4 | 1 | 1 | 0 | 1 | 6 | — |
| TwistedFate | 3/4 | E (no-number-in-ddragon) | 6 | 2 | 1 | 0 | 0 | 5 | — |
| Twitch | 4/4 | — | 3 | 1 | 0 | 1 | 0 | 6 | — |
| Udyr | 4/4 | — | 10 | 2 | 1 | 1 | 2 | 4 | — |
| Urgot | 4/4 | — | 10 | 6 | 1 | 1 | 0 | 6 | — |
| Varus | 4/4 | — | 4 | 2 | 0 | 0 | 0 | 6 | — |
| Vayne | 3/4 | W (no-number-in-ddragon) | 6 | 2 | 1 | 1 | 0 | 5 | — |
| Veigar | 3/4 | W (no-number-in-ddragon) | 2 | 1 | 0 | 0 | 0 | 6 | — |
| Velkoz | 3/4 | W (charges-in-ddragon) | 5 | 3 | 0 | 0 | 0 | 6 | — |
| Vex | 4/4 | — | 9 | 2 | 1 | 1 | 0 | 0 | — |
| Vi | 2/4 | W (no-number-in-ddragon), E (charges-in-ddragon) | 10 | 3 | 2 | 2 | 0 | 6 | — |
| Viego | 4/4 | — | 9 | 3 | 2 | 1 | 2 | 0 | — |
| Viktor | 4/4 | — | 5 | 2 | 0 | 1 | 0 | 4 | — |
| Vladimir | 4/4 | — | 7 | 2 | 0 | 1 | 3 | 6 | — |
| Volibear | 4/4 | — | 9 | 3 | 1 | 1 | 1 | 0 | — |
| Warwick | 3/4 | W (charges-in-ddragon) | 11 | 2 | 3 | 1 | 3 | 6 | — |
| Xayah | 4/4 | — | 3 | 1 | 0 | 1 | 0 | 5 | — |
| Xerath | 4/4 | — | 4 | 2 | 0 | 0 | 0 | 6 | — |
| XinZhao | 4/4 | — | 8 | 4 | 1 | 1 | 1 | 4 | — |
| Yasuo | 4/4 | — | 4 | 1 | 2 | 1 | 0 | 7 | — |
| Yone | 4/4 | — | 6 | 1 | 2 | 1 | 0 | 0 | — |
| Yorick | 4/4 | — | 5 | 1 | 0 | 0 | 1 | 6 | — |
| Yunara | 3/4 | Q (no-number-in-ddragon) | 3 | 1 | 1 | 0 | 0 | 0 | — |
| Yuumi | 3/4 | W (no-number-in-ddragon) | 8 | 2 | 1 | 3 | 2 | 0 | — |
| Zaahen | 4/4 | — | 8 | 2 | 1 | 1 | 2 | 0 | — |
| Zac | 4/4 | — | 8 | 4 | 1 | 0 | 1 | 6 | — |
| Zed | 4/4 | — | 6 | 1 | 1 | 1 | 0 | 6 | — |
| Zeri | 3/4 | Q (no-number-in-ddragon) | 4 | 1 | 1 | 0 | 0 | 0 | — |
| Ziggs | 4/4 | — | 5 | 2 | 0 | 0 | 0 | 6 | — |
| Zilean | 4/4 | — | 5 | 2 | 0 | 1 | 1 | 5 | — |
| Zoe | 3/4 | W (picked-up-spell-in-ddragon) | 6 | 2 | 1 | 0 | 0 | 6 | — |
| Zyra | 3/4 | W (charges-in-ddragon) | 3 | 2 | 0 | 0 | 0 | 8 | — |
