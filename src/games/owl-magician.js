const OWL_MAGE_BEST_KEY = "mini-game-workshop:owl-magician:best-score";
const OWL_MAGE_ART = createImageAsset("./assets/art/worldline-concept.png");
const OWL_MAGE_PHASES = [
  { name: "点亮月灯", status: "MOON RISE" },
  { name: "封印裂隙", status: "RIFT SEAL" },
  { name: "守住月核", status: "CORE HOLD" },
];

window.owlMagician = {
  id: "owl-magician",
  title: "猫头鹰与魔术师金声",
  description:
    "月夜法阵动作游戏。魔术师金声带着猫头鹰穿过林间空地，先点亮月灯，再封印裂隙，最后守住月核充能。",
  controls: [
    "拖动屏幕 / 鼠标：移动金声",
    "WASD / 方向键：备用移动",
    "E / Space：释放月光脉冲，点灯、补灯、封裂隙、清夜影",
    "收集星羽给法杖充能，三阶段依次完成点灯、封印和守核",
  ],
  create(canvas, callbacks) {
    const context = canvas.getContext("2d");
    const audio = createOwlMageAudio();
    const keys = new Set();
    const pointer = { active: false, id: null, x: 0, y: 0 };
    const state = {
      width: 960,
      height: 540,
      lastFrame: 0,
      elapsed: 0,
      score: 0,
      best: readOwlMageBest(),
      lives: 4,
      status: "MOON RISE",
      gameOver: false,
      won: false,
      shake: 0,
      flashTimer: 0,
      spawnTimer: 0,
      starTimer: 0,
      particles: [],
      wisps: [],
      stars: [],
      rifts: [],
      phaseIndex: 0,
      eliteTimer: 0,
      player: createMage(),
      owl: createOwl(),
      beacons: [],
      moonCore: createMoonCore(),
      spellButton: { x: 0, y: 0, radius: 56 },
    };

    function resizeCanvas() {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      state.width = Math.max(320, rect.width);
      state.height = Math.max(320, rect.height);
      canvas.width = Math.floor(state.width * dpr);
      canvas.height = Math.floor(state.height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      layoutArena();
    }

    function layoutArena() {
      state.spellButton.x = state.width - 90;
      state.spellButton.y = state.height - 86;
      state.beacons = [
        createBeacon(state.width * 0.24, state.height * 0.3, "晨露月灯"),
        createBeacon(state.width * 0.52, state.height * 0.2, "云羽月灯"),
        createBeacon(state.width * 0.78, state.height * 0.34, "琥珀月灯"),
      ];
      state.moonCore.x = state.width * 0.52;
      state.moonCore.y = state.height * 0.56;

      if (!state.gameOver) {
        state.player.x = state.width * 0.5;
        state.player.y = state.height * 0.72;
        state.owl.x = state.player.x + 42;
        state.owl.y = state.player.y - 36;
      }
    }

    function emitState(status, hint) {
      state.status = status;
      callbacks.onStateChange({
        title: `${window.owlMagician.title} · ${OWL_MAGE_PHASES[state.phaseIndex].name}`,
        description: window.owlMagician.description,
        controls: window.owlMagician.controls,
        score: Math.floor(state.score),
        lives: state.lives,
        best: state.best,
        status,
        hint,
      });
    }

    function litCount() {
      return state.beacons.filter((beacon) => beacon.lit).length;
    }

    function remainingRifts() {
      return state.rifts.filter((rift) => !rift.sealed).length;
    }

    function sealedRiftCount() {
      return state.rifts.length - remainingRifts();
    }

    function populateStars(count) {
      for (let index = 0; index < count; index += 1) {
        state.stars.push(createStarFeather(random(state.width * 0.18, state.width * 0.82), random(state.height * 0.2, state.height * 0.76)));
      }
    }

    function phaseHint(index) {
      if (index === 0) {
        return "先收集星羽，再靠近月灯释放脉冲点亮法阵。";
      }
      if (index === 1) {
        return "裂隙已经张开，靠近后反复放脉冲封住它们，不然夜影会越打越多。";
      }
      return "月核开始充能了，至少守住两座月灯，并别让夜影扑穿月核。";
    }

    function setupPhase(index, resetStats = false) {
      if (resetStats) {
        state.elapsed = 0;
        state.score = 0;
        state.lives = 4;
      }

      state.phaseIndex = index;
      state.gameOver = false;
      state.won = false;
      state.shake = 0;
      state.flashTimer = 0;
      state.spawnTimer = index === 0 ? 1.1 : index === 1 ? 0.86 : 0.72;
      state.starTimer = 0.35;
      state.eliteTimer = index === 2 ? 3.6 : 5.2;
      state.particles = [];
      state.wisps = [];
      state.stars = [];
      state.rifts = [];
      state.player = createMage({
        x: state.width * 0.5,
        y: state.height * 0.72,
      });
      state.owl = createOwl();
      state.owl.x = state.player.x + 42;
      state.owl.y = state.player.y - 36;
      clearInputState();
      state.moonCore = createMoonCore({
        x: state.width * 0.52,
        y: state.height * 0.56,
        active: index === 2,
        integrity: 100,
        charge: 0,
      });
      layoutArena();

      if (index === 0) {
        for (const beacon of state.beacons) {
          beacon.lit = false;
          beacon.integrity = 0;
        }
        state.player.charge = 42;
        populateStars(4);
      } else if (index === 1) {
        for (const beacon of state.beacons) {
          beacon.lit = true;
          beacon.integrity = 84;
        }
        state.player.charge = 56;
        state.rifts = [
          createRift(state.width * 0.24, state.height * 0.66, "晨露裂隙"),
          createRift(state.width * 0.54, state.height * 0.36, "云羽裂隙"),
          createRift(state.width * 0.78, state.height * 0.66, "琥珀裂隙"),
        ];
        populateStars(5);
      } else {
        for (const beacon of state.beacons) {
          beacon.lit = true;
          beacon.integrity = 88;
        }
        state.player.charge = 62;
        state.moonCore.active = true;
        state.moonCore.integrity = 100;
        state.moonCore.charge = 0;
        populateStars(6);
      }

      emitState(OWL_MAGE_PHASES[index].status, phaseHint(index));
    }

    function clearInputState() {
      keys.clear();
      pointer.active = false;
      pointer.id = null;
      pointer.x = state.player.x;
      pointer.y = state.player.y;
    }

    function resetRun() {
      clearInputState();
      setupPhase(0, true);
    }

    function advancePhase() {
      if (state.phaseIndex >= OWL_MAGE_PHASES.length - 1) {
        finishRun();
        return;
      }

      state.score += 120 + state.phaseIndex * 40;
      state.flashTimer = 0.2;
      state.shake = 10;
      audio.win();
      setupPhase(state.phaseIndex + 1, false);
    }

    function saveBest() {
      state.best = Math.max(state.best, Math.floor(state.score));
      writeOwlMageBest(state.best);
    }

    function finishRun() {
      if (state.gameOver) {
        return;
      }
      state.gameOver = true;
      state.won = true;
      clearInputState();
      saveBest();
      audio.win();
      burstParticles(state.player.x, state.player.y, "rgba(255, 236, 154, 0.95)", 32, 260, 0.8);
      emitState("OWL CLEAR", "点灯、封印、守核都拿下了，点一下画布再跑一轮。");
    }

    function failLife() {
      if (state.player.invulnerable > 0 || state.gameOver) {
        return;
      }

      state.lives -= 1;
      state.player.invulnerable = 1.2;
      state.flashTimer = 0.2;
      state.shake = 12;
      audio.hurt();
      burstParticles(state.player.x, state.player.y - 12, "rgba(255, 161, 145, 0.95)", 18, 220, 0.45);

      if (state.lives <= 0) {
        state.gameOver = true;
        clearInputState();
        saveBest();
        audio.gameOver();
        emitState("MOON FALL", "月夜法阵失守了，点一下画布重新来。");
        return;
      }

      state.player.x = state.width * 0.5;
      state.player.y = state.height * 0.72;
      state.player.vx = 0;
      state.player.vy = 0;
      state.player.charge = Math.max(state.player.charge, state.phaseIndex === 0 ? 38 : state.phaseIndex === 1 ? 46 : 54);
      state.owl.x = state.player.x + 42;
      state.owl.y = state.player.y - 36;
      clearInputState();
      state.wisps = [];
      state.particles = [];
      state.spawnTimer = state.phaseIndex === 0 ? 1.1 : state.phaseIndex === 1 ? 0.96 : 0.84;
      state.eliteTimer = state.phaseIndex === 2 ? 3.2 : 4.8;

      emitState(
        "HOLD FAST",
        state.phaseIndex === 2
          ? "这次不重置月核进度了，先清掉场上夜影，再回去补核。"
          : state.phaseIndex === 1
            ? "裂隙进度会保留，贴近裂隙再放脉冲就能继续封。"
            : "点灯进度会保留，先补充能量再把剩下月灯点亮。",
      );
    }

    function tryCastSpell() {
      audio.unlock();

      if (state.gameOver) {
        resetRun();
        return;
      }

      if (state.player.spellCooldown > 0 || state.player.charge < 24) {
        return;
      }

      state.player.spellCooldown = 0.55;
      state.player.charge = Math.max(0, state.player.charge - 24);
      state.flashTimer = 0.14;
      state.shake = Math.max(state.shake, 6);
      audio.cast();

      const pulseRadius = 126;
      let litOrHealed = false;
      let phaseProgress = false;

      for (const beacon of state.beacons) {
        const distance = getDistance(state.player.x, state.player.y - 10, beacon.x, beacon.y - 16);
        if (distance > pulseRadius) {
          continue;
        }

        if (!beacon.lit) {
          beacon.lit = true;
          beacon.integrity = 100;
          state.score += 90;
          litOrHealed = true;
          phaseProgress = true;
          burstParticles(beacon.x, beacon.y - 18, "rgba(255, 243, 176, 0.96)", 18, 180, 0.56);
        } else {
          beacon.integrity = Math.min(100, beacon.integrity + 42);
          litOrHealed = true;
          burstParticles(beacon.x, beacon.y - 18, "rgba(120, 230, 255, 0.8)", 10, 120, 0.36);
        }
      }

      for (const rift of state.rifts) {
        if (rift.sealed) {
          continue;
        }

        const distance = getDistance(state.player.x, state.player.y - 8, rift.x, rift.y);
        if (distance > pulseRadius + 10) {
          continue;
        }

        rift.integrity = Math.max(0, rift.integrity - 55);
        phaseProgress = true;
        burstParticles(rift.x, rift.y, "rgba(168, 209, 255, 0.92)", 14, 150, 0.32);
        if (rift.integrity <= 0) {
          rift.sealed = true;
          state.score += 120;
          burstParticles(rift.x, rift.y, "rgba(255, 241, 173, 0.95)", 20, 220, 0.52);
        }
      }

      if (state.moonCore.active) {
        const coreDistance = getDistance(state.player.x, state.player.y - 10, state.moonCore.x, state.moonCore.y);
        if (coreDistance <= pulseRadius + 12) {
          state.moonCore.integrity = Math.min(100, state.moonCore.integrity + 14);
          state.moonCore.charge = Math.min(100, state.moonCore.charge + 4);
          phaseProgress = true;
          burstParticles(state.moonCore.x, state.moonCore.y, "rgba(128, 230, 255, 0.86)", 12, 120, 0.3);
        }
      }

      for (let index = state.wisps.length - 1; index >= 0; index -= 1) {
        const wisp = state.wisps[index];
        const distance = getDistance(state.player.x, state.player.y - 8, wisp.x, wisp.y);
        if (distance > pulseRadius + wisp.radius) {
          continue;
        }

        wisp.hp -= 2;
        wisp.stun = 0.28;
        if (wisp.hp <= 0) {
          defeatWisp(index, "rgba(190, 220, 255, 0.96)");
        } else {
          burstParticles(wisp.x, wisp.y, "rgba(146, 194, 255, 0.84)", 8, 140, 0.28);
        }
      }

      state.particles.push({
        kind: "ring",
        x: state.player.x,
        y: state.player.y - 10,
        radius: 26,
        growth: 280,
        lineWidth: 4,
        life: 0.38,
        color: phaseProgress || litOrHealed ? "rgba(255, 241, 154, 0.95)" : "rgba(120, 228, 255, 0.92)",
      });
      state.particles.push({
        kind: "heart",
        x: state.owl.x,
        y: state.owl.y - 8,
        vx: random(-18, 18),
        vy: random(-52, -26),
        size: random(8, 12),
        life: 0.54,
        color: "rgba(255, 179, 211, 0.92)",
      });

      if (state.phaseIndex === 0 && litCount() === state.beacons.length && state.beacons.every((beacon) => beacon.integrity > 72)) {
        advancePhase();
      }
      if (state.phaseIndex === 1 && remainingRifts() === 0) {
        advancePhase();
      }
    }

    function createFloatingSpark(x, y) {
      state.particles.push({
        kind: "spark",
        x,
        y,
        vx: random(-18, 18),
        vy: random(-42, -12),
        size: random(2, 4),
        life: random(0.4, 0.72),
        color: "rgba(255, 241, 166, 0.92)",
      });
      state.particles.push({
        kind: "feather",
        x: x + random(-4, 4),
        y: y + random(-4, 4),
        vx: random(-22, 22),
        vy: random(-36, -8),
        size: random(8, 12),
        rotation: random(-0.7, 0.7),
        spin: random(-2.2, 2.2),
        life: random(0.42, 0.72),
        color: "rgba(255, 223, 185, 0.95)",
      });
    }

    function burstParticles(x, y, color, count, speed, life) {
      for (let index = 0; index < count; index += 1) {
        state.particles.push({
          kind: index % 4 === 0 ? "ring-dot" : "spark",
          x,
          y,
          vx: random(-speed, speed),
          vy: random(-speed, speed),
          size: random(2, 5),
          lineWidth: random(1, 2.4),
          life: random(life * 0.45, life),
          color,
        });

        if (index % 5 === 0) {
          state.particles.push({
            kind: "heart",
            x: x + random(-10, 10),
            y: y + random(-10, 10),
            vx: random(-speed * 0.16, speed * 0.16),
            vy: random(-speed * 0.22, -speed * 0.08),
            size: random(7, 11),
            life: random(life * 0.6, life * 1.05),
            color: index % 10 === 0 ? "rgba(255, 188, 214, 0.9)" : "rgba(255, 234, 170, 0.92)",
          });
        }
      }
    }

    function defeatWisp(index, color) {
      const wisp = state.wisps[index];
      state.score += wisp.kind === "howler" ? 42 : 26;
      audio.hit();
      burstParticles(wisp.x, wisp.y, color, 12, 150, 0.36);
      if (Math.random() < 0.52) {
        state.stars.push(createStarFeather(wisp.x + random(-8, 8), wisp.y + random(-8, 8)));
      }
      state.wisps.splice(index, 1);
    }

    function currentInput() {
      const left = keys.has("arrowleft") || keys.has("a");
      const right = keys.has("arrowright") || keys.has("d");
      const up = keys.has("arrowup") || keys.has("w");
      const down = keys.has("arrowdown") || keys.has("s");
      return { left, right, up, down };
    }

    function updatePlayer(delta) {
      const input = currentInput();
      let moveX = 0;
      let moveY = 0;

      if (input.left) {
        moveX -= 1;
      }
      if (input.right) {
        moveX += 1;
      }
      if (input.up) {
        moveY -= 1;
      }
      if (input.down) {
        moveY += 1;
      }

      if (pointer.active) {
        const dx = pointer.x - state.player.x;
        const dy = pointer.y - state.player.y;
        const distance = Math.hypot(dx, dy);
        if (distance > 10) {
          moveX = dx / distance;
          moveY = dy / distance;
        }
      }

      const speed = 250;
      const length = Math.hypot(moveX, moveY) || 1;
      state.player.vx += ((moveX / length) * speed - state.player.vx) * Math.min(1, delta * 8.6);
      state.player.vy += ((moveY / length) * speed - state.player.vy) * Math.min(1, delta * 8.6);

      state.player.x = clamp(state.player.x + state.player.vx * delta, 44, state.width - 44);
      state.player.y = clamp(state.player.y + state.player.vy * delta, 52, state.height - 44);
      state.player.spellCooldown = Math.max(0, state.player.spellCooldown - delta);
      state.player.invulnerable = Math.max(0, state.player.invulnerable - delta);
      state.player.charge = Math.min(100, state.player.charge + delta * 4.8);
      state.player.bob += delta * 4.4;
    }

    function updateOwl(delta) {
      state.owl.angle += delta * 2.8;
      const orbitRadius = 44 + Math.sin(state.elapsed * 2.4) * 8;
      const targetX = state.player.x + Math.cos(state.owl.angle) * orbitRadius;
      const targetY = state.player.y - 36 + Math.sin(state.owl.angle * 1.25) * 14;
      state.owl.x += (targetX - state.owl.x) * Math.min(1, delta * 8.4);
      state.owl.y += (targetY - state.owl.y) * Math.min(1, delta * 8.4);
      state.owl.cooldown = Math.max(0, state.owl.cooldown - delta);

      const target = state.wisps.find((wisp) => getDistance(state.owl.x, state.owl.y, wisp.x, wisp.y) < 150);
      if (target && state.owl.cooldown <= 0) {
        state.owl.cooldown = 0.78;
        target.hp -= 1;
        target.stun = 0.22;
        createFloatingSpark(target.x, target.y);
        createFloatingSpark(target.x, target.y - 4);
        audio.owl();
        if (target.hp <= 0) {
          const index = state.wisps.indexOf(target);
          if (index >= 0) {
            defeatWisp(index, "rgba(255, 218, 166, 0.92)");
          }
        }

        state.particles.push({
          kind: "heart",
          x: state.owl.x,
          y: state.owl.y - 6,
          vx: random(-16, 16),
          vy: random(-40, -18),
          size: random(6, 10),
          life: 0.4,
          color: "rgba(255, 199, 210, 0.88)",
        });
      }
    }

    function updateStars(delta) {
      state.starTimer -= delta;
      if (state.starTimer <= 0) {
        state.starTimer = state.phaseIndex === 2 ? random(0.9, 1.5) : random(1.1, 1.9);
        state.stars.push(createStarFeather(random(80, state.width - 80), random(90, state.height - 120)));
      }

      for (let index = state.stars.length - 1; index >= 0; index -= 1) {
        const star = state.stars[index];
        star.life -= delta;
        star.phase += delta * star.wobble;
        star.y += Math.sin(star.phase) * 12 * delta;

        const playerDistance = getDistance(state.player.x, state.player.y, star.x, star.y);
        const owlDistance = getDistance(state.owl.x, state.owl.y, star.x, star.y);
        if (playerDistance < 24 || owlDistance < 24) {
          state.player.charge = Math.min(100, state.player.charge + 20);
          state.score += 12;
          audio.pickup();
          burstParticles(star.x, star.y, "rgba(255, 246, 171, 0.95)", 8, 90, 0.28);
          state.stars.splice(index, 1);
          continue;
        }

        if (star.life <= 0) {
          state.stars.splice(index, 1);
        }
      }
    }

    function updateBeacons(delta) {
      for (const beacon of state.beacons) {
        if (beacon.lit) {
          beacon.integrity = Math.max(0, beacon.integrity - delta * (state.phaseIndex === 2 ? 1.55 : 1.25));
          if (beacon.integrity <= 0) {
            beacon.lit = false;
            beacon.integrity = 0;
            burstParticles(beacon.x, beacon.y - 18, "rgba(115, 130, 180, 0.72)", 14, 130, 0.4);
          }
        }
      }
    }

    function updateRifts(delta) {
      for (const rift of state.rifts) {
        if (rift.sealed) {
          continue;
        }

        rift.spawnTimer -= delta;
        if (rift.spawnTimer <= 0) {
          rift.spawnTimer = random(1.2, 1.8);
          spawnWisp("drifter", rift);
          if (Math.random() < 0.34) {
            spawnWisp("howler", rift);
          }
        }
      }
    }

    function updateMoonCore(delta) {
      if (!state.moonCore.active) {
        return;
      }

      const lit = litCount();
      const playerNearCore = getDistance(state.player.x, state.player.y, state.moonCore.x, state.moonCore.y) < 138;
      if (lit >= 2) {
        state.moonCore.charge = Math.min(100, state.moonCore.charge + delta * (playerNearCore ? 6.8 : 4.4));
      } else {
        state.moonCore.charge = Math.max(0, state.moonCore.charge - delta * 2.2);
      }

      if (state.moonCore.integrity <= 0) {
        failLife();
      }
    }

    function pickWispTarget() {
      const vulnerable = state.beacons.filter((beacon) => beacon.lit);
      if (state.moonCore.active && Math.random() < 0.42) {
        return state.moonCore;
      }
      if (vulnerable.length > 0 && Math.random() < 0.58) {
        return vulnerable[Math.floor(Math.random() * vulnerable.length)];
      }
      return state.player;
    }

    function spawnWisp(kind = null, source = null) {
      let x = 0;
      let y = 0;

      if (source) {
        x = source.x + random(-12, 12);
        y = source.y + random(-12, 12);
      } else {
        const side = Math.floor(Math.random() * 4);
        if (side === 0) {
          x = random(-20, state.width + 20);
          y = -30;
        } else if (side === 1) {
          x = state.width + 30;
          y = random(-20, state.height + 20);
        } else if (side === 2) {
          x = random(-20, state.width + 20);
          y = state.height + 30;
        } else {
          x = -30;
          y = random(-20, state.height + 20);
        }
      }

      const resolvedKind = kind || (state.phaseIndex > 0 && Math.random() < 0.22 ? "howler" : "drifter");
      const elite = resolvedKind === "howler";
      state.wisps.push({
        x,
        y,
        kind: resolvedKind,
        radius: elite ? random(18, 23) : random(14, 18),
        speed: (elite ? random(84, 114) : random(52, 86)) + litCount() * 6 + Math.min(40, state.elapsed * 1.25),
        hp: elite ? 4 : Math.random() < 0.3 ? 3 : 2,
        wobble: elite ? random(3.8, 6.4) : random(2.2, 4.8),
        phase: random(0, Math.PI * 2),
        stun: 0,
        target: pickWispTarget(),
      });
    }

    function updateWisps(delta) {
      state.spawnTimer -= delta;
      if (state.spawnTimer <= 0) {
        state.spawnTimer = Math.max(state.phaseIndex === 2 ? 0.34 : 0.42, (state.phaseIndex === 0 ? 1.2 : state.phaseIndex === 1 ? 0.94 : 0.78) - state.elapsed * 0.012);
        spawnWisp();
      }

      state.eliteTimer -= delta;
      if (state.phaseIndex > 0 && state.eliteTimer <= 0) {
        state.eliteTimer = state.phaseIndex === 2 ? random(3.1, 4.4) : random(4.6, 6.2);
        spawnWisp("howler");
      }

      for (let index = state.wisps.length - 1; index >= 0; index -= 1) {
        const wisp = state.wisps[index];
        if (
          !wisp.target ||
          (wisp.target !== state.player && wisp.target !== state.moonCore && !wisp.target.lit) ||
          (wisp.target === state.moonCore && !state.moonCore.active)
        ) {
          wisp.target = pickWispTarget();
        }

        wisp.stun = Math.max(0, wisp.stun - delta);
        wisp.phase += delta * wisp.wobble;
        const speedScale = wisp.stun > 0 ? 0.24 : 1;
        const targetX = wisp.target.x;
        const targetY = wisp.target === state.player ? wisp.target.y - 10 : wisp.target === state.moonCore ? wisp.target.y : wisp.target.y - 18;
        const dx = targetX - wisp.x;
        const dy = targetY - wisp.y;
        const distance = Math.hypot(dx, dy) || 1;

        wisp.x += (dx / distance) * wisp.speed * speedScale * delta;
        wisp.y += (dy / distance) * wisp.speed * speedScale * delta + Math.sin(wisp.phase) * (wisp.kind === "howler" ? 18 : 12) * delta;

        if (getDistance(wisp.x, wisp.y, state.player.x, state.player.y - 6) < wisp.radius + 16) {
          failLife();
          wisp.x -= dx / distance * 28;
          wisp.y -= dy / distance * 28;
        }

        for (const beacon of state.beacons) {
          if (!beacon.lit) {
            continue;
          }

          const beaconDistance = getDistance(wisp.x, wisp.y, beacon.x, beacon.y - 18);
          if (beaconDistance < wisp.radius + 22) {
            beacon.integrity = Math.max(0, beacon.integrity - delta * (wisp.kind === "howler" ? 42 : 26));
            burstParticles(beacon.x, beacon.y - 18, "rgba(109, 144, 190, 0.24)", 1, 50, 0.12);
            if (beacon.integrity <= 0) {
              beacon.lit = false;
              burstParticles(beacon.x, beacon.y - 18, "rgba(92, 108, 138, 0.75)", 14, 140, 0.42);
            }
          }
        }

        if (state.moonCore.active) {
          const coreDistance = getDistance(wisp.x, wisp.y, state.moonCore.x, state.moonCore.y);
          if (coreDistance < wisp.radius + 28) {
            state.moonCore.integrity = Math.max(0, state.moonCore.integrity - delta * (wisp.kind === "howler" ? 34 : 18));
            burstParticles(state.moonCore.x, state.moonCore.y, "rgba(123, 214, 255, 0.18)", 1, 40, 0.12);
          }
        }
      }
    }

    function updateParticles(delta) {
      for (let index = state.particles.length - 1; index >= 0; index -= 1) {
        const particle = state.particles[index];
        particle.life -= delta;
        particle.x += (particle.vx || 0) * delta;
        particle.y += (particle.vy || 0) * delta;
        if (particle.radius != null) {
          particle.radius += (particle.growth || 0) * delta;
        }
        if (particle.rotation != null) {
          particle.rotation += (particle.spin || 0) * delta;
        }
        if (particle.life <= 0) {
          state.particles.splice(index, 1);
        }
      }
    }

    function update(delta) {
      state.elapsed += delta;
      state.shake = Math.max(0, state.shake - delta * 24);
      state.flashTimer = Math.max(0, state.flashTimer - delta);

      if (state.gameOver) {
        emitState(
          state.won ? "OWL CLEAR" : "MOON FALL",
          state.won ? "猫头鹰守住了夜色，点一下画布再来一轮。" : "点一下画布，重新守住三座月灯。",
        );
        return;
      }

      updatePlayer(delta);
      updateOwl(delta);
      updateStars(delta);
      updateBeacons(delta);
      updateRifts(delta);
      updateWisps(delta);
      updateMoonCore(delta);
      updateParticles(delta);

      const lit = litCount();
      const lowestIntegrity = Math.floor(Math.min(...state.beacons.map((beacon) => (beacon.lit ? beacon.integrity : 0))));
      if (state.phaseIndex === 0) {
        emitState(
          `LIGHT ${lit}/${state.beacons.length}`,
          lit === state.beacons.length
            ? `三座月灯都点亮了，稳住灯火。当前最低灯值 ${Math.max(0, lowestIntegrity)}。`
            : `还差 ${state.beacons.length - lit} 座月灯。法杖充能 ${Math.floor(state.player.charge)}。`,
        );
      } else if (state.phaseIndex === 1) {
        emitState(
          `SEALED ${sealedRiftCount()}/${state.rifts.length}`,
          remainingRifts() === 0
            ? "裂隙都封住了，月核即将启动。"
            : `已封住 ${sealedRiftCount()} 道裂隙，还剩 ${remainingRifts()} 道。最低灯值 ${Math.max(0, lowestIntegrity)}。`,
        );
        if (remainingRifts() === 0) {
          advancePhase();
        }
      } else {
        emitState(
          `CORE ${Math.floor(state.moonCore.charge)}%`,
          `月核 ${Math.floor(state.moonCore.integrity)}%，点亮 ${lit} 座月灯。最低灯值 ${Math.max(0, lowestIntegrity)}。`,
        );
        if (state.moonCore.charge >= 100) {
          finishRun();
        }
      }
    }

    function drawBackground() {
      if (OWL_MAGE_ART.ready) {
        const sourceWidth = OWL_MAGE_ART.image.naturalWidth;
        const sourceHeight = Math.floor(OWL_MAGE_ART.image.naturalHeight * 0.63);
        const sourceRatio = sourceWidth / sourceHeight;
        const targetRatio = state.width / state.height;
        let drawWidth = sourceWidth;
        let drawHeight = sourceHeight;
        let sourceX = 0;
        let sourceY = 0;

        if (sourceRatio > targetRatio) {
          drawWidth = Math.floor(sourceHeight * targetRatio);
          sourceX = Math.floor((sourceWidth - drawWidth) * 0.52);
        } else {
          drawHeight = Math.floor(sourceWidth / targetRatio);
          sourceY = Math.floor((sourceHeight - drawHeight) * 0.28);
        }

        context.drawImage(OWL_MAGE_ART.image, sourceX, sourceY, drawWidth, drawHeight, 0, 0, state.width, state.height);
      } else {
        const gradient = context.createLinearGradient(0, 0, 0, state.height);
        gradient.addColorStop(0, "#071228");
        gradient.addColorStop(0.55, "#162540");
        gradient.addColorStop(1, "#2e2336");
        context.fillStyle = gradient;
        context.fillRect(0, 0, state.width, state.height);
      }

      const glaze = context.createLinearGradient(0, 0, 0, state.height);
      glaze.addColorStop(0, "rgba(6, 10, 24, 0.18)");
      glaze.addColorStop(0.48, "rgba(10, 18, 34, 0.34)");
      glaze.addColorStop(1, "rgba(7, 13, 24, 0.84)");
      context.fillStyle = glaze;
      context.fillRect(0, 0, state.width, state.height);

      const aurora = context.createRadialGradient(state.width * 0.53, state.height * 0.12, 10, state.width * 0.53, state.height * 0.12, state.width * 0.38);
      aurora.addColorStop(0, "rgba(126, 255, 241, 0.54)");
      aurora.addColorStop(0.24, "rgba(91, 214, 255, 0.28)");
      aurora.addColorStop(0.68, "rgba(91, 152, 255, 0.08)");
      aurora.addColorStop(1, "rgba(91, 152, 255, 0)");
      context.fillStyle = aurora;
      context.fillRect(0, 0, state.width, state.height);

      const moonX = state.width * 0.82;
      const moonY = state.height * 0.16;
      context.fillStyle = "rgba(255, 246, 210, 0.94)";
      context.beginPath();
      context.arc(moonX, moonY, 42, 0, Math.PI * 2);
      context.fill();

      context.fillStyle = "rgba(16, 24, 40, 0.22)";
      context.beginPath();
      context.arc(moonX + 14, moonY - 4, 39, 0, Math.PI * 2);
      context.fill();

      for (let index = 0; index < 42; index += 1) {
        const x = ((index * 127) % state.width) + (index % 3) * 12;
        const y = 20 + ((index * 67) % Math.floor(state.height * 0.52));
        const alpha = 0.18 + ((index * 13) % 50) / 140;
        context.fillStyle = `rgba(255, 248, 228, ${alpha})`;
        context.fillRect(x, y, index % 4 === 0 ? 3 : 2, index % 4 === 0 ? 3 : 2);
      }

      context.strokeStyle = "rgba(173, 240, 255, 0.42)";
      context.lineWidth = 4;
      context.beginPath();
      context.moveTo(state.width * 0.46, 0);
      context.bezierCurveTo(state.width * 0.5, state.height * 0.18, state.width * 0.55, state.height * 0.34, state.width * 0.58, state.height * 0.48);
      context.stroke();

      context.strokeStyle = "rgba(193, 245, 255, 0.28)";
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(state.width * 0.49, state.height * 0.04);
      context.bezierCurveTo(state.width * 0.54, state.height * 0.16, state.width * 0.6, state.height * 0.24, state.width * 0.62, state.height * 0.38);
      context.stroke();

      const floor = context.createLinearGradient(0, state.height * 0.48, 0, state.height);
      floor.addColorStop(0, "rgba(44, 66, 62, 0.08)");
      floor.addColorStop(0.52, "rgba(28, 41, 38, 0.52)");
      floor.addColorStop(1, "rgba(14, 24, 20, 0.96)");
      context.fillStyle = floor;
      context.fillRect(0, state.height * 0.46, state.width, state.height * 0.54);

      for (let index = 0; index < 10; index += 1) {
        const baseX = index * (state.width / 9) + (index % 2) * 26;
        context.fillStyle = "rgba(13, 24, 18, 0.78)";
        context.beginPath();
        context.moveTo(baseX - 48, state.height);
        context.lineTo(baseX - 10, state.height * (0.56 + (index % 3) * 0.03));
        context.lineTo(baseX + 28, state.height);
        context.fill();
      }

      for (let layer = 0; layer < 3; layer += 1) {
        const y = state.height * (0.66 + layer * 0.09);
        const mist = context.createLinearGradient(0, y - 32, 0, y + 38);
        mist.addColorStop(0, "rgba(145, 190, 214, 0)");
        mist.addColorStop(0.5, `rgba(145, 190, 214, ${0.08 + layer * 0.03})`);
        mist.addColorStop(1, "rgba(145, 190, 214, 0)");
        context.fillStyle = mist;
        context.fillRect(0, y - 34, state.width, 72);
      }
    }

    function drawBeacons() {
      for (const beacon of state.beacons) {
        context.save();
        context.translate(beacon.x, beacon.y);

        const pole = context.createLinearGradient(-8, -8, 8, 44);
        pole.addColorStop(0, "#89604c");
        pole.addColorStop(0.52, "#604235");
        pole.addColorStop(1, "#3f2a23");
        context.fillStyle = pole;
        context.fillRect(-7, -8, 14, 54);
        context.fillStyle = "#a97d61";
        context.fillRect(-12, -18, 24, 14);

        if (beacon.lit) {
          const glow = context.createRadialGradient(0, -20, 4, 0, -20, 66);
          glow.addColorStop(0, "rgba(255, 241, 183, 0.98)");
          glow.addColorStop(0.35, "rgba(255, 220, 126, 0.64)");
          glow.addColorStop(1, "rgba(255, 201, 96, 0)");
          context.fillStyle = glow;
          context.beginPath();
          context.arc(0, -20, 66, 0, Math.PI * 2);
          context.fill();
        }

        const lamp = context.createRadialGradient(-4, -24, 3, 0, -20, 18);
        lamp.addColorStop(0, beacon.lit ? "#fff8d5" : "#d9def1");
        lamp.addColorStop(1, beacon.lit ? "#ffd96a" : "#8f97b8");
        context.fillStyle = lamp;
        context.beginPath();
        context.arc(0, -20, 12, 0, Math.PI * 2);
        context.fill();

        context.fillStyle = beacon.lit ? "rgba(255, 248, 223, 0.95)" : "rgba(219, 228, 245, 0.8)";
        context.beginPath();
        context.moveTo(0, -33);
        context.lineTo(3, -25);
        context.lineTo(12, -24);
        context.lineTo(5, -18);
        context.lineTo(7, -9);
        context.lineTo(0, -14);
        context.lineTo(-7, -9);
        context.lineTo(-5, -18);
        context.lineTo(-12, -24);
        context.lineTo(-3, -25);
        context.closePath();
        context.fill();

        context.strokeStyle = beacon.lit ? "rgba(120, 228, 255, 0.85)" : "rgba(120, 140, 180, 0.5)";
        context.lineWidth = 4;
        context.beginPath();
        context.arc(0, -20, 18, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (beacon.integrity / 100));
        context.stroke();

        context.fillStyle = "rgba(255, 255, 255, 0.86)";
        context.font = '600 12px "Avenir Next", "Trebuchet MS", sans-serif';
        context.textAlign = "center";
        context.fillText(beacon.name, 0, 64);
        context.restore();
      }
    }

    function drawRifts() {
      for (const rift of state.rifts) {
        if (rift.sealed) {
          continue;
        }

        context.save();
        context.translate(rift.x, rift.y);
        context.rotate(Math.sin(state.elapsed * 3 + rift.phase) * 0.12);

        const glow = context.createRadialGradient(0, 0, 6, 0, 0, 46);
        glow.addColorStop(0, "rgba(132, 221, 255, 0.78)");
        glow.addColorStop(0.45, "rgba(95, 126, 255, 0.34)");
        glow.addColorStop(1, "rgba(95, 126, 255, 0)");
        context.fillStyle = glow;
        context.beginPath();
        context.arc(0, 0, 46, 0, Math.PI * 2);
        context.fill();

        context.fillStyle = "rgba(22, 35, 78, 0.46)";
        context.beginPath();
        context.ellipse(0, 0, 18, 30, 0, 0, Math.PI * 2);
        context.fill();

        context.strokeStyle = "rgba(184, 226, 255, 0.95)";
        context.lineWidth = 4;
        context.beginPath();
        context.ellipse(0, 0, 18, 28, 0, 0, Math.PI * 2);
        context.stroke();

        context.strokeStyle = "rgba(121, 167, 255, 0.88)";
        context.lineWidth = 3;
        context.beginPath();
        context.moveTo(-8, -20);
        context.lineTo(0, -4);
        context.lineTo(9, 12);
        context.stroke();

        context.fillStyle = "rgba(255, 251, 241, 0.9)";
        context.font = '600 11px "Avenir Next", "Trebuchet MS", sans-serif';
        context.textAlign = "center";
        context.fillText(`${Math.ceil(rift.integrity)}%`, 0, 46);
        context.restore();
      }
    }

    function drawMoonCore() {
      if (!state.moonCore.active) {
        return;
      }

      context.save();
      context.translate(state.moonCore.x, state.moonCore.y);
      const glow = context.createRadialGradient(0, 0, 10, 0, 0, 82);
      glow.addColorStop(0, "rgba(173, 248, 255, 0.9)");
      glow.addColorStop(0.3, "rgba(110, 230, 255, 0.42)");
      glow.addColorStop(1, "rgba(110, 230, 255, 0)");
      context.fillStyle = glow;
      context.beginPath();
      context.arc(0, 0, 82, 0, Math.PI * 2);
      context.fill();

      const inner = context.createRadialGradient(-6, -8, 4, 0, 0, 28);
      inner.addColorStop(0, "#fbffff");
      inner.addColorStop(0.52, "#d6f8ff");
      inner.addColorStop(1, "#84dfff");
      context.fillStyle = inner;
      context.beginPath();
      context.arc(0, 0, 24, 0, Math.PI * 2);
      context.fill();

      context.strokeStyle = "rgba(132, 232, 255, 0.92)";
      context.lineWidth = 6;
      context.beginPath();
      context.arc(0, 0, 36, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (state.moonCore.charge / 100));
      context.stroke();

      context.strokeStyle = "rgba(255, 240, 190, 0.8)";
      context.lineWidth = 4;
      context.beginPath();
      context.arc(0, 0, 48, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (state.moonCore.integrity / 100));
      context.stroke();
      context.restore();
    }

    function drawStars() {
      for (const star of state.stars) {
        context.save();
        context.translate(star.x, star.y);
        context.rotate(Math.sin(star.phase) * 0.24);
        const glow = context.createRadialGradient(0, 0, 2, 0, 0, 18);
        glow.addColorStop(0, "rgba(255, 245, 180, 0.95)");
        glow.addColorStop(1, "rgba(255, 245, 180, 0)");
        context.fillStyle = glow;
        context.beginPath();
        context.arc(0, 0, 18, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = "rgba(255, 244, 170, 0.95)";
        context.beginPath();
        context.moveTo(0, -10);
        context.lineTo(4, -2);
        context.lineTo(11, 0);
        context.lineTo(4, 4);
        context.lineTo(0, 12);
        context.lineTo(-4, 4);
        context.lineTo(-11, 0);
        context.lineTo(-4, -2);
        context.closePath();
        context.fill();
        context.restore();
      }
    }

    function drawWisps() {
      for (const wisp of state.wisps) {
        context.save();
        context.translate(wisp.x, wisp.y);
        const aura = context.createRadialGradient(0, 0, 6, 0, 0, wisp.radius + 18);
        aura.addColorStop(0, wisp.kind === "howler" ? "rgba(171, 124, 255, 0.26)" : "rgba(145, 174, 255, 0.24)");
        aura.addColorStop(1, "rgba(120, 130, 255, 0)");
        context.fillStyle = aura;
        context.beginPath();
        context.arc(0, 0, wisp.radius + 18, 0, Math.PI * 2);
        context.fill();

        const body = context.createRadialGradient(-4, -6, 2, 0, 0, wisp.radius + 2);
        body.addColorStop(0, wisp.kind === "howler" ? "rgba(120, 78, 153, 0.98)" : "rgba(92, 87, 155, 0.96)");
        body.addColorStop(0.62, wisp.kind === "howler" ? "rgba(67, 39, 93, 0.94)" : "rgba(36, 34, 79, 0.94)");
        body.addColorStop(1, "rgba(16, 17, 41, 0.8)");
        context.fillStyle = body;
        context.beginPath();
        context.arc(0, 0, wisp.radius, 0, Math.PI * 2);
        context.fill();

        context.fillStyle = "rgba(255, 255, 255, 0.08)";
        context.beginPath();
        context.ellipse(-3, 4, wisp.radius * 0.76, wisp.radius * 0.56, 0, 0, Math.PI * 2);
        context.fill();

        context.fillStyle = "rgba(210, 232, 255, 0.92)";
        context.beginPath();
        context.arc(-4, -3, 2.8, 0, Math.PI * 2);
        context.arc(4, -3, 2.8, 0, Math.PI * 2);
        context.fill();

        if (wisp.kind === "howler") {
          context.strokeStyle = "rgba(255, 188, 154, 0.95)";
          context.lineWidth = 2;
          context.beginPath();
          context.moveTo(-8, -12);
          context.lineTo(0, -20);
          context.lineTo(8, -12);
          context.stroke();
        }

        context.strokeStyle = "rgba(125, 168, 255, 0.85)";
        context.lineWidth = 2;
        context.beginPath();
        context.arc(0, 0, wisp.radius + 5, 0, Math.PI * 1.4);
        context.stroke();
        context.restore();
      }
    }

    function drawMage() {
      context.save();
      context.translate(state.player.x, state.player.y + Math.sin(state.player.bob) * 2);
      const scarfWave = Math.sin(state.elapsed * 6 + state.player.bob) * 4;

      if (state.player.invulnerable > 0 && Math.floor(state.player.invulnerable * 14) % 2 === 0) {
        context.globalAlpha = 0.5;
      }

      context.fillStyle = "rgba(10, 16, 28, 0.22)";
      context.beginPath();
      context.ellipse(0, 34, 24, 10, 0, 0, Math.PI * 2);
      context.fill();

      context.fillStyle = "#fedfc1";
      context.beginPath();
      context.arc(0, -27, 14, 0, Math.PI * 2);
      context.fill();

      context.fillStyle = "rgba(255, 188, 193, 0.8)";
      context.beginPath();
      context.arc(-7, -23, 2.8, 0, Math.PI * 2);
      context.arc(7, -23, 2.8, 0, Math.PI * 2);
      context.fill();

      context.fillStyle = "#1f1f28";
      context.beginPath();
      context.arc(-4, -28, 1.6, 0, Math.PI * 2);
      context.arc(4, -28, 1.6, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = "#1f1f28";
      context.lineWidth = 1.6;
      context.beginPath();
      context.arc(0, -23, 4.8, 0.2, Math.PI - 0.2);
      context.stroke();

      const hair = context.createLinearGradient(-12, -42, 14, -12);
      hair.addColorStop(0, "#2f2532");
      hair.addColorStop(1, "#141722");
      context.fillStyle = hair;
      context.beginPath();
      context.moveTo(-18, -30);
      context.quadraticCurveTo(-8, -51, 2, -48);
      context.quadraticCurveTo(13, -46, 16, -26);
      context.lineTo(12, -12);
      context.lineTo(-12, -12);
      context.closePath();
      context.fill();

      context.fillStyle = "#d8474c";
      context.beginPath();
      context.moveTo(8, -16);
      context.quadraticCurveTo(26 + scarfWave, -8, 18, 8);
      context.quadraticCurveTo(12, 0, 6, -4);
      context.closePath();
      context.fill();

      const coat = context.createLinearGradient(-18, -10, 18, 30);
      coat.addColorStop(0, "#335d90");
      coat.addColorStop(0.58, "#25456f");
      coat.addColorStop(1, "#162843");
      context.fillStyle = coat;
      context.beginPath();
      context.moveTo(-16, -12);
      context.quadraticCurveTo(0, -18, 16, -12);
      context.lineTo(20, 10);
      context.quadraticCurveTo(0, 28, -20, 10);
      context.closePath();
      context.fill();

      context.fillStyle = "#77dfff";
      context.fillRect(-8, -3, 16, 8);

      context.fillStyle = "#7c261f";
      context.fillRect(-10, 8, 20, 7);

      context.fillStyle = "#f6a27f";
      context.fillRect(-10, 20, 8, 18);
      context.fillRect(2, 20, 8, 18);

      context.fillStyle = "#2b1d1d";
      context.fillRect(-10, 37, 9, 5);
      context.fillRect(2, 37, 9, 5);

      context.fillStyle = "#ffd96b";
      context.beginPath();
      context.moveTo(0, -43);
      context.lineTo(2, -39);
      context.lineTo(8, -38);
      context.lineTo(3, -34);
      context.lineTo(4, -28);
      context.lineTo(0, -31);
      context.lineTo(-4, -28);
      context.lineTo(-3, -34);
      context.lineTo(-8, -38);
      context.lineTo(-2, -39);
      context.closePath();
      context.fill();

      context.strokeStyle = "rgba(255, 237, 150, 0.92)";
      context.lineWidth = 4;
      context.beginPath();
      context.moveTo(16, -10);
      context.lineTo(26, 12);
      context.stroke();

      context.fillStyle = "rgba(255, 246, 173, 0.95)";
      context.beginPath();
      context.arc(28, 14, 6, 0, Math.PI * 2);
      context.fill();

      context.fillStyle = "#d8474c";
      context.beginPath();
      context.moveTo(-2, -8);
      context.lineTo(-18, -2);
      context.lineTo(-14, 6);
      context.lineTo(0, 0);
      context.closePath();
      context.fill();

      context.strokeStyle = "rgba(255, 238, 172, 0.6)";
      context.lineWidth = 2;
      context.beginPath();
      context.arc(0, -8, 24, -0.8, 0.4);
      context.stroke();
      context.restore();
    }

    function drawOwl() {
      context.save();
      context.translate(state.owl.x, state.owl.y);
      context.rotate(Math.sin(state.elapsed * 4.8) * 0.12);

      context.fillStyle = "rgba(255, 223, 160, 0.2)";
      context.beginPath();
      context.ellipse(0, 6, 26, 18, 0, 0, Math.PI * 2);
      context.fill();

      context.strokeStyle = "#ad7a4f";
      context.lineWidth = 7;
      context.lineCap = "round";
      context.beginPath();
      context.moveTo(-12, 5);
      context.lineTo(-26, -4 - Math.sin(state.elapsed * 6) * 5);
      context.moveTo(12, 5);
      context.lineTo(26, -4 + Math.sin(state.elapsed * 6) * 5);
      context.stroke();

      const owlBody = context.createRadialGradient(-4, -5, 4, 0, 0, 20);
      owlBody.addColorStop(0, "#ecd3a8");
      owlBody.addColorStop(0.55, "#c7904c");
      owlBody.addColorStop(1, "#7d5430");
      context.fillStyle = owlBody;
      context.beginPath();
      context.ellipse(0, 0, 16, 19, 0, 0, Math.PI * 2);
      context.fill();

      context.fillStyle = "#f9e8ca";
      context.beginPath();
      context.ellipse(0, 4, 11, 11, 0, 0, Math.PI * 2);
      context.fill();

      context.fillStyle = "#fff";
      context.beginPath();
      context.arc(-5, -4, 4.8, 0, Math.PI * 2);
      context.arc(5, -4, 4.8, 0, Math.PI * 2);
      context.fill();

      context.fillStyle = "#121212";
      context.beginPath();
      context.arc(-5, -4, 2, 0, Math.PI * 2);
      context.arc(5, -4, 2, 0, Math.PI * 2);
      context.fill();

      context.fillStyle = "rgba(255, 194, 202, 0.84)";
      context.beginPath();
      context.arc(-8, 1, 2.4, 0, Math.PI * 2);
      context.arc(8, 1, 2.4, 0, Math.PI * 2);
      context.fill();

      context.strokeStyle = "#3f2b20";
      context.lineWidth = 1.6;
      context.beginPath();
      context.arc(0, 3, 4.8, 0.12, Math.PI - 0.12);
      context.stroke();

      context.fillStyle = "#f4b15c";
      context.beginPath();
      context.moveTo(0, 0);
      context.lineTo(5, 6);
      context.lineTo(-5, 6);
      context.closePath();
      context.fill();
      context.restore();
    }

    function drawParticles() {
      for (const particle of state.particles) {
        context.save();
        context.globalAlpha = Math.max(0, Math.min(1, particle.life * 2));
        context.strokeStyle = particle.color;
        context.fillStyle = particle.color;

        if (particle.kind === "ring") {
          context.lineWidth = particle.lineWidth || 2;
          context.beginPath();
          context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
          context.stroke();
        } else if (particle.kind === "heart") {
          context.translate(particle.x, particle.y);
          context.scale((particle.size || 8) / 10, (particle.size || 8) / 10);
          drawHeartShape(context);
          context.fill();
        } else if (particle.kind === "feather") {
          context.translate(particle.x, particle.y);
          context.rotate(particle.rotation || 0);
          const size = particle.size || 10;
          context.fillStyle = particle.color;
          context.beginPath();
          context.ellipse(0, 0, size * 0.42, size, -0.28, 0, Math.PI * 2);
          context.fill();
          context.strokeStyle = "rgba(143, 103, 67, 0.5)";
          context.lineWidth = 1.1;
          context.beginPath();
          context.moveTo(0, -size);
          context.lineTo(0, size * 0.9);
          context.stroke();
        } else {
          context.beginPath();
          context.arc(particle.x, particle.y, particle.size || 3, 0, Math.PI * 2);
          context.fill();
        }
        context.restore();
      }
    }

    function drawSpellButton() {
      context.save();
      context.translate(state.spellButton.x, state.spellButton.y);

      const ready = state.player.charge >= 24 && state.player.spellCooldown <= 0;
      const baseGlow = context.createRadialGradient(0, 0, 10, 0, 0, state.spellButton.radius + 14);
      baseGlow.addColorStop(0, ready ? "rgba(127, 174, 255, 0.32)" : "rgba(82, 96, 140, 0.22)");
      baseGlow.addColorStop(1, "rgba(40, 60, 118, 0)");
      context.fillStyle = baseGlow;
      context.beginPath();
      context.arc(0, 0, state.spellButton.radius + 14, 0, Math.PI * 2);
      context.fill();

      context.fillStyle = ready ? "rgba(94, 122, 225, 0.38)" : "rgba(52, 66, 110, 0.3)";
      context.beginPath();
      context.arc(0, 0, state.spellButton.radius, 0, Math.PI * 2);
      context.fill();

      context.strokeStyle = ready ? "rgba(151, 218, 255, 0.92)" : "rgba(122, 144, 198, 0.64)";
      context.lineWidth = 4;
      context.beginPath();
      context.arc(0, 0, state.spellButton.radius - 6, 0, Math.PI * 2);
      context.stroke();

      context.fillStyle = ready ? "rgba(255, 228, 138, 0.9)" : "rgba(180, 188, 214, 0.75)";
      context.beginPath();
      context.moveTo(0, -28);
      context.lineTo(5, -18);
      context.lineTo(16, -16);
      context.lineTo(7, -9);
      context.lineTo(10, 2);
      context.lineTo(0, -4);
      context.lineTo(-10, 2);
      context.lineTo(-7, -9);
      context.lineTo(-16, -16);
      context.lineTo(-5, -18);
      context.closePath();
      context.fill();

      context.fillStyle = "#f6fbff";
      context.font = '700 17px "Avenir Next", "Trebuchet MS", sans-serif';
      context.textAlign = "center";
      context.fillText("SPELL", 0, 18);
      context.font = '600 12px "Avenir Next", "Trebuchet MS", sans-serif';
      context.fillText(`${Math.floor(state.player.charge)}/24`, 0, 34);
      context.restore();
    }

    function drawOverlay() {
      context.fillStyle = "rgba(255, 255, 255, 0.86)";
      context.font = '700 18px "Avenir Next", "Trebuchet MS", sans-serif';
      context.textAlign = "left";
      context.fillText(`法杖充能 ${Math.floor(state.player.charge)}`, 26, 34);
      context.fillText(`夜影数量 ${state.wisps.length}`, 26, 60);
      if (state.phaseIndex === 1) {
        context.fillText(`已封裂隙 ${sealedRiftCount()}/${state.rifts.length}`, 26, 86);
      }
      if (state.phaseIndex === 2) {
        context.fillText(`月核 ${Math.floor(state.moonCore.charge)}% / ${Math.floor(state.moonCore.integrity)}%`, 26, 86);
      }

      if (state.flashTimer > 0) {
        context.fillStyle = `rgba(255, 245, 186, ${state.flashTimer * 0.45})`;
        context.fillRect(0, 0, state.width, state.height);
      }

      if (state.gameOver) {
        context.fillStyle = "rgba(9, 12, 24, 0.66)";
        context.fillRect(0, 0, state.width, state.height);

        context.fillStyle = "#fff4d9";
        context.textAlign = "center";
        context.font = '700 42px "Avenir Next", "Trebuchet MS", sans-serif';
        context.fillText(state.won ? "OWL CLEAR" : "MOON FALL", state.width / 2, state.height / 2 - 18);
        context.font = '500 20px "Avenir Next", "Trebuchet MS", sans-serif';
        context.fillText(
          state.won ? "金声和猫头鹰把三座月灯都稳住了。" : "夜影扑了过来，再施一次月光脉冲。",
          state.width / 2,
          state.height / 2 + 18,
        );
        context.fillText("Tap the stage or press Space / E to restart", state.width / 2, state.height / 2 + 50);
        context.textAlign = "left";
      }
    }

    function render() {
      context.save();
      context.clearRect(0, 0, state.width, state.height);

      if (state.shake > 0) {
        context.translate(random(-state.shake, state.shake), random(-state.shake, state.shake));
      }

      drawBackground();
      drawBeacons();
      drawRifts();
      drawMoonCore();
      drawStars();
      drawWisps();
      drawMage();
      drawOwl();
      drawParticles();
      drawSpellButton();
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

    function setPointerPosition(event) {
      const rect = canvas.getBoundingClientRect();
      pointer.x = event.clientX - rect.left;
      pointer.y = event.clientY - rect.top;
    }

    function onPointerDown(event) {
      setPointerPosition(event);
      audio.unlock();

      if (state.gameOver) {
        tryCastSpell();
        return;
      }

      if (getDistance(pointer.x, pointer.y, state.spellButton.x, state.spellButton.y) <= state.spellButton.radius) {
        tryCastSpell();
        return;
      }

      pointer.active = true;
      pointer.id = event.pointerId;
    }

    function onPointerMove(event) {
      if (!pointer.active || event.pointerId !== pointer.id) {
        return;
      }
      setPointerPosition(event);
    }

    function onPointerUp(event) {
      if (event.pointerId === pointer.id) {
        pointer.active = false;
        pointer.id = null;
      }
    }

    function onKeyDown(event) {
      const key = event.key.toLowerCase();
      keys.add(key);
      audio.unlock();

      if (!event.repeat && (key === " " || key === "e" || key === "enter")) {
        event.preventDefault();
        tryCastSpell();
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
    canvas.addEventListener("pointerleave", onPointerUp);
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
        canvas.removeEventListener("pointerleave", onPointerUp);
      },
    };
  },
};

function createMage(overrides = {}) {
  return {
    x: 480,
    y: 380,
    vx: 0,
    vy: 0,
    charge: 38,
    invulnerable: 0,
    spellCooldown: 0,
    bob: 0,
    ...overrides,
  };
}

function createImageAsset(src) {
  const asset = {
    image: null,
    ready: false,
  };

  const image = new Image();
  image.addEventListener("load", () => {
    asset.ready = true;
  });
  image.src = src;
  asset.image = image;
  return asset;
}

function createOwl() {
  return {
    x: 520,
    y: 340,
    angle: 0,
    cooldown: 0,
  };
}

function createBeacon(x, y, name) {
  return {
    x,
    y,
    name,
    lit: false,
    integrity: 0,
  };
}

function createRift(x, y, name) {
  return {
    x,
    y,
    name,
    integrity: 100,
    sealed: false,
    spawnTimer: random(0.8, 1.4),
    phase: random(0, Math.PI * 2),
  };
}

function createMoonCore(overrides = {}) {
  return {
    x: 480,
    y: 300,
    integrity: 100,
    charge: 0,
    active: false,
    ...overrides,
  };
}

function createStarFeather(x, y) {
  return {
    x,
    y,
    life: random(6, 10),
    phase: random(0, Math.PI * 2),
    wobble: random(1.8, 4.2),
  };
}

function readOwlMageBest() {
  try {
    return Number(window.localStorage.getItem(OWL_MAGE_BEST_KEY) || 0);
  } catch (error) {
    return 0;
  }
}

function writeOwlMageBest(best) {
  try {
    window.localStorage.setItem(OWL_MAGE_BEST_KEY, String(best));
  } catch (error) {
    return;
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function random(min, max) {
  return min + Math.random() * (max - min);
}

function getDistance(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

function drawHeartShape(context) {
  context.beginPath();
  context.moveTo(0, 8);
  context.bezierCurveTo(10, 1, 10, -8, 0, -4);
  context.bezierCurveTo(-10, -8, -10, 1, 0, 8);
  context.closePath();
}

function createOwlMageAudio() {
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

  function tone(type, frequency, duration, volume, glide = frequency) {
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
    cast() {
      tone("triangle", 280, 0.18, 0.08, 720);
      tone("sine", 640, 0.24, 0.05, 320);
    },
    pickup() {
      tone("sine", 540, 0.08, 0.05, 840);
    },
    hit() {
      tone("square", 210, 0.1, 0.04, 120);
    },
    hurt() {
      tone("sawtooth", 200, 0.16, 0.07, 96);
    },
    owl() {
      tone("triangle", 720, 0.09, 0.03, 920);
    },
    win() {
      tone("triangle", 420, 0.18, 0.05, 640);
      tone("sine", 640, 0.3, 0.06, 920);
    },
    gameOver() {
      tone("sawtooth", 180, 0.28, 0.07, 70);
    },
  };
}
