(() => {
  const KONAMI = [
    "ArrowUp",
    "ArrowUp",
    "ArrowDown",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
    "ArrowLeft",
    "ArrowRight",
    "b",
    "a"
  ];
  const HI_KEY = "kt-exodite-runner-hi";
  const W = 720;
  const H = 220;
  const GROUND_Y = 178;
  const GRAVITY = 0.65;
  const JUMP_V = -11.2;
  const BASE_SPEED = 6.2;
  const SPRITE_SRC = "/easter/exodite-dragon-master.webp";

  let buffer = [];
  let overlay = null;
  let canvas = null;
  let ctx = null;
  let panel = null;
  let raf = 0;
  let running = false;
  let waiting = true;
  let dead = false;
  let sprite = null;
  let spriteReady = false;

  const state = {
    t: 0,
    speed: BASE_SPEED,
    score: 0,
    hi: Number(localStorage.getItem(HI_KEY)) || 0,
    player: { x: 54, y: 0, vy: 0, w: 56, h: 94, onGround: true },
    obstacles: [],
    clouds: [],
    groundOffset: 0,
    spawnIn: 90,
    flash: 0
  };

  function loadHi() {
    state.hi = Number(localStorage.getItem(HI_KEY)) || 0;
  }

  function saveHi() {
    if (state.score > state.hi) {
      state.hi = Math.floor(state.score);
      try {
        localStorage.setItem(HI_KEY, String(state.hi));
      } catch (_) {
        /* ignore quota */
      }
    }
  }

  function ensureUi() {
    if (overlay) return;
    overlay = document.createElement("div");
    overlay.className = "exodite-runner-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Exodite Dragon Master runner");
    overlay.innerHTML =
      '<div class="exodite-runner-panel">' +
      '<div class="exodite-runner-head">' +
      "<h2>Exodite Dragon Master</h2>" +
      '<button type="button" class="exodite-runner-close" aria-label="Close">×</button>' +
      "</div>" +
      '<div class="exodite-runner-stage"><canvas width="' +
      W +
      '" height="' +
      H +
      '"></canvas></div>' +
      '<p class="exodite-runner-hint">Space / ↑ / click — jump · Esc — close · Volkus ruins + Mindburn</p>' +
      "</div>";
    document.body.appendChild(overlay);
    panel = overlay.querySelector(".exodite-runner-panel");
    canvas = overlay.querySelector("canvas");
    ctx = canvas.getContext("2d");
    overlay.querySelector(".exodite-runner-close").addEventListener("click", close);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });
    canvas.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      onAction();
    });
    sprite = new Image();
    sprite.decoding = "async";
    sprite.onload = () => {
      spriteReady = true;
      const ratio = sprite.naturalWidth / sprite.naturalHeight;
      state.player.h = 94;
      state.player.w = Math.round(state.player.h * ratio);
    };
    sprite.src = SPRITE_SRC;
  }

  function resetGame() {
    loadHi();
    state.t = 0;
    state.speed = BASE_SPEED;
    state.score = 0;
    state.obstacles = [];
    state.clouds = [];
    state.groundOffset = 0;
    state.spawnIn = 70;
    state.flash = 0;
    state.player.y = 0;
    state.player.vy = 0;
    state.player.onGround = true;
    waiting = true;
    dead = false;
    running = true;
    for (let i = 0; i < 3; i++) {
      state.clouds.push({
        x: 80 + i * 220 + Math.random() * 40,
        y: 28 + Math.random() * 40,
        w: 40 + Math.random() * 30
      });
    }
  }

  function open() {
    ensureUi();
    loadHi();
    overlay.classList.add("is-open");
    resetGame();
    cancelAnimationFrame(raf);
    loop();
  }

  function close() {
    overlay?.classList.remove("is-open");
    running = false;
    cancelAnimationFrame(raf);
  }

  function jump() {
    if (!state.player.onGround || dead) return;
    state.player.vy = JUMP_V;
    state.player.onGround = false;
  }

  function onAction() {
    if (!overlay?.classList.contains("is-open")) return;
    if (waiting) {
      waiting = false;
      jump();
      return;
    }
    if (dead) {
      resetGame();
      waiting = false;
      jump();
      return;
    }
    jump();
  }

  function spawnObstacle() {
    const roll = Math.random();
    if (roll < 0.28 && state.score > 180) {
      const lane = Math.random() < 0.55 ? 1 : 0;
      state.obstacles.push({
        kind: "mindburn",
        x: W + 20,
        y: lane === 0 ? GROUND_Y - 118 : GROUND_Y - 72,
        w: 108,
        h: 22
      });
      return;
    }
    const variant = Math.floor(Math.random() * 3);
    const sizes = [
      { w: 36, h: 48 },
      { w: 52, h: 62 },
      { w: 74, h: 54 }
    ];
    const size = sizes[variant];
    state.obstacles.push({
      kind: "ruin",
      variant,
      x: W + 20,
      y: GROUND_Y - size.h,
      w: size.w,
      h: size.h
    });
  }

  function hitbox(player) {
    const padX = 10;
    const padY = 12;
    return {
      x: player.x + padX,
      y: GROUND_Y - player.h - player.y + padY,
      w: player.w - padX * 2,
      h: player.h - padY * 1.4
    };
  }

  function overlaps(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function update() {
    if (!running || waiting || dead) return;
    state.t += 1;
    state.speed = BASE_SPEED + Math.min(7, state.score / 420);
    state.score += state.speed * 0.12;
    state.groundOffset = (state.groundOffset + state.speed) % 24;

    const p = state.player;
    p.vy += GRAVITY;
    p.y -= p.vy;
    if (p.y <= 0) {
      p.y = 0;
      p.vy = 0;
      p.onGround = true;
    } else {
      p.onGround = false;
    }

    state.spawnIn -= 1;
    if (state.spawnIn <= 0) {
      spawnObstacle();
      state.spawnIn = 55 + Math.random() * 55 - Math.min(25, state.speed * 2);
    }

    for (const cloud of state.clouds) {
      cloud.x -= state.speed * 0.22;
      if (cloud.x + cloud.w < 0) {
        cloud.x = W + Math.random() * 120;
        cloud.y = 24 + Math.random() * 48;
        cloud.w = 36 + Math.random() * 34;
      }
    }

    const box = hitbox(p);
    for (const obs of state.obstacles) {
      obs.x -= state.speed;
      if (overlaps(box, obs)) {
        dead = true;
        state.flash = 10;
        saveHi();
        break;
      }
    }
    state.obstacles = state.obstacles.filter((o) => o.x + o.w > -40);
    if (state.flash > 0) state.flash -= 1;
  }

  function ink() {
    const night = Math.floor(state.score / 700) % 2 === 1;
    panel?.classList.toggle("is-night", night);
    return night ? "#f0f3f6" : "#2a323a";
  }

  function drawCloud(c, color) {
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, c.w * 0.55, 10, 0, 0, Math.PI * 2);
    ctx.ellipse(c.x + c.w * 0.28, c.y - 4, c.w * 0.35, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawRuin(obs, color) {
    const { x, y, w, h, variant } = obs;
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    if (variant === 0) {
      // Broken pillar
      ctx.fillRect(x + w * 0.28, y + 8, w * 0.44, h - 8);
      ctx.fillRect(x + 2, y, w - 4, 10);
      ctx.beginPath();
      ctx.moveTo(x + w * 0.28, y + h * 0.45);
      ctx.lineTo(x + 2, y + h * 0.7);
      ctx.lineTo(x + w * 0.28, y + h * 0.78);
      ctx.fill();
    } else if (variant === 1) {
      // Ruined wall with window
      ctx.fillRect(x, y + 10, w, h - 10);
      ctx.fillRect(x - 2, y, w + 4, 12);
      ctx.fillStyle = panel?.classList.contains("is-night") ? "#1a1f24" : "#f7f8f4";
      ctx.fillRect(x + w * 0.28, y + h * 0.35, w * 0.44, h * 0.28);
      ctx.fillStyle = color;
      // Crenellations
      for (let i = 0; i < 3; i++) {
        ctx.fillRect(x + 4 + i * (w / 3), y - 6, w / 5, 8);
      }
    } else {
      // Rubble pile + stub
      ctx.beginPath();
      ctx.moveTo(x, y + h);
      ctx.lineTo(x + w * 0.18, y + h * 0.55);
      ctx.lineTo(x + w * 0.4, y + h * 0.7);
      ctx.lineTo(x + w * 0.55, y + h * 0.35);
      ctx.lineTo(x + w * 0.78, y + h * 0.58);
      ctx.lineTo(x + w, y + h);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(x + w * 0.48, y + h * 0.15, w * 0.22, h * 0.55);
    }
  }

  function drawMindburn(obs, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.font = "bold 18px 'Segoe UI', Tahoma, sans-serif";
    ctx.textBaseline = "middle";
    const label = "Mindburn";
    ctx.fillText(label, obs.x, obs.y + obs.h / 2);
    // Small wing flourishes
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.moveTo(obs.x - 6, obs.y + 6);
    ctx.quadraticCurveTo(obs.x - 18, obs.y - 4, obs.x - 4, obs.y + 14);
    ctx.moveTo(obs.x + obs.w + 2, obs.y + 6);
    ctx.quadraticCurveTo(obs.x + obs.w + 16, obs.y - 4, obs.x + obs.w, obs.y + 14);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  function drawGround(color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y);
    ctx.lineTo(W, GROUND_Y);
    ctx.stroke();
    ctx.lineWidth = 1;
    for (let x = -state.groundOffset; x < W; x += 24) {
      ctx.beginPath();
      ctx.moveTo(x, GROUND_Y + 4);
      ctx.lineTo(x + 10, GROUND_Y + 4);
      ctx.stroke();
      if ((Math.floor(x / 24) + Math.floor(state.t / 8)) % 5 === 0) {
        ctx.beginPath();
        ctx.moveTo(x + 4, GROUND_Y + 8);
        ctx.lineTo(x + 14, GROUND_Y + 8);
        ctx.stroke();
      }
    }
  }

  function drawPlayer(color) {
    const p = state.player;
    const x = p.x;
    const y = GROUND_Y - p.h - p.y;
    const bob = p.onGround && !waiting && !dead ? Math.sin(state.t / 4) * 1.5 : 0;
    if (spriteReady) {
      ctx.drawImage(sprite, x, y + bob, p.w, p.h);
    } else {
      ctx.fillStyle = color;
      ctx.fillRect(x + 8, y + 20, 30, 50);
      ctx.beginPath();
      ctx.arc(x + 28, y + 14, 12, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawHud(color) {
    ctx.fillStyle = color;
    ctx.font = "bold 14px 'Courier New', monospace";
    ctx.textAlign = "right";
    const score = String(Math.floor(state.score)).padStart(5, "0");
    const hi = String(Math.floor(state.hi)).padStart(5, "0");
    ctx.fillText("HI " + hi + "  " + score, W - 16, 22);
    ctx.textAlign = "left";
    if (waiting) {
      ctx.font = "13px 'Segoe UI', Tahoma, sans-serif";
      ctx.fillText("Press Space / ↑ / click to start", 16, 22);
    } else if (dead) {
      ctx.font = "bold 16px 'Segoe UI', Tahoma, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("GAME OVER — jump to retry", W / 2, 48);
      ctx.textAlign = "left";
    }
  }

  function draw() {
    if (!ctx) return;
    const color = ink();
    const night = panel?.classList.contains("is-night");
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = night ? "#1a1f24" : "#f7f8f4";
    ctx.fillRect(0, 0, W, H);

    for (const cloud of state.clouds) drawCloud(cloud, color);
    drawGround(color);
    for (const obs of state.obstacles) {
      if (obs.kind === "mindburn") drawMindburn(obs, color);
      else drawRuin(obs, color);
    }
    drawPlayer(color);
    drawHud(color);

    if (state.flash > 0) {
      ctx.fillStyle = night ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.12)";
      ctx.fillRect(0, 0, W, H);
    }
  }

  function loop() {
    update();
    draw();
    if (running) raf = requestAnimationFrame(loop);
  }

  function isTypingTarget(el) {
    const tag = (el && el.tagName) || "";
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable;
  }

  function matchKey(e) {
    if (e.key === "b" || e.key === "B") return "b";
    if (e.key === "a" || e.key === "A") return "a";
    return e.key;
  }

  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    if (overlay?.classList.contains("is-open")) {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key === " " || e.key === "ArrowUp" || e.code === "Space") {
        e.preventDefault();
        onAction();
      }
      return;
    }

    if (isTypingTarget(e.target)) {
      buffer = [];
      return;
    }

    const key = matchKey(e);
    const expect = KONAMI[buffer.length];
    if (key === expect) {
      e.preventDefault();
      buffer.push(key);
      if (buffer.length === KONAMI.length) {
        buffer = [];
        open();
      }
    } else if (key === KONAMI[0]) {
      e.preventDefault();
      buffer = [key];
    } else {
      buffer = [];
    }
  });
})();
