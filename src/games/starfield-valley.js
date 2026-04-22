const STARFIELD_VALLEY_BEST_KEY = "mini-game-workshop:starfield-valley:best-score";

window.starfieldValley = {
  id: "starfield-valley",
  title: "星野谷冒险",
  description:
    "开放区域冒险 demo。金声带着阿凯小牛在星野谷自由探索，接任务、采星果、点亮神龛、开古代宝箱，先跑出一块真正能逛的世界切片。",
  controls: [
    "拖动屏幕 / 鼠标：移动到目标点",
    "WASD / 方向键：备用移动",
    "J / Space：挥出月光斩，击退夜影团",
    "E / Enter：与 NPC、神龛、宝箱互动",
    "手机触控：右下角 ATTACK / INTERACT 按钮",
  ],
  create(canvas, callbacks) {
    const context = canvas.getContext("2d");
    const audio = createValleyAudio();
    const keys = new Set();
    const pointer = { active: false, id: null, x: 0, y: 0, worldX: 0, worldY: 0 };
    const touchActions = new Map();

    const state = {
      width: 960,
      height: 540,
      mapWidth: 2200,
      mapHeight: 1600,
      lastFrame: 0,
      elapsed: 0,
      score: 0,
      best: readValleyBest(),
      lives: 4,
      status: "EXPLORE",
      gameOver: false,
      won: false,
      flashTimer: 0,
      shake: 0,
      camera: { x: 0, y: 0 },
      touchZones: [],
      particles: [],
      questPhase: 0,
      dialogue: null,
      player: createValleyHero(),
      calf: createValleyCalf(),
      elder: { x: 320, y: 520, radius: 26 },
      chest: { x: 1800, y: 360, opened: false, radius: 28 },
      shrines: [
        createShrine(860, 330, "晨曦神龛"),
        createShrine(1490, 920, "流辉神龛"),
        createShrine(1880, 1180, "月泉神龛"),
      ],
      fruit: [
        createFruit(620, 980),
        createFruit(1060, 1250),
        createFruit(1510, 540),
      ],
      enemies: [
        createWispEnemy(980, 760, 170),
        createWispEnemy(1410, 430, 160),
        createWispEnemy(1760, 980, 210),
      ],
      scenery: createValleyScenery(),
      attack: null,
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
      updateCamera(0);
    }

    function updateTouchZones() {
      state.touchZones = [
        { name: "attack", x: state.width - 88, y: state.height - 82, radius: 42 },
        { name: "interact", x: state.width - 186, y: state.height - 82, radius: 38 },
      ];
    }

    function emitState(status, hint) {
      state.status = status;
      callbacks.onStateChange({
        title: `${window.starfieldValley.title} · ${questTitle()}`,
        description: window.starfieldValley.description,
        controls: window.starfieldValley.controls,
        score: Math.floor(state.score),
        lives: state.lives,
        best: state.best,
        status,
        hint,
      });
    }

    function questTitle() {
      if (state.questPhase === 0) {
        return "抵达谷口";
      }
      if (state.questPhase === 1) {
        return "采集星果";
      }
      if (state.questPhase === 2) {
        return "点亮神龛";
      }
      if (state.questPhase === 3) {
        return "开启古箱";
      }
      return "星野谷完成";
    }

    function questHint() {
      if (state.questPhase === 0) {
        return "先去村口大树下找谷口长者，对话后正式接任务。";
      }
      if (state.questPhase === 1) {
        return `还差 ${remainingFruit()} 枚星果，把阿凯带着一起收齐。`;
      }
      if (state.questPhase === 2) {
        return `还差 ${remainingShrines()} 座神龛没亮，靠近后按 E 激活。`;
      }
      if (state.questPhase === 3) {
        return state.chest.opened ? "古箱已经打开，任务完成。" : "去北侧遗迹开古箱，带走谷里的古地图。";
      }
      return "这一块开放区域已经跑通了，可以继续往村庄和遗迹外延扩。";
    }

    function resetRun() {
      state.lastFrame = 0;
      state.elapsed = 0;
      state.score = 0;
      state.lives = 4;
      state.gameOver = false;
      state.won = false;
      state.flashTimer = 0;
      state.shake = 0;
      state.questPhase = 0;
      state.dialogue = null;
      state.particles = [];
      state.attack = null;
      state.player = createValleyHero();
      state.calf = createValleyCalf();
      state.chest.opened = false;
      state.shrines = [
        createShrine(860, 330, "晨曦神龛"),
        createShrine(1490, 920, "流辉神龛"),
        createShrine(1880, 1180, "月泉神龛"),
      ];
      state.fruit = [
        createFruit(620, 980),
        createFruit(1060, 1250),
        createFruit(1510, 540),
      ];
      state.enemies = [
        createWispEnemy(980, 760, 170),
        createWispEnemy(1410, 430, 160),
        createWispEnemy(1760, 980, 210),
      ];
      pointer.active = false;
      pointer.id = null;
      touchActions.clear();
      updateCamera(0);
      emitState("EXPLORE", questHint());
    }

    function saveBest() {
      state.best = Math.max(state.best, Math.floor(state.score));
      writeValleyBest(state.best);
    }

    function completeRun() {
      if (state.won) {
        return;
      }
      state.won = true;
      state.gameOver = true;
      saveBest();
      audio.win();
      burst(state.chest.x, state.chest.y - 10, "rgba(255, 225, 138, 0.96)", 32, 260, 0.8);
      emitState("VALLEY CLEAR", "星野谷这一块已经能完整游玩了，点一下画布还能再跑一轮。");
    }

    function remainingFruit() {
      return state.fruit.filter((item) => !item.collected).length;
    }

    function remainingShrines() {
      return state.shrines.filter((item) => !item.activated).length;
    }

    function clearDialogue() {
      state.dialogue = null;
    }

    function showDialogue(title, lines, onClose = null) {
      state.dialogue = {
        title,
        lines,
        onClose,
      };
      emitState(title, lines[lines.length - 1] || questHint());
    }

    function closeDialogue() {
      if (!state.dialogue) {
        return;
      }
      const action = state.dialogue.onClose;
      state.dialogue = null;
      if (typeof action === "function") {
        action();
      }
    }

    function tryInteraction() {
      if (state.gameOver) {
        resetRun();
        return;
      }
      if (state.dialogue) {
        closeDialogue();
        return;
      }

      const elderDistance = distance(state.player.x, state.player.y, state.elder.x, state.elder.y);
      if (elderDistance < 92) {
        audio.interact();
        if (state.questPhase === 0) {
          showDialogue("谷口长者", [
            "夜里的星野谷又开始起雾了，先帮我把三枚星果找回来。",
            "阿凯会跟着你跑，收齐之后再去点亮三座神龛。",
          ], () => {
            state.questPhase = 1;
            emitState("QUEST", questHint());
          });
        } else if (state.questPhase < 3) {
          showDialogue("谷口长者", ["先把手头这步做完，谷里的古箱要等神龛都亮了才会开。"]);
        } else {
          showDialogue("谷口长者", ["好样的，这块谷地终于能继续往外扩了。"]);
        }
        return;
      }

      if (state.questPhase >= 2) {
        for (const shrine of state.shrines) {
          if (shrine.activated) {
            continue;
          }
          if (distance(state.player.x, state.player.y, shrine.x, shrine.y) < 86) {
            shrine.activated = true;
            state.score += 90;
            audio.activate();
            burst(shrine.x, shrine.y - 8, "rgba(114, 225, 255, 0.95)", 18, 160, 0.42);
            if (remainingShrines() === 0) {
              state.questPhase = 3;
              showDialogue("月灯回声", ["三座神龛都亮起来了，北边遗迹的古箱已经解封。"]);
            } else {
              emitState("SHRINE LIT", questHint());
            }
            return;
          }
        }
      }

      if (state.questPhase >= 3 && !state.chest.opened && distance(state.player.x, state.player.y, state.chest.x, state.chest.y) < 92) {
        state.chest.opened = true;
        state.score += 220;
        audio.chest();
        burst(state.chest.x, state.chest.y - 8, "rgba(255, 218, 118, 0.96)", 22, 190, 0.58);
        showDialogue("古代宝箱", ["你拿到了星野谷古地图。这已经是一块真正能逛、能接任务、能完成目标的开放区域 demo 了。"], completeRun);
      }
    }

    function attackPressed() {
      if (state.gameOver) {
        resetRun();
        return;
      }
      if (state.dialogue) {
        closeDialogue();
        return;
      }
      if (state.attack && state.attack.life > 0) {
        return;
      }

      audio.attack();
      state.attack = {
        x: state.player.x,
        y: state.player.y,
        angle: state.player.aimAngle,
        life: 0.18,
        hitIds: new Set(),
      };
      state.flashTimer = Math.max(state.flashTimer, 0.05);
      burst(state.player.x + Math.cos(state.player.aimAngle) * 18, state.player.y + Math.sin(state.player.aimAngle) * 18, "rgba(124, 231, 255, 0.9)", 10, 120, 0.18);
    }

    function currentInput() {
      let left = keys.has("arrowleft") || keys.has("a");
      let right = keys.has("arrowright") || keys.has("d");
      let up = keys.has("arrowup") || keys.has("w");
      let down = keys.has("arrowdown") || keys.has("s");

      for (const action of touchActions.values()) {
        if (action === "attack" || action === "interact") {
          continue;
        }
      }

      return { left, right, up, down };
    }

    function failLife(reason) {
      if (state.player.invulnerable > 0 || state.gameOver) {
        return;
      }

      state.lives -= 1;
      state.player.invulnerable = 1.1;
      state.flashTimer = 0.18;
      state.shake = 12;
      audio.hurt();
      burst(state.player.x, state.player.y, "rgba(255, 164, 138, 0.95)", 16, 180, 0.38);

      if (state.lives <= 0) {
        state.gameOver = true;
        saveBest();
        emitState("FALLEN", `被${reason}逼退了，点一下画布重新回到谷口。`);
        return;
      }

      state.player = createValleyHero();
      state.calf.x = state.player.x - 40;
      state.calf.y = state.player.y + 28;
      state.attack = null;
      pointer.active = false;
      pointer.id = null;
      touchActions.clear();
      emitState("RECOVER", `这次先绕开${reason}，把任务目标稳稳拿下。`);
    }

    function updatePlayer(delta) {
      const controls = currentInput();
      let moveX = 0;
      let moveY = 0;

      if (pointer.active && !state.dialogue) {
        const dx = pointer.worldX - state.player.x;
        const dy = pointer.worldY - state.player.y;
        const length = Math.hypot(dx, dy);
        if (length > 10) {
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

      if (state.dialogue) {
        moveX = 0;
        moveY = 0;
      }

      state.player.invulnerable = Math.max(0, state.player.invulnerable - delta);
      state.player.vx += (moveX * state.player.speed - state.player.vx) * Math.min(1, delta * 8.4);
      state.player.vy += (moveY * state.player.speed - state.player.vy) * Math.min(1, delta * 8.4);
      state.player.x = clamp(state.player.x + state.player.vx * delta, 86, state.mapWidth - 86);
      state.player.y = clamp(state.player.y + state.player.vy * delta, 100, state.mapHeight - 110);

      if (moveX !== 0 || moveY !== 0) {
        state.player.aimAngle = Math.atan2(moveY, moveX);
        state.player.facing = moveX >= 0 ? 1 : -1;
      }

      const calfTargetX = state.player.x - Math.cos(state.player.aimAngle) * 48;
      const calfTargetY = state.player.y + 32;
      state.calf.x += (calfTargetX - state.calf.x) * Math.min(1, delta * 5.4);
      state.calf.y += (calfTargetY - state.calf.y) * Math.min(1, delta * 5.4);
      state.calf.bob += delta * 5.6;
      state.player.bob += delta * 6.4;
    }

    function updateFruit() {
      if (state.questPhase < 1) {
        return;
      }
      for (const item of state.fruit) {
        if (item.collected) {
          continue;
        }
        item.pulse += 0.08;
        if (distance(state.player.x, state.player.y, item.x, item.y) < 34) {
          item.collected = true;
          state.score += 50;
          audio.collect();
          burst(item.x, item.y, "rgba(210, 255, 126, 0.92)", 12, 130, 0.24);
          if (remainingFruit() === 0 && state.questPhase === 1) {
            state.questPhase = 2;
            showDialogue("阿凯小牛", ["星果都收齐了，前面的三座神龛已经开始发光，咱们过去吧。"]);
          } else {
            emitState("COLLECT", questHint());
          }
        }
      }
    }

    function updateEnemies(delta) {
      for (let index = state.enemies.length - 1; index >= 0; index -= 1) {
        const enemy = state.enemies[index];
        enemy.phase += delta * enemy.speed;
        enemy.x = enemy.anchorX + Math.cos(enemy.phase) * enemy.range;
        enemy.y = enemy.anchorY + Math.sin(enemy.phase * 1.3) * (enemy.range * 0.34);
        enemy.invulnerable = Math.max(0, enemy.invulnerable - delta);

        if (state.attack && state.attack.life > 0 && enemy.invulnerable <= 0) {
          const slashX = state.attack.x + Math.cos(state.attack.angle) * 46;
          const slashY = state.attack.y + Math.sin(state.attack.angle) * 46;
          if (distance(slashX, slashY, enemy.x, enemy.y) < 54) {
            enemy.hp -= 1;
            enemy.invulnerable = 0.18;
            state.score += 24;
            audio.hit();
            burst(enemy.x, enemy.y, "rgba(180, 212, 255, 0.94)", 10, 140, 0.2);
            if (enemy.hp <= 0) {
              burst(enemy.x, enemy.y, "rgba(255, 235, 176, 0.94)", 16, 170, 0.28);
              state.enemies.splice(index, 1);
            }
            continue;
          }
        }

        if (distance(state.player.x, state.player.y, enemy.x, enemy.y) < enemy.radius + state.player.radius - 2) {
          failLife("夜影团");
          break;
        }
      }
    }

    function updateAttack(delta) {
      if (!state.attack) {
        return;
      }
      state.attack.life -= delta;
      if (state.attack.life <= 0) {
        state.attack = null;
      }
    }

    function updateParticles(delta) {
      for (let index = state.particles.length - 1; index >= 0; index -= 1) {
        const particle = state.particles[index];
        particle.life -= delta;
        particle.x += (particle.vx || 0) * delta;
        particle.y += (particle.vy || 0) * delta;
        particle.vx = (particle.vx || 0) * 0.986;
        particle.vy = (particle.vy || 0) * 0.986;
        particle.size = Math.max(0, particle.size + (particle.grow || 0) * delta);
        if (particle.life <= 0) {
          state.particles.splice(index, 1);
        }
      }
    }

    function updateCamera(delta) {
      const targetX = clamp(state.player.x - state.width * 0.5, 0, state.mapWidth - state.width);
      const targetY = clamp(state.player.y - state.height * 0.5, 0, state.mapHeight - state.height);
      state.camera.x += (targetX - state.camera.x) * Math.min(1, delta * 3.6 + 0.08);
      state.camera.y += (targetY - state.camera.y) * Math.min(1, delta * 3.6 + 0.08);
    }

    function update(delta) {
      state.elapsed += delta;
      state.flashTimer = Math.max(0, state.flashTimer - delta);
      state.shake = Math.max(0, state.shake - delta * 22);
      updateParticles(delta);

      if (state.gameOver) {
        emitState(state.won ? "VALLEY CLEAR" : "FALLEN", state.won ? "点一下画布还能再跑这块开放区域。" : "点一下画布，从谷口重新出发。");
        return;
      }

      if (state.dialogue) {
        updateCamera(delta);
        emitState(state.dialogue.title, state.dialogue.lines[state.dialogue.lines.length - 1] || questHint());
        return;
      }

      updatePlayer(delta);
      updateFruit();
      updateEnemies(delta);
      updateAttack(delta);
      updateCamera(delta);

      emitState(questTitle().toUpperCase(), questHint());
    }

    function worldToScreenX(x) {
      return x - state.camera.x;
    }

    function worldToScreenY(y) {
      return y - state.camera.y;
    }

    function drawBackground() {
      const sky = context.createLinearGradient(0, 0, 0, state.height);
      sky.addColorStop(0, "#8ad7ff");
      sky.addColorStop(0.55, "#d6f0ff");
      sky.addColorStop(1, "#fff2db");
      context.fillStyle = sky;
      context.fillRect(0, 0, state.width, state.height);

      const haze = context.createRadialGradient(state.width * 0.5, state.height * 0.18, 20, state.width * 0.5, state.height * 0.18, state.width * 0.45);
      haze.addColorStop(0, "rgba(255, 249, 216, 0.42)");
      haze.addColorStop(1, "rgba(255, 249, 216, 0)");
      context.fillStyle = haze;
      context.fillRect(0, 0, state.width, state.height);

      for (const hill of state.scenery.hills) {
        context.fillStyle = hill.color;
        context.beginPath();
        context.moveTo(-20, state.height);
        for (let x = -20; x <= state.width + 20; x += 20) {
          const worldX = x + state.camera.x * hill.parallax;
          const y =
            state.height * hill.base +
            Math.sin(worldX / hill.wave) * hill.height +
            Math.cos(worldX / (hill.wave * 0.52)) * hill.height * 0.34;
          context.lineTo(x, y);
        }
        context.lineTo(state.width + 20, state.height);
        context.closePath();
        context.fill();
      }

      context.fillStyle = "#5b9549";
      context.fillRect(0, state.height * 0.72, state.width, state.height * 0.28);
      context.fillStyle = "rgba(255, 255, 255, 0.07)";
      for (let x = 0; x < state.width; x += 44) {
        context.fillRect(x, 0, 1, state.height);
      }
      for (let y = 0; y < state.height; y += 44) {
        context.fillRect(0, y, state.width, 1);
      }
    }

    function drawScenery() {
      for (const patch of state.scenery.flowerPatches) {
        const x = worldToScreenX(patch.x);
        const y = worldToScreenY(patch.y);
        if (x < -80 || x > state.width + 80 || y < -80 || y > state.height + 80) {
          continue;
        }
        context.fillStyle = patch.grass;
        context.beginPath();
        context.ellipse(x, y, patch.radius, patch.radius * 0.52, 0, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = patch.flower;
        for (let index = 0; index < 6; index += 1) {
          context.beginPath();
          context.arc(x + Math.cos(index) * patch.radius * 0.48, y + Math.sin(index * 1.2) * patch.radius * 0.24, 3.4, 0, Math.PI * 2);
          context.fill();
        }
      }

      for (const ruin of state.scenery.ruins) {
        const x = worldToScreenX(ruin.x);
        const y = worldToScreenY(ruin.y);
        if (x + ruin.width < -80 || x > state.width + 80 || y + ruin.height < -80 || y > state.height + 80) {
          continue;
        }
        const stone = context.createLinearGradient(x, y, x + ruin.width, y + ruin.height);
        stone.addColorStop(0, "#d9d3bf");
        stone.addColorStop(0.56, "#b9af95");
        stone.addColorStop(1, "#897d6b");
        context.fillStyle = stone;
        context.fillRect(x, y, ruin.width, ruin.height);
        context.fillStyle = "rgba(255, 255, 255, 0.16)";
        context.fillRect(x + 8, y + 8, ruin.width - 16, 8);
      }

      for (const tree of state.scenery.trees) {
        const x = worldToScreenX(tree.x);
        const y = worldToScreenY(tree.y);
        if (x < -120 || x > state.width + 120 || y < -120 || y > state.height + 120) {
          continue;
        }
        context.fillStyle = "#6d4e35";
        context.fillRect(x - 10, y - 16, 20, 62);
        const canopy = context.createRadialGradient(x, y - 36, 10, x, y - 36, tree.radius);
        canopy.addColorStop(0, "#8fd66a");
        canopy.addColorStop(0.58, "#5d9f42");
        canopy.addColorStop(1, "#39652d");
        context.fillStyle = canopy;
        context.beginPath();
        context.arc(x, y - 38, tree.radius, 0, Math.PI * 2);
        context.fill();
      }
    }

    function drawFruit() {
      for (const item of state.fruit) {
        if (item.collected) {
          continue;
        }
        const x = worldToScreenX(item.x);
        const y = worldToScreenY(item.y);
        const glow = context.createRadialGradient(x, y, 2, x, y, 20);
        glow.addColorStop(0, "rgba(210, 255, 126, 0.78)");
        glow.addColorStop(1, "rgba(210, 255, 126, 0)");
        context.fillStyle = glow;
        context.beginPath();
        context.arc(x, y, 20, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = "#d2ff7e";
        context.beginPath();
        context.arc(x, y, 9 + Math.sin(item.pulse) * 1.2, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = "#7fc948";
        context.fillRect(x - 1.5, y - 15, 3, 7);
      }
    }

    function drawShrines() {
      for (const shrine of state.shrines) {
        const x = worldToScreenX(shrine.x);
        const y = worldToScreenY(shrine.y);
        context.fillStyle = "#8c7356";
        context.fillRect(x - 12, y - 4, 24, 52);
        context.fillStyle = "#b99e79";
        context.fillRect(x - 20, y - 16, 40, 14);

        if (shrine.activated) {
          const glow = context.createRadialGradient(x, y - 18, 4, x, y - 18, 54);
          glow.addColorStop(0, "rgba(120, 234, 255, 0.96)");
          glow.addColorStop(0.45, "rgba(120, 234, 255, 0.34)");
          glow.addColorStop(1, "rgba(120, 234, 255, 0)");
          context.fillStyle = glow;
          context.beginPath();
          context.arc(x, y - 18, 54, 0, Math.PI * 2);
          context.fill();
        }

        context.fillStyle = shrine.activated ? "#ebfff8" : "#ced8ea";
        context.beginPath();
        context.arc(x, y - 18, 12, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = shrine.activated ? "#7be7ff" : "#98a9be";
        context.lineWidth = 3;
        context.beginPath();
        context.arc(x, y - 18, 18, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (shrine.activated ? 1 : 0.34));
        context.stroke();
      }
    }

    function drawNpcAndChest() {
      drawValleyPerson(state.elder.x, state.elder.y, 1, {
        robe: "#6e8f4f",
        scarf: "#d4ff7d",
        accent: "#f3dfaf",
        staff: true,
      });

      const chestX = worldToScreenX(state.chest.x);
      const chestY = worldToScreenY(state.chest.y);
      context.fillStyle = state.chest.opened ? "#d0b889" : "#8f5e38";
      context.fillRect(chestX - 26, chestY - 16, 52, 34);
      context.fillStyle = state.chest.opened ? "#f1dfb3" : "#c08a54";
      context.fillRect(chestX - 26, chestY - 22, 52, 12);
      context.fillStyle = "#ffe39d";
      context.fillRect(chestX - 4, chestY - 8, 8, 10);
    }

    function drawEnemies() {
      for (const enemy of state.enemies) {
        const x = worldToScreenX(enemy.x);
        const y = worldToScreenY(enemy.y);
        const aura = context.createRadialGradient(x, y, 6, x, y, enemy.radius + 16);
        aura.addColorStop(0, "rgba(150, 175, 255, 0.26)");
        aura.addColorStop(1, "rgba(150, 175, 255, 0)");
        context.fillStyle = aura;
        context.beginPath();
        context.arc(x, y, enemy.radius + 16, 0, Math.PI * 2);
        context.fill();

        const body = context.createRadialGradient(x - 5, y - 6, 2, x, y, enemy.radius + 2);
        body.addColorStop(0, "#8f9dff");
        body.addColorStop(0.56, "#5053a3");
        body.addColorStop(1, "#232653");
        context.fillStyle = body;
        context.beginPath();
        context.arc(x, y, enemy.radius, 0, Math.PI * 2);
        context.fill();

        context.fillStyle = "#e5efff";
        context.beginPath();
        context.arc(x - 4, y - 4, 2.6, 0, Math.PI * 2);
        context.arc(x + 4, y - 4, 2.6, 0, Math.PI * 2);
        context.fill();
      }
    }

    function drawAttack() {
      if (!state.attack) {
        return;
      }
      const x = worldToScreenX(state.attack.x);
      const y = worldToScreenY(state.attack.y);
      context.save();
      context.translate(x, y);
      context.rotate(state.attack.angle);
      context.strokeStyle = "rgba(148, 236, 255, 0.94)";
      context.lineWidth = 5;
      context.beginPath();
      context.arc(0, 0, 46, -0.7, 0.48);
      context.stroke();
      context.strokeStyle = "rgba(255, 241, 176, 0.72)";
      context.lineWidth = 2;
      context.beginPath();
      context.arc(0, 0, 54, -0.65, 0.42);
      context.stroke();
      context.restore();
    }

    function drawPlayerAndCalf() {
      drawValleyCalf(worldToScreenX(state.calf.x), worldToScreenY(state.calf.y), state.calf.bob);
      drawValleyPerson(state.player.x, state.player.y, state.player.facing, {
        robe: "#244a78",
        scarf: "#d84b4b",
        accent: "#77dfff",
        staff: true,
        hero: true,
        bob: state.player.bob,
      });
    }

    function drawParticles() {
      for (const particle of state.particles) {
        context.globalAlpha = Math.max(0, particle.life * 2);
        context.fillStyle = particle.color;
        context.strokeStyle = particle.color;
        context.lineWidth = particle.lineWidth || 2;
        const x = worldToScreenX(particle.x);
        const y = worldToScreenY(particle.y);

        if (particle.kind === "streak") {
          const angle = Math.atan2(particle.vy || 0, particle.vx || 0);
          const tail = particle.size * 2.4;
          context.beginPath();
          context.moveTo(x, y);
          context.lineTo(x - Math.cos(angle) * tail, y - Math.sin(angle) * tail);
          context.stroke();
        } else {
          context.beginPath();
          context.arc(x, y, particle.size || 3, 0, Math.PI * 2);
          context.fill();
        }
      }
      context.globalAlpha = 1;
    }

    function drawTouchControls() {
      for (const zone of state.touchZones) {
        const active = Array.from(touchActions.values()).includes(zone.name);
        context.fillStyle = active ? "rgba(255, 255, 255, 0.22)" : "rgba(255, 255, 255, 0.1)";
        context.beginPath();
        context.arc(zone.x, zone.y, zone.radius, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = "rgba(255, 255, 255, 0.22)";
        context.lineWidth = 2;
        context.beginPath();
        context.arc(zone.x, zone.y, zone.radius - 4, 0, Math.PI * 2);
        context.stroke();
        context.fillStyle = "#fffef7";
        context.font = '700 14px "Avenir Next", "Trebuchet MS", sans-serif';
        context.textAlign = "center";
        context.fillText(zone.name === "attack" ? "ATTACK" : "INTERACT", zone.x, zone.y + 5);
      }
      context.textAlign = "left";
    }

    function drawDialogue() {
      if (!state.dialogue) {
        return;
      }
      context.fillStyle = "rgba(7, 15, 26, 0.72)";
      context.fillRect(30, state.height - 158, state.width - 60, 116);
      context.strokeStyle = "rgba(255, 255, 255, 0.12)";
      context.lineWidth = 2;
      context.strokeRect(30, state.height - 158, state.width - 60, 116);
      context.fillStyle = "#7ce7ff";
      context.font = '700 16px "Avenir Next", "Trebuchet MS", sans-serif';
      context.fillText(state.dialogue.title, 52, state.height - 126);
      context.fillStyle = "#fffdf6";
      context.font = '500 17px "Avenir Next", "Trebuchet MS", sans-serif';
      const lines = state.dialogue.lines;
      for (let index = 0; index < lines.length; index += 1) {
        context.fillText(lines[index], 52, state.height - 94 + index * 28);
      }
      context.fillStyle = "rgba(255, 244, 214, 0.88)";
      context.font = '600 13px "Avenir Next", "Trebuchet MS", sans-serif';
      context.fillText("按 E / Enter 或点一下继续", state.width - 248, state.height - 58);
    }

    function drawOverlay() {
      context.fillStyle = "rgba(10, 24, 18, 0.22)";
      context.fillRect(18, 18, 300, 82);
      context.fillStyle = "#fdf8ec";
      context.font = '700 16px "Avenir Next", "Trebuchet MS", sans-serif';
      context.fillText(`Quest · ${questTitle()}`, 30, 40);
      context.fillText(`星果 ${3 - remainingFruit()}/3 · 神龛 ${3 - remainingShrines()}/3`, 30, 64);
      context.fillText(`夜影 ${state.enemies.length} · 古箱 ${state.chest.opened ? "已开" : "未开"}`, 30, 88);

      if (state.flashTimer > 0) {
        context.fillStyle = `rgba(255, 247, 214, ${state.flashTimer * 0.48})`;
        context.fillRect(0, 0, state.width, state.height);
      }

      if (state.gameOver) {
        context.fillStyle = "rgba(7, 15, 26, 0.62)";
        context.fillRect(0, 0, state.width, state.height);
        context.fillStyle = "#fff7de";
        context.textAlign = "center";
        context.font = '700 42px "Avenir Next", "Trebuchet MS", sans-serif';
        context.fillText(state.won ? "VALLEY CLEAR" : "TRY AGAIN", state.width / 2, state.height / 2 - 20);
        context.font = '500 20px "Avenir Next", "Trebuchet MS", sans-serif';
        context.fillText(
          state.won ? "这块星野谷已经具备开放探索的第一版闭环。" : "从谷口再出发一轮，把任务链跑通。",
          state.width / 2,
          state.height / 2 + 18,
        );
        context.fillText("Tap the stage or press E / Space to restart", state.width / 2, state.height / 2 + 52);
        context.textAlign = "left";
      }
    }

    function render() {
      context.save();
      context.clearRect(0, 0, state.width, state.height);
      if (state.shake > 0) {
        context.translate(random(-state.shake, state.shake), random(-state.shake, state.shake));
      }

      window._miniGameWorkshopContextHack = context;
      window._miniGameWorkshopCameraHack = state.camera;

      drawBackground();
      drawScenery();
      drawFruit();
      drawShrines();
      drawNpcAndChest();
      drawEnemies();
      drawParticles();
      drawAttack();
      drawPlayerAndCalf();
      drawTouchControls();
      drawOverlay();
      drawDialogue();
      window._miniGameWorkshopContextHack = null;
      window._miniGameWorkshopCameraHack = null;
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
      pointer.worldX = pointer.x + state.camera.x;
      pointer.worldY = pointer.y + state.camera.y;
    }

    function touchZoneAt(pointX, pointY) {
      return state.touchZones.find((zone) => Math.hypot(zone.x - pointX, zone.y - pointY) <= zone.radius);
    }

    function onPointerDown(event) {
      setPointerPosition(event);
      audio.unlock();

      const zone = touchZoneAt(pointer.x, pointer.y);
      if (zone) {
        touchActions.set(event.pointerId, zone.name);
        if (zone.name === "attack") {
          attackPressed();
        } else if (zone.name === "interact") {
          tryInteraction();
        }
        return;
      }

      pointer.active = true;
      pointer.id = event.pointerId;
      if (state.gameOver) {
        resetRun();
      }
    }

    function onPointerMove(event) {
      setPointerPosition(event);
      if (pointer.active && event.pointerId === pointer.id) {
        return;
      }
      if (touchActions.has(event.pointerId)) {
        const zone = touchZoneAt(pointer.x, pointer.y);
        if (zone) {
          touchActions.set(event.pointerId, zone.name);
        } else {
          touchActions.delete(event.pointerId);
        }
      }
    }

    function onPointerUp(event) {
      if (event.pointerId === pointer.id) {
        pointer.active = false;
        pointer.id = null;
      }
      touchActions.delete(event.pointerId);
    }

    function onKeyDown(event) {
      const key = event.key.toLowerCase();
      keys.add(key);
      audio.unlock();
      if (!event.repeat && (key === "j" || key === " ")) {
        event.preventDefault();
        attackPressed();
      }
      if (!event.repeat && (key === "e" || key === "enter")) {
        event.preventDefault();
        tryInteraction();
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

function createValleyHero() {
  return {
    x: 280,
    y: 620,
    vx: 0,
    vy: 0,
    speed: 280,
    radius: 24,
    invulnerable: 0,
    aimAngle: 0,
    facing: 1,
    bob: 0,
  };
}

function createValleyCalf() {
  return {
    x: 236,
    y: 648,
    bob: 0,
  };
}

function createShrine(x, y, name) {
  return { x, y, name, activated: false };
}

function createFruit(x, y) {
  return { x, y, collected: false, pulse: Math.random() * Math.PI * 2 };
}

function createWispEnemy(x, y, range) {
  return {
    anchorX: x,
    anchorY: y,
    x,
    y,
    range,
    speed: random(0.6, 0.9),
    phase: Math.random() * Math.PI * 2,
    radius: 18,
    hp: 2,
    invulnerable: 0,
  };
}

function createValleyScenery() {
  return {
    hills: [
      { color: "#b5dc87", base: 0.38, height: 28, parallax: 0.25, wave: 340 },
      { color: "#84ba5a", base: 0.5, height: 44, parallax: 0.46, wave: 210 },
      { color: "#6ea148", base: 0.62, height: 56, parallax: 0.7, wave: 150 },
    ],
    trees: [
      { x: 240, y: 430, radius: 48 },
      { x: 540, y: 300, radius: 42 },
      { x: 900, y: 1180, radius: 54 },
      { x: 1270, y: 690, radius: 44 },
      { x: 1700, y: 600, radius: 50 },
      { x: 1960, y: 980, radius: 46 },
    ],
    ruins: [
      { x: 770, y: 250, width: 120, height: 70 },
      { x: 1750, y: 300, width: 160, height: 80 },
      { x: 1830, y: 1080, width: 90, height: 120 },
    ],
    flowerPatches: [
      { x: 420, y: 760, radius: 34, grass: "#72b84c", flower: "#fff3a8" },
      { x: 1130, y: 1030, radius: 42, grass: "#67a74b", flower: "#f6c3f1" },
      { x: 1600, y: 760, radius: 38, grass: "#72b84c", flower: "#bde8ff" },
      { x: 1920, y: 1240, radius: 34, grass: "#72b84c", flower: "#fff3a8" },
    ],
  };
}

function drawValleyPerson(worldX, worldY, facing, palette) {
  const context = window._miniGameWorkshopContextHack;
  if (!context) {
    return;
  }
  const screenX = worldX - window._miniGameWorkshopCameraHack.x;
  const screenY = worldY - window._miniGameWorkshopCameraHack.y;
  context.save();
  context.translate(screenX, screenY + Math.sin((palette.bob || 0)) * 2);
  context.scale(facing >= 0 ? 1 : -1, 1);

  context.fillStyle = "rgba(12, 18, 30, 0.22)";
  context.beginPath();
  context.ellipse(0, 36, 22, 8, 0, 0, Math.PI * 2);
  context.fill();

  const face = context.createRadialGradient(-4, -28, 3, 0, -24, 16);
  face.addColorStop(0, "#fff0d8");
  face.addColorStop(1, "#fee0bf");
  context.fillStyle = face;
  context.beginPath();
  context.arc(0, -24, 14, 0, Math.PI * 2);
  context.fill();

  const hair = context.createLinearGradient(-14, -40, 14, -14);
  hair.addColorStop(0, "#2a2333");
  hair.addColorStop(1, "#13243a");
  context.fillStyle = hair;
  context.beginPath();
  context.moveTo(-14, -24);
  context.quadraticCurveTo(-10, -40, 4, -38);
  context.quadraticCurveTo(15, -34, 12, -18);
  context.lineTo(8, -12);
  context.lineTo(-12, -12);
  context.closePath();
  context.fill();

  const robe = context.createLinearGradient(-18, -8, 18, 30);
  robe.addColorStop(0, lighten(palette.robe, 0.18));
  robe.addColorStop(0.55, palette.robe);
  robe.addColorStop(1, darken(palette.robe, 0.26));
  context.fillStyle = robe;
  context.beginPath();
  context.moveTo(-18, -8);
  context.lineTo(18, -8);
  context.lineTo(22, 26);
  context.lineTo(-22, 26);
  context.closePath();
  context.fill();

  context.fillStyle = palette.accent;
  context.fillRect(-10, 2, 20, 7);
  context.fillStyle = palette.scarf;
  context.beginPath();
  context.moveTo(8, -8);
  context.quadraticCurveTo(22, -2, 18, 10);
  context.quadraticCurveTo(10, 4, 4, 0);
  context.closePath();
  context.fill();

  context.fillStyle = "#2a1a18";
  context.beginPath();
  context.arc(-4, -25, 1.8, 0, Math.PI * 2);
  context.arc(4, -25, 1.8, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = "#2a1a18";
  context.lineWidth = 1.6;
  context.beginPath();
  context.arc(0, -20, 4.5, 0.15, Math.PI - 0.15);
  context.stroke();

  context.fillStyle = "#f2a481";
  context.fillRect(-10, 26, 8, 16);
  context.fillRect(2, 26, 8, 16);

  if (palette.staff) {
    context.strokeStyle = "#ffeab8";
    context.lineWidth = 4;
    context.beginPath();
    context.moveTo(16, -8);
    context.lineTo(26, 16);
    context.stroke();
    const glow = context.createRadialGradient(28, 18, 1, 28, 18, 12);
    glow.addColorStop(0, "rgba(255, 247, 216, 0.98)");
    glow.addColorStop(0.5, "rgba(255, 228, 142, 0.8)");
    glow.addColorStop(1, "rgba(255, 228, 142, 0)");
    context.fillStyle = glow;
    context.beginPath();
    context.arc(28, 18, 12, 0, Math.PI * 2);
    context.fill();
  }

  if (palette.hero) {
    const aura = context.createRadialGradient(0, -8, 6, 0, -8, 38);
    aura.addColorStop(0, "rgba(124, 231, 255, 0.18)");
    aura.addColorStop(1, "rgba(124, 231, 255, 0)");
    context.fillStyle = aura;
    context.beginPath();
    context.arc(0, -8, 38, 0, Math.PI * 2);
    context.fill();
  }

  context.restore();
}

function drawValleyCalf(x, y, bob) {
  const context = window._miniGameWorkshopContextHack;
  if (!context) {
    return;
  }
  context.save();
  context.translate(x, y + Math.sin(bob) * 2);
  context.fillStyle = "rgba(20, 16, 12, 0.2)";
  context.beginPath();
  context.ellipse(0, 24, 24, 8, 0, 0, Math.PI * 2);
  context.fill();

  const body = context.createLinearGradient(-24, 4, 24, 28);
  body.addColorStop(0, "#fffdf6");
  body.addColorStop(0.58, "#fff4e0");
  body.addColorStop(1, "#e8dcc8");
  context.fillStyle = body;
  context.beginPath();
  context.ellipse(0, 8, 22, 15, 0, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = "#5b3a2d";
  context.beginPath();
  context.arc(15, 0, 10, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#fff7ef";
  context.beginPath();
  context.arc(18, 1, 4, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#2a1a18";
  context.beginPath();
  context.arc(14, -1, 1.5, 0, Math.PI * 2);
  context.arc(18, -1, 1.5, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#ffb9c8";
  context.beginPath();
  context.arc(20, -9, 4, 0, Math.PI * 2);
  context.arc(12, -10, 4, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#d84b4b";
  context.fillRect(-5, -1, 18, 5);
  context.fillStyle = "#fff7ef";
  context.fillRect(-10, 18, 4, 10);
  context.fillRect(0, 18, 4, 10);
  context.fillRect(10, 18, 4, 10);
  context.fillRect(18, 18, 4, 10);
  context.restore();
}

function readValleyBest() {
  try {
    return Number(window.localStorage.getItem(STARFIELD_VALLEY_BEST_KEY) || 0);
  } catch (error) {
    return 0;
  }
}

function writeValleyBest(best) {
  try {
    window.localStorage.setItem(STARFIELD_VALLEY_BEST_KEY, String(best));
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

function distance(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

function lighten(hex, amount) {
  return mixColor(hex, "#ffffff", amount);
}

function darken(hex, amount) {
  return mixColor(hex, "#000000", amount);
}

function mixColor(a, b, t) {
  const colorA = parseHex(a);
  const colorB = parseHex(b);
  const r = Math.round(colorA.r + (colorB.r - colorA.r) * t);
  const g = Math.round(colorA.g + (colorB.g - colorA.g) * t);
  const bValue = Math.round(colorA.b + (colorB.b - colorA.b) * t);
  return `rgb(${r}, ${g}, ${bValue})`;
}

function parseHex(hex) {
  const clean = hex.replace("#", "");
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

function createValleyAudio() {
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
    interact() {
      tone("triangle", 320, 0.12, 0.05, 520);
    },
    collect() {
      tone("sine", 560, 0.09, 0.05, 860);
    },
    activate() {
      tone("triangle", 280, 0.16, 0.06, 720);
      tone("sine", 640, 0.24, 0.04, 920);
    },
    attack() {
      tone("square", 190, 0.08, 0.03, 130);
    },
    hit() {
      tone("triangle", 420, 0.09, 0.04, 240);
    },
    hurt() {
      tone("sawtooth", 220, 0.14, 0.06, 110);
    },
    chest() {
      tone("triangle", 380, 0.18, 0.05, 780);
      tone("sine", 780, 0.28, 0.04, 1100);
    },
    win() {
      tone("triangle", 420, 0.22, 0.05, 760);
      tone("sine", 760, 0.32, 0.05, 1020);
    },
  };
}
