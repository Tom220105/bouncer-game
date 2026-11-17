/* Spielzustand, Eingabe (Zeichnen von Bouncern) und Hauptschleife */
(function (B) {
  'use strict';

  const G = B.geo;
  const R = B.RULES;
  const PH = B.physics;
  const TAU = Math.PI * 2;

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const view = { scale: 1, ox: 0, oy: 0, dpr: 1 };

  const g = {
    levelIndex: 0,
    level: null,
    bouncers: [],       // { a, b, born, flash }
    mode: 'build',      // build | run | capture | failed | won
    sim: null,
    trail: [],
    drawing: null,      // { id, points, fit, valid, reason, short }
    pressed: null,      // Klick auf vorhandenen Bouncer (zum Entfernen)
    hover: -1,
    particles: [],
    rings: [],
    preview: null,
    previewDirty: true,
    clock: 0,
    acc: 0,
    last: 0,
    shake: 0,
    portalPulse: 0,
    failTimer: 0,
    winTimer: 0,
    cubeHidden: false,
    moteTimer: 0,
    lastResult: null,
  };

  /* ---------- Level & Ablauf ---------- */

  // Die orange „Schiene“ links vom Würfel (wie im Konzeptbild)
  function railTrail() {
    const c = g.level.cube;
    return [
      { x: c.x - Math.cos(c.angle) * 4000, y: c.y - Math.sin(c.angle) * 4000 },
      { x: c.x, y: c.y },
    ];
  }

  function loadLevel(index) {
    const lvl = B.LEVELS[index];
    if (!lvl) return;
    g.levelIndex = index;
    g.level = lvl;
    g.bouncers = [];
    g.particles = [];
    g.rings = [];
    cancelDrawing();
    B.progress.lastLevel = index;
    B.ui.onLevelLoaded(lvl, index);
    resetRun();
  }

  function selectLevel(index) {
    if (index === g.levelIndex && g.level) {
      if (g.mode !== 'build') resetRun();
    } else {
      loadLevel(index);
    }
  }

  function resetRun() {
    g.mode = 'build';
    g.sim = null;
    g.trail = railTrail();
    g.failTimer = 0;
    g.winTimer = 0;
    g.cubeHidden = false;
    g.acc = 0;
    g.previewDirty = true;
    B.ui.onModeChange('build');
    updateCounter();
  }

  function start() {
    if (g.mode !== 'build') return;
    cancelDrawing();
    g.hover = -1;
    g.sim = PH.createSim(g.level);
    g.trail = railTrail();
    g.mode = 'run';
    g.acc = 0;
    B.audio.play('start');
    B.ui.onModeChange('run');
    B.ui.hideHint();
  }

  function toggleRun() {
    if (g.mode === 'build') start();
    else if (g.mode === 'run' || g.mode === 'failed') resetRun();
  }

  function afterWin() {
    if (g.mode === 'won') resetRun();
  }

  function starsFor(used, par) {
    if (used <= par) return 3;
    if (used === par + 1) return 2;
    return 1;
  }

  /* ---------- Bouncer ---------- */

  function updateCounter() {
    B.ui.updateCounter(g.bouncers.length, g.level.maxBouncers);
  }

  function addBouncer(a, b) {
    g.bouncers.push({ a, b, born: g.clock, flash: 0 });
    g.previewDirty = true;
    B.audio.play('place');
    B.ui.hideHint();
    updateCounter();
  }

  function removeBouncer(i, silent) {
    const b = g.bouncers[i];
    if (!b) return;
    g.bouncers.splice(i, 1);
    dustAlong(b);
    if (!silent) B.audio.play('remove');
    g.hover = -1;
    g.previewDirty = true;
    updateCounter();
  }

  function undo() {
    if (g.mode === 'build' && g.bouncers.length) removeBouncer(g.bouncers.length - 1);
  }

  function clearAll() {
    if (g.mode !== 'build' || !g.bouncers.length) return;
    for (let i = g.bouncers.length - 1; i >= 0; i--) removeBouncer(i, true);
    B.audio.play('remove');
  }

  function hitBouncer(p, tol) {
    let best = -1, bd = tol;
    g.bouncers.forEach((b, i) => {
      const d = G.distPointSeg(p, b.a, b.b);
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }

  /* ---------- Zeichnen ---------- */

  function beginDrawing(p, id) {
    g.drawing = { id, points: [p], fit: null, valid: false, reason: '', short: true };
  }

  function extendDrawing(p) {
    const d = g.drawing;
    const last = d.points[d.points.length - 1];
    if (Math.hypot(p.x - last.x, p.y - last.y) < 2) return;
    d.points.push(p);
    refit();
  }

  function refit() {
    const d = g.drawing;
    if (!d) return;
    const snap = B.settings.snap ? Math.PI / 12 : 0;
    d.fit = G.fitStroke(d.points, snap, R.MAX_LEN);
    if (!d.fit) return;
    const v = PH.validateBouncer(g.level, g.bouncers, d.fit.a, d.fit.b);
    d.valid = v.ok;
    d.reason = v.reason || '';
    d.short = !!v.short;
  }

  function finishDrawing() {
    const d = g.drawing;
    g.drawing = null;
    if (!d || !d.fit || d.fit.length < 12) return; // nur ein Klick
    if (!d.valid) {
      B.audio.play('error');
      B.ui.toast(d.reason, 'bad');
      return;
    }
    addBouncer(d.fit.a, d.fit.b);
  }

  function cancelDrawing() {
    g.drawing = null;
    g.pressed = null;
  }

  /* ---------- Effekte ---------- */

  function spawn(p) {
    if (g.particles.length < 600) g.particles.push(p);
  }

  function burst(x, y, n, o) {
    for (let i = 0; i < n; i++) {
      const ang = o.angle != null ? o.angle + (Math.random() - 0.5) * o.spread : Math.random() * TAU;
      const sp = o.min + Math.random() * (o.max - o.min);
      const life = o.life * (0.6 + Math.random() * 0.4);
      spawn({
        kind: o.kind || 'spark', x, y,
        vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
        life, max: life,
        size: o.size * (0.6 + Math.random() * 0.6),
        drag: o.drag == null ? 3 : o.drag,
        rot: Math.random() * TAU,
        vr: (Math.random() - 0.5) * 14,
      });
    }
  }

  function ring(x, y, r0, r1, life, squash, width) {
    g.rings.push({ x, y, r0, r1, life, max: life, squash: squash || 1, width: width || 3 });
  }

  function dustAlong(b) {
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      burst(b.a.x + (b.b.x - b.a.x) * t, b.a.y + (b.b.y - b.a.y) * t, 2,
        { kind: 'dust', min: 10, max: 70, life: 0.5, size: 3, drag: 4 });
    }
  }

  // Kleine Partikel, die ständig ins Portal gesogen werden
  function spawnMotes(dt) {
    const P = g.level.portal;
    g.moteTimer -= dt;
    while (g.moteTimer <= 0) {
      g.moteTimer += 0.07;
      const a = Math.random() * TAU;
      const rr = 1.6 + Math.random() * 1.4;
      const x = P.x + Math.cos(a) * P.rx * rr * 1.5;
      const y = P.y + Math.sin(a) * P.ry * rr * 0.9;
      const dx = P.x - x, dy = P.y - y, d = Math.hypot(dx, dy);
      const sp = 40 + Math.random() * 50;
      const tw = 0.35;
      const life = (d / sp) * 0.85;
      spawn({
        kind: 'mote', x, y,
        vx: (dx / d) * sp - (dy / d) * sp * tw,
        vy: (dy / d) * sp + (dx / d) * sp * tw,
        life, max: life, size: 1 + Math.random() * 1.4, drag: 0, rot: 0, vr: 0,
      });
    }
  }

  function updateParticles(dt) {
    for (let i = g.particles.length - 1; i >= 0; i--) {
      const p = g.particles[i];
      p.life -= dt;
      if (p.life <= 0) { g.particles.splice(i, 1); continue; }
      const f = Math.max(0, 1 - p.drag * dt);
      p.vx *= f;
      p.vy *= f;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
    for (let i = g.rings.length - 1; i >= 0; i--) {
      g.rings[i].life -= dt;
      if (g.rings[i].life <= 0) g.rings.splice(i, 1);
    }
  }

  /* ---------- Simulation ---------- */

  function recordTrail() {
    if (g.sim.state !== 'run') return;
    const p = g.sim.pos;
    const last = g.trail[g.trail.length - 1];
    if (Math.hypot(p.x - last.x, p.y - last.y) > 5) g.trail.push({ x: p.x, y: p.y });
  }

  function handleEvents(events) {
    for (const ev of events) {
      if (ev.type === 'bounce') {
        const b = g.bouncers[ev.index];
        if (b) b.flash = 1;
        const v = g.sim.vel;
        burst(ev.x, ev.y, 14, { angle: Math.atan2(v.y, v.x), spread: 1.6, min: 120, max: 420, life: 0.35, size: 2.2, drag: 5 });
        ring(ev.x, ev.y, 6, 46, 0.35, 1, 2);
        B.audio.play('bounce', ev.n - 1);
      } else if (ev.type === 'fail') {
        g.mode = 'failed';
        g.failTimer = 1.35;
        g.trail.push({ x: ev.x, y: ev.y });
        if (ev.reason === 'crash') {
          g.cubeHidden = true;
          g.shake = 1;
          burst(ev.x, ev.y, 22, { kind: 'shard', min: 80, max: 380, life: 1.0, size: 9, drag: 2.2 });
          burst(ev.x, ev.y, 18, { min: 150, max: 500, life: 0.4, size: 2, drag: 5 });
          B.audio.play('crash');
          B.ui.toast('Würfel an der Barriere zerschellt', 'bad');
        } else if (ev.reason === 'out') {
          B.audio.play('out');
          B.ui.toast('Würfel hat das Spielfeld verlassen', 'bad');
        } else {
          B.audio.play('out');
          B.ui.toast('Zeit abgelaufen', 'bad');
        }
        B.ui.onModeChange('failed');
      } else if (ev.type === 'capture') {
        g.mode = 'capture';
        g.portalPulse = 1;
        g.trail.push({ x: ev.x, y: ev.y });
        B.audio.play('capture');
        B.ui.onModeChange('capture');
      } else if (ev.type === 'won') {
        const P = g.level.portal;
        g.mode = 'won';
        g.cubeHidden = true;
        g.portalPulse = 1.4;
        g.winTimer = 0.55;
        ring(P.x, P.y, P.rx, P.rx * 4, 0.9, P.ry / P.rx, 4);
        ring(P.x, P.y, P.rx * 0.5, P.rx * 2.6, 0.7, P.ry / P.rx, 2);
        burst(P.x, P.y, 40, { min: 100, max: 520, life: 0.7, size: 2.4, drag: 3 });
        B.audio.play('win');
        const used = g.bouncers.length;
        const stars = starsFor(used, g.level.par);
        const improved = B.progress.record(g.level.id, stars, used);
        g.lastResult = { stars, used, par: g.level.par, improved };
        B.ui.onModeChange('won');
      }
    }
  }

  function update(dt, paused) {
    g.clock += dt;
    g.shake = Math.max(0, g.shake - dt * 3.5);
    g.portalPulse = Math.max(0, g.portalPulse - dt * 1.6);
    for (const b of g.bouncers) b.flash = Math.max(0, b.flash - dt * 3);

    if (!paused) {
      if (g.mode === 'run' || g.mode === 'capture') {
        g.acc += dt;
        const events = [];
        let guard = 0;
        while (g.acc >= R.DT && guard++ < 24) {
          PH.step(g.sim, g.level, g.bouncers, events);
          g.acc -= R.DT;
          recordTrail();
          if (g.sim.state === 'failed' || g.sim.state === 'won') { g.acc = 0; break; }
        }
        if (events.length) handleEvents(events);
      } else if (g.mode === 'failed') {
        g.failTimer -= dt;
        if (g.failTimer <= 0) resetRun();
      } else if (g.mode === 'won' && g.winTimer > 0) {
        g.winTimer -= dt;
        if (g.winTimer <= 0) B.ui.showWin(g.lastResult, g.levelIndex);
      }
    }
    updateParticles(dt);
    spawnMotes(dt);
  }

  function updatePreview() {
    if (!B.settings.preview || g.mode !== 'build' || !g.previewDirty) return;
    g.previewDirty = false;
    g.preview = PH.predict(g.level, g.bouncers, 6);
  }

  /* ---------- Eingabe ---------- */

  function toWorld(e) {
    const r = canvas.getBoundingClientRect();
    const x = (e.clientX - r.left) * view.dpr;
    const y = (e.clientY - r.top) * view.dpr;
    return { x: (x - view.ox) / view.scale, y: (y - view.oy) / view.scale };
  }

  function onPointerDown(e) {
    B.audio.unlock();
    if (B.ui.isModalOpen() || g.mode !== 'build') return;
    const p = toWorld(e);
    if (e.pointerType === 'mouse' && e.button === 2) {
      const i = hitBouncer(p, 16);
      if (i >= 0) removeBouncer(i);
      return;
    }
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (g.drawing || g.pressed) return; // zweiter Finger
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* egal */ }
    const hit = hitBouncer(p, e.pointerType === 'touch' ? 24 : 14);
    if (hit >= 0) {
      g.pressed = { id: e.pointerId, index: hit, x: p.x, y: p.y };
      return;
    }
    beginDrawing(p, e.pointerId);
  }

  function onPointerMove(e) {
    const p = toWorld(e);
    if (g.drawing && e.pointerId === g.drawing.id) {
      extendDrawing(p);
      return;
    }
    if (g.pressed && e.pointerId === g.pressed.id) {
      // Bewegt man sich vom Bouncer weg, wird daraus ein neuer Strich
      if (Math.hypot(p.x - g.pressed.x, p.y - g.pressed.y) > 10) {
        const startP = { x: g.pressed.x, y: g.pressed.y };
        const id = g.pressed.id;
        g.pressed = null;
        beginDrawing(startP, id);
        extendDrawing(p);
      }
      return;
    }
    if (e.pointerType === 'mouse' && g.mode === 'build' && !B.ui.isModalOpen()) {
      g.hover = hitBouncer(p, 14);
      canvas.style.cursor = g.hover >= 0 ? 'pointer' : '';
    }
  }

  function onPointerUp(e) {
    if (g.drawing && e.pointerId === g.drawing.id) {
      finishDrawing();
    } else if (g.pressed && e.pointerId === g.pressed.id) {
      const i = g.pressed.index;
      g.pressed = null;
      removeBouncer(i);
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      if (B.ui.closeTopModal()) return;
      cancelDrawing();
      return;
    }
    if (B.ui.isModalOpen()) return;
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    if (e.code === 'Space' || e.key === 'Enter') {
      if (tag === 'BUTTON') return; // Button übernimmt selbst
      e.preventDefault();
      B.audio.unlock();
      toggleRun();
    } else if ((e.key === 'z' || e.key === 'Z' || e.key === 'Backspace') && !e.altKey) {
      e.preventDefault();
      undo();
    }
  }

  /* ---------- Darstellung ---------- */

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth, h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    // Oben und unten Platz für das Overlay lassen
    const short = h < 520;
    const padTop = short ? 60 : w < 640 ? 64 : 76;
    const padBottom = short ? 52 : w < 640 ? 80 : 92;
    const padX = w < 640 ? 12 : 32;
    const availW = Math.max(100, w - padX * 2);
    const availH = Math.max(100, h - padTop - padBottom);
    const s = Math.min(availW / B.WORLD.w, availH / B.WORLD.h);
    view.dpr = dpr;
    view.scale = s * dpr;
    view.ox = ((w - B.WORLD.w * s) / 2) * dpr;
    view.oy = (padTop + (availH - B.WORLD.h * s) / 2) * dpr;
  }

  function frame(now) {
    const t = now / 1000;
    const dt = g.last ? Math.min(t - g.last, 1 / 20) : 0;
    g.last = t;
    const paused = B.ui.isModalOpen() && g.mode !== 'won';
    update(dt, paused);
    updatePreview();
    B.render.frame(ctx, view, g);
    requestAnimationFrame(frame);
  }

  function init() {
    resize();
    window.addEventListener('resize', resize);
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', cancelDrawing);
    canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') g.hover = -1; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', onKeyDown);
    requestAnimationFrame(frame);
  }

  function onSettingsChanged(key) {
    if (key === 'preview') g.previewDirty = true;
    if (key === 'snap' && g.drawing) refit();
  }

  B.game = {
    init, loadLevel, selectLevel, start, toggleRun, resetRun, afterWin,
    undo, clearAll, cancelDrawing, onSettingsChanged,
    get state() { return g; },
  };
})(globalThis.Bouncer = globalThis.Bouncer || {});
