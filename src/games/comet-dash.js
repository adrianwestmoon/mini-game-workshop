const BEST_SCORE_KEY = "mini-game-workshop:comet-dash:best-score";

export const cometDash = {
  id: "comet-dash",
  title: "Comet Dash",
  description:
    "驾驶飞船在碎星带里穿梭，收集能量碎片并躲开高速坠落的陨石。目标很简单，但节奏会越来越快。",
  controls: [
    "方向键 / WASD：移动",
    "Space / Enter：游戏结束后重新开始",
  ],
  create(canvas, callbacks) {
    const context = canvas.getContext("2d");
    const input = new Set();
    const state = {
      width: 960,
      height: 540,
      running: true,
      lastFrame: 0,
      score: 0,
      best: Number(localStorage.getItem(BEST_SCORE_KEY) || 0),
      lives: 3,
      elapsed: 0,
      starTimer: 0,
      cometTimer: 0,
      burstTimer: 0,
      flashTimer: 0,
      gameOver: false,
      stars: [],
      comets: [],
      ambient: Array.from({ length: 28 }, () => createAmbientTrail(960, 540)),
      player: {
        x: 160,
        y: 270,
        radius: 16,
        speed: 320,
        invulnerable: 0,
      },
    };

    function resizeCanvas() {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      state.width = Math.max(320, rect.width);
      state.height = Math.max(240, rect.height);
      canvas.width = Math.floor(state.width * dpr);
      canvas.height = Math.floor(state.height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function setMessage(status, hint) {
      callbacks.onStateChange({
        title: cometDash.title,
        description: cometDash.description,
        controls: cometDash.controls,
        score: Math.floor(state.score),
        lives: state.lives,
        best: state.best,
        status,
        hint,
      });
    }

    function resetGame() {
      state.running = true;
      state.lastFrame = 0;
      state.score = 0;
      state.lives = 3;
      state.elapsed = 0;
      state.starTimer = 0;
      state.cometTimer = 0;
      state.burstTimer = 0;
      state.flashTimer = 0;
      state.gameOver = false;
      state.stars = [];
      state.comets = [];
      state.player.x = 160;
      state.player.y = state.height / 2;
      state.player.invulnerable = 0;
      setMessage("RUNNING", "收集碎片，同时别撞上陨石。");
    }

    function createStar() {
      return {
        x: random(120, state.width - 50),
        y: random(50, state.height - 50),
        radius: random(7, 12),
        pulse: Math.random() * Math.PI * 2,
      };
    }

    function createComet() {
      const dangerScale = Math.min(1 + state.elapsed / 24, 2.8);
      return {
        x: random(40, state.width - 40),
        y: -40,
        radius: random(16, 28),
        speedY: random(190, 300) * dangerScale,
        speedX: random(-45, 45),
        spin: random(-3, 3),
      };
    }

    function finishGame() {
      state.running = false;
      state.gameOver = true;
      state.best = Math.max(state.best, Math.floor(state.score));
      localStorage.setItem(BEST_SCORE_KEY, String(state.best));
      setMessage("GAME OVER", "按 Space 或 Enter 再来一局。");
    }

    function update(delta) {
      if (state.gameOver) {
        return;
      }

      state.elapsed += delta;
      state.player.invulnerable = Math.max(0, state.player.invulnerable - delta);
      state.flashTimer = Math.max(0, state.flashTimer - delta);
      state.burstTimer += delta;

      const moveX = (input.has("arrowright") || input.has("d") ? 1 : 0) - (input.has("arrowleft") || input.has("a") ? 1 : 0);
      const moveY = (input.has("arrowdown") || input.has("s") ? 1 : 0) - (input.has("arrowup") || input.has("w") ? 1 : 0);
      const magnitude = Math.hypot(moveX, moveY) || 1;
      state.player.x += (moveX / magnitude) * state.player.speed * delta;
      state.player.y += (moveY / magnitude) * state.player.speed * delta;

      state.player.x = clamp(state.player.x, 26, state.width - 26);
      state.player.y = clamp(state.player.y, 26, state.height - 26);

      state.starTimer += delta;
      if (state.starTimer > 1.15 && state.stars.length < 4) {
        state.starTimer = 0;
        state.stars.push(createStar());
      }

      state.cometTimer += delta;
      const spawnInterval = Math.max(0.28, 0.95 - state.elapsed * 0.02);
      if (state.cometTimer > spawnInterval) {
        state.cometTimer = 0;
        state.comets.push(createComet());
      }

      for (const ambient of state.ambient) {
        ambient.y += ambient.speed * delta;
        if (ambient.y > state.height + ambient.length) {
          ambient.x = random(0, state.width);
          ambient.y = -ambient.length;
        }
      }

      state.stars = state.stars.filter((star) => {
        star.pulse += delta * 3.8;
        const distance = Math.hypot(star.x - state.player.x, star.y - state.player.y);
        if (distance < star.radius + state.player.radius + 4) {
          state.score += 10;
          state.best = Math.max(state.best, Math.floor(state.score));
          return false;
        }
        return true;
      });

      state.comets = state.comets.filter((comet) => {
        comet.x += comet.speedX * delta;
        comet.y += comet.speedY * delta;
        comet.rotation = (comet.rotation || 0) + comet.spin * delta;

        if (state.player.invulnerable <= 0) {
          const distance = Math.hypot(comet.x - state.player.x, comet.y - state.player.y);
          if (distance < comet.radius + state.player.radius - 5) {
            state.lives -= 1;
            state.player.invulnerable = 1.4;
            state.flashTimer = 0.25;
            if (state.lives <= 0) {
              finishGame();
            } else {
              setMessage("HIT TAKEN", "顶住，抓住空档继续收集碎片。");
            }
            return false;
          }
        }

        return comet.y < state.height + 60;
      });

      state.score += delta * 4;
      callbacks.onStateChange({
        title: cometDash.title,
        description: cometDash.description,
        controls: cometDash.controls,
        score: Math.floor(state.score),
        lives: state.lives,
        best: state.best,
        status: "RUNNING",
        hint: "速度会慢慢变快，尽量提前走位。",
      });
    }

    function render() {
      context.clearRect(0, 0, state.width, state.height);
      drawBackground(context, state);

      for (const star of state.stars) {
        drawCollectible(context, star);
      }

      for (const comet of state.comets) {
        drawComet(context, comet);
      }

      drawPlayer(context, state.player, state.flashTimer);
      drawWave(context, state);

      if (state.gameOver) {
        drawGameOver(context, state);
      }
    }

    function frame(timestamp) {
      const seconds = timestamp / 1000;
      const delta = Math.min(0.033, Math.max(0, seconds - state.lastFrame));
      state.lastFrame = seconds;
      update(delta);
      render();
      state.frameHandle = requestAnimationFrame(frame);
    }

    function handleKeyDown(event) {
      const key = event.key.toLowerCase();
      input.add(key);
      if (state.gameOver && (key === " " || key === "enter")) {
        resetGame();
      }
    }

    function handleKeyUp(event) {
      input.delete(event.key.toLowerCase());
    }

    resizeCanvas();
    resetGame();
    window.addEventListener("resize", resizeCanvas);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    state.frameHandle = requestAnimationFrame(frame);

    return {
      destroy() {
        cancelAnimationFrame(state.frameHandle);
        window.removeEventListener("resize", resizeCanvas);
        window.removeEventListener("keydown", handleKeyDown);
        window.removeEventListener("keyup", handleKeyUp);
      },
    };
  },
};

function drawBackground(context, state) {
  const gradient = context.createLinearGradient(0, 0, state.width, state.height);
  gradient.addColorStop(0, "#08101d");
  gradient.addColorStop(1, "#111f39");
  context.fillStyle = gradient;
  context.fillRect(0, 0, state.width, state.height);

  for (const ambient of state.ambient) {
    context.strokeStyle = `rgba(102, 231, 255, ${ambient.alpha})`;
    context.lineWidth = ambient.width;
    context.beginPath();
    context.moveTo(ambient.x, ambient.y);
    context.lineTo(ambient.x, ambient.y + ambient.length);
    context.stroke();
  }

  context.strokeStyle = "rgba(255, 255, 255, 0.05)";
  context.lineWidth = 1;
  for (let x = 0; x < state.width; x += 60) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, state.height);
    context.stroke();
  }
}

function drawCollectible(context, star) {
  const pulse = 1 + Math.sin(star.pulse) * 0.18;
  context.save();
  context.translate(star.x, star.y);
  context.fillStyle = "rgba(212, 255, 93, 0.2)";
  context.beginPath();
  context.arc(0, 0, star.radius * 2.2 * pulse, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = "#d4ff5d";
  context.beginPath();
  context.arc(0, 0, star.radius * pulse, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawComet(context, comet) {
  context.save();
  context.translate(comet.x, comet.y);
  context.rotate(comet.rotation || 0);
  context.fillStyle = "#ff875f";
  context.beginPath();
  context.arc(0, 0, comet.radius, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = "rgba(255, 210, 180, 0.4)";
  context.beginPath();
  context.arc(-comet.radius * 0.2, -comet.radius * 0.2, comet.radius * 0.35, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawPlayer(context, player, flashTimer) {
  context.save();
  context.translate(player.x, player.y);
  context.fillStyle = flashTimer > 0 ? "#ff9f88" : "#66e7ff";
  context.beginPath();
  context.moveTo(20, 0);
  context.lineTo(-12, 11);
  context.lineTo(-5, 0);
  context.lineTo(-12, -11);
  context.closePath();
  context.fill();

  context.fillStyle = "rgba(255, 255, 255, 0.75)";
  context.beginPath();
  context.arc(-2, 0, 4, 0, Math.PI * 2);
  context.fill();

  if (player.invulnerable > 0) {
    context.strokeStyle = "rgba(102, 231, 255, 0.6)";
    context.lineWidth = 2;
    context.beginPath();
    context.arc(0, 0, 24 + Math.sin(player.invulnerable * 12) * 4, 0, Math.PI * 2);
    context.stroke();
  }
  context.restore();
}

function drawWave(context, state) {
  context.save();
  context.strokeStyle = "rgba(255, 255, 255, 0.12)";
  context.lineWidth = 2;
  context.beginPath();
  for (let x = 0; x <= state.width; x += 12) {
    const y = state.height - 24 + Math.sin((x + state.burstTimer * 180) / 42) * 7;
    if (x === 0) {
      context.moveTo(x, y);
    } else {
      context.lineTo(x, y);
    }
  }
  context.stroke();
  context.restore();
}

function drawGameOver(context, state) {
  context.save();
  context.fillStyle = "rgba(4, 8, 18, 0.7)";
  context.fillRect(0, 0, state.width, state.height);

  context.fillStyle = "#f4f7fb";
  context.textAlign = "center";
  context.font = '700 42px "Avenir Next", "Trebuchet MS", sans-serif';
  context.fillText("GAME OVER", state.width / 2, state.height / 2 - 18);

  context.font = '500 18px "Avenir Next", "Trebuchet MS", sans-serif';
  context.fillStyle = "rgba(244, 247, 251, 0.8)";
  context.fillText(`本局得分 ${Math.floor(state.score)}  |  最高分 ${state.best}`, state.width / 2, state.height / 2 + 18);
  context.fillText("按 Space 或 Enter 重新开始", state.width / 2, state.height / 2 + 56);
  context.restore();
}

function createAmbientTrail(width, height) {
  return {
    x: random(0, width),
    y: random(0, height),
    length: random(30, 90),
    speed: random(80, 180),
    width: random(1, 2.5),
    alpha: random(0.14, 0.32),
  };
}

function random(min, max) {
  return Math.random() * (max - min) + min;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
