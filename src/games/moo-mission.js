const MOO_BEST_KEY = "mini-game-workshop:moo-mission:best-score";

window.mooMission = {
  id: "moo-mission",
  title: "Moo Mission",
  description:
    "以阿凯小牛为主角的横版闯关游戏。穿过草甸、风车坡和夜色谷仓，收集四叶草、避开荆棘与巡逻敌人，打开终点门。",
  controls: [
    "A / D 或方向键：左右移动",
    "W / Space / 上方向键：跳跃",
    "手机触控：画布底部左 / 右 / 跳按钮",
    "收集完本关全部四叶草后进入终点门",
  ],
  create(canvas, callbacks) {
    const context = canvas.getContext("2d");
    const audio = createMooAudio();
    const keys = new Set();
    const touchActions = new Map();

    const state = {
      width: 960,
      height: 540,
      lastFrame: 0,
      elapsed: 0,
      score: 0,
      best: readMooBest(),
      lives: 4,
      status: "RUNNING",
      levelIndex: 0,
      gameOver: false,
      won: false,
      flashTimer: 0,
      shake: 0,
      particles: [],
      clouds: Array.from({ length: 8 }, (_, index) => createCloud(index)),
      player: createPlayer(),
      level: null,
      cameraX: 0,
      touchZones: [],
    };

    function resizeCanvas() {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      state.width = Math.max(320, rect.width);
      state.height = Math.max(320, rect.height);
      canvas.width = Math.floor(state.width * dpr);
      canvas.height = Math.floor(state.height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      updateTouchZones();
    }

    function updateTouchZones() {
      const y = state.height - 70;
      state.touchZones = [
        { name: "left", x: 84, y, radius: 42 },
        { name: "right", x: 174, y, radius: 42 },
        { name: "jump", x: state.width - 90, y, radius: 48 },
      ];
    }

    function emitState(status, hint) {
      state.status = status;
      callbacks.onStateChange({
        title: `${window.mooMission.title} · ${LEVELS[state.levelIndex].name}`,
        description: window.mooMission.description,
        controls: window.mooMission.controls,
        score: Math.floor(state.score),
        lives: state.lives,
        best: state.best,
        status,
        hint,
      });
    }

    function loadLevel(index, resetScore) {
      if (resetScore) {
        state.score = 0;
        state.lives = 4;
      }

      state.levelIndex = index;
      state.level = buildLevel(LEVELS[index]);
      state.player = createPlayer({
        x: state.level.spawn.x,
        y: state.level.spawn.y,
      });
      state.cameraX = 0;
      state.flashTimer = 0;
      state.shake = 0;
      state.particles = [];
      state.gameOver = false;
      state.won = false;
      emitState(`LEVEL ${index + 1}`, `收集 ${state.level.collectibles.length} 个四叶草，打开终点门。`);
    }

    function resetRun() {
      loadLevel(0, true);
    }

    function completeLevel() {
      state.score += 120 + state.lives * 18;
      state.best = Math.max(state.best, Math.floor(state.score));
      writeMooBest(state.best);
      audio.goal();

      if (state.levelIndex === LEVELS.length - 1) {
        state.won = true;
        state.gameOver = true;
        emitState("ALL CLEAR", "阿凯小牛安全到家了，点击画布再跑一轮。");
        return;
      }

      loadLevel(state.levelIndex + 1, false);
    }

    function failLife() {
      if (state.player.invulnerable > 0 || state.gameOver) {
        return;
      }

      state.lives -= 1;
      state.player.invulnerable = 1.1;
      state.flashTimer = 0.18;
      state.shake = 10;
      audio.hurt();

      burstParticles(state.player.x, state.player.y + 16, "rgba(255, 189, 145, 0.95)", 18, 220, 0.5);

      if (state.lives <= 0) {
        state.gameOver = true;
        state.best = Math.max(state.best, Math.floor(state.score));
        writeMooBest(state.best);
        audio.gameOver();
        emitState("MISSION FAILED", "点一下画布，重新护送阿凯小牛闯关。");
        return;
      }

      const spawn = state.level.spawn;
      state.player.x = spawn.x;
      state.player.y = spawn.y;
      state.player.vx = 0;
      state.player.vy = 0;
      emitState("TRY AGAIN", "别急，这次看准平台和荆棘位置。");
    }

    function createJumpDust() {
      for (let index = 0; index < 6; index += 1) {
        state.particles.push({
          kind: "orb",
          x: state.player.x + random(-8, 8),
          y: state.player.y + 20,
          vx: random(-70, 70),
          vy: random(-24, 30),
          size: random(2, 4),
          life: random(0.16, 0.28),
          color: "rgba(255, 244, 219, 0.72)",
        });
      }
    }

    function burstParticles(x, y, color, count, speed, life) {
      for (let index = 0; index < count; index += 1) {
        state.particles.push({
          kind: index < count / 3 ? "streak" : "orb",
          x,
          y,
          vx: random(-speed, speed),
          vy: random(-speed, speed),
          size: random(2, 5),
          lineWidth: random(1, 2.4),
          life: random(life * 0.45, life),
          color,
        });
      }
    }

    function currentInput() {
      let left = keys.has("arrowleft") || keys.has("a");
      let right = keys.has("arrowright") || keys.has("d");
      let jump = keys.has("arrowup") || keys.has("w") || keys.has(" ");

      for (const action of touchActions.values()) {
        if (action === "left") {
          left = true;
        }
        if (action === "right") {
          right = true;
        }
        if (action === "jump") {
          jump = true;
        }
      }

      return { left, right, jump };
    }

    function updatePlayer(delta) {
      const input = currentInput();
      const acceleration = state.player.onGround ? 2200 : 1500;
      const friction = state.player.onGround ? 1800 : 500;
      const maxSpeed = 280;
      const previousGround = state.player.onGround;

      state.player.invulnerable = Math.max(0, state.player.invulnerable - delta);
      state.player.jumpBuffer = Math.max(0, state.player.jumpBuffer - delta);
      state.player.coyote = Math.max(0, state.player.coyote - delta);

      if (input.jump) {
        state.player.jumpBuffer = 0.12;
      }

      if (input.left && !input.right) {
        state.player.vx -= acceleration * delta;
        state.player.facing = -1;
      } else if (input.right && !input.left) {
        state.player.vx += acceleration * delta;
        state.player.facing = 1;
      } else if (state.player.vx !== 0) {
        const drag = Math.min(Math.abs(state.player.vx), friction * delta);
        state.player.vx -= Math.sign(state.player.vx) * drag;
      }

      state.player.vx = clamp(state.player.vx, -maxSpeed, maxSpeed);
      state.player.vy += 1580 * delta;

      if (state.player.onGround) {
        state.player.coyote = 0.12;
      }

      if (state.player.jumpBuffer > 0 && state.player.coyote > 0) {
        state.player.vy = -610;
        state.player.onGround = false;
        state.player.jumpBuffer = 0;
        state.player.coyote = 0;
        audio.jump();
        createJumpDust();
      }

      state.player.x += state.player.vx * delta;
      resolveHorizontalCollisions();
      state.player.y += state.player.vy * delta;
      resolveVerticalCollisions(previousGround);

      if (state.player.y > state.level.groundY + 200) {
        failLife();
      }
    }

    function resolveHorizontalCollisions() {
      for (const platform of state.level.platforms) {
        if (!overlapRect(state.player, platform)) {
          continue;
        }

        if (state.player.vx > 0) {
          state.player.x = platform.x - state.player.width / 2;
        } else if (state.player.vx < 0) {
          state.player.x = platform.x + platform.width + state.player.width / 2;
        }
        state.player.vx = 0;
      }
    }

    function resolveVerticalCollisions(previousGround) {
      state.player.onGround = false;

      for (const platform of state.level.platforms) {
        if (!overlapRect(state.player, platform)) {
          continue;
        }

        const playerBottom = state.player.y + state.player.height / 2;
        const previousBottom = playerBottom - state.player.vy * 0.016;

        if (state.player.vy >= 0 && previousBottom <= platform.y + 10) {
          state.player.y = platform.y - state.player.height / 2;
          state.player.vy = 0;
          state.player.onGround = true;
        } else if (state.player.vy < 0) {
          state.player.y = platform.y + platform.height + state.player.height / 2;
          state.player.vy = 40;
        }
      }

      if (state.player.onGround && !previousGround) {
        audio.land();
        for (let index = 0; index < 5; index += 1) {
          state.particles.push({
            kind: "orb",
            x: state.player.x + random(-8, 8),
            y: state.player.y + 21,
            vx: random(-80, 80),
            vy: random(-10, 25),
            size: random(2, 4),
            life: random(0.1, 0.2),
            color: "rgba(255, 244, 219, 0.6)",
          });
        }
      }
    }

    function updateEnemies(delta) {
      for (const enemy of state.level.enemies) {
        enemy.x += enemy.speed * enemy.direction * delta;

        if (enemy.x < enemy.minX) {
          enemy.x = enemy.minX;
          enemy.direction = 1;
        }
        if (enemy.x > enemy.maxX) {
          enemy.x = enemy.maxX;
          enemy.direction = -1;
        }

        if (Math.abs(enemy.x - state.player.x) < enemy.width / 2 + state.player.width / 2 - 6 &&
            Math.abs(enemy.y - state.player.y) < enemy.height / 2 + state.player.height / 2 - 4) {
          if (state.player.vy > 120 && state.player.y < enemy.y) {
            state.player.vy = -360;
            state.score += 35;
            audio.boop();
            burstParticles(enemy.x, enemy.y, "rgba(255, 226, 142, 0.88)", 12, 160, 0.32);
            enemy.dead = true;
          } else {
            failLife();
          }
        }
      }

      state.level.enemies = state.level.enemies.filter((enemy) => !enemy.dead);
    }

    function updateCollectibles() {
      for (const item of state.level.collectibles) {
        if (item.collected) {
          continue;
        }

        item.pulse += 0.08;
        if (Math.abs(item.x - state.player.x) < 22 && Math.abs(item.y - state.player.y) < 26) {
          item.collected = true;
          state.score += 40;
          audio.collect();
          burstParticles(item.x, item.y, "rgba(210, 255, 126, 0.88)", 10, 140, 0.26);
        }
      }
    }

    function updateHazards() {
      for (const hazard of state.level.hazards) {
        const withinX = state.player.x + state.player.width / 2 > hazard.x &&
          state.player.x - state.player.width / 2 < hazard.x + hazard.width;
        const withinY = state.player.y + state.player.height / 2 > hazard.y &&
          state.player.y + state.player.height / 2 < hazard.y + hazard.height + 8;

        if (withinX && withinY) {
          failLife();
          return;
        }
      }
    }

    function updateGate() {
      const remaining = state.level.collectibles.filter((item) => !item.collected).length;
      state.level.gate.open = remaining === 0;

      if (!state.level.gate.open) {
        return;
      }

      if (
        Math.abs(state.player.x - state.level.gate.x) < state.level.gate.width / 2 &&
        Math.abs(state.player.y - state.level.gate.y) < state.level.gate.height / 2 + 18
      ) {
        completeLevel();
      }
    }

    function updateParticles(delta) {
      for (let index = state.particles.length - 1; index >= 0; index -= 1) {
        const particle = state.particles[index];
        particle.life -= delta;
        particle.x += (particle.vx || 0) * delta;
        particle.y += (particle.vy || 0) * delta;
        particle.vx = (particle.vx || 0) * 0.98;
        particle.vy = (particle.vy || 0) * 0.98;
        particle.size = Math.max(0, particle.size + (particle.grow || 0) * delta);

        if (particle.life <= 0) {
          state.particles.splice(index, 1);
        }
      }
    }

    function updateCamera(delta) {
      state.elapsed += delta;
      state.flashTimer = Math.max(0, state.flashTimer - delta);
      state.shake = Math.max(0, state.shake - delta * 18);

      for (const cloud of state.clouds) {
        cloud.x += cloud.speed * delta;
        if (cloud.x - cloud.size > state.level.width + state.width * 0.4) {
          cloud.x = -cloud.size * 2;
        }
      }

      const targetCamera = clamp(state.player.x - state.width * 0.4, 0, Math.max(0, state.level.width - state.width));
      state.cameraX += (targetCamera - state.cameraX) * Math.min(1, delta * 3.8);
    }

    function update(delta) {
      updateParticles(delta);
      updateCamera(delta);

      if (state.gameOver) {
        emitState(state.won ? "ALL CLEAR" : "MISSION FAILED", state.won ? "阿凯小牛已经回家了，点一下再跑一轮。" : "点一下画布重新开始本次冒险。");
        return;
      }

      updatePlayer(delta);
      updateEnemies(delta);
      updateCollectibles();
      updateHazards();
      updateGate();

      emitState(
        `LEVEL ${state.levelIndex + 1}/${LEVELS.length}`,
        state.level.gate.open
          ? "终点门已经打开，带阿凯小牛进门。"
          : `还差 ${state.level.collectibles.filter((item) => !item.collected).length} 个四叶草。`,
      );
    }

    function worldToScreenX(x) {
      return x - state.cameraX;
    }

    function drawBackground() {
      const sky = context.createLinearGradient(0, 0, 0, state.height);
      sky.addColorStop(0, "#8ad7ff");
      sky.addColorStop(0.58, "#d9f4ff");
      sky.addColorStop(1, "#fff1d6");
      context.fillStyle = sky;
      context.fillRect(0, 0, state.width, state.height);

      context.fillStyle = "rgba(255, 255, 255, 0.76)";
      for (const cloud of state.clouds) {
        drawCloud(worldToScreenX(cloud.x) * 0.45, cloud.y, cloud.size);
      }

      drawHillLayer("#9ecb73", state.level.width, 0.18, 0.2, 0.7);
      drawHillLayer("#77a84e", state.level.width, 0.26, 0.32, 1);

      context.fillStyle = "#5d8f3f";
      context.fillRect(0, state.level.groundY, state.width, state.height - state.level.groundY);
    }

    function drawCloud(x, y, size) {
      context.beginPath();
      context.arc(x, y, size * 0.34, 0, Math.PI * 2);
      context.arc(x + size * 0.32, y - size * 0.06, size * 0.28, 0, Math.PI * 2);
      context.arc(x + size * 0.58, y + size * 0.04, size * 0.24, 0, Math.PI * 2);
      context.fill();
    }

    function drawHillLayer(color, width, amplitude, base, parallax) {
      context.fillStyle = color;
      context.beginPath();
      context.moveTo(0, state.height);
      for (let screenX = 0; screenX <= state.width + 20; screenX += 20) {
        const worldX = screenX + state.cameraX * parallax;
        const y =
          state.height * base +
          Math.sin(worldX / 180) * state.height * amplitude * 0.35 +
          Math.sin(worldX / 78 + 0.8) * 18;
        context.lineTo(screenX, y);
      }
      context.lineTo(state.width, state.height);
      context.closePath();
      context.fill();
    }

    function drawPlatforms() {
      for (const platform of state.level.platforms) {
        const screenX = worldToScreenX(platform.x);
        if (screenX + platform.width < -40 || screenX > state.width + 40) {
          continue;
        }

        context.fillStyle = "#6f472b";
        context.fillRect(screenX, platform.y, platform.width, platform.height);
        context.fillStyle = "#6eb44f";
        context.fillRect(screenX, platform.y, platform.width, 10);

        context.fillStyle = "rgba(255, 255, 255, 0.14)";
        context.fillRect(screenX + 8, platform.y + 16, platform.width - 16, 4);
      }
    }

    function drawHazards() {
      for (const hazard of state.level.hazards) {
        const screenX = worldToScreenX(hazard.x);
        context.fillStyle = "#2c6540";
        for (let x = 0; x < hazard.width; x += 14) {
          context.beginPath();
          context.moveTo(screenX + x, hazard.y + hazard.height);
          context.lineTo(screenX + x + 7, hazard.y);
          context.lineTo(screenX + x + 14, hazard.y + hazard.height);
          context.closePath();
          context.fill();
        }
      }
    }

    function drawCollectibles() {
      for (const item of state.level.collectibles) {
        if (item.collected) {
          continue;
        }

        const screenX = worldToScreenX(item.x);
        const scale = 1 + Math.sin(item.pulse) * 0.15;
        context.fillStyle = "rgba(210, 255, 126, 0.26)";
        context.beginPath();
        context.arc(screenX, item.y, 22 * scale, 0, Math.PI * 2);
        context.fill();

        context.fillStyle = "#d2ff7e";
        drawClover(screenX, item.y, 11 * scale);
      }
    }

    function drawClover(x, y, size) {
      for (let index = 0; index < 4; index += 1) {
        const angle = (Math.PI / 2) * index;
        context.beginPath();
        context.arc(x + Math.cos(angle) * size * 0.7, y + Math.sin(angle) * size * 0.7, size * 0.6, 0, Math.PI * 2);
        context.fill();
      }
      context.fillRect(x - 1.5, y + size * 0.4, 3, size * 1.35);
    }

    function drawEnemies() {
      for (const enemy of state.level.enemies) {
        const screenX = worldToScreenX(enemy.x);
        context.save();
        context.translate(screenX, enemy.y);
        context.scale(enemy.direction, 1);

        context.fillStyle = "#6a3d26";
        context.beginPath();
        context.ellipse(0, 8, 18, 12, 0, 0, Math.PI * 2);
        context.fill();

        context.fillStyle = "#8d5b35";
        context.beginPath();
        context.arc(10, 2, 10, 0, Math.PI * 2);
        context.fill();

        context.fillStyle = "#fff5de";
        context.fillRect(-10, 12, 4, 12);
        context.fillRect(6, 12, 4, 12);
        context.fillRect(-2, 12, 4, 12);
        context.fillRect(12, 12, 4, 12);

        context.restore();
      }
    }

    function drawGate() {
      const gate = state.level.gate;
      const screenX = worldToScreenX(gate.x);

      context.fillStyle = gate.open ? "#9be86d" : "#8e6040";
      context.fillRect(screenX - gate.width / 2, gate.y - gate.height / 2, gate.width, gate.height);
      context.fillStyle = gate.open ? "rgba(155, 232, 109, 0.28)" : "rgba(255, 245, 228, 0.14)";
      context.fillRect(screenX - gate.width / 2 + 8, gate.y - gate.height / 2 + 8, gate.width - 16, gate.height - 16);

      if (gate.open) {
        context.fillStyle = "rgba(155, 232, 109, 0.28)";
        context.beginPath();
        context.arc(screenX, gate.y, 46 + Math.sin(state.elapsed * 5) * 6, 0, Math.PI * 2);
        context.fill();
      }
    }

    function drawPlayer() {
      const blink = state.player.invulnerable > 0 && Math.floor(state.player.invulnerable * 20) % 2 === 0;
      if (blink) {
        return;
      }

      const screenX = worldToScreenX(state.player.x);
      context.save();
      context.translate(screenX, state.player.y);
      context.scale(state.player.facing, 1);

      context.fillStyle = "#fff7eb";
      context.beginPath();
      context.ellipse(0, 10, 24, 17, 0, 0, Math.PI * 2);
      context.fill();

      context.fillStyle = "#5b3a2d";
      context.beginPath();
      context.arc(-7, 5, 6, 0, Math.PI * 2);
      context.arc(7, 13, 5, 0, Math.PI * 2);
      context.fill();

      context.fillStyle = "#fff7eb";
      context.beginPath();
      context.arc(18, -1, 12, 0, Math.PI * 2);
      context.fill();

      context.fillStyle = "#ffb8c8";
      context.beginPath();
      context.arc(24, -11, 5, 0, Math.PI * 2);
      context.arc(16, -12, 5, 0, Math.PI * 2);
      context.fill();

      context.fillStyle = "#ffd47f";
      context.fillRect(15, -16, 2, 8);
      context.fillRect(21, -16, 2, 8);

      context.fillStyle = "#2a1c18";
      context.beginPath();
      context.arc(21, -3, 1.8, 0, Math.PI * 2);
      context.fill();

      context.fillStyle = "#f08c67";
      context.beginPath();
      context.ellipse(29, 2, 4, 3, 0, 0, Math.PI * 2);
      context.fill();

      context.fillStyle = "#d44747";
      context.fillRect(-6, 1, 18, 5);

      context.fillStyle = "#fff5de";
      context.fillRect(-12, 22, 4, 12);
      context.fillRect(-2, 22, 4, 12);
      context.fillRect(8, 22, 4, 12);
      context.fillRect(18, 22, 4, 12);

      context.strokeStyle = "#5b3a2d";
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(-22, 2);
      context.lineTo(-30, -4 + Math.sin(state.elapsed * 12) * 2);
      context.stroke();

      context.restore();
    }

    function drawParticles() {
      for (const particle of state.particles) {
        context.globalAlpha = Math.max(0, particle.life * 1.8);
        context.fillStyle = particle.color;
        context.strokeStyle = particle.color;
        context.lineWidth = particle.lineWidth || 2;
        const screenX = worldToScreenX(particle.x);

        if (particle.kind === "streak") {
          const angle = Math.atan2(particle.vy || 0, particle.vx || 0);
          const tail = particle.size * 2.4;
          context.beginPath();
          context.moveTo(screenX, particle.y);
          context.lineTo(screenX - Math.cos(angle) * tail, particle.y - Math.sin(angle) * tail);
          context.stroke();
        } else {
          context.beginPath();
          context.arc(screenX, particle.y, particle.size, 0, Math.PI * 2);
          context.fill();
        }
      }
      context.globalAlpha = 1;
    }

    function drawTouchControls() {
      for (const zone of state.touchZones) {
        const active = Array.from(touchActions.values()).includes(zone.name);
        context.fillStyle = active ? "rgba(255, 255, 255, 0.28)" : "rgba(255, 255, 255, 0.12)";
        context.beginPath();
        context.arc(zone.x, zone.y, zone.radius, 0, Math.PI * 2);
        context.fill();

        context.strokeStyle = "rgba(255, 255, 255, 0.2)";
        context.lineWidth = 2;
        context.stroke();

        context.fillStyle = "rgba(255, 255, 255, 0.85)";
        context.font = '700 18px "Avenir Next", "Trebuchet MS", sans-serif';
        context.textAlign = "center";
        context.fillText(zone.name === "jump" ? "JUMP" : zone.name.toUpperCase(), zone.x, zone.y + 6);
        context.textAlign = "left";
      }
    }

    function drawOverlay() {
      context.fillStyle = "rgba(22, 39, 22, 0.24)";
      context.fillRect(16, 16, 220, 54);
      context.fillStyle = "#ffffff";
      context.font = '700 16px "Avenir Next", "Trebuchet MS", sans-serif';
      context.fillText(`Level ${state.levelIndex + 1}/${LEVELS.length}`, 28, 38);
      context.fillText(`Clovers ${state.level.collectibles.filter((item) => !item.collected).length}`, 28, 58);

      if (state.gameOver) {
        context.fillStyle = "rgba(8, 16, 20, 0.7)";
        context.fillRect(0, 0, state.width, state.height);

        context.fillStyle = "#fffaf0";
        context.textAlign = "center";
        context.font = '700 46px "Avenir Next", "Trebuchet MS", sans-serif';
        context.fillText(state.won ? "MOO COMPLETE" : "TRY AGAIN", state.width / 2, state.height / 2 - 26);
        context.font = '500 19px "Avenir Next", "Trebuchet MS", sans-serif';
        context.fillText(state.won ? "阿凯小牛成功穿过全部牧场。" : "阿凯小牛摔回起点了，再闯一次。", state.width / 2, state.height / 2 + 10);
        context.fillText("Tap the stage or press Space / Enter to restart", state.width / 2, state.height / 2 + 44);
        context.textAlign = "left";
      }
    }

    function render() {
      context.clearRect(0, 0, state.width, state.height);
      context.save();

      if (state.shake > 0) {
        context.translate(random(-state.shake, state.shake), random(-state.shake, state.shake));
      }

      drawBackground();
      drawPlatforms();
      drawHazards();
      drawCollectibles();
      drawGate();
      drawEnemies();
      drawParticles();
      drawPlayer();
      drawOverlay();
      drawTouchControls();

      if (state.flashTimer > 0) {
        context.fillStyle = `rgba(255, 255, 255, ${state.flashTimer * 0.6})`;
        context.fillRect(0, 0, state.width, state.height);
      }

      context.restore();
    }

    function frame(timestamp) {
      const seconds = timestamp / 1000;
      const delta = Math.min(0.033, Math.max(0, seconds - state.lastFrame));
      state.lastFrame = seconds || 0;
      update(delta);
      render();
      state.frameHandle = window.requestAnimationFrame(frame);
    }

    function actionFromPoint(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;

      for (const zone of state.touchZones) {
        if (Math.hypot(zone.x - x, zone.y - y) <= zone.radius) {
          return zone.name;
        }
      }
      return null;
    }

    function handlePointerDown(event) {
      audio.unlock();
      if (state.gameOver) {
        resetRun();
      }

      const action = actionFromPoint(event.clientX, event.clientY);
      if (action) {
        touchActions.set(event.pointerId, action);
      }
    }

    function handlePointerMove(event) {
      if (!touchActions.has(event.pointerId)) {
        return;
      }
      const action = actionFromPoint(event.clientX, event.clientY);
      if (action) {
        touchActions.set(event.pointerId, action);
      } else {
        touchActions.delete(event.pointerId);
      }
    }

    function handlePointerUp(event) {
      touchActions.delete(event.pointerId);
    }

    function handleKeyDown(event) {
      audio.unlock();
      const key = event.key.toLowerCase();
      keys.add(key);
      if (state.gameOver && (key === " " || key === "enter")) {
        resetRun();
      }
    }

    function handleKeyUp(event) {
      keys.delete(event.key.toLowerCase());
    }

    resizeCanvas();
    resetRun();

    window.addEventListener("resize", resizeCanvas);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerup", handlePointerUp);
    canvas.addEventListener("pointercancel", handlePointerUp);
    canvas.addEventListener("pointerleave", handlePointerUp);

    state.frameHandle = window.requestAnimationFrame(frame);

    return {
      destroy() {
        audio.dispose();
        window.cancelAnimationFrame(state.frameHandle);
        window.removeEventListener("resize", resizeCanvas);
        window.removeEventListener("keydown", handleKeyDown);
        window.removeEventListener("keyup", handleKeyUp);
        canvas.removeEventListener("pointerdown", handlePointerDown);
        canvas.removeEventListener("pointermove", handlePointerMove);
        canvas.removeEventListener("pointerup", handlePointerUp);
        canvas.removeEventListener("pointercancel", handlePointerUp);
        canvas.removeEventListener("pointerleave", handlePointerUp);
      },
    };
  },
};

const LEVELS = [
  {
    name: "草甸起跑线",
    width: 1700,
    groundY: 448,
    spawn: { x: 110, y: 390 },
    gate: { x: 1560, y: 396, width: 54, height: 92 },
    platforms: [
      { x: 0, y: 448, width: 360, height: 120 },
      { x: 300, y: 388, width: 180, height: 26 },
      { x: 520, y: 344, width: 170, height: 26 },
      { x: 760, y: 404, width: 190, height: 26 },
      { x: 1010, y: 360, width: 160, height: 26 },
      { x: 1250, y: 322, width: 160, height: 26 },
      { x: 1460, y: 448, width: 240, height: 120 },
    ],
    hazards: [
      { x: 706, y: 432, width: 48, height: 20 },
      { x: 1188, y: 432, width: 54, height: 20 },
    ],
    collectibles: [
      { x: 366, y: 344 },
      { x: 586, y: 300 },
      { x: 1085, y: 318 },
      { x: 1328, y: 282 },
    ],
    enemies: [
      { x: 860, y: 376, width: 36, height: 28, speed: 72, minX: 804, maxX: 920 },
    ],
  },
  {
    name: "风车坡道",
    width: 1960,
    groundY: 454,
    spawn: { x: 120, y: 394 },
    gate: { x: 1820, y: 402, width: 54, height: 92 },
    platforms: [
      { x: 0, y: 454, width: 280, height: 120 },
      { x: 260, y: 406, width: 150, height: 24 },
      { x: 470, y: 360, width: 150, height: 24 },
      { x: 670, y: 320, width: 150, height: 24 },
      { x: 880, y: 368, width: 160, height: 24 },
      { x: 1120, y: 410, width: 140, height: 24 },
      { x: 1320, y: 350, width: 170, height: 24 },
      { x: 1570, y: 304, width: 170, height: 24 },
      { x: 1760, y: 454, width: 240, height: 120 },
    ],
    hazards: [
      { x: 420, y: 438, width: 42, height: 18 },
      { x: 1040, y: 438, width: 58, height: 18 },
      { x: 1495, y: 438, width: 56, height: 18 },
    ],
    collectibles: [
      { x: 322, y: 362 },
      { x: 536, y: 318 },
      { x: 738, y: 280 },
      { x: 1368, y: 308 },
      { x: 1638, y: 262 },
    ],
    enemies: [
      { x: 954, y: 340, width: 36, height: 28, speed: 90, minX: 900, maxX: 1018 },
      { x: 1662, y: 276, width: 36, height: 28, speed: 82, minX: 1602, maxX: 1718 },
    ],
  },
  {
    name: "夜谷归家路",
    width: 2260,
    groundY: 458,
    spawn: { x: 130, y: 396 },
    gate: { x: 2100, y: 404, width: 54, height: 92 },
    platforms: [
      { x: 0, y: 458, width: 300, height: 120 },
      { x: 320, y: 414, width: 150, height: 24 },
      { x: 520, y: 368, width: 150, height: 24 },
      { x: 730, y: 332, width: 150, height: 24 },
      { x: 960, y: 398, width: 150, height: 24 },
      { x: 1180, y: 354, width: 150, height: 24 },
      { x: 1390, y: 310, width: 160, height: 24 },
      { x: 1620, y: 360, width: 170, height: 24 },
      { x: 1870, y: 320, width: 160, height: 24 },
      { x: 2040, y: 458, width: 240, height: 120 },
    ],
    hazards: [
      { x: 470, y: 442, width: 44, height: 16 },
      { x: 1128, y: 442, width: 48, height: 16 },
      { x: 1798, y: 442, width: 52, height: 16 },
    ],
    collectibles: [
      { x: 385, y: 372 },
      { x: 584, y: 324 },
      { x: 793, y: 286 },
      { x: 1245, y: 310 },
      { x: 1468, y: 266 },
      { x: 1934, y: 278 },
    ],
    enemies: [
      { x: 1038, y: 370, width: 36, height: 28, speed: 96, minX: 988, maxX: 1092 },
      { x: 1705, y: 332, width: 36, height: 28, speed: 104, minX: 1642, maxX: 1764 },
      { x: 1958, y: 292, width: 36, height: 28, speed: 88, minX: 1896, maxX: 2010 },
    ],
  },
];

function buildLevel(template) {
  return {
    name: template.name,
    width: template.width,
    groundY: template.groundY,
    spawn: { ...template.spawn },
    gate: { ...template.gate, open: false },
    platforms: template.platforms.map((platform) => ({ ...platform })),
    hazards: template.hazards.map((hazard) => ({ ...hazard })),
    collectibles: template.collectibles.map((item) => ({
      ...item,
      pulse: Math.random() * Math.PI * 2,
      collected: false,
    })),
    enemies: template.enemies.map((enemy) => ({
      ...enemy,
      direction: Math.random() > 0.5 ? 1 : -1,
      dead: false,
    })),
  };
}

function createPlayer(overrides = {}) {
  return {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    width: 38,
    height: 42,
    onGround: false,
    jumpBuffer: 0,
    coyote: 0,
    facing: 1,
    invulnerable: 0,
    ...overrides,
  };
}

function overlapRect(player, platform) {
  return (
    player.x + player.width / 2 > platform.x &&
    player.x - player.width / 2 < platform.x + platform.width &&
    player.y + player.height / 2 > platform.y &&
    player.y - player.height / 2 < platform.y + platform.height
  );
}

function createCloud(index) {
  return {
    x: index * 260 - 120,
    y: 70 + (index % 3) * 42,
    size: 74 + (index % 4) * 10,
    speed: 6 + (index % 3) * 3,
  };
}

function random(min, max) {
  return Math.random() * (max - min) + min;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function readMooBest() {
  try {
    return Number(window.localStorage.getItem(MOO_BEST_KEY) || 0);
  } catch {
    return 0;
  }
}

function writeMooBest(value) {
  try {
    window.localStorage.setItem(MOO_BEST_KEY, String(value));
  } catch {
    // file:// mode can block storage.
  }
}

function createMooAudio() {
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  let context = null;
  let master = null;
  let unlocked = false;

  function ensureContext() {
    if (!AudioContextCtor) {
      return null;
    }
    if (!context) {
      context = new AudioContextCtor();
      master = context.createGain();
      master.gain.value = 0.18;
      master.connect(context.destination);
    }
    return context;
  }

  async function unlock() {
    const nextContext = ensureContext();
    if (!nextContext) {
      return;
    }
    try {
      if (nextContext.state === "suspended") {
        await nextContext.resume();
      }
      unlocked = nextContext.state === "running";
    } catch {
      unlocked = false;
    }
  }

  function chirp(type, start, end, duration, gain) {
    const nextContext = ensureContext();
    if (!unlocked || !nextContext || nextContext.state !== "running" || !master) {
      return;
    }
    const oscillator = nextContext.createOscillator();
    const gainNode = nextContext.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(start, nextContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(end, nextContext.currentTime + duration);
    gainNode.gain.setValueAtTime(0.0001, nextContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(gain, nextContext.currentTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, nextContext.currentTime + duration + 0.05);
    oscillator.connect(gainNode);
    gainNode.connect(master);
    oscillator.start(nextContext.currentTime);
    oscillator.stop(nextContext.currentTime + duration + 0.06);
  }

  return {
    unlock,
    jump() {
      chirp("triangle", 280, 520, 0.08, 0.045);
    },
    land() {
      chirp("sine", 180, 110, 0.06, 0.02);
    },
    collect() {
      chirp("triangle", 480, 920, 0.12, 0.05);
    },
    goal() {
      chirp("sine", 360, 960, 0.22, 0.06);
    },
    boop() {
      chirp("square", 240, 130, 0.1, 0.04);
    },
    hurt() {
      chirp("sawtooth", 240, 70, 0.22, 0.06);
    },
    gameOver() {
      chirp("triangle", 200, 45, 0.45, 0.06);
    },
    dispose() {
      if (context && context.state === "running") {
        context.suspend().catch(() => {});
      }
    },
  };
}
