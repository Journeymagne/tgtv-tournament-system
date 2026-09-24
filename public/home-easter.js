(() => {
  const HOLD_MS = 1500;
  const SECRET = "rygau";
  const WORDS = ["БУРП!", "БУЭЭЭ!", "УРРП!", "ЫК!"];

  const logo = document.querySelector(".companion-home-brand img");
  if (!logo) return;

  let egg = null;
  let typing = "";
  let holding = false;
  let holdTimer = 0;
  let audioCtx = null;
  let master = null;
  let noiseBuf = null;

  function ensureEgg() {
    if (egg) return egg;
    egg = document.createElement("button");
    egg.type = "button";
    egg.className = "rygau-egg";
    egg.setAttribute("aria-label", "Кошка рыгнула. Нажми, чтобы открыть страницу Рыгаю");
    egg.innerHTML =
      '<div class="rygau-egg-inner"><img src="/rygayu-cat.webp" alt=""></div>' +
      '<span class="rygau-egg-burst" aria-hidden="true"></span>';
    egg.addEventListener("click", () => {
      window.location.href = "/rygau";
    });
    document.body.appendChild(egg);
    return egg;
  }

  function restart(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  function audio() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!audioCtx) {
      audioCtx = new AC();
      master = audioCtx.createDynamicsCompressor();
      master.threshold.value = -18;
      master.ratio.value = 6;
      master.connect(audioCtx.destination);
      const len = Math.floor(audioCtx.sampleRate * 1.2);
      noiseBuf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }

  function playBurp() {
    const ctx = audio();
    if (!ctx) return;
    const t = ctx.currentTime;
    const dur = 0.55;
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(55, t + dur);

    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(700, t);
    bp.frequency.exponentialRampToValueAtTime(220, t + dur);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.001, t);
    ng.gain.linearRampToValueAtTime(0.28, t + 0.03);
    ng.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.85);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.001, t);
    env.gain.linearRampToValueAtTime(0.7, t + 0.03);
    env.gain.exponentialRampToValueAtTime(0.001, t + dur);

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 900;

    osc.connect(lp);
    lp.connect(env);
    noise.connect(bp);
    bp.connect(ng);
    ng.connect(env);
    env.connect(master);
    osc.start(t);
    noise.start(t);
    osc.stop(t + dur + 0.05);
    noise.stop(t + dur + 0.05);
  }

  function summon() {
    const node = ensureEgg();
    node.classList.add("is-on");
    const inner = node.querySelector(".rygau-egg-inner");
    const burst = node.querySelector(".rygau-egg-burst");
    burst.textContent = WORDS[Math.floor(Math.random() * WORDS.length)];
    restart(inner, "is-burping");
    restart(burst, "is-show");
    playBurp();
    try {
      node.focus({ preventScroll: true });
    } catch (_) {
      /* ignore */
    }
  }

  function clearHold() {
    holding = false;
    logo.classList.remove("rygau-charging");
    window.clearTimeout(holdTimer);
  }

  logo.addEventListener("pointerdown", (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    if (holding) return;
    holding = true;
    logo.classList.add("rygau-charging");
    try {
      logo.setPointerCapture(e.pointerId);
    } catch (_) {
      /* ignore */
    }
    audio();
    holdTimer = window.setTimeout(() => {
      if (!holding) return;
      clearHold();
      summon();
    }, HOLD_MS);
  });

  function endHold(e) {
    if (!holding) return;
    if (e) e.preventDefault();
    clearHold();
  }

  logo.addEventListener("pointerup", endHold);
  logo.addEventListener("pointercancel", endHold);
  logo.addEventListener("lostpointercapture", endHold);
  logo.addEventListener("contextmenu", (e) => e.preventDefault());

  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = (e.target && e.target.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.target?.isContentEditable) {
      typing = "";
      return;
    }
    const key = e.key.length === 1 ? e.key.toLowerCase() : "";
    if (!key) {
      typing = "";
      return;
    }
    typing = (typing + key).slice(-SECRET.length);
    if (typing === SECRET) {
      typing = "";
      summon();
    }
  });
})();
