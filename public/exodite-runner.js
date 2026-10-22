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
  const GRAVITY = 0.52;
  const JUMP_V = -10.4;
  const DOUBLE_JUMP_V = -9.2;
  const MAX_JUMPS = 2;
  const BASE_SPEED = 4.2;
  const MAX_SPEED_BONUS = 3.2;
  const SPRITE_SRC = "/easter/exodite-dragon-master.webp";
  const FRAME_W = 144;
  const FRAME_H = 120;
  const WALK_FRAMES = 4;
  const JUMP_FRAME = 4;
  const DRAW_SCALE = 0.55;
  const PLAYER_W = Math.round(FRAME_W * DRAW_SCALE);
  const PLAYER_H = Math.round(FRAME_H * DRAW_SCALE);

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
    player: {
      x: 48,
      y: 0,
      vy: 0,
      w: PLAYER_W,
      h: PLAYER_H,
      onGround: true,
      jumpsLeft: MAX_JUMPS,
      frame: 0
    },
    obstacles: [],
    clouds: [],
    groundOffset: 0,
    spawnIn: 110,
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
    overlay.setAttribute("aria-label", "Exodite Dragon Master Shit Runner");
    overlay.innerHTML =
      '<div class="exodite-runner-panel">' +
      '<div class="exodite-runner-head">' +
      "<h2>Exodite Dragon Master Shit Runner</h2>" +
      '<button type="button" class="exodite-runner-close" aria-label="Close">×</button>' +
      "</div>" +
      '<div class="exodite-runner-stage"><canvas width="' +
      W +
      '" height="' +
      H +
      '"></canvas></div>' +
      '<p class="exodite-runner-hint">Space / ↑ / click — jump (×2) · Esc — close · Volkus ruins + Mindburn</p>' +
      "</div>";
    document.body.appendChild(overlay);
    panel = overlay.querySelector(".exodite-runner-panel");
    canvas = overlay.querySelector("canvas");
    ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
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
    state.spawnIn = 100;
    state.flash = 0;
    state.player.y = 0;
    state.player.vy = 0;
    state.player.onGround = true;
    state.player.jumpsLeft = MAX_JUMPS;
    state.player.frame = 0;
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
    if (dead) return;
    const p = state.player;
    if (p.jumpsLeft <= 0) return;
    const first = p.onGround || p.jumpsLeft === MAX_JUMPS;
    p.vy = first ? JUMP_V : DOUBLE_JUMP_V;
    p.onGround = false;
    p.jumpsLeft -= 1;
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
    if (roll < 0.2 && state.score > 280) {
      const lane = Math.random() < 0.6 ? 1 : 0;
      state.obstacles.push({
        kind: "mindburn",
        x: W + 20,
        y: lane === 0 ? GROUND_Y - 124 : GROUND_Y - 78,
        w: 108,
        h: 22
      });
      return;
    }
    const variant = Math.floor(Math.random() * 3);
    const sizes = [
      { w: 28, h: 38 },
      { w: 40, h: 48 },
      { w: 56, h: 42 }
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
    const padX = 14;
    const padTop = 16;
    const padBottom = 6;
    return {
      x: player.x + padX,
      y: GROUND_Y - player.h - player.y + padTop,
      w: player.w - padX * 2,
      h: player.h - padTop - padBottom
    };
  }

  function overlaps(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function update() {
    if (!running || waiting || dead) return;
    state.t += 1;
    state.speed = BASE_SPEED + Math.min(MAX_SPEED_BONUS, state.score / 650);
    state.score += state.speed * 0.1;
    state.groundOffset = (state.groundOffset + state.speed) % 24;

    const p = state.player;
    p.vy += GRAVITY;
    p.y -= p.vy;
    if (p.y <= 0) {
      p.y = 0;
      p.vy = 0;
      p.onGround = true;
      p.jumpsLeft = MAX_JUMPS;
    } else {
      p.onGround = false;
    }

    if (p.onGround) {
      p.frame = Math.floor(state.t / 6) % WALK_FRAMES;
    } else {
      p.frame = JUMP_FRAME;
    }

    state.spawnIn -= 1;
    if (state.spawnIn <= 0) {
      spawnObstacle();
      state.spawnIn = 85 + Math.random() * 70 - Math.min(18, state.speed * 1.5);
    }

    for (const cloud of state.clouds) {
      cloud.x -= state.speed * 0.2;
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
    const night = Math.floor(state.score / 900) % 2 === 1;
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
      ctx.fillRect(x + w * 0.28, y + 8, w * 0.44, h - 8);
      ctx.fillRect(x + 2, y, w - 4, 10);
      ctx.beginPath();
      ctx.moveTo(x + w * 0.28, y + h * 0.45);
      ctx.lineTo(x + 2, y + h * 0.7);
      ctx.lineTo(x + w * 0.28, y + h * 0.78);
      ctx.fill();
    } else if (variant === 1) {
      ctx.fillRect(x, y + 10, w, h - 10);
      ctx.fillRect(x - 2, y, w + 4, 12);
      ctx.fillStyle = panel?.classList.contains("is-night") ? "#1a1f24" : "#f7f8f4";
      ctx.fillRect(x + w * 0.28, y + h * 0.35, w * 0.44, h * 0.28);
      ctx.fillStyle = color;
      for (let i = 0; i < 3; i++) {
        ctx.fillRect(x + 4 + i * (w / 3), y - 6, w / 5, 8);
      }
    } else {
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
    ctx.fillText("Mindburn", obs.x, obs.y + obs.h / 2);
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
    if (spriteReady) {
      const frame = waiting || dead ? 0 : p.frame;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(
        sprite,
        frame * FRAME_W,
        0,
        FRAME_W,
        FRAME_H,
        x,
        y,
        p.w,
        p.h
      );
    } else {
      ctx.fillStyle = color;
      ctx.fillRect(x + 16, y + 28, 36, 28);
      ctx.fillRect(x + 40, y + 18, 18, 16);
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
      ctx.fillText("Press Space / ↑ / click to start · double jump", 16, 22);
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
    ctx.imageSmoothingEnabled = false;
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
