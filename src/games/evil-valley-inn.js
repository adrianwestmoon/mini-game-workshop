const EVIL_INN_BEST_KEY = "mini-game-workshop:evil-valley-inn:best-score";

window.evilValleyInn = {
  id: "evil-valley-inn",
  title: "恶人谷黑店",
  description:
    "正义主角金声潜入黑店三重关卡，对抗喷火岳、需求仙师和荔枝头陀，最后救出门口被拴着的小牛阿凯，冲出恶人谷。",
  controls: [
    "拖动屏幕 / 鼠标：移动金声",
    "WASD / 方向键：备用移动",
    "靠近线索自动收集，靠近出口自动进下一关",
    "点击画布或按 Space / Enter：失败后重开",
  ],
  create(canvas, callbacks) {
    const context = canvas.getContext("2d");
    const audio = createInnAudio();
    const input = new Set();
    const pointer = {
      active: false,
      x: 0,
      y: 0,
    };

    const state = {
      width: 960,
      height: 540,
      lastFrame: 0,
      elapsed: 0,
      score: 0,
      best: readInnBest(),
      lives: 4,
      levelIndex: 0,
      flashTimer: 0,
      shake: 0,
      particles: [],
      gameOver: false,
      won: false,
      player: createInnPlayer(),
      level: null,
    };

    function resizeCanvas() {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      state.width = Math.max(320, rect.width);
      state.height = Math.max(280, rect.height);
      canvas.width = Math.floor(state.width * dpr);
      canvas.height = Math.floor(state.height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);

      if (state.level) {
        const index = state.levelIndex;
        const score = state.score;
        const lives = state.lives;
        const best = state.best;
        loadLevel(index, false);
        state.score = score;
        state.lives = lives;
        state.best = best;
      }
    }

    function emitState(status, hint) {
      callbacks.onStateChange({
        title: `${window.evilValleyInn.title} · ${INN_LEVELS[state.levelIndex].name}`,
        description: window.evilValleyInn.description,
        controls: window.evilValleyInn.controls,
        score: Math.floor(state.score),
        lives: state.lives,
        best: state.best,
        status,
        hint,
      });
    }

    function loadLevel(index, fullReset) {
      if (fullReset) {
        state.score = 0;
        state.lives = 4;
      }

      state.levelIndex = index;
      state.level = createInnLevel(INN_LEVELS[index], state.width, state.height);
      state.player = createInnPlayer({
        x: state.level.spawn.x,
        y: state.level.spawn.y,
      });
      state.flashTimer = 0;
      state.shake = 0;
      state.gameOver = false;
      state.won = false;
      emitState(`STAGE ${index + 1}`, `${state.level.goalLabel} 还差 ${remainingClues()} 份。`);
    }

    function remainingClues() {
      return state.level.clues.filter((clue) => !clue.collected).length;
    }

    function restartRun() {
      loadLevel(0, true);
    }

    function nextStage() {
      state.score += 120 + state.lives * 12;
      state.best = Math.max(state.best, Math.floor(state.score));
      writeInnBest(state.best);
      audio.stageClear();

      if (state.levelIndex >= INN_LEVELS.length - 1) {
        state.won = true;
        state.gameOver = true;
        emitState("ALL CLEAR", "金声带着阿凯冲出黑店了，点击画布可重开。");
        return;
      }

      loadLevel(state.levelIndex + 1, false);
    }

    function damagePlayer(reason) {
      if (state.player.invulnerable > 0 || state.gameOver) {
        return;
      }

      state.lives -= 1;
      state.player.invulnerable = 1.2;
      state.flashTimer = 0.18;
      state.shake = 12;
      audio.hurt();
      burst(state.player.x, state.player.y, "rgba(255, 173, 122, 0.95)", 18, 220, 0.4);

      if (state.lives <= 0) {
        state.gameOver = true;
        state.best = Math.max(state.best, Math.floor(state.score));
        writeInnBest(state.best);
        audio.gameOver();
        emitState("MISSION FAILED", `被${reason}拖住了，点一下重新闯黑店。`);
        return;
      }

      state.player.x = state.level.spawn.x;
      state.player.y = state.level.spawn.y;
      state.player.vx = 0;
      state.player.vy = 0;
      emitState("TRY AGAIN", `这次别再被${reason}带偏节奏。`);
    }

    function collectClue(clue) {
      clue.collected = true;
      state.score += 45;
      state.best = Math.max(state.best, Math.floor(state.score));
      burst(clue.x, clue.y, "rgba(221, 255, 123, 0.9)", 12, 150, 0.28);
      audio.collect();
      emitState("CLUE FOUND", `${state.level.goalLabel} 还差 ${remainingClues()} 份。`);
    }

    function spawnParticle(particle) {
      state.particles.push(particle);
    }

    function burst(x, y, color, count, speed, life) {
      for (let index = 0; index < count; index += 1) {
        spawnParticle({
          kind: index < count / 3 ? "streak" : "orb",
          x,
          y,
          vx: random(-speed, speed),
          vy: random(-speed, speed),
          size: random(2, 5),
          lineWidth: random(1, 2.3),
          life: random(life * 0.45, life),
          color,
        });
      }
    }

    function currentInput() {
      return {
        left: input.has("arrowleft") || input.has("a"),
        right: input.has("arrowright") || input.has("d"),
        up: input.has("arrowup") || input.has("w"),
        down: input.has("arrowdown") || input.has("s"),
      };
    }

    function updatePlayer(delta) {
      const controls = currentInput();
      let moveX = 0;
      let moveY = 0;

      if (pointer.active) {
        const dx = pointer.x - state.player.x;
        const dy = pointer.y - state.player.y;
        const length = Math.hypot(dx, dy);
        if (length > 8) {
          moveX = dx / length;
          moveY = dy / length;
        }
      } else {
        moveX = (controls.right ? 1 : 0) - (controls.left ? 1 : 0);
        moveY = (controls.down ? 1 : 0) - (controls.up ? 1 : 0);
        const length = Math.hypot(moveX, moveY) || 1;
        moveX /= length;
        moveY /= length;
      }

      state.player.invulnerable = Math.max(0, state.player.invulnerable - delta);
      state.player.vx = moveX * state.player.speed;
      state.player.vy = moveY * state.player.speed;

      const previousX = state.player.x;
      const previousY = state.player.y;

      state.player.x += state.player.vx * delta;
      resolveWallCollision("x", previousX, previousY);
      state.player.y += state.player.vy * delta;
      resolveWallCollision("y", previousX, previousY);

      state.player.x = clamp(state.player.x, 26, state.width - 26);
      state.player.y = clamp(state.player.y, 32, state.height - 28);

      const moved = Math.hypot(state.player.x - previousX, state.player.y - previousY);
      if (moved > 1.4) {
        spawnParticle({
          kind: "orb",
          x: state.player.x + random(-4, 4),
          y: state.player.y + 18,
          vx: random(-30, 30),
          vy: random(30, 80),
          size: random(2, 3.5),
          life: random(0.08, 0.16),
          color: "rgba(255, 244, 222, 0.34)",
        });
      }
    }

    function resolveWallCollision(axis, previousX, previousY) {
      for (const wall of state.level.walls) {
        if (!circleHitsRect(state.player.x, state.player.y, state.player.radius, wall)) {
          continue;
        }

        if (axis === "x") {
          state.player.x = previousX;
          state.player.vx = 0;
        } else {
          state.player.y = previousY;
          state.player.vy = 0;
        }
      }
    }

    function updateEnemies(delta) {
      for (const enemy of state.level.enemies) {
        enemy.timer += delta;
        enemy.phase += delta * enemy.speedFactor;

        if (enemy.kind === "penfire-yue") {
          enemy.x = enemy.anchorX + Math.sin(enemy.phase) * enemy.range;
          if (enemy.timer >= enemy.fireRate) {
            enemy.timer = 0;
            launchProjectile(enemy, state.player.x, state.player.y, 210, "speech", "rgba(255, 137, 100, 0.9)");
            audio.enemyCast();
          }
        }

        if (enemy.kind === "xi-master") {
          if (enemy.timer >= enemy.shiftRate) {
            enemy.timer = 0;
            enemy.activePattern = (enemy.activePattern + 1) % enemy.patterns.length;
            state.level.dynamicWalls = enemy.patterns[enemy.activePattern].map((wall) => ({ ...wall }));
            audio.ruleShift();
            burst(enemy.x, enemy.y, "rgba(137, 214, 255, 0.85)", 12, 130, 0.24);
          }
        }

        if (enemy.kind === "lychee-monk") {
          enemy.x = enemy.anchorX + Math.cos(enemy.phase * 0.9) * enemy.range;
          enemy.y = enemy.anchorY + Math.sin(enemy.phase * 1.4) * 18;
          if (enemy.timer >= enemy.fireRate) {
            enemy.timer = 0;
            launchOrbitProjectiles(enemy);
            audio.enemyCast();
          }
        }
      }
    }

    function launchProjectile(enemy, targetX, targetY, speed, type, color) {
      const angle = Math.atan2(targetY - enemy.y, targetX - enemy.x);
      state.level.projectiles.push({
        x: enemy.x,
        y: enemy.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: type === "speech" ? 11 : 8,
        type,
        color,
      });
    }

    function launchOrbitProjectiles(enemy) {
      const base = enemy.phase * 1.7;
      for (const offset of [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5]) {
        const angle = base + offset;
        state.level.projectiles.push({
          x: enemy.x,
          y: enemy.y,
          vx: Math.cos(angle) * 180,
          vy: Math.sin(angle) * 180,
          radius: 8,
          type: "rumor",
          color: "rgba(193, 118, 255, 0.88)",
        });
      }
    }

    function updateProjectiles(delta) {
      for (let index = state.level.projectiles.length - 1; index >= 0; index -= 1) {
        const projectile = state.level.projectiles[index];
        projectile.x += projectile.vx * delta;
        projectile.y += projectile.vy * delta;

        if (
          projectile.x < -30 ||
          projectile.x > state.width + 30 ||
          projectile.y < -30 ||
          projectile.y > state.height + 30
        ) {
          state.level.projectiles.splice(index, 1);
          continue;
        }

        for (const wall of combinedWalls()) {
          if (circleHitsRect(projectile.x, projectile.y, projectile.radius, wall)) {
            state.level.projectiles.splice(index, 1);
            break;
          }
        }

        if (!state.level.projectiles[index]) {
          continue;
        }

        if (Math.hypot(projectile.x - state.player.x, projectile.y - state.player.y) < projectile.radius + state.player.radius - 2) {
          state.level.projectiles.splice(index, 1);
          damagePlayer(projectile.type === "speech" ? "喷火岳" : projectile.type === "rumor" ? "荔枝头陀" : "黑店机关");
        }
      }
    }

    function combinedWalls() {
      return state.level.walls.concat(state.level.dynamicWalls || []);
    }

    function updateClues() {
      for (const clue of state.level.clues) {
        clue.pulse += 0.12;
        if (!clue.collected && Math.hypot(clue.x - state.player.x, clue.y - state.player.y) < 26) {
          collectClue(clue);
        }
      }
    }

    function updateGate() {
      state.level.exitOpen = remainingClues() === 0;
      if (state.level.calf && state.level.exitOpen) {
        state.level.calf.freed = true;
      }

      if (
        state.level.exitOpen &&
        Math.abs(state.player.x - state.level.exit.x) < state.level.exit.width / 2 &&
        Math.abs(state.player.y - state.level.exit.y) < state.level.exit.height / 2
      ) {
        nextStage();
      }
    }

    function updateParticles(delta) {
      for (let index = state.particles.length - 1; index >= 0; index -= 1) {
        const particle = state.particles[index];
        particle.life -= delta;
        particle.x += (particle.vx || 0) * delta;
        particle.y += (particle.vy || 0) * delta;
        particle.vx = (particle.vx || 0) * 0.985;
        particle.vy = (particle.vy || 0) * 0.985;
        if (particle.life <= 0) {
          state.particles.splice(index, 1);
        }
      }
    }

    function update(delta) {
      state.elapsed += delta;
      state.flashTimer = Math.max(0, state.flashTimer - delta);
      state.shake = Math.max(0, state.shake - delta * 22);
      updateParticles(delta);

      if (state.gameOver) {
        emitState(state.won ? "ALL CLEAR" : "MISSION FAILED", state.won ? "点一下可以再杀回黑店。" : "点一下重新闯关。");
        return;
      }

      updatePlayer(delta);
      updateEnemies(delta);
      updateProjectiles(delta);
      updateClues();
      updateGate();

      emitState(
        `STAGE ${state.levelIndex + 1}/${INN_LEVELS.length}`,
        state.level.exitOpen ? "出口已经打开，带着线索冲出去。" : `${state.level.goalLabel} 还差 ${remainingClues()} 份。`,
      );
    }

    function drawBackground() {
      const gradient = context.createLinearGradient(0, 0, state.width, state.height);
      gradient.addColorStop(0, state.level.palette.top);
      gradient.addColorStop(1, state.level.palette.bottom);
      context.fillStyle = gradient;
      context.fillRect(0, 0, state.width, state.height);

      context.fillStyle = state.level.palette.pattern;
      for (let y = 0; y < state.height; y += 56) {
        context.fillRect(0, y, state.width, 2);
      }
      for (let x = 0; x < state.width; x += 56) {
        context.fillRect(x, 0, 2, state.height);
      }
    }

    function drawWalls() {
      for (const wall of state.level.walls) {
        drawWall(wall, state.level.palette.wall);
      }
      for (const wall of state.level.dynamicWalls) {
        drawWall(wall, state.level.palette.dynamicWall);
      }
    }

    function drawWall(wall, color) {
      context.fillStyle = color;
      context.fillRect(wall.x, wall.y, wall.width, wall.height);
      context.fillStyle = "rgba(255, 255, 255, 0.08)";
      context.fillRect(wall.x + 6, wall.y + 6, wall.width - 12, 6);
    }

    function drawClues() {
      for (const clue of state.level.clues) {
        if (clue.collected) {
          continue;
        }

        const scale = 1 + Math.sin(clue.pulse) * 0.16;
        context.fillStyle = "rgba(221, 255, 123, 0.18)";
        context.beginPath();
        context.arc(clue.x, clue.y, 20 * scale, 0, Math.PI * 2);
        context.fill();

        context.fillStyle = "#f5f0db";
        context.fillRect(clue.x - 11, clue.y - 14, 22, 28);
        context.fillStyle = "#d7ff7e";
        context.fillRect(clue.x - 7, clue.y - 7, 14, 3);
        context.fillRect(clue.x - 7, clue.y, 10, 3);
      }
    }

    function drawEnemies() {
      for (const enemy of state.level.enemies) {
        context.save();
        context.translate(enemy.x, enemy.y);

        if (enemy.kind === "penfire-yue") {
          context.fillStyle = "#ff9867";
          context.beginPath();
          context.arc(0, 0, 18, 0, Math.PI * 2);
          context.fill();
          context.fillStyle = "#fff3df";
          context.fillRect(-9, -24, 18, 10);
          context.fillStyle = "#3f1b14";
          context.beginPath();
          context.arc(-5, -2, 2.2, 0, Math.PI * 2);
          context.arc(5, -2, 2.2, 0, Math.PI * 2);
          context.fill();
          context.fillRect(-8, 8, 16, 3);
        }

        if (enemy.kind === "xi-master") {
          context.fillStyle = "#7edcff";
          context.fillRect(-20, -20, 40, 40);
          context.fillStyle = "#10263b";
          context.fillRect(-12, -12, 24, 24);
          context.fillStyle = "#d9ff7e";
          context.fillRect(-8, 8, 16, 4);
        }

        if (enemy.kind === "lychee-monk") {
          context.fillStyle = "#b86eff";
          context.beginPath();
          context.arc(0, 0, 17, 0, Math.PI * 2);
          context.fill();
          context.fillStyle = "#ffe7c2";
          context.beginPath();
          context.arc(0, -3, 9, 0, Math.PI * 2);
          context.fill();
          context.fillStyle = "#5c2d7a";
          context.fillRect(-10, 10, 20, 4);
        }

        context.restore();
      }
    }

    function drawProjectiles() {
      for (const projectile of state.level.projectiles) {
        context.fillStyle = projectile.color;
        context.beginPath();
        context.arc(projectile.x, projectile.y, projectile.radius, 0, Math.PI * 2);
        context.fill();

        if (projectile.type === "speech") {
          context.fillStyle = "rgba(255, 255, 255, 0.7)";
          context.fillRect(projectile.x - 6, projectile.y - 2, 12, 3);
        }
      }
    }

    function drawExit() {
      const gate = state.level.exit;
      context.fillStyle = state.level.exitOpen ? "#9ce86c" : "#795640";
      context.fillRect(gate.x - gate.width / 2, gate.y - gate.height / 2, gate.width, gate.height);
      context.fillStyle = state.level.exitOpen ? "rgba(156, 232, 108, 0.28)" : "rgba(255, 250, 235, 0.12)";
      context.fillRect(gate.x - gate.width / 2 + 8, gate.y - gate.height / 2 + 8, gate.width - 16, gate.height - 16);

      if (state.level.exitOpen) {
        context.fillStyle = "rgba(156, 232, 108, 0.18)";
        context.beginPath();
        context.arc(gate.x, gate.y, 42 + Math.sin(state.elapsed * 5) * 6, 0, Math.PI * 2);
        context.fill();
      }

      if (state.level.calf) {
        context.fillStyle = state.level.calf.freed ? "#d4ff7d" : "#fff4e0";
        context.beginPath();
        context.ellipse(state.level.calf.x, state.level.calf.y + 8, 20, 14, 0, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = "#5b3a2d";
        context.beginPath();
        context.arc(state.level.calf.x + 15, state.level.calf.y + 1, 9, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = state.level.calf.freed ? "rgba(212, 255, 125, 0.8)" : "rgba(255, 170, 120, 0.8)";
        context.lineWidth = 3;
        context.beginPath();
        context.moveTo(state.level.calf.x - 22, state.level.calf.y + 4);
        context.lineTo(state.level.calf.x - 56, state.level.calf.y + 4);
        context.stroke();
      }
    }

    function drawPlayer() {
      const blinking = state.player.invulnerable > 0 && Math.floor(state.player.invulnerable * 18) % 2 === 0;
      if (blinking) {
        return;
      }

      context.save();
      context.translate(state.player.x, state.player.y);

      context.fillStyle = "#ffe2b2";
      context.beginPath();
      context.arc(0, -10, 14, 0, Math.PI * 2);
      context.fill();

      context.fillStyle = "#0f2238";
      context.fillRect(-14, 4, 28, 22);
      context.fillStyle = "#76e5ff";
      context.fillRect(-8, 10, 16, 6);
      context.fillStyle = "#ff926a";
      context.fillRect(-11, 26, 8, 16);
      context.fillRect(3, 26, 8, 16);

      context.fillStyle = "#2c1f1b";
      context.beginPath();
      context.arc(-5, -12, 2, 0, Math.PI * 2);
      context.arc(5, -12, 2, 0, Math.PI * 2);
      context.fill();

      context.restore();
    }

    function drawParticles() {
      for (const particle of state.particles) {
        context.globalAlpha = Math.max(0, particle.life * 2);
        context.fillStyle = particle.color;
        context.strokeStyle = particle.color;
        context.lineWidth = particle.lineWidth || 2;

        if (particle.kind === "streak") {
          const angle = Math.atan2(particle.vy || 0, particle.vx || 0);
          const tail = particle.size * 2.4;
          context.beginPath();
          context.moveTo(particle.x, particle.y);
          context.lineTo(particle.x - Math.cos(angle) * tail, particle.y - Math.sin(angle) * tail);
          context.stroke();
        } else {
          context.beginPath();
          context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
          context.fill();
        }
      }
      context.globalAlpha = 1;
    }

    function drawOverlay() {
      context.fillStyle = "rgba(6, 10, 18, 0.2)";
      context.fillRect(16, 16, 260, 58);
      context.fillStyle = "#ffffff";
      context.font = '700 16px "Avenir Next", "Trebuchet MS", sans-serif';
      context.fillText(`Stage ${state.levelIndex + 1}/${INN_LEVELS.length}`, 30, 38);
      context.fillText(`${state.level.goalLabel} ${remainingClues()}`, 30, 60);

      if (state.gameOver) {
        context.fillStyle = "rgba(6, 10, 18, 0.72)";
        context.fillRect(0, 0, state.width, state.height);
        context.fillStyle = "#fffaf0";
        context.textAlign = "center";
        context.font = '700 42px "Avenir Next", "Trebuchet MS", sans-serif';
        context.fillText(state.won ? "BLACK INN CLEARED" : "RUN LOST", state.width / 2, state.height / 2 - 20);
        context.font = '500 18px "Avenir Next", "Trebuchet MS", sans-serif';
        context.fillText(
          state.won ? "阿凯得救了，黑店也被你拆穿了。" : "黑店还在，点一下再来一轮。",
          state.width / 2,
          state.height / 2 + 16,
        );
        context.fillText("Tap the stage or press Space / Enter to restart", state.width / 2, state.height / 2 + 48);
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
      drawWalls();
      drawClues();
      drawExit();
      drawEnemies();
      drawProjectiles();
      drawParticles();
      drawPlayer();
      drawOverlay();

      if (state.flashTimer > 0) {
        context.fillStyle = `rgba(255, 255, 255, ${state.flashTimer * 0.45})`;
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

    function updatePointer(event) {
      const rect = canvas.getBoundingClientRect();
      pointer.x = clamp(event.clientX - rect.left, 0, rect.width);
      pointer.y = clamp(event.clientY - rect.top, 0, rect.height);
    }

    function handlePointerDown(event) {
      audio.unlock();
      if (state.gameOver) {
        restartRun();
      }
      pointer.active = true;
      updatePointer(event);
    }

    function handlePointerMove(event) {
      updatePointer(event);
    }

    function handlePointerUp() {
      pointer.active = false;
    }

    function handleKeyDown(event) {
      audio.unlock();
      const key = event.key.toLowerCase();
      input.add(key);
      if (state.gameOver && (key === " " || key === "enter")) {
        restartRun();
      }
    }

    function handleKeyUp(event) {
      input.delete(event.key.toLowerCase());
    }

    resizeCanvas();
    restartRun();

    window.addEventListener("resize", resizeCanvas);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerup", handlePointerUp);
    canvas.addEventListener("pointerleave", handlePointerUp);
    canvas.addEventListener("click", () => {
      if (state.gameOver) {
        restartRun();
      }
    });

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
        canvas.removeEventListener("pointerleave", handlePointerUp);
      },
    };
  },
};

const INN_LEVELS = [
  {
    name: "前厅嘴炮阵",
    palette: {
      top: "#241421",
      bottom: "#4d2328",
      pattern: "rgba(255,255,255,0.04)",
      wall: "#7c4c35",
      dynamicWall: "#9f7652",
    },
    goalLabel: "收据线索",
    spawn: { x: 94, y: 428 },
    exit: { x: 860, y: 100, width: 70, height: 90 },
    calf: null,
    walls: [
      { x: 0, y: 0, width: 960, height: 34 },
      { x: 0, y: 506, width: 960, height: 34 },
      { x: 0, y: 0, width: 34, height: 540 },
      { x: 926, y: 0, width: 34, height: 540 },
      { x: 180, y: 140, width: 90, height: 28 },
      { x: 180, y: 140, width: 28, height: 170 },
      { x: 340, y: 250, width: 180, height: 26 },
      { x: 610, y: 140, width: 28, height: 220 },
      { x: 700, y: 360, width: 170, height: 26 },
    ],
    dynamicWalls: [],
    clues: [
      { x: 122, y: 104, pulse: 0, collected: false },
      { x: 444, y: 180, pulse: 0, collected: false },
      { x: 802, y: 298, pulse: 0, collected: false },
    ],
    enemies: [
      {
        kind: "penfire-yue",
        x: 760,
        y: 150,
        anchorX: 760,
        anchorY: 150,
        range: 88,
        fireRate: 1.1,
        speedFactor: 1.6,
        phase: 0,
        timer: 0,
      },
    ],
    projectiles: [],
  },
  {
    name: "改需求工坊",
    palette: {
      top: "#10233d",
      bottom: "#254466",
      pattern: "rgba(255,255,255,0.05)",
      wall: "#486985",
      dynamicWall: "#7dd6ff",
    },
    goalLabel: "改稿证据",
    spawn: { x: 88, y: 92 },
    exit: { x: 858, y: 438, width: 70, height: 90 },
    calf: null,
    walls: [
      { x: 0, y: 0, width: 960, height: 34 },
      { x: 0, y: 506, width: 960, height: 34 },
      { x: 0, y: 0, width: 34, height: 540 },
      { x: 926, y: 0, width: 34, height: 540 },
      { x: 180, y: 100, width: 28, height: 340 },
      { x: 340, y: 100, width: 28, height: 340 },
      { x: 540, y: 100, width: 28, height: 340 },
      { x: 740, y: 100, width: 28, height: 340 },
    ],
    dynamicWalls: [],
    clues: [
      { x: 260, y: 438, pulse: 0, collected: false },
      { x: 470, y: 98, pulse: 0, collected: false },
      { x: 678, y: 438, pulse: 0, collected: false },
    ],
    enemies: [
      {
        kind: "xi-master",
        x: 452,
        y: 268,
        phase: 0,
        timer: 0,
        speedFactor: 0.7,
        shiftRate: 2.1,
        activePattern: 0,
        patterns: [
          [
            { x: 208, y: 220, width: 132, height: 22 },
            { x: 568, y: 312, width: 172, height: 22 },
          ],
          [
            { x: 368, y: 142, width: 172, height: 22 },
            { x: 568, y: 390, width: 172, height: 22 },
          ],
          [
            { x: 208, y: 312, width: 132, height: 22 },
            { x: 568, y: 142, width: 172, height: 22 },
          ],
        ],
      },
    ],
    projectiles: [],
  },
  {
    name: "后院牛栏",
    palette: {
      top: "#1f1836",
      bottom: "#37214d",
      pattern: "rgba(255,255,255,0.05)",
      wall: "#654b2b",
      dynamicWall: "#8b6cff",
    },
    goalLabel: "解锁钥匙",
    spawn: { x: 96, y: 430 },
    exit: { x: 858, y: 94, width: 70, height: 90 },
    calf: { x: 820, y: 408, freed: false },
    walls: [
      { x: 0, y: 0, width: 960, height: 34 },
      { x: 0, y: 506, width: 960, height: 34 },
      { x: 0, y: 0, width: 34, height: 540 },
      { x: 926, y: 0, width: 34, height: 540 },
      { x: 160, y: 360, width: 210, height: 24 },
      { x: 420, y: 250, width: 160, height: 24 },
      { x: 618, y: 360, width: 240, height: 24 },
      { x: 738, y: 202, width: 24, height: 160 },
    ],
    dynamicWalls: [],
    clues: [
      { x: 238, y: 312, pulse: 0, collected: false },
      { x: 492, y: 196, pulse: 0, collected: false },
      { x: 688, y: 432, pulse: 0, collected: false },
      { x: 814, y: 170, pulse: 0, collected: false },
    ],
    enemies: [
      {
        kind: "lychee-monk",
        x: 470,
        y: 118,
        anchorX: 470,
        anchorY: 118,
        range: 90,
        fireRate: 1.25,
        speedFactor: 1.8,
        phase: 0,
        timer: 0,
      },
    ],
    projectiles: [],
  },
];

function createInnLevel(template, width, height) {
  const level = {
    ...template,
    palette: { ...template.palette },
    spawn: { ...template.spawn },
    exit: { ...template.exit },
    calf: template.calf ? { ...template.calf } : null,
    walls: template.walls.map((wall) => ({ ...wall })),
    dynamicWalls: template.dynamicWalls.map((wall) => ({ ...wall })),
    clues: template.clues.map((clue) => ({ ...clue })),
    enemies: template.enemies.map((enemy) => ({
      ...enemy,
      patterns: enemy.patterns ? enemy.patterns.map((pattern) => pattern.map((wall) => ({ ...wall }))) : undefined,
    })),
    projectiles: [],
    goalLabel: template.goalLabel,
    name: template.name,
  };

  fitLevelToCanvas(level, width, height);
  return level;
}

function fitLevelToCanvas(level, width = 960, height = 540) {
  const sx = width / 960;
  const sy = height / 540;
  const scaleWall = (wall) => ({
    x: wall.x * sx,
    y: wall.y * sy,
    width: wall.width * sx,
    height: wall.height * sy,
  });

  level.spawn = {
    x: level.spawn.x * sx,
    y: level.spawn.y * sy,
  };
  level.exit = {
    ...level.exit,
    x: level.exit.x * sx,
    y: level.exit.y * sy,
    width: level.exit.width * sx,
    height: level.exit.height * sy,
  };
  if (level.calf) {
    level.calf = {
      ...level.calf,
      x: level.calf.x * sx,
      y: level.calf.y * sy,
    };
  }
  level.walls = level.walls.map(scaleWall);
  level.dynamicWalls = level.dynamicWalls.map(scaleWall);
  level.clues = level.clues.map((clue) => ({
    ...clue,
    x: clue.x * sx,
    y: clue.y * sy,
  }));
  level.enemies = level.enemies.map((enemy) => ({
    ...enemy,
    x: enemy.x * sx,
    y: enemy.y * sy,
    anchorX: (enemy.anchorX || enemy.x) * sx,
    anchorY: (enemy.anchorY || enemy.y) * sy,
    range: (enemy.range || 0) * sx,
    patterns: enemy.patterns
      ? enemy.patterns.map((pattern) => pattern.map(scaleWall))
      : undefined,
  }));
}

function createInnPlayer(overrides = {}) {
  return {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    radius: 18,
    speed: 260,
    invulnerable: 0,
    ...overrides,
  };
}

function circleHitsRect(cx, cy, radius, rect) {
  const closestX = clamp(cx, rect.x, rect.x + rect.width);
  const closestY = clamp(cy, rect.y, rect.y + rect.height);
  return Math.hypot(cx - closestX, cy - closestY) < radius;
}

function random(min, max) {
  return Math.random() * (max - min) + min;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function readInnBest() {
  try {
    return Number(window.localStorage.getItem(EVIL_INN_BEST_KEY) || 0);
  } catch {
    return 0;
  }
}

function writeInnBest(value) {
  try {
    window.localStorage.setItem(EVIL_INN_BEST_KEY, String(value));
  } catch {
    // file:// mode may block storage.
  }
}

function createInnAudio() {
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
      master.gain.value = 0.16;
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

  function tone(type, start, end, duration, gain) {
    const nextContext = ensureContext();
    if (!unlocked || !nextContext || nextContext.state !== "running" || !master) {
      return;
    }

    const oscillator = nextContext.createOscillator();
    const gainNode = nextContext.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(start, nextContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, end), nextContext.currentTime + duration);
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
    collect() {
      tone("triangle", 480, 960, 0.11, 0.05);
    },
    hurt() {
      tone("sawtooth", 240, 80, 0.2, 0.06);
    },
    enemyCast() {
      tone("square", 260, 160, 0.08, 0.03);
    },
    ruleShift() {
      tone("triangle", 180, 720, 0.18, 0.04);
    },
    stageClear() {
      tone("sine", 320, 960, 0.25, 0.06);
    },
    gameOver() {
      tone("triangle", 210, 42, 0.45, 0.06);
    },
    dispose() {
      if (context && context.state === "running") {
        context.suspend().catch(() => {});
      }
    },
  };
}
