const EVIL_INN_BEST_KEY = "mini-game-workshop:evil-valley-inn:best-score";

window.evilValleyInn = {
  id: "evil-valley-inn",
  title: "恶人谷黑店",
  description:
    "这次不只是潜入了。金声要靠正义冲刺拆封印、顶着警报区推进、压制喷火岳、需求仙师和荔枝头陀，最后救出阿凯小牛冲出黑店。",
  controls: [
    "拖动屏幕 / 鼠标：移动金声",
    "WASD / 方向键：备用移动",
    "E / Shift：正义冲刺，可拆封印、清弹幕、撞晕敌人",
    "收集线索并拆掉全部封印后，救出阿凯再冲向出口",
  ],
  create(canvas, callbacks) {
    const context = canvas.getContext("2d");
    const audio = createInnAudio();
    const input = new Set();
    const pointer = { active: false, x: 0, y: 0 };

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
      touchZones: [],
    };

    function resizeCanvas() {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      state.width = Math.max(320, rect.width);
      state.height = Math.max(280, rect.height);
      canvas.width = Math.floor(state.width * dpr);
      canvas.height = Math.floor(state.height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      updateTouchZones();

      if (state.level) {
        const score = state.score;
        const best = state.best;
        const lives = state.lives;
        const levelIndex = state.levelIndex;
        const won = state.won;
        const gameOver = state.gameOver;
        loadLevel(levelIndex, false);
        state.score = score;
        state.best = best;
        state.lives = lives;
        state.won = won;
        state.gameOver = gameOver;
      }
    }

    function updateTouchZones() {
      state.touchZones = [
        {
          name: "dash",
          x: state.width - 78,
          y: state.height - 72,
          radius: 42,
        },
      ];
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

    function remainingClues() {
      return state.level.clues.filter((item) => !item.collected).length;
    }

    function remainingSeals() {
      return state.level.seals.filter((item) => !item.disabled).length;
    }

    function loadLevel(index, resetRun) {
      if (resetRun) {
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
      state.particles = [];
      emitState(
        `STAGE ${index + 1}`,
        `${state.level.goalLabel} ${remainingClues()} 份，封印还剩 ${remainingSeals()} 个。`,
      );
    }

    function restartRun() {
      loadLevel(0, true);
    }

    function completeStage() {
      state.score += 140 + state.lives * 15 + state.player.dashCharges * 6;
      state.best = Math.max(state.best, Math.floor(state.score));
      writeInnBest(state.best);
      audio.stageClear();

      if (state.levelIndex >= INN_LEVELS.length - 1) {
        state.won = true;
        state.gameOver = true;
        emitState("ALL CLEAR", "金声带着阿凯冲出恶人谷了，点击画布还能再闯。");
        return;
      }

      loadLevel(state.levelIndex + 1, false);
    }

    function failLife(reason) {
      if (state.player.invulnerable > 0 || state.gameOver) {
        return;
      }

      state.lives -= 1;
      state.player.invulnerable = 1.2;
      state.flashTimer = 0.18;
      state.shake = 14;
      audio.hurt();
      burst(state.player.x, state.player.y, "rgba(255, 176, 128, 0.95)", 18, 220, 0.42);

      if (state.lives <= 0) {
        state.gameOver = true;
        state.best = Math.max(state.best, Math.floor(state.score));
        writeInnBest(state.best);
        audio.gameOver();
        emitState("MISSION FAILED", `被${reason}按在黑店里了，点一下重新开局。`);
        return;
      }

      state.player.x = state.level.spawn.x;
      state.player.y = state.level.spawn.y;
      state.player.vx = 0;
      state.player.vy = 0;
      state.player.dashTimer = 0;
      emitState("TRY AGAIN", `这次别再被${reason}抓到节奏。`);
    }

    function collectClue(clue) {
      clue.collected = true;
      state.score += 55;
      state.best = Math.max(state.best, Math.floor(state.score));
      audio.collect();
      burst(clue.x, clue.y, "rgba(221, 255, 123, 0.9)", 12, 150, 0.28);
      emitState("CLUE FOUND", `${state.level.goalLabel} ${remainingClues()} 份，封印还剩 ${remainingSeals()} 个。`);
    }

    function disableSeal(seal) {
      if (seal.disabled) {
        return;
      }
      seal.disabled = true;
      state.score += 70;
      state.best = Math.max(state.best, Math.floor(state.score));
      audio.breakSeal();
      burst(seal.x, seal.y, "rgba(120, 234, 255, 0.9)", 16, 180, 0.36);
      emitState("SEAL BROKEN", `${remainingSeals()} 个封印待拆。`);
    }

    function rescueCalf() {
      if (!state.level.calf || state.level.calf.rescued) {
        return;
      }
      state.level.calf.rescued = true;
      state.score += 150;
      state.best = Math.max(state.best, Math.floor(state.score));
      state.player.speed = 292;
      state.player.maxDashCharges = 4;
      state.player.dashCharges = Math.min(state.player.maxDashCharges, state.player.dashCharges + 1);
      audio.rescue();
      burst(state.level.calf.x, state.level.calf.y, "rgba(212, 255, 125, 0.9)", 20, 190, 0.42);
      emitState("AKAI JOINS", "阿凯跟上来了，冲刺上限提高，赶紧杀出去。");
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
          lineWidth: random(1, 2.4),
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
        dash: input.has("shift") || input.has("e"),
      };
    }

    function requestDash() {
      if (state.player.dashCharges <= 0 || state.player.dashTimer > 0 || state.gameOver) {
        return;
      }

      let dashX = 0;
      let dashY = 0;
      if (pointer.active) {
        const dx = pointer.x - state.player.x;
        const dy = pointer.y - state.player.y;
        const length = Math.hypot(dx, dy);
        if (length > 10) {
          dashX = dx / length;
          dashY = dy / length;
        }
      } else {
        const controls = currentInput();
        dashX = (controls.right ? 1 : 0) - (controls.left ? 1 : 0);
        dashY = (controls.down ? 1 : 0) - (controls.up ? 1 : 0);
        const length = Math.hypot(dashX, dashY);
        if (length > 0) {
          dashX /= length;
          dashY /= length;
        }
      }

      if (dashX === 0 && dashY === 0) {
        dashX = state.player.facingX;
        dashY = state.player.facingY;
      }

      const length = Math.hypot(dashX, dashY) || 1;
      dashX /= length;
      dashY /= length;

      state.player.dashCharges -= 1;
      state.player.dashTimer = 0.18;
      state.player.invulnerable = Math.max(state.player.invulnerable, 0.28);
      state.player.dashVectorX = dashX;
      state.player.dashVectorY = dashY;
      state.shake = Math.max(state.shake, 8);
      audio.dash();
      burst(state.player.x, state.player.y, "rgba(120, 234, 255, 0.92)", 12, 150, 0.22);
    }

    function updatePlayer(delta) {
      const controls = currentInput();
      if (controls.dash && !state.player.dashHeld) {
        requestDash();
      }
      state.player.dashHeld = controls.dash;

      state.player.invulnerable = Math.max(0, state.player.invulnerable - delta);
      state.player.dashTimer = Math.max(0, state.player.dashTimer - delta);
      state.player.dashRecharge = Math.max(0, state.player.dashRecharge - delta);

      if (state.player.dashCharges < state.player.maxDashCharges && state.player.dashRecharge <= 0) {
        state.player.dashCharges += 1;
        state.player.dashRecharge = 1.55;
      }

      let moveX = 0;
      let moveY = 0;
      if (state.player.dashTimer > 0) {
        moveX = state.player.dashVectorX;
        moveY = state.player.dashVectorY;
      } else if (pointer.active) {
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

      if (moveX !== 0 || moveY !== 0) {
        state.player.facingX = moveX;
        state.player.facingY = moveY;
      }

      const speed = state.player.dashTimer > 0 ? 680 : state.player.speed;
      state.player.vx = moveX * speed;
      state.player.vy = moveY * speed;

      const previousX = state.player.x;
      const previousY = state.player.y;
      state.player.x += state.player.vx * delta;
      resolveWallCollision("x", previousX, previousY);
      state.player.y += state.player.vy * delta;
      resolveWallCollision("y", previousX, previousY);
      state.player.x = clamp(state.player.x, 26, state.width - 26);
      state.player.y = clamp(state.player.y, 32, state.height - 28);

      const moved = Math.hypot(state.player.x - previousX, state.player.y - previousY);
      if (moved > 1.2) {
        spawnParticle({
          kind: state.player.dashTimer > 0 ? "streak" : "orb",
          x: state.player.x + random(-4, 4),
          y: state.player.y + random(-4, 8),
          vx: random(-50, 50),
          vy: random(20, 80),
          size: random(2, 4),
          lineWidth: random(1, 2.2),
          life: random(0.08, 0.18),
          color: state.player.dashTimer > 0 ? "rgba(120, 234, 255, 0.82)" : "rgba(255, 244, 222, 0.34)",
        });
      }
    }

    function resolveWallCollision(axis, previousX, previousY) {
      for (const wall of combinedWalls()) {
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

    function combinedWalls() {
      return state.level.walls.concat(state.level.dynamicWalls);
    }

    function updateEnemies(delta) {
      const rageScale = 1 + remainingSeals() * 0.18;

      for (const enemy of state.level.enemies) {
        if (enemy.defeated) {
          continue;
        }

        enemy.timer += delta;
        enemy.phase += delta * enemy.speedFactor;
        enemy.invulnerable = Math.max(0, enemy.invulnerable - delta);
        enemy.stun = Math.max(0, enemy.stun - delta);

        if (enemy.stun > 0) {
          continue;
        }

        if (enemy.kind === "penfire-yue") {
          enemy.x = enemy.anchorX + Math.sin(enemy.phase) * enemy.range;
          if (enemy.timer >= enemy.fireRate / rageScale) {
            enemy.timer = 0;
            launchProjectile(enemy, state.player.x, state.player.y, 220 * rageScale, "speech", "rgba(255, 137, 100, 0.9)");
            audio.enemyCast();
          }
        }

        if (enemy.kind === "xi-master") {
          if (enemy.timer >= enemy.shiftRate / rageScale) {
            enemy.timer = 0;
            enemy.activePattern = (enemy.activePattern + 1) % enemy.patterns.length;
            state.level.dynamicWalls = enemy.patterns[enemy.activePattern].map((wall) => ({ ...wall }));
            audio.ruleShift();
            burst(enemy.x, enemy.y, "rgba(137, 214, 255, 0.85)", 12, 130, 0.24);
          }
          if (Math.sin(enemy.phase * 2.6) > 0.98) {
            radialBurst(enemy, 4, 170 * rageScale, "rewrite", "rgba(132, 219, 255, 0.88)");
          }
        }

        if (enemy.kind === "lychee-monk") {
          enemy.x = enemy.anchorX + Math.cos(enemy.phase * 0.9) * enemy.range;
          enemy.y = enemy.anchorY + Math.sin(enemy.phase * 1.5) * 24;
          if (enemy.timer >= enemy.fireRate / rageScale) {
            enemy.timer = 0;
            radialBurst(enemy, 6, 180 * rageScale, "rumor", "rgba(193, 118, 255, 0.88)", enemy.phase);
            audio.enemyCast();
          }
        }

        if (Math.hypot(enemy.x - state.player.x, enemy.y - state.player.y) < enemy.radius + state.player.radius - 2) {
          if (state.player.dashTimer > 0) {
            hitEnemy(enemy, 2);
          } else {
            failLife(enemy.label);
          }
        }
      }

      state.level.enemies = state.level.enemies.filter((enemy) => !enemy.defeated);
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
        label: enemy.label,
        color,
      });
    }

    function radialBurst(enemy, count, speed, type, color, offset = 0) {
      for (let index = 0; index < count; index += 1) {
        const angle = offset + (Math.PI * 2 * index) / count;
        state.level.projectiles.push({
          x: enemy.x,
          y: enemy.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          radius: type === "rewrite" ? 9 : 8,
          type,
          label: enemy.label,
          color,
        });
      }
    }

    function hitEnemy(enemy, damage) {
      if (enemy.invulnerable > 0 || enemy.defeated) {
        return;
      }

      enemy.hp -= damage;
      enemy.invulnerable = 0.16;
      enemy.stun = 0.34;
      audio.enemyHit();
      burst(enemy.x, enemy.y, enemy.hitColor, 12, 160, 0.24);

      if (enemy.hp <= 0) {
        enemy.defeated = true;
        state.score += enemy.value;
        state.best = Math.max(state.best, Math.floor(state.score));
        audio.enemyBreak();
        burst(enemy.x, enemy.y, enemy.hitColor, 18, 220, 0.38);
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

        let removed = false;
        for (const wall of combinedWalls()) {
          if (circleHitsRect(projectile.x, projectile.y, projectile.radius, wall)) {
            state.level.projectiles.splice(index, 1);
            removed = true;
            break;
          }
        }
        if (removed) {
          continue;
        }

        if (state.player.dashTimer > 0 && Math.hypot(projectile.x - state.player.x, projectile.y - state.player.y) < projectile.radius + state.player.radius + 8) {
          state.level.projectiles.splice(index, 1);
          state.score += 6;
          spawnParticle({
            kind: "ring",
            x: projectile.x,
            y: projectile.y,
            size: 8,
            lineWidth: 2.5,
            life: 0.12,
            grow: 70,
            vx: 0,
            vy: 0,
            color: "rgba(120, 234, 255, 0.95)",
          });
          continue;
        }

        if (Math.hypot(projectile.x - state.player.x, projectile.y - state.player.y) < projectile.radius + state.player.radius - 2) {
          state.level.projectiles.splice(index, 1);
          failLife(projectile.label || "黑店弹幕");
        }
      }
    }

    function updateClues() {
      for (const clue of state.level.clues) {
        clue.pulse += 0.12;
        if (!clue.collected && Math.hypot(clue.x - state.player.x, clue.y - state.player.y) < 26) {
          collectClue(clue);
        }
      }
    }

    function updateSeals(delta) {
      for (const seal of state.level.seals) {
        seal.pulse += delta * 4.2;
        if (seal.disabled) {
          continue;
        }
        if (Math.hypot(seal.x - state.player.x, seal.y - state.player.y) < 24) {
          if (state.player.dashTimer > 0) {
            disableSeal(seal);
          } else {
            seal.charge = Math.min(1, seal.charge + delta * 0.65);
            if (seal.charge >= 1) {
              failLife("封印反噬");
              seal.charge = 0;
            }
          }
        } else {
          seal.charge = Math.max(0, seal.charge - delta * 0.45);
        }
      }
    }

    function updateAlarms(delta) {
      for (const alarm of state.level.alarms) {
        alarm.timer += delta;
        const cycle = alarm.activeTime + alarm.cooldown;
        const phase = alarm.timer % cycle;
        alarm.active = phase < alarm.activeTime;

        if (
          alarm.active &&
          state.player.x + state.player.radius > alarm.x &&
          state.player.x - state.player.radius < alarm.x + alarm.width &&
          state.player.y + state.player.radius > alarm.y &&
          state.player.y - state.player.radius < alarm.y + alarm.height
        ) {
          if (state.player.dashTimer <= 0) {
            failLife(alarm.label);
          }
        }
      }
    }

    function updateRescueTarget() {
      if (!state.level.calf || !state.level.exitOpen || state.level.calf.rescued) {
        return;
      }
      if (Math.hypot(state.level.calf.x - state.player.x, state.level.calf.y - state.player.y) < 30) {
        rescueCalf();
      }
    }

    function updateExit() {
      state.level.exitOpen = remainingClues() === 0 && remainingSeals() === 0;

      if (state.level.calf) {
        state.level.calf.freed = state.level.calf.rescued || state.level.exitOpen;
      }

      const rescueReady = !state.level.calf || state.level.calf.rescued;
      if (
        state.level.exitOpen &&
        rescueReady &&
        Math.abs(state.player.x - state.level.exit.x) < state.level.exit.width / 2 &&
        Math.abs(state.player.y - state.level.exit.y) < state.level.exit.height / 2
      ) {
        completeStage();
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
        particle.size = Math.max(0, particle.size + (particle.grow || 0) * delta);
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
        emitState(
          state.won ? "ALL CLEAR" : "MISSION FAILED",
          state.won ? "点一下可以再杀回黑店。" : "点一下重新闯关。",
        );
        return;
      }

      updatePlayer(delta);
      updateEnemies(delta);
      updateProjectiles(delta);
      updateClues();
      updateSeals(delta);
      updateAlarms(delta);
      updateRescueTarget();
      updateExit();

      const hint = state.level.exitOpen
        ? state.level.calf && !state.level.calf.rescued
          ? "出口开了，但得先把阿凯从门口救下来。"
          : "路线已经打通，带着证据和阿凯冲向出口。"
        : `${state.level.goalLabel} ${remainingClues()} 份，封印还剩 ${remainingSeals()} 个。`;

      emitState(`STAGE ${state.levelIndex + 1}/${INN_LEVELS.length}`, hint);
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

      for (const alarm of state.level.alarms) {
        context.fillStyle = alarm.active ? "rgba(255, 90, 90, 0.2)" : "rgba(255, 150, 90, 0.08)";
        context.fillRect(alarm.x, alarm.y, alarm.width, alarm.height);
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

    function drawSeals() {
      for (const seal of state.level.seals) {
        if (seal.disabled) {
          context.fillStyle = "rgba(120, 234, 255, 0.16)";
          context.beginPath();
          context.arc(seal.x, seal.y, 18, 0, Math.PI * 2);
          context.fill();
          continue;
        }

        const scale = 1 + Math.sin(seal.pulse) * 0.1;
        context.fillStyle = "rgba(120, 234, 255, 0.18)";
        context.beginPath();
        context.arc(seal.x, seal.y, 22 * scale, 0, Math.PI * 2);
        context.fill();

        context.strokeStyle = "#7be7ff";
        context.lineWidth = 3;
        context.beginPath();
        context.arc(seal.x, seal.y, 12, 0, Math.PI * 2);
        context.stroke();
        context.beginPath();
        context.moveTo(seal.x - 9, seal.y);
        context.lineTo(seal.x + 9, seal.y);
        context.moveTo(seal.x, seal.y - 9);
        context.lineTo(seal.x, seal.y + 9);
        context.stroke();

        if (seal.charge > 0) {
          context.fillStyle = "rgba(255, 120, 90, 0.22)";
          context.beginPath();
          context.arc(seal.x, seal.y, 28 * seal.charge, 0, Math.PI * 2);
          context.fill();
        }
      }
    }

    function drawEnemies() {
      for (const enemy of state.level.enemies) {
        if (enemy.defeated) {
          continue;
        }

        context.save();
        context.translate(enemy.x, enemy.y);
        context.globalAlpha = enemy.stun > 0 ? 0.55 : 1;

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

        context.globalAlpha = 1;
        const hpWidth = enemy.radius * 2;
        context.fillStyle = "rgba(0, 0, 0, 0.32)";
        context.fillRect(-hpWidth / 2, enemy.radius + 12, hpWidth, 5);
        context.fillStyle = enemy.hitColor;
        context.fillRect(-hpWidth / 2, enemy.radius + 12, hpWidth * (enemy.hp / enemy.maxHp), 5);

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
        context.fillStyle = state.level.calf.rescued ? "#d4ff7d" : "#fff4e0";
        context.beginPath();
        context.ellipse(state.level.calf.x, state.level.calf.y + 8, 20, 14, 0, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = "#5b3a2d";
        context.beginPath();
        context.arc(state.level.calf.x + 15, state.level.calf.y + 1, 9, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = state.level.calf.rescued ? "rgba(212, 255, 125, 0.8)" : "rgba(255, 170, 120, 0.8)";
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
      const angle = Math.atan2(state.player.facingY, state.player.facingX);
      context.rotate(angle * 0.12);

      if (state.player.dashTimer > 0) {
        context.fillStyle = "rgba(120, 234, 255, 0.24)";
        context.beginPath();
        context.arc(0, 0, 26 + Math.sin(state.elapsed * 26) * 3, 0, Math.PI * 2);
        context.fill();
      }

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
        } else if (particle.kind === "ring") {
          context.beginPath();
          context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
          context.stroke();
        } else {
          context.beginPath();
          context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
          context.fill();
        }
      }
      context.globalAlpha = 1;
    }

    function drawTouchControls() {
      for (const zone of state.touchZones) {
        context.fillStyle = "rgba(255, 255, 255, 0.12)";
        context.beginPath();
        context.arc(zone.x, zone.y, zone.radius, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = "rgba(255, 255, 255, 0.18)";
        context.lineWidth = 2;
        context.stroke();
        context.fillStyle = "#ffffff";
        context.font = '700 18px "Avenir Next", "Trebuchet MS", sans-serif';
        context.textAlign = "center";
        context.fillText("冲", zone.x, zone.y + 6);
        context.textAlign = "left";
      }
    }

    function drawOverlay() {
      context.fillStyle = "rgba(6, 10, 18, 0.22)";
      context.fillRect(16, 16, 320, 72);
      context.fillStyle = "#ffffff";
      context.font = '700 16px "Avenir Next", "Trebuchet MS", sans-serif';
      context.fillText(`Stage ${state.levelIndex + 1}/${INN_LEVELS.length}`, 30, 38);
      context.fillText(`线索 ${remainingClues()}  封印 ${remainingSeals()}`, 30, 60);

      const charges = Array.from({ length: state.player.maxDashCharges }, (_, index) => index < state.player.dashCharges);
      let offsetX = state.width - 210;
      context.fillStyle = "rgba(6, 10, 18, 0.22)";
      context.fillRect(offsetX - 20, 16, 194, 56);
      context.fillStyle = "#ffffff";
      context.fillText("冲刺能量", offsetX, 38);
      for (const [index, active] of charges.entries()) {
        context.fillStyle = active ? "#78eaff" : "rgba(255,255,255,0.12)";
        context.beginPath();
        context.arc(offsetX + 22 + index * 34, 56, 10, 0, Math.PI * 2);
        context.fill();
      }

      if (state.gameOver) {
        context.fillStyle = "rgba(6, 10, 18, 0.74)";
        context.fillRect(0, 0, state.width, state.height);
        context.fillStyle = "#fffaf0";
        context.textAlign = "center";
        context.font = '700 42px "Avenir Next", "Trebuchet MS", sans-serif';
        context.fillText(state.won ? "BLACK INN CLEARED" : "RUN LOST", state.width / 2, state.height / 2 - 20);
        context.font = '500 18px "Avenir Next", "Trebuchet MS", sans-serif';
        context.fillText(
          state.won ? "阿凯得救了，黑店的三层封印也被你拆穿了。" : "黑店还在，点一下再来一轮。",
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
      drawSeals();
      drawExit();
      drawEnemies();
      drawProjectiles();
      drawParticles();
      drawPlayer();
      drawOverlay();
      drawTouchControls();

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

    function touchZoneAt(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      return state.touchZones.find((zone) => Math.hypot(zone.x - x, zone.y - y) <= zone.radius) || null;
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

      const zone = touchZoneAt(event.clientX, event.clientY);
      if (zone && zone.name === "dash") {
        requestDash();
        return;
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
    seals: [
      { x: 272, y: 348, pulse: 0, charge: 0, disabled: false },
      { x: 820, y: 188, pulse: 0, charge: 0, disabled: false },
    ],
    alarms: [
      { x: 520, y: 56, width: 54, height: 450, activeTime: 1.1, cooldown: 1.4, timer: 0, active: false, label: "前厅警报灯" },
    ],
    enemies: [
      {
        kind: "penfire-yue",
        label: "喷火岳",
        x: 760,
        y: 150,
        anchorX: 760,
        anchorY: 150,
        range: 88,
        radius: 18,
        fireRate: 1.1,
        speedFactor: 1.6,
        phase: 0,
        timer: 0,
        hp: 5,
        maxHp: 5,
        value: 120,
        hitColor: "rgba(255, 152, 103, 0.9)",
        defeated: false,
        invulnerable: 0,
        stun: 0,
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
    seals: [
      { x: 260, y: 162, pulse: 0, charge: 0, disabled: false },
      { x: 678, y: 164, pulse: 0, charge: 0, disabled: false },
    ],
    alarms: [
      { x: 212, y: 222, width: 128, height: 24, activeTime: 1.3, cooldown: 1.2, timer: 0, active: false, label: "规则警戒带" },
      { x: 568, y: 312, width: 172, height: 24, activeTime: 1.1, cooldown: 1.4, timer: 0, active: false, label: "改稿警戒带" },
    ],
    enemies: [
      {
        kind: "xi-master",
        label: "需求仙师",
        x: 452,
        y: 268,
        radius: 22,
        phase: 0,
        timer: 0,
        speedFactor: 0.75,
        shiftRate: 2.1,
        activePattern: 0,
        hp: 6,
        maxHp: 6,
        value: 150,
        hitColor: "rgba(125, 219, 255, 0.9)",
        defeated: false,
        invulnerable: 0,
        stun: 0,
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
    calf: { x: 820, y: 408, rescued: false },
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
    seals: [
      { x: 552, y: 430, pulse: 0, charge: 0, disabled: false },
      { x: 770, y: 302, pulse: 0, charge: 0, disabled: false },
    ],
    alarms: [
      { x: 384, y: 120, width: 58, height: 320, activeTime: 1.2, cooldown: 1.3, timer: 0, active: false, label: "后院哨岗" },
      { x: 638, y: 150, width: 180, height: 22, activeTime: 1, cooldown: 1.6, timer: 0, active: false, label: "牛栏警戒绳" },
    ],
    enemies: [
      {
        kind: "lychee-monk",
        label: "荔枝头陀",
        x: 470,
        y: 118,
        anchorX: 470,
        anchorY: 118,
        range: 90,
        radius: 17,
        fireRate: 1.25,
        speedFactor: 1.9,
        phase: 0,
        timer: 0,
        hp: 8,
        maxHp: 8,
        value: 190,
        hitColor: "rgba(193, 118, 255, 0.9)",
        defeated: false,
        invulnerable: 0,
        stun: 0,
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
    seals: template.seals.map((seal) => ({ ...seal })),
    alarms: template.alarms.map((alarm) => ({ ...alarm })),
    enemies: template.enemies.map((enemy) => ({
      ...enemy,
      patterns: enemy.patterns ? enemy.patterns.map((pattern) => pattern.map((wall) => ({ ...wall }))) : undefined,
    })),
    projectiles: [],
    exitOpen: false,
    goalLabel: template.goalLabel,
    name: template.name,
  };

  fitLevelToCanvas(level, width, height);
  return level;
}

function fitLevelToCanvas(level, width = 960, height = 540) {
  const sx = width / 960;
  const sy = height / 540;
  const scaleRect = (item) => ({
    x: item.x * sx,
    y: item.y * sy,
    width: item.width * sx,
    height: item.height * sy,
  });

  level.spawn = { x: level.spawn.x * sx, y: level.spawn.y * sy };
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

  level.walls = level.walls.map(scaleRect);
  level.dynamicWalls = level.dynamicWalls.map(scaleRect);
  level.alarms = level.alarms.map((alarm) => ({
    ...alarm,
    x: alarm.x * sx,
    y: alarm.y * sy,
    width: alarm.width * sx,
    height: alarm.height * sy,
  }));
  level.clues = level.clues.map((clue) => ({
    ...clue,
    x: clue.x * sx,
    y: clue.y * sy,
  }));
  level.seals = level.seals.map((seal) => ({
    ...seal,
    x: seal.x * sx,
    y: seal.y * sy,
  }));
  level.enemies = level.enemies.map((enemy) => ({
    ...enemy,
    x: enemy.x * sx,
    y: enemy.y * sy,
    anchorX: (enemy.anchorX || enemy.x) * sx,
    anchorY: (enemy.anchorY || enemy.y) * sy,
    range: (enemy.range || 0) * sx,
    radius: enemy.radius * ((sx + sy) / 2),
    patterns: enemy.patterns ? enemy.patterns.map((pattern) => pattern.map(scaleRect)) : undefined,
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
    facingX: 1,
    facingY: 0,
    invulnerable: 0,
    dashCharges: 3,
    maxDashCharges: 3,
    dashRecharge: 1.55,
    dashTimer: 0,
    dashVectorX: 1,
    dashVectorY: 0,
    dashHeld: false,
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
    dash() {
      tone("square", 260, 620, 0.09, 0.05);
    },
    enemyCast() {
      tone("square", 260, 160, 0.08, 0.03);
    },
    enemyHit() {
      tone("triangle", 520, 240, 0.06, 0.03);
    },
    enemyBreak() {
      tone("sawtooth", 220, 70, 0.18, 0.05);
    },
    ruleShift() {
      tone("triangle", 180, 720, 0.18, 0.04);
    },
    breakSeal() {
      tone("sine", 340, 900, 0.16, 0.05);
    },
    rescue() {
      tone("triangle", 300, 1100, 0.22, 0.06);
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
