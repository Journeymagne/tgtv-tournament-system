const form = document.querySelector("#controls");
const track = document.querySelector("#track");
const totalSteps = document.querySelector("#totalSteps");
const counterCount = document.querySelector("#counterCount");
const firstPlayer = document.querySelector("#firstPlayer");

const trackerText = (ru, en) => document.documentElement.lang === "en" ? en : ru;
const names = { get me() { return trackerText("Я", "Me"); }, get opponent() { return trackerText("Соперник", "Opponent"); } };

function clampCount(value) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return 0;
  return Math.min(40, Math.max(0, parsed));
}

function otherSide(side) {
  return side === "me" ? "opponent" : "me";
}

function buildSequence(myCount, opponentCount, first) {
  const ready = { me: myCount, opponent: opponentCount };
  const used = { me: 0, opponent: 0 };
  const counters = { me: 0, opponent: 0 };
  const sequence = [];
  let turn = first;

  while (ready.me > 0 || ready.opponent > 0) {
    const enemy = otherSide(turn);

    if (ready[turn] > 0) {
      used[turn] += 1;
      ready[turn] -= 1;
      sequence.push({
        side: turn,
        type: "activation",
        count: used[turn],
        title: `${names[turn]}: ${trackerText("активация", "activation")} ${used[turn]}`,
        note: ready[turn] === 0 ? trackerText("Все оперативники этой стороны активированы.", "All operatives on this side are expended.") : trackerText(`Готовых осталось: ${ready[turn]}`, `Ready remaining: ${ready[turn]}`)
      });
    } else if (ready[enemy] > 0) {
      counters[turn] += 1;
      sequence.push({
        side: turn,
        type: "counter",
        count: counters[turn],
        title: `${names[turn]}: ${trackerText("контрдействие", "counteract")} ${counters[turn]}`,
        note: trackerText("Вместо активации, затем ход возвращается сопернику.", "Instead of activating, then play alternates back.")
      });
    }

    turn = enemy;
  }

  return sequence;
}

function render() {
  const data = new FormData(form);
  const myCount = clampCount(data.get("myCount"));
  const opponentCount = clampCount(data.get("oppCount"));
  const first = data.get("first") || "me";
  const sequence = buildSequence(myCount, opponentCount, first);
  const counters = sequence.filter((step) => step.type === "counter").length;

  totalSteps.textContent = sequence.length;
  counterCount.textContent = counters;
  firstPlayer.textContent = names[first];

  track.replaceChildren(...sequence.map((step, index) => {
    const card = document.createElement("article");
    card.className = `slot ${step.side} ${step.type === "counter" ? "counter" : ""}`;
    card.innerHTML = `
      <div class="slot-top">
        <span>${trackerText("Шаг", "Step")}</span>
        <span class="badge">${index + 1}</span>
      </div>
      <div class="slot-title">${step.title}</div>
      <div class="slot-note">${step.note}</div>
    `;
    return card;
  }));
}

window.addEventListener("kt:locale", render);
form.addEventListener("input", render);
window.KTCalculator = { reset() { form.reset(); render(); } };
render();
