const entries = {};
function q(n, question, options, explanation) { entries[`hoa-${String(n).padStart(3, '0')}`] = { question, options, explanation }; }
// Options below are correct-first, matching questions.cjs and import-selected.cjs.
q(1, 'The Assassin starts its activation with several Pain tokens. It uses Dark Animus before its first Shoot and Stimulated Senses on that attack roll. After its second Shoot, it wants to use Accelerated Rejuvenation. How is this resolved?',
 ['It cannot heal: Dark Animus has already used its ordinary invigoration allowance', 'It can heal because this follows a different Shoot action', 'It can heal, but must undo its Stimulated Senses re-rolls', 'It could not use Stimulated Senses either: only one invigoration is allowed per activation'],
 'Dark Animus and Accelerated Rejuvenation share the one-invigoration allowance per activation. Stimulated Senses can be used once in addition, but do not allow another healing invigoration.');
q(2, 'A splinter rifle attack rolls 1, 2, 5, 5. You want to keep both critical successes and try to gain another hit with Stimulated Senses. Which dice should you re-roll?',
 ['One failed die: either the 1 or the 2', 'Both failed dice: the 1 and the 2', 'Both 5s', 'One failed die and one 5'],
 'Re-roll one failed die: either the 1 or the 2. Stimulated Senses selects a single numerical result, so it cannot re-roll both a 1 and a 2 together. Both 5s remain critical successes.');
q(3, 'An Agent used Dark Animus in turning point 2 and ended its activation with APL 3. In turning point 3, it has not yet activated. What happens to its APL before and at the start of its next activation?',
 ['It remains 3 until the activation starts, then returns to 2', 'It returns to 2 in the Ready step', 'It stays 3 until the end of its next activation', 'It returns to 2 as soon as its turning point 2 activation ends'],
 'Dark Animus lasts until the start of that operative\'s next activation. Moving to a new turning point does not itself end the effect.');
q(4, 'A Gunner finishes off an enemy with a Wounds stat of 12 using one Shoot action. The enemy had only 1 wound remaining before the shot. How many Pain tokens does the Gunner gain?',
 ['Two: the threshold uses the Wounds stat', 'One: the target had only 1 wound remaining', 'Three: one for incapacitation and two more for Wounds 12', 'None: the target was already injured before the shot'],
 'Incapacitating an enemy with a Wounds stat of 12 or more gives two tokens instead of one. Remaining wounds do not replace the Wounds characteristic for this check.');
q(6, 'A Flayer strikes with a critical success in its own Fight and grants a token through Flay. Later in the same turning point, an enemy fights it and the Flayer strikes with a critical success while retaliating. Can Flay grant another token?',
 ['Yes: this is its first critical strike in a different combat sequence', 'No: Flay is limited to once per turning point', 'No: Flay only works in the Flayer\'s own Fight action', 'Yes, but only to the same recipient as in the first Fight'],
 'Flay checks the first critical strike in each sequence. A later retaliation is a new sequence; Flay does not require the Flayer\'s own activation.');
q(7, 'During one combat, a Flayer first uses a critical success to block, then another critical success to strike, and later makes a second critical strike. How many times does Flay trigger in that sequence?',
 ['Once, on the first critical strike', 'Never: its first critical success was already spent blocking', 'Twice, once for each critical strike', 'Three times, once for each critical success spent'],
 'Flay checks the first strike with a critical success, not the first critical die used. Blocking neither triggers nor consumes it. A second critical strike in the same sequence grants no further token.');
q(8, 'A Flayer makes its first critical strike in a combat. Your Agent has no Pain tokens and is 5 inches from the Flayer behind an opaque wall. Can the Agent receive the token from Flay?',
 ['Yes: Flay requires distance, not visibility', 'No: the recipient must see the Flayer', 'No: the recipient must see the wounded enemy', 'Yes, but only if the Agent already has a Pain token'],
 'Flay can select a friendly Hand of the Archon operative within 6 inches. It does not require visibility or an existing Pain token.');
q(9, 'An Agent with APL 3 starts its activation with Dash, then fires its splinter rifle, then performs Reposition. How does Accurate 1 from Rifles apply?',
 ['It applies to that Shoot; the later Reposition does not undo it', 'The earlier Dash disables it', 'The later Reposition retroactively removes it', 'It applies only if the Agent spends a Pain token'],
 'Before shooting, the Agent has only Dashed, which is not one of the actions that disables Rifles. The rule explicitly permits the listed movement actions after shooting.');
q(10, 'An Agent has not moved at all this turning point. It performs Shoot with a splinter rifle while counteracting. Does Rifles grant Accurate 1?',
 ['No: Rifles requires shooting during an activation', 'Yes: not performing Reposition that turning point is enough', 'Yes, but only if the Agent is on Vantage terrain', 'Yes, if the Agent had a Pain token before counteracting'],
 'Rifles is tied to an activation. Counteracting is not an activation, so remaining stationary does not enable this bonus.');
q(11, 'A target has Wounds 12 and 11 wounds remaining at the start of your Shoot. Merciless Sadists is active. Can you gain Balanced and then use Prey on the Wounded?',
 ['Yes: both only need the target to have lost at least one wound before the Shoot began', 'Only Balanced: Prey on the Wounded requires an injured target', 'Only Prey on the Wounded: Balanced requires an injured target', 'Neither: the target must have fewer than half its wounds remaining'],
 'Wounded and injured are different conditions. Both ploys check whether the target has lost wounds at the start of the action; neither requires it to be below half its Wounds.');
q(12, 'A target has full wounds when Shoot begins. A triggered reaction deals it 1 damage after the action starts but before your attack roll. Merciless Sadists is active. Which bonuses from Merciless Sadists and Prey on the Wounded are available against that target in this Shoot?',
 ['Neither: the target was not wounded at the start of Shoot', 'Both: the target is wounded by the time attack dice are rolled', 'Only Balanced from Merciless Sadists', 'Only the re-rolls from Prey on the Wounded'],
 'The October errata makes both ploys check the target\'s condition at the start of the action. A wound lost during that same Shoot does not change that check.');
q(13, 'A wounded enemy starts a Fight against your Agent. Blade Artists and Merciless Sadists are active, and Toxin Coating has not been used yet. Which bonuses can the Agent use while retaliating?',
 ['Rending and Lethal 5+', 'Rending, Lethal 5+ and Balanced', 'Only Rending', 'Only Balanced'],
 'Blade Artists improves melee weapons without limiting it to the attacking side. Toxin Coating explicitly includes retaliation. Merciless Sadists lists shooting and fighting, but not retaliating.');
q(14, 'At the start of its activation, the Assassin has Conceal and cover from enemy X, so X cannot select it for Shoot. You select X for From Darkness, Death. The Assassin then takes Engage and shoots X. Does it keep the normal-to-critical success conversion?',
 ['Yes: the selection condition was checked before determining the new order', 'No: Engage immediately cancels the selected target', 'No: after changing order, you must check again whether X can shoot the Assassin', 'Yes, but only if the Assassin keeps Conceal until the activation ends'],
 'From Darkness, Death selects the enemy when the operative activates, before its order is determined. Subsequently taking Engage does not cancel the effect against the selected enemy.');
q(15, 'The Assassin selected enemy X for From Darkness, Death. During that activation it first shoots enemy Y with razorwing, then enemy X with shardcarbine. It does not perform Mark. Which shot gets the normal-to-critical conversion?',
 ['The Shoot against X: shooting Y first does not consume the effect against X', 'Only the first Shoot against Y', 'Neither: the first Shoot must target X', 'Both Shoot actions, because each uses a different weapon'],
 'From Darkness, Death applies the first time the operative shoots or fights the selected enemy. Attacking a different enemy does not consume it. Merciless Hunter permits this pair of Shoot actions.');
q(16, 'An Agent with Blade Artists fights its From Darkness, Death target for the first time. It has two normal successes and no critical successes after rolling. What can it retain by applying both rules?',
 ['Two critical successes', 'One critical and one normal success', 'One critical success, discarding the other success', 'Two normal successes: Rending requires a rolled 6'],
 'From Darkness, Death retains one normal success as a critical success. That critical success allows Rending from Blade Artists to retain the other normal success as a second critical success.');
q(17, 'A shooter is 10 inches from your Agent, with Heavy terrain intervening. Another enemy is exactly 2 inches from the Agent. Denizens of Night is active. Does the Agent get a defence re-roll?',
 ['No: it must be more than 2 inches from every enemy, not just the shooter', 'Yes: distance is measured only to the shooter', 'Yes: Heavy terrain removes the distance requirement', 'No, but changing the Agent to Conceal would enable the re-roll'],
 'The distance condition refers to enemy operatives generally and requires more than 2 inches. An enemy exactly 2 inches away prevents the bonus even if the shooter is far away.');
q(18, 'An Agent with Engage has the edge of its base underneath Vantage terrain. No Light or Heavy terrain intervenes between it and the shooter, and all enemies are more than 2 inches away. Does Denizens of Night apply?',
 ['Yes: having any part of its base underneath Vantage is sufficient', 'No: intervening Light or Heavy terrain is mandatory', 'No: the bonus requires Conceal', 'Yes, but only if the entire base is underneath Vantage'],
 'Having any part of the base underneath Vantage is an alternative condition. It does not also require intervening terrain, and the ploy has no order requirement.');
q(19, 'In turning point 1, Devious Scheme is applied to enemy ploy X, costing 1CP. The opponent does not use X again until turning point 3. In turning point 2 they use a different ploy Y. What happens?',
 ['The surcharge waits for X in turning point 3; until then, you cannot apply another Devious Scheme to Y', 'The effect ends with turning point 1, so X costs 1CP again', 'Y receives the surcharge as the next ploy the opponent uses', 'You can apply another Devious Scheme to Y while keeping the first effect on X'],
 'The effect waits for the next use of the specific ploy and does not end with the turning point. Devious Scheme cannot be used again until that effect ends.');
q(20, 'Your opponent uses a firefight ploy that costs them 0CP for this use. You want to respond with Devious Scheme to increase its next use\'s cost. What happens?',
 ['You cannot apply Devious Scheme to this use', 'Its next use automatically costs 1CP', 'The surcharge is created, but applies only if the next use costs at least 1CP', 'Devious Scheme can be used for free because the triggering ploy was free'],
 'The trigger for Devious Scheme explicitly excludes a ploy costing 0CP. You cannot create its delayed surcharge from such a use.');
q(21, 'An enemy with Wounds 12 and two wounds remaining attempts to Fall Back from a fully healthy Agent with Wounds 8. No other enemies are in the Agent\'s control range. How many D6 are rolled for Chain Snare?',
 ['One: compare the Wounds stats of 12 and 8', 'Two: the retreating enemy has fewer wounds remaining', 'Three: their maximum wounds differ by four', 'None: Chain Snare cannot affect injured operatives'],
 'The number of dice depends on the Wounds characteristics, not remaining wounds. The enemy has a higher characteristic, so roll one D6.');
q(22, 'Earlier this turning point, Chain Snare failed to stop a Fall Back: both dice were below 4. Later, another enemy attempts to retreat from another of your operatives. Each friendly operative had only that enemy in its control range. Can Chain Snare be used again?',
 ['Yes: the turning point restriction starts after a successful 4+ result', 'No: the equipment can be used only once per turning point regardless of the roll', 'No: another attempt must involve the same friendly operative', 'Yes, but this attempt needs a 6 instead of 4+'],
 'The prohibition on using Chain Snare again is part of the successful 4+ outcome. A failed attempt does not consume the team\'s successful-use allowance.');
q(23, 'An enemy with APL 2 begins its activation beside an Agent and declares Fall Back. Chain Snare successfully stops it. How many AP does the enemy have left?',
 ['2 AP', '0 AP', '1 AP', '3 AP'],
 'It has 2 AP left: the Fall Back stopped by Chain Snare spends no AP. APL is a characteristic; AP are the action points available during the activation.');
q(24, 'The Duellist uses razorflail. Its opponent has one unresolved critical success and one normal success. The Duellist allocates its own critical success to block. What does Tangle allow?',
 ['Block both enemy successes with that single critical block', 'Block only the critical success: the two blocked successes must be the same type', 'Block only the normal success: Brutal prevents blocking critical successes', 'Block both, but only by spending another normal success'],
 'Tangle increases the number of successes a block can stop to two. A critical block can stop a critical and a normal success. Razorflail\'s Brutal restricts the opponent\'s blocks against it, not the Duellist\'s own blocks.');
q(25, 'The Duellist has one normal success left, while the enemy has a critical success and a normal success. The Duellist uses its normal success to block with Tangle. What can it block?',
 ['Only the enemy normal success', 'Both successes: Tangle removes the distinction between normal and critical', 'Only the critical success, by giving up the second block', 'Nothing: Tangle works only with critical blocks'],
 'Tangle changes how many successes can be blocked, but does not let a normal success block a critical success.');
q(27, 'Only your Agent with APL 2 and an enemy with APL 3 affected by Brutal Display are contesting a marker. Who controls it?',
 ['Neither: the enemy cannot control it, but its APL still prevents the Agent from doing so', 'The Agent: Brutal Display entirely excludes the enemy from the APL comparison', 'The enemy: higher APL overrides Brutal Display', 'Both: the control restriction creates shared control'],
 'Being unable to control a marker is not the same as being unable to contest it. The enemy still contributes to the APL comparison, denying the Agent control, while Brutal Display prevents the enemy from controlling it.');
q(28, 'A stinger pistol incapacitates enemy A. Your Agent B is visible to and within 2 inches of A, has 2 wounds left, and takes 3 damage from Stinger. Enemy C is visible to and within 2 inches of B, but more than 2 inches from A. Does the chain damage C?',
 ['Yes: incapacitating friendly B continues the Stinger chain', 'No: only incapacitated enemies continue the chain', 'No: every secondary victim must be within 2 inches of the original A', 'Yes, but C automatically takes the same 3 damage as B'],
 'The initial trigger is an enemy incapacitated by the weapon. Thereafter, any operative incapacitated by the weapon rule continues the chain, including a friendly one. Make a new separate D3 roll for C from B\'s position.');
q(29, 'An enemy incapacitated by a stinger pistol can see two of your operatives and one of its allies within 2 inches. How is the initial Stinger burst resolved?',
 ['Roll D3 damage separately for each of the three operatives', 'Roll one D3 and deal that same damage to all three', 'Only the Disciple\'s enemies take D3; your operatives are unaffected', 'The Disciple chooses one of the three to take D3'],
 'Stinger affects each other operative within the specified visibility and distance, whether friend or foe. The current datacard explicitly requires separate rolls.');
q(30, 'Torment Grenade affects an enemy with Save 4+ and your Agent with Save 4+ within 1 inch of it. Each takes a separate poison test, and both D6 show 2. Who takes D3 damage and gains a Poison token?',
 ['Both: each result of 2 is increased to 3', 'Only the enemy: friendly operatives do not take poison tests', 'Neither: a natural result of 3+ is required', 'Only the Agent: the enemy\'s 2 counts as a successful save'],
 'Each affected operative takes its own poison test. Save 4+ adds 1 to each result, turning both 2s into 3s. Both operatives therefore take separately rolled D3 damage and gain a Poison token each.');
q(31, 'An enemy already has one of your Poison tokens. In the next turning point it takes another poison test from Torment Grenade, with a final result of 4. It then activates. How is damage resolved?',
 ['D3 immediately from the new grenade, then D3 on activation; it still has one Poison token', 'Only D3 on activation: another grenade cannot affect a poisoned target', 'D3 immediately, then 2D3 on activation from two Poison tokens', 'Only D3 immediately: the new grenade removes the old Poison token'],
 'The existing-token restriction only prevents an additional Poison token. The new grenade still deals its immediate damage, and the single token still triggers when the operative activates.');
q(32, 'An enemy with one of your Poison tokens has already completed its activation and later counteracts. How many times does that counteraction trigger D3 damage from the Poison token?',
 ['None: the token triggers on activation', 'Once before the counteraction\'s action', 'Once after the counteraction\'s action', 'Twice: before and after the counteraction\'s action'],
 'Poison token damage is tied to the operative being activated. Counteracting is not an activation and does not cause another trigger.');
q(33, 'An Agent with Hypex has 3 of its 8 wounds remaining. Its original Move is 7 inches and its splinter rifle Hit is 3+. How does being injured affect these two stats?',
 ['Move remains 7 inches; Hit becomes 4+', 'Move remains 7 inches; Hit remains 3+', 'Move becomes 5 inches; Hit remains 3+', 'Move becomes 5 inches; Hit becomes 4+'],
 'Hypex lets the operative ignore changes to Move caused by being injured. It does not cancel the penalty to Hit.');
q(34, 'The team began the battle with Painbringer. The Elixicant uses Administer Drug on a wounded Agent to give it Hypex. What else happens with that use?',
 ['Hypex replaces Painbringer only on that Agent; this use does not also heal it', 'The Agent gains Hypex in addition to Painbringer and regains 2D3 wounds', 'The whole team replaces Painbringer with Hypex', 'The Agent loses Painbringer, gains Hypex and must regain 2D3 wounds'],
 'Administer Drug offers a choice between healing and replacing the selected operative\'s COMBAT DRUG. Replacing it neither adds a second drug nor changes the whole team\'s drug.');
q(35, 'An operative with Painbringer is about to take damage from two unblocked attack dice: 3 and 2. A Painbringer roll of 6 reduces the first die\'s damage to 2. Do you roll Painbringer for the second die because the total damage is now 4?',
 ['No: the threshold of 3 is checked separately for each attack die dealing damage', 'Yes: the total exceeds 3, so both dice are checked', 'Yes: reducing the first die triggers a new check for the second', 'No: Painbringer can only be used once per Shoot action'],
 'Painbringer responds to an individual attack die inflicting at least 3 damage. The second die inflicts 2, and adding up the attack\'s total damage does not change that.');
q(36, 'A Flayer suffers one normal hit with Normal Dmg 4 and one critical hit with Critical Dmg 5. Another 2 damage has already been inflicted separately by Devastating. What is the total after Insensible to Pain?',
 ['9: 3 + 4 + 2', '8: 3 + 4 + 1', '10: 4 + 5 + 1', '7: all three sources lose 1 damage, and the critical loses another 1'],
 'Insensible to Pain reduces Normal and Critical Dmg of 3 or more by one: 4 becomes 3, and 5 becomes 4. Separate Devastating damage is neither Normal nor Critical Dmg and remains 2.');
q(37, 'The Assassin has gained APL 3. Its player plans to Shoot with razorwing, Shoot with shardcarbine, then Mark a third target. Can it perform the entire sequence in one activation?',
 ['No: permission to Shoot twice requires not performing Mark at all during that activation', 'Yes: Mark comes after both Shoot actions and changes nothing', 'Yes: APL 3 removes the Merciless Hunter restriction', 'No: shardcarbine must be fired before razorwing for the sequence to work'],
 'Merciless Hunter checks that Mark is not performed during the entire activation. Moving Mark to the end does not let it be combined with two Shoot actions.');
q(38, 'The Assassin keeps Conceal for its entire activation and does not perform Mark. Its player wants to Shoot twice using Merciless Hunter. Which combination is available?',
 ['Only one Shoot with razorwing; two shots cannot be combined while keeping Conceal', 'Two Shoot actions with razorwing, because it has Silent', 'Razorwing and shardcarbine: permission to Shoot twice gives both Silent', 'Two Shoot actions with shardcarbine if the first incapacitates its target'],
 'Razorwing has Silent; shardcarbine does not. When shooting twice, Merciless Hunter requires razorwing for exactly one of the two actions, so the second shot cannot be another razorwing.');
q(40, 'The Assassin can see an enemy 14 inches away and performs Mark. Later, your Gunner shoots that same target. Which parts of this plan work?',
 ['Mark can select the target at that distance, but the Gunner gets none of its bonuses', 'Mark is limited to 6 inches, so the target cannot be selected', 'Mark works, and the Gunner gains Seek Light and ignores obscured', 'Mark works, but the Gunner only ignores obscured'],
 'Mark has no maximum range for selecting a visible enemy. Its shooting bonuses apply to the Assassin itself, not to all friendly shooters.');
q(41, 'An enemy selected for Omen rolls a 6 on an attack die and must re-roll it. The re-roll is also a 6. What happens to that die?',
 ['It stays a 6: the same die cannot be re-rolled again', 'Keep re-rolling until it shows 1 through 5', 'It automatically becomes a normal success', 'Discard it as a failed die'],
 'Omen requires the initial 6 to be re-rolled, but does not override the prohibition on re-rolling a die more than once. The 6 obtained on the re-roll stays.');
q(42, 'An enemy affected by Omen attacks with Lethal 5+. It rolls a 5 and a 6. Which does Omen force it to re-roll?',
 ['Only the 6; the critical 5 stays', 'Both: Omen re-rolls all critical successes', 'Only the 5: a natural 6 is protected from re-rolls', 'Neither: Lethal 5+ overrides Omen'],
 'Omen refers to a numerical result of 6, not the category of critical success. Lethal 5+ does not turn a rolled 5 into a numerical 6.');
q(43, 'The Assassin uses Refined Poison on shardcarbine with Dmg 2/2 and Devastating 2. One normal success and one critical success remain after defence. How much total damage do they inflict, including that critical\'s Devastating?',
 ['7: normal 3, critical 2, plus 2 from Devastating', '8: normal 3, critical 3, plus 2 from Devastating', '6: normal 2, critical 2, plus 2 from Devastating', '9: normal 3, critical 2, plus 4 from improved Devastating'],
 'Refined Poison only increases Normal Dmg, making the profile 3/2. Critical Dmg and Devastating stay unchanged, for a total of 3 + 2 + 2.');
q(44, 'A Heavy Gunner uses Refined Poison when selecting the sweeping profile of splinter cannon, then performs one Shoot with Torrent against three targets. How many equipment uses are spent, and which targets face increased Normal Dmg?',
 ['One use; Normal Dmg is increased in all three sequences of that Shoot', 'One use; only the first target faces increased damage', 'Three uses, so the third target cannot be shot', 'Two uses; the third target faces ordinary Normal Dmg'],
 'Refined Poison is applied when selecting the weapon and lasts until the end of Shoot. Additional Torrent sequences belong to that same action and do not spend separate uses.');
q(45, 'Earlier this turning point, an Agent used Toxin Coating while retaliating. The Duellist now performs two Fight actions and wants to enhance razorflail in both. What does the remaining allowance permit?',
 ['Only one of the Duellist\'s two Fight actions can be enhanced', 'Both can be enhanced: the Duellist has its own two-use allowance', 'One use enhances both Fight actions until the activation ends', 'No uses remain: retaliation consumes both uses'],
 'Toxin Coating has a shared team limit of two uses per turning point. Each use lasts for one sequence, so two Fight actions need two uses, but only one remains.');
q(46, 'You selected Wicked Blades. During a turning point, an Agent fights with array of blades, a Duellist with razorflail, and a Flayer with pain sculptors. What are their respective Atk stats?',
 ['4, 4, 4', '4, 5, 5', '3, 5, 5', '4, 5, 4'],
 'Wicked Blades only adds an attack to array of blades, increasing 3 to 4. Razorflail and pain sculptors already have Atk 4 but do not benefit from this equipment.');
q(47, 'An Agent with APL 2 begins its activation in an enemy\'s control range. Its player uses Cruel Deception, performs Fall Back for 1AP, then Shoot with splinter rifle for 1AP. Does Rifles grant Accurate 1 to that Shoot?',
 ['No: reducing the Fall Back cost does not remove the Rifles condition', 'Yes: a 1AP Fall Back counts as Dash for Rifles', 'Yes: only Reposition disables Rifles', 'Shoot is unavailable: Cruel Deception spends the second AP'],
 'Cruel Deception reduces the AP cost of Fall Back, but it remains a Fall Back action. Because it happened before Shoot in the same activation, Rifles does not grant Accurate 1.');
q(48, 'Your selected team already includes an Archsybarite with blast pistol and a Heavy Gunner with dark lance. You want to add a Gunner. Which Gunner loadout can you add to this team?',
 ['Shredder; array of blades', 'Blaster; array of blades', 'Either: the darklight limit only counts the Gunner and Heavy Gunner', 'Neither: the Gunner and Heavy Gunner cannot be selected together'],
 'Blast pistol and dark lance already fill the two allowed darklight weapon slots. Shredder is not a darklight weapon; blaster would be a third. Selecting both a Gunner and a Heavy Gunner is permitted.');
q(49, 'A Flayer with Pain tokens performs Charge, then Fight and incapacitates the only enemy near it. It has not used an invigoration in this activation. Can it Dash through Vitalised Surge after the enemy is removed?',
 ['Yes: Vitalised Surge permits this Dash after Charge', 'No: Charge prevents any Dash during this activation', 'Yes, but the Dash costs another 1AP', 'No: it must first wait until the whole activation ends'],
 'Vitalised Surge grants an immediate free Dash after the incapacitated enemy is removed. It explicitly permits this after an action that would normally prevent Dash, so the earlier Charge does not prevent it.');
q(50, 'A Duellist with Pain tokens incapacitates one of two enemies in its control range. The second enemy remains in its control range. Can the Duellist escape using the Dash from Vitalised Surge?',
 ['No: Vitalised Surge does not remove the prohibition on starting Dash in enemy control range', 'Yes: any free Dash can start in enemy control range', 'Yes: its exception for actions preventing Dash also removes positional requirements', 'Yes, if the Dash ends more than 2 inches from the second enemy'],
 'The Vitalised Surge exception concerns a previously performed action that prevents Dash. It does not remove Dash\'s requirement to start outside enemy control range.');
q(51, 'A Heavy Gunner with Pain tokens incapacitates an enemy with dark lance while counteracting. It wants to use Vitalised Surge immediately and move 3 inches in a straight line. What is the maximum distance of this Dash during the counteraction?',
 ['2 inches: the counteraction movement limit still applies', '3 inches: a free Dash is not part of the counteraction', '7 inches: Vitalised Surge uses the full Move stat', '0 inches: Heavy (Dash only) prevents Dash after shooting'],
 'Vitalised Surge can grant a free Dash after incapacitating an enemy, and Heavy (Dash only) allows it. However, counteraction movement is limited to 2 inches with precedence over other rules.');
q(52, 'The Assassin shoots with razorwing and uses Stimulated Senses, then shoots with shardcarbine in the same activation. It has Pain tokens left and has not performed Mark. Can it use Stimulated Senses again on the second attack roll?',
 ['No: the additional Stimulated Senses use is limited to once per activation', 'Yes: the allowance resets with each Shoot action', 'Yes: changing weapons permits another use', 'Yes, if the second Shoot re-rolls a different numerical result'],
 'The exception for Stimulated Senses allows it once in addition to another invigoration. It does not grant a separate use for every action or weapon.');

module.exports = entries;
