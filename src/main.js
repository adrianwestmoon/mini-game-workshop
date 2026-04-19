import { games } from "./games/index.js";

const elements = {
  best: document.querySelector("#best-value"),
  controls: document.querySelector("#game-controls"),
  description: document.querySelector("#game-description"),
  gameList: document.querySelector("#game-list"),
  hint: document.querySelector("#hint-text"),
  lives: document.querySelector("#lives-value"),
  score: document.querySelector("#score-value"),
  stageTitle: document.querySelector("#game-title"),
  statusPill: document.querySelector("#status-pill"),
  statusText: document.querySelector("#status-text"),
  canvas: document.querySelector("#game-canvas"),
};

let activeGameHandle = null;
let activeGameId = null;

function renderCatalog() {
  elements.gameList.innerHTML = "";

  for (const game of games) {
    const button = document.createElement("button");
    button.className = "game-card";
    button.type = "button";
    button.dataset.gameId = game.id;
    button.innerHTML = `
      <span class="game-card-title">${game.title}</span>
      <span class="game-card-copy">${game.description}</span>
    `;
    button.addEventListener("click", () => loadGame(game.id));
    elements.gameList.append(button);
  }
}

function updatePanel(payload) {
  elements.stageTitle.textContent = payload.title;
  elements.description.textContent = payload.description;
  elements.score.textContent = String(payload.score);
  elements.lives.textContent = String(payload.lives);
  elements.best.textContent = String(payload.best);
  elements.statusPill.textContent = payload.status;
  elements.statusText.textContent = payload.status;
  elements.hint.textContent = payload.hint;

  elements.controls.innerHTML = "";
  for (const item of payload.controls) {
    const li = document.createElement("li");
    li.textContent = item;
    elements.controls.append(li);
  }

  for (const card of elements.gameList.querySelectorAll(".game-card")) {
    card.classList.toggle("is-active", card.dataset.gameId === activeGameId);
  }
}

function loadGame(gameId) {
  const nextGame = games.find((game) => game.id === gameId);
  if (!nextGame) {
    return;
  }

  if (activeGameHandle) {
    activeGameHandle.destroy();
  }

  activeGameId = nextGame.id;
  activeGameHandle = nextGame.create(elements.canvas, {
    onStateChange: updatePanel,
  });
}

renderCatalog();
loadGame(games[0].id);
