const APP_BUILD = "2026.04.20-art-integrated";
const CAMPAIGN_PROGRESS_KEY = "mini-game-workshop:campaign-progress";

const CAMPAIGN_CHAPTERS = [
  {
    id: "moo-homecoming",
    label: "第一章",
    title: "牧场失踪案",
    gameId: "moo-mission",
    gameName: "Moo Mission",
    objective: "找到阿凯小牛并把他带回家",
    intro: {
      speaker: "金声",
      text: "阿凯小牛在暮色前还没回栏。先穿过牧场把他找回来，看看今晚到底出了什么事。",
    },
    outro: {
      speaker: "阿凯小牛",
      text: "我听见黑店那边有人在说什么封印和夜影，咱们得顺着这条线继续查下去。",
    },
    winStatus: "ALL CLEAR",
  },
  {
    id: "evil-inn-raid",
    label: "第二章",
    title: "黑店取证",
    gameId: "evil-valley-inn",
    gameName: "恶人谷黑店",
    objective: "拆封印、救阿凯、带着证据冲出黑店",
    intro: {
      speaker: "旁白",
      text: "线索把你们带到恶人谷黑店。金声要潜进去拆掉封印、带着阿凯冲出来，把真相从黑店里挖出来。",
    },
    outro: {
      speaker: "金声",
      text: "黑店只是表层。真正的异动在林间法阵那边，得赶去把月夜封印重新立住。",
    },
    winStatus: "ALL CLEAR",
  },
  {
    id: "owl-moon-ritual",
    label: "第三章",
    title: "月夜法阵",
    gameId: "owl-magician",
    gameName: "猫头鹰与魔术师金声",
    objective: "点亮月灯、封住裂隙、守住月核",
    intro: {
      speaker: "猫头鹰",
      text: "先点亮月灯，再封裂隙，最后守住月核。只要这三步稳住，夜影今晚就压不过来。",
    },
    outro: {
      speaker: "旁白",
      text: "法阵稳住后，一头守关奶龙从林口现身。它不肯让路，除非你在擂台上把它正面打服。",
    },
    winStatus: "OWL CLEAR",
  },
  {
    id: "milk-dragon-duel",
    label: "第四章",
    title: "奶龙擂台",
    gameId: "milk-dragon-brawl",
    gameName: "金声与奶龙",
    objective: "打满三回合，赢下守关奶龙",
    intro: {
      speaker: "奶龙",
      text: "你们想继续往前，就先在奶泡擂台上赢我三回合。能过这一关，我就告诉你夜空裂口该怎么进。",
    },
    outro: {
      speaker: "奶龙",
      text: "行，这条路你们配走。裂口就在天穹上面，开飞船冲进去，把最后那团夜影核心轰散。",
    },
    winStatus: "BRAWL CLEAR",
  },
  {
    id: "comet-rift-run",
    label: "第五章",
    title: "裂口追击",
    gameId: "comet-dash",
    gameName: "Comet Dash",
    objective: "把分数打到 1500，冲穿夜空裂口",
    intro: {
      speaker: "旁白",
      text: "奶龙让开了路，金声驾驶飞船冲进夜空裂口。这里没有回头路，只有把夜影核心一路打穿。",
    },
    outro: {
      speaker: "金声",
      text: "裂口已经被轰穿，第一幕的异动终于压下去了。后面可以继续把更多章节和支线接进来。",
    },
    isComplete(payload) {
      return payload.status !== "GAME OVER" && payload.score >= 1500;
    },
  },
];

const elements = {
  best: document.querySelector("#best-value"),
  buildVersion: document.querySelector("#build-version"),
  campaignButton: document.querySelector("#campaign-button"),
  campaignProgress: document.querySelector("#campaign-progress"),
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
  storyOverlay: document.querySelector("#story-overlay"),
  storyKicker: document.querySelector("#story-kicker"),
  storyTitle: document.querySelector("#story-title"),
  storySpeaker: document.querySelector("#story-speaker"),
  storyCopy: document.querySelector("#story-copy"),
  storyButton: document.querySelector("#story-button"),
};

const games = window.MiniGameWorkshopGames || [];
const campaignProgress = readCampaignProgress();
const campaign = {
  active: false,
  chapterIndex: 0,
  resolvedChapterId: null,
};

let activeGameHandle = null;
let activeGameId = null;
let storyAction = null;

if (elements.buildVersion) {
  elements.buildVersion.textContent = APP_BUILD;
}

function readCampaignProgress() {
  try {
    const raw = JSON.parse(window.localStorage.getItem(CAMPAIGN_PROGRESS_KEY) || "{}");
    const completed = Array.isArray(raw.completed) ? raw.completed.filter((id) => CAMPAIGN_CHAPTERS.some((chapter) => chapter.id === id)) : [];
    const unlocked = Number.isInteger(raw.unlocked) ? raw.unlocked : 0;
    return {
      completed,
      unlocked: clamp(unlocked, 0, CAMPAIGN_CHAPTERS.length - 1),
    };
  } catch (error) {
    return { completed: [], unlocked: 0 };
  }
}

function writeCampaignProgress() {
  try {
    window.localStorage.setItem(CAMPAIGN_PROGRESS_KEY, JSON.stringify(campaignProgress));
  } catch (error) {
    return;
  }
}

function chapterIsCompleted(chapterId) {
  return campaignProgress.completed.includes(chapterId);
}

function chapterIsUnlocked(index) {
  return index <= campaignProgress.unlocked || chapterIsCompleted(CAMPAIGN_CHAPTERS[index].id);
}

function getResumeChapterIndex() {
  const firstIncomplete = CAMPAIGN_CHAPTERS.findIndex((chapter, index) => chapterIsUnlocked(index) && !chapterIsCompleted(chapter.id));
  if (firstIncomplete >= 0) {
    return firstIncomplete;
  }
  return 0;
}

function allCampaignCompleted() {
  return CAMPAIGN_CHAPTERS.every((chapter) => chapterIsCompleted(chapter.id));
}

function updateCampaignButton() {
  if (!elements.campaignButton) {
    return;
  }

  if (campaign.active) {
    elements.campaignButton.textContent = `剧情进行中 · ${CAMPAIGN_CHAPTERS[campaign.chapterIndex].label}`;
    return;
  }

  if (allCampaignCompleted()) {
    elements.campaignButton.textContent = "重玩剧情模式";
    return;
  }

  elements.campaignButton.textContent = campaignProgress.completed.length > 0 ? "继续剧情模式" : "开始剧情模式";
}

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

function renderCampaignProgress() {
  if (!elements.campaignProgress) {
    return;
  }

  elements.campaignProgress.innerHTML = "";

  for (let index = 0; index < CAMPAIGN_CHAPTERS.length; index += 1) {
    const chapter = CAMPAIGN_CHAPTERS[index];
    const step = document.createElement("div");
    const isCurrent = campaign.active && campaign.chapterIndex === index;
    const isLocked = !chapterIsUnlocked(index);
    const isCompleted = chapterIsCompleted(chapter.id);
    step.className = `campaign-step${isCurrent ? " is-current" : ""}${isLocked ? " is-locked" : ""}`;

    let stateLabel = "未解锁";
    if (isCompleted) {
      stateLabel = "已通关";
    } else if (isCurrent) {
      stateLabel = "进行中";
    } else if (!isLocked) {
      stateLabel = "已解锁";
    }

    step.innerHTML = `
      <div class="campaign-step-head">
        <span class="campaign-step-title">${chapter.label} · ${chapter.title}</span>
        <span class="campaign-step-state">${stateLabel}</span>
      </div>
      <p class="campaign-step-copy">${chapter.gameName}</p>
      <p class="campaign-step-copy">目标：${chapter.objective}</p>
    `;

    elements.campaignProgress.append(step);
  }
}

function showStoryOverlay(scene) {
  if (!elements.storyOverlay) {
    return;
  }

  elements.storyKicker.textContent = scene.kicker;
  elements.storyTitle.textContent = scene.title;
  elements.storySpeaker.textContent = scene.speaker;
  elements.storyCopy.textContent = scene.text;
  elements.storyButton.textContent = scene.buttonLabel;
  elements.storyOverlay.classList.remove("is-hidden");
  storyAction = scene.onConfirm;
}

function hideStoryOverlay() {
  if (!elements.storyOverlay) {
    return;
  }
  elements.storyOverlay.classList.add("is-hidden");
  storyAction = null;
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

function handleCampaignState(payload) {
  if (!campaign.active) {
    return;
  }

  const chapter = CAMPAIGN_CHAPTERS[campaign.chapterIndex];
  if (!chapter || activeGameId !== chapter.gameId) {
    return;
  }

  const completedByStatus = chapter.winStatus && payload.status === chapter.winStatus;
  const completedByRule = typeof chapter.isComplete === "function" && chapter.isComplete(payload);
  if ((!completedByStatus && !completedByRule) || campaign.resolvedChapterId === chapter.id) {
    return;
  }

  campaign.resolvedChapterId = chapter.id;
  markChapterComplete(campaign.chapterIndex);
}

function handleStateChange(gameId, payload) {
  if (gameId !== activeGameId) {
    return;
  }
  updatePanel(payload);
  handleCampaignState(payload);
}

function loadGame(gameId, options = {}) {
  const nextGame = games.find((game) => game.id === gameId);
  if (!nextGame) {
    return;
  }

  if (!options.fromCampaign) {
    campaign.active = false;
    campaign.resolvedChapterId = null;
    hideStoryOverlay();
    updateCampaignButton();
    renderCampaignProgress();
  }

  if (activeGameHandle) {
    activeGameHandle.destroy();
  }

  activeGameId = nextGame.id;
  hideStoryOverlay();
  activeGameHandle = nextGame.create(elements.canvas, {
    onStateChange(payload) {
      handleStateChange(nextGame.id, payload);
    },
  });
}

function showChapterIntro(index) {
  const chapter = CAMPAIGN_CHAPTERS[index];
  campaign.active = true;
  campaign.chapterIndex = index;
  campaign.resolvedChapterId = null;
  updateCampaignButton();
  renderCampaignProgress();

  showStoryOverlay({
    kicker: `${chapter.label} · 剧情模式`,
    title: chapter.title,
    speaker: chapter.intro.speaker,
    text: chapter.intro.text,
    buttonLabel: "进入本章",
    onConfirm() {
      loadGame(chapter.gameId, { fromCampaign: true });
      updateCampaignButton();
      renderCampaignProgress();
    },
  });
}

function markChapterComplete(index) {
  const chapter = CAMPAIGN_CHAPTERS[index];
  if (!chapterIsCompleted(chapter.id)) {
    campaignProgress.completed.push(chapter.id);
  }
  campaignProgress.unlocked = Math.max(campaignProgress.unlocked, Math.min(index + 1, CAMPAIGN_CHAPTERS.length - 1));
  writeCampaignProgress();
  renderCampaignProgress();
  updateCampaignButton();

  const isFinalChapter = index === CAMPAIGN_CHAPTERS.length - 1;
  showStoryOverlay({
    kicker: `${chapter.label} · 通关`,
    title: chapter.title,
    speaker: chapter.outro.speaker,
    text: chapter.outro.text,
    buttonLabel: isFinalChapter ? "查看结尾" : "继续下一章",
    onConfirm() {
      if (isFinalChapter) {
        showCampaignEnding();
      } else {
        showChapterIntro(index + 1);
      }
    },
  });
}

function showCampaignEnding() {
  campaign.active = false;
  updateCampaignButton();
  renderCampaignProgress();

  showStoryOverlay({
    kicker: "剧情模式 · 第一幕完成",
    title: "裂口已经闭合",
    speaker: "旁白",
    text: "阿凯已经回家，黑店线索被撬开，林间法阵重新站稳，奶龙也成了你们的新盟友。第一幕五章已经串完，接下来我们可以继续往第二幕做地图、Boss 和支线。",
    buttonLabel: "回到工作台",
    onConfirm() {
      hideStoryOverlay();
    },
  });
}

function startCampaign() {
  const index = getResumeChapterIndex();
  showChapterIntro(index);
}

if (elements.campaignButton) {
  elements.campaignButton.addEventListener("click", startCampaign);
}

if (elements.storyButton) {
  elements.storyButton.addEventListener("click", () => {
    if (typeof storyAction === "function") {
      const action = storyAction;
      storyAction = null;
      action();
    }
  });
}

renderCatalog();
renderCampaignProgress();
updateCampaignButton();

if (games[0]) {
  loadGame(games[0].id);
} else {
  elements.statusPill.textContent = "LOAD FAILED";
  elements.statusText.textContent = "脚本没有正确初始化。";
  elements.hint.textContent = "请刷新页面，或改用部署后的在线地址访问。";
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
