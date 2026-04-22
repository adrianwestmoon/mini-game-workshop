const BRAWL_BEST_KEY = "mini-game-workshop:milk-dragon-brawl:best-score";
const BRAWL_PHASES = [
  { name: "奶泡热身局", enemyHp: 86, enemySpeed: 166, enemyAggro: 0.72, tint: "#ffd7cb" },
  { name: "龙尾连击局", enemyHp: 110, enemySpeed: 182, enemyAggro: 0.84, tint: "#ffc9b8" },
  { name: "奶焰暴走局", enemyHp: 138, enemySpeed: 198, enemyAggro: 0.96, tint: "#ffbea6" },
];

window.milkDragonBrawl = {
  id: "milk-dragon-brawl",
  title: "金声与奶龙",
  description:
    "横版擂台格斗原型。金声在奶泡擂台上对战奶龙，用轻拳、飞踢和奶光破招打满三回合，越往后奶龙越凶。",
  controls: [
    "A / D 或方向键：左右移动",
    "W / 上方向键：跳跃",
    "J / F：轻拳连击",
    "K / Space：奶光飞踢，破招更强但冷却更长",
    "手机触控：左 / 右 / 跳 / 拳 / 必杀按钮",
  ],
  create(canvas, callbacks) {
    const context = canvas.getContext("2d");
    const audio = createBrawlAudio();
    const keys = new Set();
    const touchActions = new Map();

    const state = {
      width: 960,
      height: 540,
      groundY: 0,
      lastFrame: 0,
      elapsed: 0,
      score: 0,
      best: readBrawlBest(),
      lives: 3,
      phaseIndex: 0,
      status: "ROUND 1/3",
      gameOver: false,
      won: false,
      flashTimer: 0,
      shake: 0,
      particles: [],
      touchZones: [],
      player: null,
      enemy: null,
      aiTimer: 0,
      arenaGlow: 0,
    };

    function resizeCanvas() {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      state.width = Math.max(320, rect.width);
      state.height = Math.max(320, rect.height);
      state.groundY = state.height - 96;
      canvas.width = Math.floor(state.width * dpr);
      canvas.height = Math.floor(state.height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      updateTouchZones();
    }

    function updateTouchZones() {
      state.touchZones = [
        { name: "left", x: 80, y: state.height - 72, radius: 38 },
        { name: "right", x: 164, y: state.height - 72, radius: 38 },
        { name: "jump", x: state.width - 214, y: state.height - 72, radius: 34 },
        { name: "punch", x: state.width - 132, y: state.height - 78, radius: 42 },
        { name: "special", x: state.width - 60, y: state.height - 92, radius: 50 },
      ];
    }

    function emitState(status, hint) {
      state.status = status;
      callbacks.onStateChange({
        title: `${window.milkDragonBrawl.title} · ${BRAWL_PHASES[state.phaseIndex].name}`,
        description: window.milkDragonBrawl.description,
        controls: window.milkDragonBrawl.controls,
        score: Math.floor(state.score),
        lives: state.lives,
        best: state.best,
        status,
        hint,
      });
    }

    function saveBest() {
      state.best = Math.max(state.best, Math.floor(state.score));
      writeBrawlBest(state.best);
    }

    function loadPhase(index, resetRun) {
      if (resetRun) {
        state.score = 0;
        state.lives = 3;
        state.elapsed = 0;
      }

      const phase = BRAWL_PHASES[index];
      state.phaseIndex = index;
      state.gameOver = false;
      state.won = false;
      state.flashTimer = 0;
      state.shake = 0;
      state.particles = [];
      state.aiTimer = 0;
      state.arenaGlow = 0;
      state.player = createFighter({
        name: "金声",
        x: state.width * 0.28,
        y: state.groundY,
        color: "#3a7bd8",
        scarf: "#7ce7ff",
        accent: "#ffd56f",
        maxHp: 118,
        hp: 118,
        moveSpeed: 248,
        jumpPower: 642,
      });
      state.enemy = createFighter({
        name: "奶龙",
        x: state.width * 0.74,
        y: state.groundY,
        facing: -1,
        color: "#ffb36b",
        scarf: "#ffe2a8",
        accent: "#ff8d7a",
        maxHp: phase.enemyHp,
        hp: phase.enemyHp,
        moveSpeed: phase.enemySpeed,
        jumpPower: 620,
      });

      emitState(`ROUND ${index + 1}/${BRAWL_PHASES.length}`, "先靠近用轻拳摸节奏，看到奶龙起手再用飞踢压过去。");
    }

    function resetRun() {
      loadPhase(0, true);
    }

    function winPhase() {
      state.score += 180 + state.player.hp * 2 + state.lives * 40;
      saveBest();
      state.flashTimer = 0.22;
      state.shake = 12;
      audio.win();
      burstBrawlParticles(state.enemy.x, state.enemy.y - 70, "rgba(255, 216, 165, 0.95)", 28, 260, 0.72);

      if (state.phaseIndex === BRAWL_PHASES.length - 1) {
        state.gameOver = true;
        state.won = true;
        emitState("BRAWL CLEAR", "三回合都拿下了，点一下画布再打一套。");
        return;
      }

      loadPhase(state.phaseIndex + 1, false);
    }

    function loseLife() {
      if (state.gameOver) {
        return;
      }

      state.lives -= 1;
      state.flashTimer = 0.18;
      state.shake = 14;
      audio.gameOver();
      burstBrawlParticles(state.player.x, state.player.y - 72, "rgba(255, 158, 142, 0.96)", 24, 220, 0.52);

      if (state.lives <= 0) {
        state.gameOver = true;
        state.won = false;
        saveBest();
        emitState("KO", "奶龙这局压住了，点一下画布重开整场。");
        return;
      }

      loadPhase(state.phaseIndex, false);
      emitState(`ROUND ${state.phaseIndex + 1}/${BRAWL_PHASES.length}`, "掉了一条命，稳一点，拉开距离后再反打。");
    }

    function currentInput() {
      let left = keys.has("arrowleft") || keys.has("a");
      let right = keys.has("arrowright") || keys.has("d");
      let jump = keys.has("arrowup") || keys.has("w");
      let punch = keys.has("j") || keys.has("f");
      let special = keys.has("k") || keys.has(" ");

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
        if (action === "punch") {
          punch = true;
        }
        if (action === "special") {
          special = true;
        }
      }

      return { left, right, jump, punch, special };
    }

    function beginAttack(actor, kind) {
      if (actor.stun > 0 || actor.attack || actor.attackCooldown > 0) {
        return false;
      }

      if (kind === "punch") {
        actor.attack = {
          kind,
          timer: 0,
          windup: 0.05,
          active: 0.09,
          recovery: 0.16,
          damage: 14,
          range: 68,
          height: 76,
          knockbackX: 240,
          knockbackY: -140,
          scored: false,
          effectColor: actor === state.player ? "rgba(124, 231, 255, 0.95)" : "rgba(255, 210, 154, 0.95)",
        };
        actor.attackCooldown = 0.26;
        audio.punch();
      } else {
        actor.attack = {
          kind,
          timer: 0,
          windup: 0.08,
          active: 0.12,
          recovery: 0.3,
          damage: 24,
          range: 92,
          height: 88,
          knockbackX: 390,
          knockbackY: -220,
          scored: false,
          effectColor: actor === state.player ? "rgba(255, 227, 124, 0.96)" : "rgba(255, 150, 130, 0.94)",
        };
        actor.attackCooldown = 0.72;
        actor.vx += actor.facing * 140;
        actor.vy = Math.min(actor.vy, -180);
        audio.special();
      }

      actor.comboFlash = 0.18;
      return true;
    }

    function hitTarget(attacker, defender, attack) {
      defender.hp = Math.max(0, defender.hp - attack.damage);
      defender.stun = attack.kind === "special" ? 0.32 : 0.18;
      defender.invulnerable = 0.22;
      defender.vx = attacker.facing * attack.knockbackX;
      defender.vy = attack.knockbackY;
      defender.onGround = false;
      defender.facing = attacker.x < defender.x ? -1 : 1;
      state.shake = Math.max(state.shake, attack.kind === "special" ? 10 : 6);
      state.flashTimer = Math.max(state.flashTimer, attack.kind === "special" ? 0.12 : 0.06);

      if (attacker === state.player) {
        state.score += attack.kind === "special" ? 24 : 12;
      }

      burstBrawlParticles(defender.x, defender.y - 60, attack.effectColor, attack.kind === "special" ? 16 : 10, 180, 0.34);
      if (attack.kind === "special") {
        state.particles.push({
          kind: "ring",
          x: defender.x,
          y: defender.y - 62,
          radius: 18,
          growth: 220,
          lineWidth: 4,
          life: 0.32,
          color: attack.effectColor,
        });
      }

      audio.hit(attack.kind === "special");
      attack.scored = true;
    }

    function updateAttack(actor, defender, delta) {
      if (!actor.attack) {
        return;
      }

      actor.attack.timer += delta;
      const attack = actor.attack;
      const activeStart = attack.windup;
      const activeEnd = attack.windup + attack.active;

      if (attack.kind === "special" && attack.timer < activeEnd) {
        actor.vx = actor.facing * 280;
      }

      if (!attack.scored && attack.timer >= activeStart && attack.timer <= activeEnd) {
        const horizontal = (defender.x - actor.x) * actor.facing;
        const vertical = Math.abs((defender.y - 58) - (actor.y - 58));
        if (horizontal > 8 && horizontal < attack.range && vertical < attack.height && defender.invulnerable <= 0) {
          hitTarget(actor, defender, attack);
        }
      }

      if (attack.timer >= attack.windup + attack.active + attack.recovery) {
        actor.attack = null;
      }
    }

    function updateFighter(actor, controls, delta) {
      actor.attackCooldown = Math.max(0, actor.attackCooldown - delta);
      actor.stun = Math.max(0, actor.stun - delta);
      actor.invulnerable = Math.max(0, actor.invulnerable - delta);
      actor.comboFlash = Math.max(0, actor.comboFlash - delta);
      actor.bob += delta * 5;

      if (actor.stun <= 0) {
        let move = 0;
        if (controls.left && !controls.right) {
          move -= 1;
        }
        if (controls.right && !controls.left) {
          move += 1;
        }

        const targetVx = move * actor.moveSpeed;
        actor.vx += (targetVx - actor.vx) * Math.min(1, delta * (actor.onGround ? 11 : 5.5));
        if (move !== 0) {
          actor.facing = move;
        }

        if (controls.jump && actor.onGround && !actor.jumpLatch) {
          actor.vy = -actor.jumpPower;
          actor.onGround = false;
          actor.jumpLatch = true;
          audio.jump();
          burstBrawlParticles(actor.x, actor.y - 6, "rgba(255, 246, 221, 0.82)", 8, 90, 0.26);
        }
        if (!controls.jump) {
          actor.jumpLatch = false;
        }
      } else {
        actor.vx *= 0.96;
      }

      actor.vy += 1680 * delta;
      actor.x += actor.vx * delta;
      actor.y += actor.vy * delta;

      const leftBound = 46;
      const rightBound = state.width - 46;
      if (actor.x < leftBound) {
        actor.x = leftBound;
        actor.vx = Math.max(0, actor.vx);
      }
      if (actor.x > rightBound) {
        actor.x = rightBound;
        actor.vx = Math.min(0, actor.vx);
      }

      if (actor.y >= state.groundY) {
        actor.y = state.groundY;
        actor.vy = 0;
        actor.onGround = true;
      } else {
        actor.onGround = false;
      }
    }

    function updatePlayer(delta) {
      const controls = currentInput();
      updateFighter(state.player, controls, delta);

      if (!state.gameOver && state.player.stun <= 0) {
        if (controls.punch && !state.player.attackLatch.punch) {
          beginAttack(state.player, "punch");
        }
        if (controls.special && !state.player.attackLatch.special) {
          beginAttack(state.player, "special");
        }
      }

      state.player.attackLatch.punch = controls.punch;
      state.player.attackLatch.special = controls.special;
      updateAttack(state.player, state.enemy, delta);
    }

    function updateEnemy(delta) {
      const enemy = state.enemy;
      const player = state.player;
      const phase = BRAWL_PHASES[state.phaseIndex];
      state.aiTimer -= delta;

      const controls = {
        left: false,
        right: false,
        jump: false,
      };

      if (enemy.stun <= 0) {
        const dx = player.x - enemy.x;
        const absDx = Math.abs(dx);
        if (absDx > 104) {
          controls[dx > 0 ? "right" : "left"] = true;
        } else if (absDx < 56 && Math.random() < 0.2) {
          controls[dx > 0 ? "left" : "right"] = true;
        }

        if (state.aiTimer <= 0) {
          state.aiTimer = brawlRandom(0.16, 0.3);

          if (absDx < 90 && enemy.attackCooldown <= 0) {
            if (Math.random() < phase.enemyAggro) {
              beginAttack(enemy, absDx < 64 && Math.random() < 0.55 ? "punch" : "special");
            }
          } else if (absDx > 160 && enemy.onGround && Math.random() < 0.22) {
            controls.jump = true;
          }
        }
      }

      if (player.x < enemy.x) {
        enemy.facing = -1;
      } else {
        enemy.facing = 1;
      }

      updateFighter(enemy, controls, delta);
      updateAttack(enemy, player, delta);
    }

    function updateParticles(delta) {
      for (let index = state.particles.length - 1; index >= 0; index -= 1) {
        const particle = state.particles[index];
        particle.life -= delta;
        particle.x += (particle.vx || 0) * delta;
        particle.y += (particle.vy || 0) * delta;
        particle.rotation = (particle.rotation || 0) + (particle.spin || 0) * delta;
        if (particle.radius != null) {
          particle.radius += (particle.growth || 0) * delta;
        }
        if (particle.life <= 0) {
          state.particles.splice(index, 1);
        }
      }
    }

    function burstBrawlParticles(x, y, color, count, speed, life) {
      for (let index = 0; index < count; index += 1) {
        state.particles.push({
          kind: index % 5 === 0 ? "star" : "orb",
          x,
          y,
          vx: brawlRandom(-speed, speed),
          vy: brawlRandom(-speed, speed),
          size: brawlRandom(4, 8),
          rotation: brawlRandom(-0.6, 0.6),
          spin: brawlRandom(-4.2, 4.2),
          life: brawlRandom(life * 0.45, life),
          color,
        });
      }
    }

    function update(delta) {
      state.elapsed += delta;
      state.shake = Math.max(0, state.shake - delta * 22);
      state.flashTimer = Math.max(0, state.flashTimer - delta);
      state.arenaGlow = Math.max(0, state.arenaGlow - delta * 0.9);

      if (state.gameOver) {
        emitState(
          state.won ? "BRAWL CLEAR" : "KO",
          state.won ? "金声把奶龙三回合都拿下了，点一下画布再开一套。" : "点一下画布，重新开这场奶泡擂台。",
        );
        updateParticles(delta);
        return;
      }

      updatePlayer(delta);
      updateEnemy(delta);
      updateParticles(delta);

      if (state.enemy.hp <= 0) {
        winPhase();
        return;
      }

      if (state.player.hp <= 0) {
        loseLife();
        return;
      }

      emitState(
        `ROUND ${state.phaseIndex + 1}/${BRAWL_PHASES.length}`,
        `金声 ${Math.ceil(state.player.hp)} HP，对面奶龙 ${Math.ceil(state.enemy.hp)} HP。`,
      );
    }

    function drawBackground() {
      const phase = BRAWL_PHASES[state.phaseIndex];
      const sky = context.createLinearGradient(0, 0, 0, state.height);
      sky.addColorStop(0, "#22132e");
      sky.addColorStop(0.58, "#3a2545");
      sky.addColorStop(1, "#201626");
      context.fillStyle = sky;
      context.fillRect(0, 0, state.width, state.height);

      context.fillStyle = "rgba(255, 225, 198, 0.16)";
      context.beginPath();
      context.arc(state.width * 0.18, state.height * 0.18, 72, 0, Math.PI * 2);
      context.fill();

      context.fillStyle = "rgba(255, 255, 255, 0.06)";
      for (let index = 0; index < 16; index += 1) {
        const x = index * (state.width / 15) + (index % 2) * 12;
        context.fillRect(x, 0, 2, state.height);
      }

      context.fillStyle = "rgba(255, 255, 255, 0.03)";
      for (let index = 0; index < 10; index += 1) {
        const y = 50 + index * 42;
        context.fillRect(0, y, state.width, 2);
      }

      const floor = context.createLinearGradient(0, state.groundY - 36, 0, state.height);
      floor.addColorStop(0, phase.tint);
      floor.addColorStop(1, "#c7766f");
      context.fillStyle = floor;
      context.fillRect(0, state.groundY - 26, state.width, state.height - state.groundY + 40);

      context.fillStyle = "rgba(120, 42, 58, 0.28)";
      context.fillRect(0, state.groundY - 10, state.width, 10);

      context.strokeStyle = "rgba(255, 247, 239, 0.18)";
      context.lineWidth = 6;
      context.strokeRect(22, 52, state.width - 44, state.groundY - 74);

      context.fillStyle = "rgba(255, 244, 236, 0.82)";
      context.font = '600 14px "Avenir Next", "Trebuchet MS", sans-serif';
      context.textAlign = "center";
      context.fillText("MILK DRAGON RING", state.width / 2, 34);
      context.textAlign = "left";
    }

    function drawHpBars() {
      drawBar(28, 24, 260, 18, state.player.hp / state.player.maxHp, "#7ce7ff", "金声");
      drawBar(state.width - 288, 24, 260, 18, state.enemy.hp / state.enemy.maxHp, "#ffb56b", "奶龙", true);
    }

    function drawBar(x, y, width, height, ratio, color, label, rightAlign) {
      context.fillStyle = "rgba(255, 255, 255, 0.08)";
      context.fillRect(x, y, width, height);
      context.fillStyle = color;
      const fillWidth = brawlClamp(width * brawlClamp(ratio, 0, 1), 0, width);
      context.fillRect(rightAlign ? x + width - fillWidth : x, y, fillWidth, height);
      context.strokeStyle = "rgba(255, 255, 255, 0.28)";
      context.strokeRect(x, y, width, height);
      context.fillStyle = "#fff5ef";
      context.font = '700 15px "Avenir Next", "Trebuchet MS", sans-serif';
      context.textAlign = rightAlign ? "right" : "left";
      context.fillText(label, rightAlign ? x + width : x, y - 6);
      context.textAlign = "left";
    }

    function drawFighter(actor, enemy) {
      context.save();
      context.translate(actor.x, actor.y);
      context.scale(actor.facing, 1);

      if (actor.invulnerable > 0 && Math.floor(actor.invulnerable * 16) % 2 === 0) {
        context.globalAlpha = 0.52;
      }

      if (actor.name === "奶龙") {
        drawMilkDragon(actor, enemy);
      } else {
        drawJinsheng(actor);
      }

      context.restore();
    }

    function drawJinsheng(actor) {
      const bodyLean = actor.attack ? 4 : 0;
      context.fillStyle = "rgba(26, 16, 28, 0.22)";
      context.beginPath();
      context.ellipse(0, 6, 24, 8, 0, 0, Math.PI * 2);
      context.fill();

      const aura = context.createRadialGradient(0, -48, 8, 0, -48, 48);
      aura.addColorStop(0, "rgba(124, 231, 255, 0.18)");
      aura.addColorStop(1, "rgba(124, 231, 255, 0)");
      context.fillStyle = aura;
      context.beginPath();
      context.arc(0, -48, 48, 0, Math.PI * 2);
      context.fill();

      const face = context.createRadialGradient(-5, -90, 4, 0, -84, 20);
      face.addColorStop(0, "#fff0d8");
      face.addColorStop(1, "#fee1c8");
      context.fillStyle = face;
      context.beginPath();
      context.arc(0, -84, 18, 0, Math.PI * 2);
      context.fill();

      context.fillStyle = "rgba(255, 186, 192, 0.82)";
      context.beginPath();
      context.arc(-9, -80, 3.4, 0, Math.PI * 2);
      context.arc(9, -80, 3.4, 0, Math.PI * 2);
      context.fill();

      const hair = context.createLinearGradient(-16, -104, 14, -68);
      hair.addColorStop(0, "#272133");
      hair.addColorStop(1, "#172037");
      context.fillStyle = hair;
      context.beginPath();
      context.moveTo(-18, -84);
      context.quadraticCurveTo(-14, -102, 2, -100);
      context.quadraticCurveTo(18, -96, 14, -76);
      context.lineTo(8, -68);
      context.lineTo(-14, -68);
      context.closePath();
      context.fill();

      context.fillStyle = "#172037";
      context.beginPath();
      context.arc(-5, -87, 2, 0, Math.PI * 2);
      context.arc(5, -87, 2, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = "#172037";
      context.lineWidth = 1.8;
      context.beginPath();
      context.arc(0, -81, 5.2, 0.2, Math.PI - 0.2);
      context.stroke();

      const coat = context.createLinearGradient(-22, -66, 22, -8);
      coat.addColorStop(0, "#466ca8");
      coat.addColorStop(0.52, "#203766");
      coat.addColorStop(1, "#11203d");
      context.fillStyle = coat;
      context.beginPath();
      context.moveTo(-20, -66);
      context.lineTo(20, -66);
      context.lineTo(24, -18);
      context.lineTo(-24, -18);
      context.closePath();
      context.fill();
      context.fillStyle = actor.scarf;
      context.fillRect(-14, -56, 28, 9);
      context.fillStyle = "rgba(255, 255, 255, 0.22)";
      context.fillRect(-14, -56, 10, 9);
      context.fillStyle = actor.accent;
      context.fillRect(-6, -66, 12, 8);

      const armReach = actor.attack ? 20 : 8;
      context.strokeStyle = "#203766";
      context.lineWidth = 11;
      context.lineCap = "round";
      context.beginPath();
      context.moveTo(-16, -56);
      context.lineTo(-26, -32);
      context.moveTo(16, -56);
      context.lineTo(20 + armReach, -34 - bodyLean);
      context.stroke();

      context.strokeStyle = "#f2a481";
      context.lineWidth = 8;
      context.beginPath();
      context.moveTo(-6, -20);
      context.lineTo(-10, 12);
      context.moveTo(6, -20);
      context.lineTo(10, 12);
      context.stroke();

      context.fillStyle = "#ffd86a";
      context.beginPath();
      context.moveTo(0, -110);
      context.lineTo(4, -100);
      context.lineTo(14, -98);
      context.lineTo(5, -92);
      context.lineTo(8, -82);
      context.lineTo(0, -87);
      context.lineTo(-8, -82);
      context.lineTo(-5, -92);
      context.lineTo(-14, -98);
      context.lineTo(-4, -100);
      context.closePath();
      context.fill();

      context.fillStyle = "rgba(255, 255, 255, 0.18)";
      context.beginPath();
      context.arc(-4, -90, 5, 0, Math.PI * 2);
      context.fill();
    }

    function drawMilkDragon(actor, enemy) {
      const tailSwing = Math.sin(state.elapsed * 7) * 10;
      context.fillStyle = "rgba(30, 16, 12, 0.24)";
      context.beginPath();
      context.ellipse(0, 8, 38, 10, 0, 0, Math.PI * 2);
      context.fill();

      const dragonAura = context.createRadialGradient(0, -54, 10, 0, -54, 64);
      dragonAura.addColorStop(0, "rgba(255, 224, 170, 0.16)");
      dragonAura.addColorStop(1, "rgba(255, 224, 170, 0)");
      context.fillStyle = dragonAura;
      context.beginPath();
      context.arc(0, -54, 64, 0, Math.PI * 2);
      context.fill();

      const body = context.createLinearGradient(-30, -84, 30, -8);
      body.addColorStop(0, "#ffd69e");
      body.addColorStop(0.52, "#ffbd73");
      body.addColorStop(1, "#d67a41");
      context.fillStyle = body;
      context.beginPath();
      context.ellipse(0, -54, 34, 42, 0, 0, Math.PI * 2);
      context.fill();

      context.fillStyle = "rgba(255, 255, 255, 0.16)";
      context.beginPath();
      context.ellipse(-6, -64, 14, 18, -0.3, 0, Math.PI * 2);
      context.fill();

      context.fillStyle = "#ffe7c4";
      context.beginPath();
      context.ellipse(0, -42, 22, 18, 0, 0, Math.PI * 2);
      context.fill();

      context.fillStyle = "#fff";
      context.beginPath();
      context.arc(-10, -62, 6, 0, Math.PI * 2);
      context.arc(10, -62, 6, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = "#1d1d1d";
      context.beginPath();
      context.arc(-10, -62, 2.3, 0, Math.PI * 2);
      context.arc(10, -62, 2.3, 0, Math.PI * 2);
      context.fill();

      context.fillStyle = "rgba(255, 186, 196, 0.84)";
      context.beginPath();
      context.arc(-16, -52, 3.8, 0, Math.PI * 2);
      context.arc(16, -52, 3.8, 0, Math.PI * 2);
      context.fill();

      context.strokeStyle = "#8f4d2d";
      context.lineWidth = 2;
      context.beginPath();
      context.arc(0, -52, 8, 0.18, Math.PI - 0.18);
      context.stroke();

      context.fillStyle = "#ff9379";
      context.beginPath();
      context.moveTo(-18, -94);
      context.lineTo(-8, -108);
      context.lineTo(0, -92);
      context.closePath();
      context.fill();
      context.beginPath();
      context.moveTo(18, -94);
      context.lineTo(8, -108);
      context.lineTo(0, -92);
      context.closePath();
      context.fill();

      context.strokeStyle = "#ffbd73";
      context.lineWidth = 12;
      context.lineCap = "round";
      context.beginPath();
      context.moveTo(22, -26);
      context.lineTo(28, 4);
      context.moveTo(-12, -12);
      context.lineTo(-34, 6 + tailSwing);
      context.stroke();

      context.strokeStyle = "#ffe2aa";
      context.lineWidth = 8;
      context.beginPath();
      context.moveTo(-34, 6 + tailSwing);
      context.lineTo(-52, -2 + tailSwing * 0.4);
      context.stroke();

      if (actor.attack && actor.attack.kind === "special") {
        context.strokeStyle = "rgba(255, 236, 168, 0.92)";
        context.lineWidth = 5;
        context.beginPath();
        context.arc(26, -54, 24, -0.7, 0.8);
        context.stroke();
      }

      context.fillStyle = "#fff1d2";
      context.beginPath();
      context.moveTo(10, -32);
      context.lineTo(18, -18);
      context.lineTo(4, -20);
      context.closePath();
      context.fill();
      context.beginPath();
      context.moveTo(-2, -30);
      context.lineTo(6, -14);
      context.lineTo(-8, -16);
      context.closePath();
      context.fill();

      if (enemy && enemy.hp < enemy.maxHp * 0.4) {
        context.fillStyle = "rgba(255, 236, 150, 0.26)";
        context.beginPath();
        context.arc(0, -54, 52, 0, Math.PI * 2);
        context.fill();
      }
    }

    function drawParticles() {
      for (const particle of state.particles) {
        context.save();
        context.globalAlpha = Math.max(0, Math.min(1, particle.life * 2));
        context.fillStyle = particle.color;
        context.strokeStyle = particle.color;

        if (particle.kind === "ring") {
          context.lineWidth = particle.lineWidth || 2;
          context.beginPath();
          context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
          context.stroke();
        } else if (particle.kind === "star") {
          context.translate(particle.x, particle.y);
          context.rotate(particle.rotation || 0);
          drawBrawlStar(context, particle.size || 10);
          context.fill();
        } else {
          context.beginPath();
          context.arc(particle.x, particle.y, particle.size || 4, 0, Math.PI * 2);
          context.fill();
        }
        context.restore();
      }
    }

    function drawTouchButtons() {
      for (const zone of state.touchZones) {
        context.save();
        const active = Array.from(touchActions.values()).includes(zone.name);
        context.translate(zone.x, zone.y);
        context.fillStyle = active ? "rgba(255, 242, 229, 0.22)" : "rgba(255, 255, 255, 0.08)";
        context.beginPath();
        context.arc(0, 0, zone.radius, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = active ? "rgba(255, 228, 185, 0.95)" : "rgba(255, 255, 255, 0.24)";
        context.lineWidth = 3;
        context.beginPath();
        context.arc(0, 0, zone.radius - 4, 0, Math.PI * 2);
        context.stroke();

        context.fillStyle = "#fff7f0";
        context.font = '700 14px "Avenir Next", "Trebuchet MS", sans-serif';
        context.textAlign = "center";
        const label =
          zone.name === "left"
            ? "L"
            : zone.name === "right"
              ? "R"
              : zone.name === "jump"
                ? "JUMP"
                : zone.name === "punch"
                  ? "PUNCH"
                  : "SUPER";
        context.fillText(label, 0, zone.name === "jump" ? 5 : 4);
        context.restore();
      }
      context.textAlign = "left";
    }

    function drawOverlay() {
      drawHpBars();

      context.fillStyle = "rgba(255, 248, 240, 0.88)";
      context.font = '700 16px "Avenir Next", "Trebuchet MS", sans-serif';
      context.fillText(`Round ${state.phaseIndex + 1}/${BRAWL_PHASES.length}`, 28, state.height - 128);
      context.fillText(`出招冷却 ${Math.max(0, state.player.attackCooldown).toFixed(2)}s`, 28, state.height - 104);

      if (state.flashTimer > 0) {
        context.fillStyle = `rgba(255, 240, 215, ${state.flashTimer * 0.42})`;
        context.fillRect(0, 0, state.width, state.height);
      }

      if (state.gameOver) {
        context.fillStyle = "rgba(16, 10, 18, 0.64)";
        context.fillRect(0, 0, state.width, state.height);
        context.fillStyle = "#fff0df";
        context.textAlign = "center";
        context.font = '700 44px "Avenir Next", "Trebuchet MS", sans-serif';
        context.fillText(state.won ? "BRAWL CLEAR" : "KO", state.width / 2, state.height / 2 - 18);
        context.font = '500 20px "Avenir Next", "Trebuchet MS", sans-serif';
        context.fillText(
          state.won ? "金声把奶龙整整压了三回合。" : "奶龙这轮扳回来了，再打一套。",
          state.width / 2,
          state.height / 2 + 18,
        );
        context.fillText("Tap the stage or press Space / K to restart", state.width / 2, state.height / 2 + 52);
        context.textAlign = "left";
      }
    }

    function render() {
      context.save();
      context.clearRect(0, 0, state.width, state.height);

      if (state.shake > 0) {
        context.translate(brawlRandom(-state.shake, state.shake), brawlRandom(-state.shake, state.shake));
      }

      drawBackground();
      drawParticles();
      drawFighter(state.player, state.enemy);
      drawFighter(state.enemy, state.player);
      drawTouchButtons();
      drawOverlay();
      context.restore();
    }

    function frame(now) {
      if (!state.lastFrame) {
        state.lastFrame = now;
      }
      const delta = Math.min(0.033, (now - state.lastFrame) / 1000);
      state.lastFrame = now;
      update(delta);
      render();
      state.rafId = window.requestAnimationFrame(frame);
    }

    function findTouchZone(x, y) {
      return state.touchZones.find((zone) => Math.hypot(zone.x - x, zone.y - y) <= zone.radius);
    }

    function pointerPosition(event) {
      const rect = canvas.getBoundingClientRect();
      return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
    }

    function onPointerDown(event) {
      const point = pointerPosition(event);
      audio.unlock();

      if (state.gameOver) {
        resetRun();
        return;
      }

      const zone = findTouchZone(point.x, point.y);
      if (zone) {
        touchActions.set(event.pointerId, zone.name);
        if (zone.name === "punch") {
          beginAttack(state.player, "punch");
        }
        if (zone.name === "special") {
          beginAttack(state.player, "special");
        }
      }
    }

    function onPointerMove(event) {
      if (!touchActions.has(event.pointerId)) {
        return;
      }
      const point = pointerPosition(event);
      const zone = findTouchZone(point.x, point.y);
      if (zone) {
        touchActions.set(event.pointerId, zone.name);
      } else {
        touchActions.delete(event.pointerId);
      }
    }

    function onPointerUp(event) {
      touchActions.delete(event.pointerId);
    }

    function onKeyDown(event) {
      const key = event.key.toLowerCase();
      keys.add(key);
      audio.unlock();

      if (state.gameOver && (key === " " || key === "k" || key === "enter")) {
        event.preventDefault();
        resetRun();
        return;
      }

      if (!event.repeat && !state.gameOver) {
        if (key === "j" || key === "f") {
          event.preventDefault();
          beginAttack(state.player, "punch");
        }
        if (key === "k" || key === " ") {
          event.preventDefault();
          beginAttack(state.player, "special");
        }
      }
    }

    function onKeyUp(event) {
      keys.delete(event.key.toLowerCase());
    }

    resizeCanvas();
    resetRun();

    window.addEventListener("resize", resizeCanvas);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);

    state.rafId = window.requestAnimationFrame(frame);

    return {
      destroy() {
        window.cancelAnimationFrame(state.rafId);
        window.removeEventListener("resize", resizeCanvas);
        window.removeEventListener("keydown", onKeyDown);
        window.removeEventListener("keyup", onKeyUp);
        canvas.removeEventListener("pointerdown", onPointerDown);
        canvas.removeEventListener("pointermove", onPointerMove);
        canvas.removeEventListener("pointerup", onPointerUp);
        canvas.removeEventListener("pointercancel", onPointerUp);
      },
    };
  },
};

function createFighter(overrides) {
  return {
    name: "fighter",
    x: 100,
    y: 100,
    vx: 0,
    vy: 0,
    facing: 1,
    maxHp: 100,
    hp: 100,
    moveSpeed: 220,
    jumpPower: 620,
    attackCooldown: 0,
    attack: null,
    stun: 0,
    invulnerable: 0,
    onGround: true,
    jumpLatch: false,
    comboFlash: 0,
    bob: 0,
    attackLatch: { punch: false, special: false },
    color: "#4477ff",
    scarf: "#7ce7ff",
    accent: "#ffde7f",
    ...overrides,
  };
}

function drawBrawlStar(context, size) {
  context.beginPath();
  context.moveTo(0, -size);
  context.lineTo(size * 0.32, -size * 0.28);
  context.lineTo(size, 0);
  context.lineTo(size * 0.32, size * 0.28);
  context.lineTo(0, size);
  context.lineTo(-size * 0.32, size * 0.28);
  context.lineTo(-size, 0);
  context.lineTo(-size * 0.32, -size * 0.28);
  context.closePath();
}

function readBrawlBest() {
  try {
    return Number(window.localStorage.getItem(BRAWL_BEST_KEY) || 0);
  } catch (error) {
    return 0;
  }
}

function writeBrawlBest(best) {
  try {
    window.localStorage.setItem(BRAWL_BEST_KEY, String(best));
  } catch (error) {
    return;
  }
}

function brawlClamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function brawlRandom(min, max) {
  return min + Math.random() * (max - min);
}

function createBrawlAudio() {
  let audioContext = null;

  function ensureContext() {
    if (!audioContext) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) {
        return null;
      }
      audioContext = new AudioContextClass();
    }
    if (audioContext.state === "suspended") {
      audioContext.resume().catch(() => {});
    }
    return audioContext;
  }

  function beep(type, frequency, duration, volume, glide = frequency) {
    const context = ensureContext();
    if (!context) {
      return;
    }

    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(glide, now + duration);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration);
  }

  return {
    unlock() {
      ensureContext();
    },
    jump() {
      beep("triangle", 320, 0.08, 0.045, 440);
    },
    punch() {
      beep("square", 180, 0.06, 0.04, 120);
    },
    special() {
      beep("sawtooth", 240, 0.16, 0.06, 520);
      beep("triangle", 520, 0.18, 0.04, 260);
    },
    hit(isHeavy) {
      beep("square", isHeavy ? 120 : 160, isHeavy ? 0.11 : 0.08, 0.05, 70);
    },
    win() {
      beep("triangle", 420, 0.16, 0.04, 640);
      beep("sine", 620, 0.24, 0.05, 900);
    },
    gameOver() {
      beep("sawtooth", 190, 0.22, 0.06, 80);
    },
  };
}
