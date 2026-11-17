# WTC Doubles

Rules reference: [Coinflip Vol.3](https://docs.google.com/document/d/1LMEYmL94pZfKuZ_MCpx-TXRb4zXYDGTbTrIWUKK2VRA/edit).

WTC Doubles is a separate Swiss team format with two players per roster, one faction per player and four rounds by default. It supports TTS and IRL. Each round has exactly four distinct missions. TTS uses two shared virtual tables; IRL uses a separate line of two physical tables per team match. Table layouts, mission pools and personal games retain their round snapshots.

In TTS the application guides both captains through a D6 roll-off (reroll ties), a ban by the loser, a ban by the winner, then the winner's right choice. The winner either pairs players or assigns tables to their own players. The loser does the other action and assigns the remaining two missions. Tables chosen before opponents stay attached to the selected players. There are no Shield/Sword steps. In IRL captains follow the same sequence at the venue, then either captain or an organizer saves both final games together in the manual form. The two unused missions are the bans.

Each personal game awards `10 + clamp(own VP − opposing VP, −10, 10)` GP. Two games total 40 GP. A team with 0–17 GP loses (0 TP), 18–22 draws (1 TP), and 23–40 wins (2 TP). Existing Doubles' personal TP and VP bonus do not apply. Only completed team matches contribute official standings; personal results remain visible immediately in the separate individual table.

Standings compare team TP, individual wins, mean SOS, total VP and raw Tac Op. SOS averages opponents' current total team TP over completed encounters, including withdrawn opponents and repeated encounters. It is compared without display rounding. Fully equal rows use seed and ID. Result corrections recalculate scores and SOS. Undo, reset and corrections retain later-round and result-removal protections.

Automatic byes and team forfeits are unavailable because the source does not define their scoring. Active roster counts must remain even. A roster with unfinished matches cannot be withdrawn. Organizer replacement and normal personal result reporting remain available.

Migration 111 admits `wtc_doubles` without rewriting historical tournaments. TTS requires guided pairing; IRL requires manual pairing. The UI and API enforce these settings and one registered faction. Existing WTC, Classic and Doubles keep their behavior.

Automated regression coverage: `test/unit/wtc-doubles.test.js`, `test/unit/client-wtc-doubles.test.js`, `test/integration/wtc-doubles.test.js`. Under AGENTS.md, these run in CI; no local automated execution is part of this change.
