const BEST_SCORE_KEY = "mini-game-workshop:comet-dash:best-score";

window.cometDash = {
  id: "comet-dash",
  title: "Comet Dash",
  description:
    "升级成街机纵版射击原型了。拖动飞船穿过霓虹星云，自动开火，击落敌机、吃能量核心、在密集火力里抢生路。",
  controls: [
    "拖动屏幕 / 鼠标移动：控制飞船",
    "方向键 / WASD：备用移动",
    "自动射击：持续开火",
    "首次点击或按键：解锁音效",
    "Space / Enter / 点击画布：失败后重开",
  ],
  create(canvas, callbacks) {
    const context = canvas.getContext("2d");
    const audio = createAudioEngine();
    const input = new Set();
    const pointer = {
      active: false,
      x: 0,
      y: 0,
    };

    const state = {
      width: 960,
      height: 540,
      elapsed: 0,
      lastFrame: 0,
      score: 0,
      best: readBestScore(),
      lives: 3,
      combo: 0,
      gameOver: false,
      spawnTimer: 0,
      pulseTimer: 0,
      flashTimer: 0,
      shake: 0,
      starsFar: Array.from({ length: 48 }, () => createStar(960, 540, 0.3, 40, 110)),
      starsNear: Array.from({ length: 24 }, () => createStar(960, 540, 0.7, 120, 260)),
      particles: [],
      bullets: [],
      enemies: [],
      enemyBullets: [],
      pickups: [],
      player: {
        x: 480,
        y: 440,
        targetX: 480,
        targetY: 440,
        radius: 18,
        speed: 480,
        cooldown: 0,
        invulnerable: 0,
        power: 1,
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

      state.player.x = state.width / 2;
      state.player.y = state.height * 0.82;
      state.player.targetX = state.player.x;
      state.player.targetY = state.player.y;
      pointer.x = state.player.x;
      pointer.y = state.player.y;
    }

    function emitState(status, hint) {
      callbacks.onStateChange({
        title: window.cometDash.title,
        description: window.cometDash.description,
        controls: window.cometDash.controls,
        score: Math.floor(state.score),
        lives: state.lives,
        best: state.best,
        status,
        hint,
      });
    }

    function resetGame() {
      state.elapsed = 0;
      state.lastFrame = 0;
      state.score = 0;
      state.lives = 3;
      state.combo = 0;
      state.gameOver = false;
      state.spawnTimer = 0;
      state.pulseTimer = 0;
      state.flashTimer = 0;
      state.shake = 0;
      state.particles = [];
      state.bullets = [];
      state.enemies = [];
      state.enemyBullets = [];
      state.pickups = [];
      state.player.x = state.width / 2;
      state.player.y = state.height * 0.82;
      state.player.targetX = state.player.x;
      state.player.targetY = state.player.y;
      state.player.cooldown = 0;
      state.player.invulnerable = 0;
      state.player.power = 1;
      pointer.x = state.player.x;
      pointer.y = state.player.y;
      emitState("RUNNING", "拖动飞船闪避敌机，火力会自动输出。");
    }

    function finishGame() {
      state.gameOver = true;
      state.best = Math.max(state.best, Math.floor(state.score));
      writeBestScore(state.best);
      audio.gameOver();
      emitState("GAME OVER", "点击画布或按 Space / Enter 立刻再来一局。");
    }

    function spawnEnemy() {
      const lane = random(54, state.width - 54);
      const difficulty = 1 + state.elapsed / 26;
      const typeRoll = Math.random();
      const enemy =
        typeRoll > 0.7
          ? {
              type: "spinner",
              x: lane,
              y: -40,
              radius: 20,
              hp: 6,
              value: 28,
              speedY: random(100, 150) * difficulty,
              speedX: random(-40, 40),
              fireCooldown: random(1.2, 1.9),
              angle: Math.random() * Math.PI * 2,
            }
          : {
              type: "raider",
              x: lane,
              y: -40,
              radius: 16,
              hp: 3,
              value: 14,
              speedY: random(170, 240) * difficulty,
              speedX: random(-80, 80),
              fireCooldown: random(0.9, 1.5),
              angle: Math.random() * Math.PI * 2,
            };

      state.enemies.push(enemy);
    }

    function firePlayer() {
      const power = state.player.power;
      const pattern = power === 1 ? [-1] : power === 2 ? [-8, 8] : [-14, 0, 14];

      for (const offset of pattern) {
        state.bullets.push({
          x: state.player.x + offset,
          y: state.player.y - 18,
          speedY: 620,
          radius: offset === 0 ? 5 : 4,
          hue: power === 3 ? "#d9ff65" : "#67efff",
        });
      }

      audio.playerShot(power);

      spawnParticle({
        kind: "ring",
        x: state.player.x,
        y: state.player.y - 14,
        size: 10,
        grow: 96,
        life: 0.12,
        lineWidth: 3,
        color: power === 3 ? "rgba(217, 255, 101, 0.9)" : "rgba(103, 239, 255, 0.9)",
      });

      for (let index = 0; index < 10; index += 1) {
        spawnParticle({
          kind: index < 4 ? "streak" : "orb",
          x: state.player.x + random(-14, 14),
          y: state.player.y + random(-4, 16),
          vx: random(-28, 28),
          vy: index < 4 ? random(-240, -180) : random(140, 260),
          size: random(2, 5),
          lineWidth: random(1, 2.5),
          life: random(0.1, 0.22),
          color:
            index < 4
              ? power === 3
                ? "rgba(217, 255, 101, 0.85)"
                : "rgba(103, 239, 255, 0.85)"
              : "rgba(255, 138, 96, 0.8)",
        });
      }
    }

    function fireEnemy(enemy) {
      const aimX = state.player.x - enemy.x;
      const aimY = state.player.y - enemy.y;
      const base = Math.atan2(aimY, aimX);
      const spread = enemy.type === "spinner" ? [-0.28, 0, 0.28] : [0];

      for (const offset of spread) {
        state.enemyBullets.push({
          x: enemy.x,
          y: enemy.y + enemy.radius * 0.2,
          speed: enemy.type === "spinner" ? 260 : 300,
          angle: base + offset,
          radius: enemy.type === "spinner" ? 5 : 4,
        });
      }

      audio.enemyShot(enemy.type);
    }

    function damagePlayer() {
      if (state.player.invulnerable > 0 || state.gameOver) {
        return;
      }

      state.lives -= 1;
      state.combo = 0;
      state.player.invulnerable = 1.3;
      state.flashTimer = 0.22;
      state.shake = 16;
      audio.playerDamaged();

      spawnParticle({
        kind: "ring",
        x: state.player.x,
        y: state.player.y,
        size: 14,
        grow: 180,
        life: 0.22,
        lineWidth: 4,
        color: "rgba(255, 177, 132, 0.95)",
      });

      for (let index = 0; index < 26; index += 1) {
        spawnParticle({
          x: state.player.x,
          y: state.player.y,
          vx: random(-220, 220),
          vy: random(-220, 220),
          size: random(2, 6),
          life: random(0.22, 0.55),
          color: index % 2 === 0 ? "rgba(255, 133, 95, 0.95)" : "rgba(255, 239, 155, 0.85)",
        });
      }

      if (state.lives <= 0) {
        finishGame();
      } else {
        emitState("HIT TAKEN", "擦弹可以，撞弹不行，先稳住位置。");
      }
    }

    function destroyEnemy(enemy, bulletIndex) {
      if (typeof bulletIndex === "number") {
        state.bullets.splice(bulletIndex, 1);
      }

      const enemyIndex = state.enemies.indexOf(enemy);
      if (enemyIndex >= 0) {
        state.enemies.splice(enemyIndex, 1);
      }

      state.combo += 1;
      state.score += enemy.value + state.combo * 2;
      state.best = Math.max(state.best, Math.floor(state.score));
      state.shake = Math.max(state.shake, 10);
      audio.enemyExplode(enemy.type);

      if (Math.random() > 0.76 && state.player.power < 3) {
        state.pickups.push({
          x: enemy.x,
          y: enemy.y,
          radius: 11,
          speedY: 140,
          pulse: 0,
        });
      }

      spawnParticle({
        kind: "ring",
        x: enemy.x,
        y: enemy.y,
        size: enemy.radius * 0.8,
        grow: 130,
        life: 0.18,
        lineWidth: 3,
        color: enemy.type === "spinner" ? "rgba(255, 154, 105, 0.9)" : "rgba(193, 71, 255, 0.85)",
      });

      for (let index = 0; index < 18; index += 1) {
        spawnParticle({
          kind: index < 8 ? "streak" : "orb",
          x: enemy.x,
          y: enemy.y,
          vx: random(-180, 180),
          vy: random(-160, 180),
          size: random(2, 6),
          lineWidth: random(1, 3),
          life: random(0.16, 0.5),
          color: index % 3 === 0 ? "rgba(255, 136, 95, 0.95)" : "rgba(103, 239, 255, 0.8)",
        });
      }
    }

    function spawnParticle(particle) {
      state.particles.push(particle);
    }

    function updatePlayer(delta) {
      const previousX = state.player.x;
      const previousY = state.player.y;
      state.player.invulnerable = Math.max(0, state.player.invulnerable - delta);
      state.player.cooldown = Math.max(0, state.player.cooldown - delta);

      if (pointer.active) {
        state.player.targetX = pointer.x;
        state.player.targetY = pointer.y;
      } else {
        const moveX = (input.has("arrowright") || input.has("d") ? 1 : 0) - (input.has("arrowleft") || input.has("a") ? 1 : 0);
        const moveY = (input.has("arrowdown") || input.has("s") ? 1 : 0) - (input.has("arrowup") || input.has("w") ? 1 : 0);
        const length = Math.hypot(moveX, moveY) || 1;
        state.player.targetX += (moveX / length) * state.player.speed * delta;
        state.player.targetY += (moveY / length) * state.player.speed * delta;
      }

      state.player.targetX = clamp(state.player.targetX, 32, state.width - 32);
      state.player.targetY = clamp(state.player.targetY, 52, state.height - 30);

      const followStrength = pointer.active ? 10 : 7.2;
      state.player.x += (state.player.targetX - state.player.x) * Math.min(1, delta * followStrength);
      state.player.y += (state.player.targetY - state.player.y) * Math.min(1, delta * followStrength);

      const moved = Math.hypot(state.player.x - previousX, state.player.y - previousY);
      if (moved > 1.5) {
        const trailCount = Math.min(4, Math.ceil(moved / 8));
        for (let index = 0; index < trailCount; index += 1) {
          spawnParticle({
            kind: "orb",
            x: previousX + random(-6, 6),
            y: previousY + random(-4, 10),
            vx: random(-35, 35),
            vy: random(40, 120),
            size: random(2, 4),
            life: random(0.08, 0.16),
            color: "rgba(126, 240, 255, 0.35)",
          });
        }
      }

      if (state.player.cooldown <= 0 && !state.gameOver) {
        state.player.cooldown = state.player.power === 3 ? 0.11 : 0.14;
        firePlayer();
      }
    }

    function updateBackground(delta) {
      state.pulseTimer += delta;
      state.flashTimer = Math.max(0, state.flashTimer - delta);
      state.shake = Math.max(0, state.shake - delta * 26);

      for (const star of state.starsFar) {
        star.y += star.speed * delta;
        if (star.y > state.height + 20) {
          resetStar(star, state.width, state.height, true);
        }
      }

      for (const star of state.starsNear) {
        star.y += star.speed * delta;
        if (star.y > state.height + 24) {
          resetStar(star, state.width, state.height, false);
        }
      }
    }

    function updateBullets(delta) {
      for (let index = state.bullets.length - 1; index >= 0; index -= 1) {
        const bullet = state.bullets[index];
        bullet.y -= bullet.speedY * delta;
        if (bullet.y < -18) {
          state.bullets.splice(index, 1);
        }
      }

      for (let index = state.enemyBullets.length - 1; index >= 0; index -= 1) {
        const bullet = state.enemyBullets[index];
        bullet.x += Math.cos(bullet.angle) * bullet.speed * delta;
        bullet.y += Math.sin(bullet.angle) * bullet.speed * delta;

        const distance = Math.hypot(bullet.x - state.player.x, bullet.y - state.player.y);
        if (distance < bullet.radius + state.player.radius - 3) {
          state.enemyBullets.splice(index, 1);
          damagePlayer();
          continue;
        }

        if (bullet.y < -40 || bullet.y > state.height + 40 || bullet.x < -40 || bullet.x > state.width + 40) {
          state.enemyBullets.splice(index, 1);
        }
      }
    }

    function updateEnemies(delta) {
      state.spawnTimer += delta;
      const spawnInterval = Math.max(0.24, 0.78 - state.elapsed * 0.012);
      if (state.spawnTimer > spawnInterval && !state.gameOver) {
        state.spawnTimer = 0;
        spawnEnemy();
      }

      for (let index = state.enemies.length - 1; index >= 0; index -= 1) {
        const enemy = state.enemies[index];
        enemy.angle += delta * (enemy.type === "spinner" ? 2.4 : 1.2);
        enemy.x += Math.sin(enemy.angle) * enemy.speedX * delta;
        enemy.y += enemy.speedY * delta;
        enemy.fireCooldown -= delta;

        if (enemy.fireCooldown <= 0 && !state.gameOver) {
          enemy.fireCooldown = enemy.type === "spinner" ? random(1.2, 1.8) : random(0.8, 1.35);
          fireEnemy(enemy);
        }

        const collision = Math.hypot(enemy.x - state.player.x, enemy.y - state.player.y);
        if (collision < enemy.radius + state.player.radius - 6) {
          destroyEnemy(enemy);
          damagePlayer();
          continue;
        }

        if (enemy.y > state.height + 70) {
          state.enemies.splice(index, 1);
          state.combo = 0;
        }
      }
    }

    function updatePickups(delta) {
      for (let index = state.pickups.length - 1; index >= 0; index -= 1) {
        const pickup = state.pickups[index];
        pickup.y += pickup.speedY * delta;
        pickup.pulse += delta * 5;

        if (Math.hypot(pickup.x - state.player.x, pickup.y - state.player.y) < pickup.radius + state.player.radius) {
          state.player.power = Math.min(3, state.player.power + 1);
          state.score += 18;
          state.pickups.splice(index, 1);
          audio.powerUp();
          spawnParticle({
            kind: "ring",
            x: state.player.x,
            y: state.player.y,
            size: 12,
            grow: 120,
            life: 0.18,
            lineWidth: 3,
            color: "rgba(217, 255, 101, 0.9)",
          });
          for (let burst = 0; burst < 12; burst += 1) {
            spawnParticle({
              kind: burst < 5 ? "streak" : "orb",
              x: pickup.x,
              y: pickup.y,
              vx: random(-160, 160),
              vy: random(-160, 160),
              size: random(2, 5),
              lineWidth: random(1, 2.5),
              life: random(0.12, 0.28),
              color: "rgba(217, 255, 101, 0.88)",
            });
          }
          emitState("POWER UP", "火力提升了，压过去。");
          continue;
        }

        if (pickup.y > state.height + 30) {
          state.pickups.splice(index, 1);
        }
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
        particle.rotation = (particle.rotation || 0) + (particle.spin || 0) * delta;

        if (particle.life <= 0) {
          state.particles.splice(index, 1);
        }
      }
    }

    function resolveBulletHits() {
      for (let bulletIndex = state.bullets.length - 1; bulletIndex >= 0; bulletIndex -= 1) {
        const bullet = state.bullets[bulletIndex];
        let hit = false;

        for (let enemyIndex = state.enemies.length - 1; enemyIndex >= 0; enemyIndex -= 1) {
          const enemy = state.enemies[enemyIndex];
          if (Math.hypot(bullet.x - enemy.x, bullet.y - enemy.y) < bullet.radius + enemy.radius) {
            enemy.hp -= 1;
            state.bullets.splice(bulletIndex, 1);
            hit = true;
            audio.enemyHit();

            spawnParticle({
              kind: "ring",
              x: bullet.x,
              y: bullet.y,
              size: 4,
              grow: 70,
              lineWidth: 2,
              life: 0.1,
              color: "rgba(255, 245, 180, 0.9)",
            });

            for (let spark = 0; spark < 5; spark += 1) {
              spawnParticle({
                kind: "streak",
                x: bullet.x,
                y: bullet.y,
                vx: random(-140, 140),
                vy: random(-140, 140),
                size: random(3, 6),
                lineWidth: random(1, 2.5),
                life: random(0.06, 0.14),
                color: "rgba(255, 245, 180, 0.85)",
              });
            }

            if (enemy.hp <= 0) {
              destroyEnemy(enemy);
            }
            break;
          }
        }

        if (hit) {
          continue;
        }
      }
    }

    function update(delta) {
      updateBackground(delta);
      updateParticles(delta);

      if (state.gameOver) {
        emitState("GAME OVER", "点击画布或按 Space / Enter 立即重开。");
        return;
      }

      state.elapsed += delta;
      updatePlayer(delta);
      updateBullets(delta);
      updateEnemies(delta);
      updatePickups(delta);
      resolveBulletHits();

      state.score += delta * (6 + state.combo * 0.3);
      emitState(
        state.player.power === 3 ? "OVERDRIVE" : "RUNNING",
        state.player.power === 3 ? "满火力状态，趁现在把屏幕压干净。" : "拖动飞船穿针引线，别让节奏断掉。",
      );
    }

    function drawBackground() {
      const sky = context.createLinearGradient(0, 0, 0, state.height);
      sky.addColorStop(0, "#041021");
      sky.addColorStop(0.55, "#0d1730");
      sky.addColorStop(1, "#170b1d");
      context.fillStyle = sky;
      context.fillRect(0, 0, state.width, state.height);

      const pulse = 0.5 + Math.sin(state.pulseTimer * 0.8) * 0.5;

      context.fillStyle = `rgba(89, 235, 255, ${0.08 + pulse * 0.05})`;
      context.beginPath();
      context.ellipse(state.width * 0.18, state.height * 0.24, state.width * 0.24, state.height * 0.18, 0, 0, Math.PI * 2);
      context.fill();

      context.fillStyle = `rgba(255, 110, 82, ${0.07 + (1 - pulse) * 0.05})`;
      context.beginPath();
      context.ellipse(state.width * 0.8, state.height * 0.34, state.width * 0.28, state.height * 0.22, 0, 0, Math.PI * 2);
      context.fill();

      for (const star of state.starsFar) {
        context.fillStyle = `rgba(163, 228, 255, ${star.alpha})`;
        context.fillRect(star.x, star.y, star.size, star.size * 4);
      }

      for (const star of state.starsNear) {
        context.fillStyle = `rgba(255, 255, 255, ${star.alpha})`;
        context.fillRect(star.x, star.y, star.size, star.size * 7);
      }

      context.strokeStyle = "rgba(255, 255, 255, 0.05)";
      context.lineWidth = 1;
      for (let y = 0; y < state.height; y += 70) {
        context.beginPath();
        context.moveTo(0, y + Math.sin((state.pulseTimer * 2) + y * 0.02) * 6);
        context.lineTo(state.width, y + Math.sin((state.pulseTimer * 2) + y * 0.02) * 6);
        context.stroke();
      }
    }

    function drawPlayer() {
      context.save();
      context.translate(state.player.x, state.player.y);

      const exhaustAlpha = 0.5 + Math.sin(state.pulseTimer * 22) * 0.18;
      const exhaustGlow = context.createRadialGradient(0, 24, 2, 0, 24, 24);
      exhaustGlow.addColorStop(0, `rgba(255, 208, 144, ${exhaustAlpha})`);
      exhaustGlow.addColorStop(0.55, `rgba(255, 148, 108, ${exhaustAlpha * 0.86})`);
      exhaustGlow.addColorStop(1, "rgba(255, 148, 108, 0)");
      context.fillStyle = exhaustGlow;
      context.beginPath();
      context.arc(0, 26, 24, 0, Math.PI * 2);
      context.fill();

      context.fillStyle = `rgba(255, 148, 108, ${exhaustAlpha})`;
      context.beginPath();
      context.moveTo(-7, 18);
      context.lineTo(0, 36 + Math.sin(state.pulseTimer * 20) * 4);
      context.lineTo(7, 18);
      context.closePath();
      context.fill();

      const hull = context.createLinearGradient(-18, -20, 18, 18);
      hull.addColorStop(0, state.player.invulnerable > 0 ? "rgba(255, 244, 220, 0.98)" : "#d9fbff");
      hull.addColorStop(0.4, state.player.invulnerable > 0 ? "rgba(255, 216, 166, 0.96)" : "#7ef0ff");
      hull.addColorStop(1, state.player.invulnerable > 0 ? "rgba(255, 170, 122, 0.95)" : "#1782af");
      context.fillStyle = hull;
      context.beginPath();
      context.moveTo(0, -24);
      context.lineTo(17, 14);
      context.lineTo(6, 9);
      context.lineTo(0, 18);
      context.lineTo(-6, 9);
      context.lineTo(-17, 14);
      context.closePath();
      context.fill();

      context.fillStyle = "rgba(255, 255, 255, 0.18)";
      context.beginPath();
      context.moveTo(0, -21);
      context.lineTo(10, 6);
      context.lineTo(0, 1);
      context.lineTo(-10, 6);
      context.closePath();
      context.fill();

      context.fillStyle = "#0f2b45";
      context.beginPath();
      context.moveTo(0, -12);
      context.lineTo(8, 6);
      context.lineTo(0, 14);
      context.lineTo(-8, 6);
      context.closePath();
      context.fill();

      context.fillStyle = "#f4fbff";
      context.beginPath();
      context.arc(0, -3, 5, 0, Math.PI * 2);
      context.fill();

      context.fillStyle = "rgba(255, 255, 255, 0.55)";
      context.beginPath();
      context.arc(-2, -5, 2, 0, Math.PI * 2);
      context.fill();

      context.strokeStyle = "rgba(213, 255, 101, 0.55)";
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(-18, 12);
      context.lineTo(-28, 22);
      context.moveTo(18, 12);
      context.lineTo(28, 22);
      context.stroke();

      if (state.player.invulnerable > 0) {
        context.strokeStyle = "rgba(126, 240, 255, 0.65)";
        context.lineWidth = 2;
        context.beginPath();
        context.arc(0, 0, 28 + Math.sin(state.player.invulnerable * 11) * 3, 0, Math.PI * 2);
        context.stroke();
      }

      context.restore();
    }

    function drawBullets() {
      for (const bullet of state.bullets) {
        context.fillStyle = bullet.hue;
        context.beginPath();
        context.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
        context.fill();

        context.fillStyle = "rgba(255, 255, 255, 0.65)";
        context.fillRect(bullet.x - 1, bullet.y, 2, 12);
      }

      for (const bullet of state.enemyBullets) {
        context.fillStyle = "#ff9267";
        context.beginPath();
        context.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
        context.fill();
      }
    }

    function drawEnemies() {
      for (const enemy of state.enemies) {
        context.save();
        context.translate(enemy.x, enemy.y);
        context.rotate(enemy.angle);

        const body = context.createLinearGradient(-enemy.radius, -enemy.radius, enemy.radius, enemy.radius);
        body.addColorStop(0, enemy.type === "spinner" ? "#ffd0b2" : "#f0afff");
        body.addColorStop(0.45, enemy.type === "spinner" ? "#ff9a69" : "#c147ff");
        body.addColorStop(1, enemy.type === "spinner" ? "#a4422d" : "#55108b");
        context.fillStyle = body;
        context.beginPath();
        context.moveTo(0, -enemy.radius);
        context.lineTo(enemy.radius * 0.9, enemy.radius * 0.5);
        context.lineTo(0, enemy.radius * 0.2);
        context.lineTo(-enemy.radius * 0.9, enemy.radius * 0.5);
        context.closePath();
        context.fill();

        context.fillStyle = "rgba(255, 255, 255, 0.18)";
        context.beginPath();
        context.moveTo(0, -enemy.radius + 4);
        context.lineTo(enemy.radius * 0.52, enemy.radius * 0.14);
        context.lineTo(0, enemy.radius * 0.02);
        context.lineTo(-enemy.radius * 0.52, enemy.radius * 0.14);
        context.closePath();
        context.fill();

        context.fillStyle = "rgba(255, 246, 212, 0.9)";
        context.beginPath();
        context.arc(0, -enemy.radius * 0.2, enemy.radius * 0.24, 0, Math.PI * 2);
        context.fill();

        context.strokeStyle = enemy.type === "spinner" ? "rgba(255, 214, 174, 0.82)" : "rgba(225, 173, 255, 0.82)";
        context.lineWidth = 2.2;
        context.beginPath();
        context.moveTo(-enemy.radius * 0.76, enemy.radius * 0.42);
        context.lineTo(-enemy.radius * 1.12, enemy.radius * 0.66);
        context.moveTo(enemy.radius * 0.76, enemy.radius * 0.42);
        context.lineTo(enemy.radius * 1.12, enemy.radius * 0.66);
        context.stroke();

        context.restore();
      }
    }

    function drawPickups() {
      for (const pickup of state.pickups) {
        const pulse = 1 + Math.sin(pickup.pulse) * 0.18;
        context.fillStyle = "rgba(217, 255, 101, 0.18)";
        context.beginPath();
        context.arc(pickup.x, pickup.y, pickup.radius * 2.1 * pulse, 0, Math.PI * 2);
        context.fill();

        context.fillStyle = "#d9ff65";
        context.beginPath();
        context.moveTo(pickup.x, pickup.y - pickup.radius);
        context.lineTo(pickup.x + pickup.radius, pickup.y);
        context.lineTo(pickup.x, pickup.y + pickup.radius);
        context.lineTo(pickup.x - pickup.radius, pickup.y);
        context.closePath();
        context.fill();
      }
    }

    function drawParticles() {
      for (const particle of state.particles) {
        context.fillStyle = particle.color;
        context.strokeStyle = particle.color;
        context.lineWidth = particle.lineWidth || 2;
        context.globalAlpha = Math.max(0, particle.life * 2);

        if (particle.kind === "ring") {
          context.beginPath();
          context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
          context.stroke();
        } else if (particle.kind === "streak") {
          const angle = Math.atan2(particle.vy || 0, particle.vx || 0);
          const tail = particle.size * 2.8;
          context.beginPath();
          context.moveTo(particle.x, particle.y);
          context.lineTo(particle.x - Math.cos(angle) * tail, particle.y - Math.sin(angle) * tail);
          context.stroke();
        } else {
          context.beginPath();
          context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
          context.fill();
        }

        context.globalAlpha = 1;
      }
    }

    function drawOverlay() {
      context.fillStyle = "rgba(255, 255, 255, 0.08)";
      context.font = '700 15px "Avenir Next", "Trebuchet MS", sans-serif';
      context.fillText(`COMBO ${state.combo}`, 18, 28);
      context.fillText(`POWER ${state.player.power}`, 18, 50);

      if (!pointer.active) {
        context.fillStyle = "rgba(255, 255, 255, 0.55)";
        context.font = '500 13px "Avenir Next", "Trebuchet MS", sans-serif';
        context.fillText("Touch / drag to move", state.width - 168, state.height - 18);
      }

      if (state.gameOver) {
        context.fillStyle = "rgba(3, 8, 18, 0.74)";
        context.fillRect(0, 0, state.width, state.height);

        context.fillStyle = "#f7fbff";
        context.textAlign = "center";
        context.font = '700 46px "Avenir Next", "Trebuchet MS", sans-serif';
        context.fillText("MISSION FAILED", state.width / 2, state.height / 2 - 24);

        context.font = '500 19px "Avenir Next", "Trebuchet MS", sans-serif';
        context.fillStyle = "rgba(247, 251, 255, 0.82)";
        context.fillText(`Score ${Math.floor(state.score)}  |  Best ${state.best}`, state.width / 2, state.height / 2 + 16);
        context.fillText("Tap the stage or press Space / Enter to relaunch", state.width / 2, state.height / 2 + 52);
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
      drawPickups();
      drawBullets();
      drawEnemies();
      drawParticles();
      drawPlayer();
      drawOverlay();

      if (state.flashTimer > 0) {
        context.fillStyle = `rgba(255, 255, 255, ${state.flashTimer * 0.4})`;
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
        resetGame();
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
    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerup", handlePointerUp);
    canvas.addEventListener("pointerleave", handlePointerUp);
    canvas.addEventListener("click", () => {
      if (state.gameOver) {
        resetGame();
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

function createStar(width, height, alphaScale, minSpeed, maxSpeed) {
  return {
    x: random(0, width),
    y: random(0, height),
    size: random(1, 2.7),
    speed: random(minSpeed, maxSpeed),
    alpha: random(0.16, 0.34) * alphaScale + 0.12,
  };
}

function resetStar(star, width, height, farLayer) {
  star.x = random(0, width);
  star.y = -random(20, height * 0.35);
  star.size = random(1, farLayer ? 1.8 : 2.7);
  star.alpha = random(0.14, farLayer ? 0.26 : 0.42);
}

function random(min, max) {
  return Math.random() * (max - min) + min;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function readBestScore() {
  try {
    return Number(window.localStorage.getItem(BEST_SCORE_KEY) || 0);
  } catch {
    return 0;
  }
}

function writeBestScore(value) {
  try {
    window.localStorage.setItem(BEST_SCORE_KEY, String(value));
  } catch {
    // Some in-app browsers block storage on file:// origins.
  }
}

function createAudioEngine() {
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  let context = null;
  let master = null;
  let unlocked = false;
  let noiseBuffer = null;
  const cooldowns = {
    shot: 0,
    hit: 0,
    enemyShot: 0,
  };

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

    if (!noiseBuffer) {
      noiseBuffer = context.createBuffer(1, context.sampleRate * 0.2, context.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let index = 0; index < data.length; index += 1) {
        data[index] = Math.random() * 2 - 1;
      }
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

  function now() {
    return context ? context.currentTime : 0;
  }

  function canPlay(name, gap) {
    const current = now();
    if (current < cooldowns[name]) {
      return false;
    }
    cooldowns[name] = current + gap;
    return true;
  }

  function tone({
    type = "sine",
    startFrequency,
    endFrequency = startFrequency,
    duration = 0.1,
    gain = 0.08,
    attack = 0.005,
    release = 0.06,
  }) {
    if (!unlocked && !context) {
      return;
    }
    const nextContext = ensureContext();
    if (!nextContext || nextContext.state !== "running" || !master) {
      return;
    }

    const oscillator = nextContext.createOscillator();
    const gainNode = nextContext.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(startFrequency, nextContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), nextContext.currentTime + duration);

    gainNode.gain.setValueAtTime(0.0001, nextContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(gain, nextContext.currentTime + attack);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, nextContext.currentTime + release + duration);

    oscillator.connect(gainNode);
    gainNode.connect(master);
    oscillator.start(nextContext.currentTime);
    oscillator.stop(nextContext.currentTime + duration + release + 0.03);
  }

  function noise({
    duration = 0.12,
    gain = 0.07,
    highpass = 500,
    lowpass = 4200,
  }) {
    const nextContext = ensureContext();
    if (!unlocked || !nextContext || nextContext.state !== "running" || !master || !noiseBuffer) {
      return;
    }

    const source = nextContext.createBufferSource();
    const gainNode = nextContext.createGain();
    const highpassFilter = nextContext.createBiquadFilter();
    const lowpassFilter = nextContext.createBiquadFilter();

    source.buffer = noiseBuffer;
    highpassFilter.type = "highpass";
    highpassFilter.frequency.value = highpass;
    lowpassFilter.type = "lowpass";
    lowpassFilter.frequency.value = lowpass;

    gainNode.gain.setValueAtTime(gain, nextContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, nextContext.currentTime + duration);

    source.connect(highpassFilter);
    highpassFilter.connect(lowpassFilter);
    lowpassFilter.connect(gainNode);
    gainNode.connect(master);
    source.start(nextContext.currentTime);
    source.stop(nextContext.currentTime + duration + 0.02);
  }

  return {
    unlock,
    playerShot(power) {
      if (!canPlay("shot", 0.045)) {
        return;
      }
      tone({
        type: power === 3 ? "sawtooth" : "square",
        startFrequency: power === 3 ? 480 : 320,
        endFrequency: power === 3 ? 260 : 220,
        duration: 0.06,
        gain: power === 3 ? 0.05 : 0.04,
        attack: 0.002,
        release: 0.025,
      });
    },
    enemyShot(type) {
      if (!canPlay("enemyShot", 0.08)) {
        return;
      }
      tone({
        type: type === "spinner" ? "triangle" : "square",
        startFrequency: type === "spinner" ? 210 : 180,
        endFrequency: type === "spinner" ? 130 : 120,
        duration: 0.08,
        gain: 0.032,
        attack: 0.002,
        release: 0.05,
      });
    },
    enemyHit() {
      if (!canPlay("hit", 0.03)) {
        return;
      }
      tone({
        type: "triangle",
        startFrequency: 820,
        endFrequency: 460,
        duration: 0.035,
        gain: 0.02,
        attack: 0.001,
        release: 0.03,
      });
    },
    enemyExplode(type) {
      tone({
        type: "sawtooth",
        startFrequency: type === "spinner" ? 160 : 220,
        endFrequency: 48,
        duration: 0.22,
        gain: 0.06,
        attack: 0.002,
        release: 0.12,
      });
      noise({
        duration: type === "spinner" ? 0.18 : 0.14,
        gain: 0.045,
        highpass: 220,
        lowpass: 2400,
      });
    },
    powerUp() {
      tone({
        type: "triangle",
        startFrequency: 420,
        endFrequency: 920,
        duration: 0.18,
        gain: 0.055,
        attack: 0.003,
        release: 0.08,
      });
      tone({
        type: "sine",
        startFrequency: 620,
        endFrequency: 1240,
        duration: 0.12,
        gain: 0.04,
        attack: 0.002,
        release: 0.05,
      });
    },
    playerDamaged() {
      tone({
        type: "square",
        startFrequency: 240,
        endFrequency: 70,
        duration: 0.22,
        gain: 0.07,
        attack: 0.002,
        release: 0.14,
      });
      noise({
        duration: 0.16,
        gain: 0.055,
        highpass: 120,
        lowpass: 1800,
      });
    },
    gameOver() {
      tone({
        type: "sawtooth",
        startFrequency: 240,
        endFrequency: 42,
        duration: 0.45,
        gain: 0.06,
        attack: 0.004,
        release: 0.16,
      });
    },
    dispose() {
      if (context && context.state === "running") {
        context.suspend().catch(() => {});
      }
    },
  };
}
