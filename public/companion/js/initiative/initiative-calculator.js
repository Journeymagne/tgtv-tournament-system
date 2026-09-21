const cards = ["reroll", "1", "2", "3"];
const cardNames = {
  reroll: "Re-roll",
  1: "+1/-1",
  2: "+2/-2",
  3: "+3/-3"
};
const abilityNames = {
  "ability-reroll": "Killteam Re-roll",
  "ability-d3": "+1d3",
  "ability-plus1": "+1"
};

let latestLog = "";

function getChecks(player) {
  return [...document.querySelectorAll(`[data-player="${player}"] input[type="checkbox"]`)];
}

function setPlayerCards(player, values) {
  getChecks(player).forEach((input) => {
    input.checked = values.includes(input.value);
  });
}

function selectedCards(player) {
  return getChecks(player).filter((input) => input.checked).map((input) => input.value);
}

function getAbilityChecks(player) {
  return [...document.querySelectorAll(`[data-abilities="${player}"] input[type="checkbox"]`)];
}

function selectedAbilities(player) {
  return getAbilityChecks(player).filter((input) => input.checked).map((input) => input.value);
}

function positiveBonus(playerCards) {
  return playerCards.reduce((total, card) => {
    const value = Number(card);
    return Number.isFinite(value) ? total + value : total;
  }, 0);
}

function validateExclusiveCards(changedInput) {
  const p1 = selectedCards("p1");
  const p2 = selectedCards("p2");
  let message = "";

  for (const card of cards) {
    if (p1.includes(card) && p2.includes(card)) {
      if (changedInput) {
        const otherPlayer = changedInput.closest("[data-player]").dataset.player === "p1" ? "p2" : "p1";
        const other = getChecks(otherPlayer).find((input) => input.value === card);
        other.checked = false;
      } else {
        message = `${cardNames[card]} cannot be selected by both players at the same time.`;
      }
    }
  }

  showError(message);
  return !message;
}

function showError(message) {
  const error = document.getElementById("error");
  error.textContent = message;
  error.style.display = message ? "block" : "none";
}

function rollD6() {
  return Math.floor(Math.random() * 6) + 1;
}

function rollD3() {
  return Math.floor(Math.random() * 3) + 1;
}

function maxAbilityBonus(abilities) {
  return (abilities.includes("ability-plus1") ? 1 : 0) + (abilities.includes("ability-d3") ? 3 : 0);
}

function createRollState(name, cards, abilities, tieWins, baseRoll) {
  return {
    name,
    cards,
    abilities,
    tieWins,
    firstRoll: baseRoll,
    baseRoll,
    abilityRerolled: false,
    cardRerolled: false,
    d3Bonus: 0,
    plusOneBonus: 0,
    abilityBonus: 0,
    cardBonus: positiveBonus(cards),
    total: baseRoll
  };
}

function canBeat(playerTotal, opponentTotal, tieWins) {
  return tieWins ? playerTotal >= opponentTotal : playerTotal > opponentTotal;
}

function maybeUseAbilityReroll(player, opponent) {
  if (!player.abilities.includes("ability-reroll")) return;

  const playerBest = player.baseRoll + maxAbilityBonus(player.abilities) + player.cardBonus;
  const opponentBest = opponent.baseRoll + maxAbilityBonus(opponent.abilities) + opponent.cardBonus;

  if (!canBeat(playerBest, opponentBest, player.tieWins)) {
    player.baseRoll = rollD6();
    player.abilityRerolled = true;
  }
}

function applyAbilityBonuses(player) {
  if (player.abilities.includes("ability-plus1")) {
    player.plusOneBonus = 1;
  }

  if (player.abilities.includes("ability-d3")) {
    player.d3Bonus = rollD3();
  }

  player.abilityBonus = player.plusOneBonus + player.d3Bonus;
  player.total = player.baseRoll + player.abilityBonus + player.cardBonus;
}

function wantsCardReroll(player, opponent) {
  if (!player.cards.includes("reroll")) return false;
  return !canBeat(player.total, opponent.total, player.tieWins);
}

function applyCardReroll(player) {
  player.baseRoll = rollD6();
  player.cardRerolled = true;
  player.d3Bonus = 0;
  player.plusOneBonus = 0;
  player.abilityBonus = 0;
  player.total = player.baseRoll + player.cardBonus;
}

function simulate(count) {
  const p1Cards = selectedCards("p1");
  const p2Cards = selectedCards("p2");
  const p1Abilities = selectedAbilities("p1");
  const p2Abilities = selectedAbilities("p2");
  const p1Tie = document.getElementById("p1Tie").checked;
  const p2Tie = document.getElementById("p2Tie").checked;
  let p1Wins = 0;
  let p2Wins = 0;
  let unresolvedTies = 0;
  const log = [];

  log.push("Kill Team initiative simulation log");
  log.push(`Simulations: ${count}`);
  log.push(`Player 1 cards: ${p1Cards.map((card) => cardNames[card]).join(", ") || "none"}`);
  log.push(`Player 2 cards: ${p2Cards.map((card) => cardNames[card]).join(", ") || "none"}`);
  log.push(`Player 1 killteam abilities: ${p1Abilities.map((ability) => abilityNames[ability]).join(", ") || "none"}`);
  log.push(`Player 2 killteam abilities: ${p2Abilities.map((ability) => abilityNames[ability]).join(", ") || "none"}`);
  log.push(`Player 1 wins ties: ${p1Tie ? "yes" : "no"}`);
  log.push(`Player 2 wins ties: ${p2Tie ? "yes" : "no"}`);
  log.push("");

  for (let i = 1; i <= count; i++) {
    const firstP1Roll = rollD6();
    const firstP2Roll = rollD6();
    const p1 = createRollState("Player 1", p1Cards, p1Abilities, p1Tie, firstP1Roll);
    const p2 = createRollState("Player 2", p2Cards, p2Abilities, p2Tie, firstP2Roll);

    maybeUseAbilityReroll(p1, p2);
    maybeUseAbilityReroll(p2, p1);
    applyAbilityBonuses(p1);
    applyAbilityBonuses(p2);

    const p1UsesCardReroll = wantsCardReroll(p1, p2);
    const p2UsesCardReroll = wantsCardReroll(p2, p1);
    if (p1UsesCardReroll) applyCardReroll(p1);
    if (p2UsesCardReroll) applyCardReroll(p2);

    let winner = "";
    if (p1.total > p2.total) {
      p1Wins++;
      winner = "Player 1";
    } else if (p2.total > p1.total) {
      p2Wins++;
      winner = "Player 2";
    } else if (p1Tie && !p2Tie) {
      p1Wins++;
      winner = "Player 1 (tie)";
    } else if (p2Tie && !p1Tie) {
      p2Wins++;
      winner = "Player 2 (tie)";
    } else {
      unresolvedTies++;
      winner = "tie";
    }

    const p1RerollText = [
      p1.abilityRerolled ? `ability reroll to ${p1.baseRoll}` : "",
      p1.cardRerolled ? `card reroll to ${p1.baseRoll}` : ""
    ].filter(Boolean).join(", ");
    const p2RerollText = [
      p2.abilityRerolled ? `ability reroll to ${p2.baseRoll}` : "",
      p2.cardRerolled ? `card reroll to ${p2.baseRoll}` : ""
    ].filter(Boolean).join(", ");
    const p1Details = `${p1RerollText ? `, ${p1RerollText}` : ""}, ability +${p1.abilityBonus} (d3 ${p1.d3Bonus}, +1 ${p1.plusOneBonus}), cards +${p1.cardBonus}`;
    const p2Details = `${p2RerollText ? `, ${p2RerollText}` : ""}, ability +${p2.abilityBonus} (d3 ${p2.d3Bonus}, +1 ${p2.plusOneBonus}), cards +${p2.cardBonus}`;
    log.push(
      `${String(i).padStart(5, "0")}: ` +
      `P1 roll ${firstP1Roll}${p1Details} = ${p1.total}; ` +
      `P2 roll ${firstP2Roll}${p2Details} = ${p2.total}; ` +
      `winner: ${winner}`
    );
  }

  return { p1Wins, p2Wins, unresolvedTies, log: log.join("\n") };
}

function runSimulation() {
  try {
    if (!validateExclusiveCards()) return;

    const count = Math.max(1, Math.min(250000, Number(document.getElementById("simCount").value) || 10000));
    document.getElementById("simCount").value = count;
    const result = simulate(count);
    latestLog = result.log;

    const p1Percent = (result.p1Wins / count * 100).toFixed(2);
    const p2Percent = (result.p2Wins / count * 100).toFixed(2);
    document.getElementById("p1Chance").textContent = `${p1Percent}%`;
    document.getElementById("p2Chance").textContent = `${p2Percent}%`;
    document.getElementById("summary").textContent =
      `Wins: Player 1 - ${result.p1Wins}, Player 2 - ${result.p2Wins}` +
      (result.unresolvedTies ? `, unresolved ties - ${result.unresolvedTies}.` : ".");
    document.getElementById("logPreview").textContent = latestLog.split("\n").slice(0, 80).join("\n");
  } catch (error) {
    showError(error.message || "Could not calculate.");
  }
}

function downloadLog() {
  if (!latestLog) runSimulation();
  if (!latestLog) return;
  const blob = new Blob([latestLog], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "initiative-roll-log.txt";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

document.querySelectorAll('[data-player] input[type="checkbox"]').forEach((input) => {
  input.addEventListener("change", () => validateExclusiveCards(input));
});

document.getElementById("p1Tie").addEventListener("change", (event) => {
  if (event.target.checked) document.getElementById("p2Tie").checked = false;
});

document.getElementById("p2Tie").addEventListener("change", (event) => {
  if (event.target.checked) document.getElementById("p1Tie").checked = false;
});

document.getElementById("run").addEventListener("click", runSimulation);
document.getElementById("download").addEventListener("click", downloadLog);

setPlayerCards("p1", ["reroll", "1"]);
setPlayerCards("p2", ["2"]);
validateExclusiveCards();

window.addEventListener("error", (event) => {
  showError(event.message || "Script error.");
});
