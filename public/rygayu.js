(() => {
  const $ = id => document.getElementById(id);
  const world = $('world'), stage = $('stage'), cat = $('cat'), inner = $('inner'),
        fx = $('fx'), burst = $('burst'), say = $('say'),
        countEl = $('count'), countNum = $('countNum'), hint = $('hint');
  const letters = [...document.querySelectorAll('.caption span')];

  const MAX_HOLD = 1400;                 // ms to fully charge
  const WORDS = ['БУРП!', 'БУЭЭЭ!', 'УРРП!', 'ЫК!', 'БР-Р-РП!', 'ИК!'];
  const BIG   = ['БУУУУРП!!!', 'БУЭЭЭЭЭ!!!', 'ГРААААХ!!'];
  const LINES = ['пардон', 'это была не я', 'ой', 'извиняюсь', 'мяу?', 'вкусно было',
                 'ещё раз?', 'не смотри так', 'и не стыдно', 'это комплимент повару'];
  const pick = a => a[Math.floor(Math.random() * a.length)];

  // ---------- counter (per-browser) ----------
  let count = 0;
  try { count = parseInt(localStorage.getItem('rygayu-count'), 10) || 0; } catch (e) {}
  countNum.textContent = count;

  // ---------- sound: synthesized with Web Audio, no files ----------
  let ctx = null, master = null, noiseBuf = null, inhale = null;

  function audio() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createDynamicsCompressor();
      master.threshold.value = -18;
      master.ratio.value = 6;
      master.connect(ctx.destination);
      const len = Math.floor(ctx.sampleRate * 1.5);
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function distortion(k) {
    const n = 1024, c = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = i * 2 / n - 1;
      c[i] = (1 + k) * x / (1 + k * Math.abs(x));
    }
    return c;
  }

  // breathing in while the button is held
  function startInhale() {
    const c = audio(); if (!c) return;
    stopInhale();
    const t = c.currentTime, T = MAX_HOLD / 1000;
    const src = c.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(320, t);
    bp.frequency.exponentialRampToValueAtTime(1700, t + T);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + T);
    src.connect(bp).connect(g).connect(master);
    src.start();
    inhale = { src, g };
  }
  function stopInhale() {
    if (!inhale) return;
    const t = ctx.currentTime;
    inhale.g.gain.cancelScheduledValues(t);
    inhale.g.gain.setValueAtTime(Math.max(inhale.g.gain.value, 0.0001), t);
    inhale.g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    inhale.src.stop(t + 0.06);
    inhale = null;
  }

  // the burp itself; p = 0.3 (tap) … 1 (fully charged)
  function playBurp(p) {
    const c = audio(); if (!c) return;
    const t = c.currentTime;
    const dur = 0.28 + p * 0.85;
    const f0 = (150 - p * 80) * (0.92 + Math.random() * 0.16);
    const f1 = f0 * (0.5 - p * 0.12);

    const osc = c.createOscillator(); osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(f1, t + dur);

    const osc2 = c.createOscillator(); osc2.type = 'square';
    osc2.frequency.setValueAtTime(f0 * 1.01, t);
    osc2.frequency.exponentialRampToValueAtTime(f1 * 0.99, t + dur);
    const g2 = c.createGain(); g2.gain.value = 0.35;

    // gurgle: one LFO wobbles both loudness and pitch
    const lfo = c.createOscillator(); lfo.type = 'sine';
    lfo.frequency.setValueAtTime(14 + Math.random() * 10, t);
    lfo.frequency.linearRampToValueAtTime(9, t + dur);
    const trem = c.createGain(); trem.gain.value = 0.6;
    const lfoAmp = c.createGain(); lfoAmp.gain.value = 0.5;
    lfo.connect(lfoAmp); lfoAmp.connect(trem.gain);
    const lfoPitch = c.createGain(); lfoPitch.gain.value = f0 * 0.12;
    lfo.connect(lfoPitch); lfoPitch.connect(osc.frequency); lfoPitch.connect(osc2.frequency);

    const shaper = c.createWaveShaper();
    shaper.curve = distortion(30 + p * 70);
    shaper.oversample = '2x';

    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 5;
    lp.frequency.setValueAtTime(700 + p * 500, t);
    lp.frequency.exponentialRampToValueAtTime(180, t + dur);

    const noise = c.createBufferSource(); noise.buffer = noiseBuf;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.8;
    bp.frequency.setValueAtTime(900, t);
    bp.frequency.exponentialRampToValueAtTime(250, t + dur);
    const ng = c.createGain();
    ng.gain.setValueAtTime(0, t);
    ng.gain.linearRampToValueAtTime(0.25 + p * 0.2, t + 0.03);
    ng.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.8);

    const env = c.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.9, t + 0.025);
    env.gain.setValueAtTime(0.9, t + dur * 0.55);
    env.gain.exponentialRampToValueAtTime(0.001, t + dur);

    osc.connect(trem); osc2.connect(g2); g2.connect(trem);
    trem.connect(shaper); shaper.connect(lp); lp.connect(env);
    noise.connect(bp); bp.connect(ng); ng.connect(env);
    env.connect(master);

    [osc, osc2, lfo, noise].forEach(n => { n.start(t); n.stop(t + dur + 0.1); });
  }

  // ---------- visuals ----------
  function restart(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;            // reflow so the animation can replay
    el.classList.add(cls);
  }

  function puffs(p) {
    const n = Math.round(5 + p * 12);
    const base = stage.getBoundingClientRect().width;
    for (let i = 0; i < n; i++) {
      const el = document.createElement('i');
      el.className = 'puff';
      const ang = (-90 + (Math.random() - 0.5) * 120) * Math.PI / 180;
      const dist = base * (0.25 + Math.random() * 0.35) * (0.6 + p * 0.7);
      el.style.setProperty('--dx', (Math.cos(ang) * dist).toFixed(1) + 'px');
      el.style.setProperty('--dy', (Math.sin(ang) * dist - base * 0.05).toFixed(1) + 'px');
      el.style.setProperty('--sz', (base * (0.06 + Math.random() * 0.08) * (0.7 + p * 0.6)).toFixed(1) + 'px');
      el.style.setProperty('--s', (1.6 + Math.random() * 1.4).toFixed(2));
      el.style.setProperty('--t', Math.round(650 + Math.random() * 500 + p * 300) + 'ms');
      el.style.animationDelay = Math.round(Math.random() * 90) + 'ms';
      el.addEventListener('animationend', () => el.remove());
      fx.appendChild(el);
    }
  }

  let sayTimer = 0, sayDelay = 0;
  function speak(text, big) {
    clearTimeout(sayDelay); clearTimeout(sayTimer);
    sayDelay = setTimeout(() => {
      say.textContent = text;
      say.classList.add('on');
      sayTimer = setTimeout(() => say.classList.remove('on'), big ? 2200 : 1500);
    }, 420);
  }

  function burp(p) {
    count++;
    try { localStorage.setItem('rygayu-count', String(count)); } catch (e) {}
    countNum.textContent = count;
    restart(countEl, 'pop');
    hint.classList.add('gone');

    playBurp(p);

    world.style.setProperty('--pow', p.toFixed(2));
    restart(inner, 'burping');
    restart(world, 'shaking');
    letters.forEach((l, i) => { l.style.animationDelay = (i * 55) + 'ms'; restart(l, 'wave'); });

    const big = p > 0.82;
    burst.textContent = pick(big ? BIG : WORDS);
    burst.style.setProperty('--sz', (0.8 + p * 0.9).toFixed(2));
    restart(burst, 'show');

    puffs(p);
    if (big || Math.random() < 0.55) speak(pick(LINES), big);
  }

  // ---------- input: tap = burp, hold = charge a bigger one ----------
  let charging = false, t0 = 0, raf = 0, charge = 0;

  function tick() {
    if (!charging) return;
    charge = Math.min(1, (performance.now() - t0) / MAX_HOLD);
    cat.style.setProperty('--charge', charge.toFixed(3));
    raf = requestAnimationFrame(tick);
  }
  function down(e) {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    if (charging) return;
    charging = true; t0 = performance.now(); charge = 0;
    cat.classList.add('charging');
    if (e.pointerId !== undefined) { try { cat.setPointerCapture(e.pointerId); } catch (err) {} }
    audio();
    startInhale();
    tick();
  }
  function up(e) {
    if (!charging) return;
    if (e) e.preventDefault();
    charging = false;
    cancelAnimationFrame(raf);
    cat.classList.remove('charging');
    cat.style.setProperty('--charge', '0');
    stopInhale();
    burp(0.3 + 0.7 * charge);
  }

  cat.addEventListener('pointerdown', down);
  cat.addEventListener('pointerup', up);
  cat.addEventListener('pointercancel', up);
  cat.addEventListener('contextmenu', e => e.preventDefault());
  cat.addEventListener('keydown', e => {
    if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) down(e);
  });
  cat.addEventListener('keyup', e => {
    if (e.key === ' ' || e.key === 'Enter') up(e);
  });
  window.addEventListener('blur', () => { if (charging) up(null); });
})();
