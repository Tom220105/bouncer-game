/* Spielzustand, Bouncer-Steuerung (zeichnen, auswählen, verschieben, drehen) und Hauptschleife */
(function (B) {
  'use strict';

  const G = B.geo;
  const R = B.RULES;
  const PH = B.physics;
  const TAU = Math.PI * 2;
  const DEG = Math.PI / 180;
  const SNAP_STEP = 15 * DEG;   // Raster für „Winkel einrasten“
  const MAGNET = 2.5 * DEG;     // sanftes Einrasten auch ohne Einstellung
  const MAX_EXTEND = 300;       // so weit darf der Spielbereich über das Entwurfsfeld hinausgehen

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const view = { scale: 1, ox: 0, oy: 0, dpr: 1, css: 1 };

  const g = {
    levelIndex: 0,
    level: null,
    bouncers: [],       // { a, b, born, flash }
    mode: 'build',      // build | run | capture | failed | won
    sim: null,
    trail: [],
    drag: null,         // laufende Zeiger-Aktion (draw | move | handle)
    selected: -1,
    hover: -1,
    history: [],        // Schnappschüsse für „Rückgängig“
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
    bounds: Object.assign({}, PH.DESIGN_BOUNDS),
    yaw: Math.PI / 4,
    mirrorFlash: [],
    wheelAcc: 0,
    editAt: 0,
  };

  const px2w = (cssPx) => cssPx / view.css;   // Bildschirm-Pixel → Welteinheiten
  const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
  const copyPt = (p) => ({ x: p.x, y: p.y });
  const copyList = (list) => list.map((b) => ({ a: copyPt(b.a), b: copyPt(b.b) }));

  /* ---------- Level & Ablauf ---------- */

  // Die orange „Schiene“ hinter dem Würfel
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
    g.history = [];
    g.particles = [];
    g.rings = [];
    g.selected = -1;
    g.hover = -1;
    g.drag = null;
    g.mirrorFlash = lvl.mirrors.map(() => 0);
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

  function hasNext() {
    const n = g.levelIndex + 1;
    return n < B.LEVELS.length && B.progress.isUnlocked(n);
  }

  function nextLevel() {
    if (hasNext()) loadLevel(g.levelIndex + 1);
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
    cancelDrag();
    g.hover = -1;
    g.sim = PH.createSim(g.level, g.bounds);
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
    if (used <= par + 1) return 2;
    return 1;
  }

  /* ---------- Bouncer verwalten ---------- */

  function updateCounter() {
    B.ui.updateCounter(g.bouncers.length, g.level.par, g.history.length > 0);
  }

  function pushHistory(snapshot) {
    g.history.push(snapshot || copyList(g.bouncers));
    if (g.history.length > 100) g.history.shift();
  }

  function changed() {
    g.previewDirty = true;
    updateCounter();
  }

  function validate(a, b, ignore) {
    return PH.validateBouncer(g.level, g.bouncers, a, b, { bounds: g.bounds, ignore });
  }

  function addBouncer(a, b) {
    pushHistory();
    g.bouncers.push({ a, b, born: g.clock, flash: 0 });
    g.selected = g.bouncers.length - 1;
    B.audio.play('place');
    B.ui.hideHint();
    changed();
  }

  function removeBouncer(i) {
    const b = g.bouncers[i];
    if (!b) return;
    pushHistory();
    g.bouncers.splice(i, 1);
    dustAlong(b);
    B.audio.play('remove');
    g.selected = -1;
    g.hover = -1;
    changed();
  }

  function clearAll() {
    if (g.mode !== 'build' || !g.bouncers.length) return;
    pushHistory();
    for (const b of g.bouncers) dustAlong(b);
    g.bouncers = [];
    g.selected = -1;
    g.hover = -1;
    B.audio.play('remove');
    changed();
  }

  function undo() {
    if (g.mode !== 'build' || !g.history.length) return;
    cancelDrag();
    const snap = g.history.pop();
    g.bouncers = snap.map((b) => ({ a: b.a, b: b.b, born: -10, flash: 0 }));
    g.selected = -1;
    g.hover = -1;
    B.audio.play('remove');
    changed();
  }

  function hitBouncer(p, tol) {
    let best = -1, bd = tol;
    g.bouncers.forEach((b, i) => {
      const d = G.distPointSeg(p, b.a, b.b);
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }

  function snapAngle(a) {
    const n = Math.round(a / SNAP_STEP) * SNAP_STEP;
    if (B.settings.snap || Math.abs(a - n) < MAGNET) return n;
    return a;
  }

  // Kleine Änderungen per Rad/Tastatur werden zu einem Rückgängig-Schritt zusammengefasst
  function editStep() {
    const now = performance.now();
    if (now - g.editAt > 700) pushHistory();
    g.editAt = now;
  }

  function applyEdit(i, a, b) {
    const v = validate(a, b, i);
    if (!v.ok) {
      B.ui.toast(v.reason, 'bad');
      return false;
    }
    editStep();
    const bo = g.bouncers[i];
    bo.a = a;
    bo.b = b;
    g.selected = i;
    changed();
    return true;
  }

  function rotateBouncer(i, delta) {
    const b = g.bouncers[i];
    if (!b) return;
    const s = G.setSegAngle(b.a, b.b, G.segAngle(b.a, b.b) + delta);
    applyEdit(i, s.a, s.b);
  }

  function nudgeBouncer(i, dx, dy) {
    const b = g.bouncers[i];
    if (!b) return;
    applyEdit(i, { x: b.a.x + dx, y: b.a.y + dy }, { x: b.b.x + dx, y: b.b.y + dy });
  }

  /* ---------- Zeiger-Aktionen ---------- */

  function refitStroke(d) {
    const fit = G.fitStroke(d.points, 0, R.MAX_LEN);
    if (!fit) return;
    const s = G.setSegAngle(fit.a, fit.b, snapAngle(G.segAngle(fit.a, fit.b)));
    d.fit = { a: s.a, b: s.b, length: fit.length };
    const v = validate(s.a, s.b, -1);
    d.valid = v.ok;
    d.reason = v.reason || '';
    d.short = !!v.short;
  }

  function revalidate(d) {
    const b = g.bouncers[d.index];
    const v = validate(b.a, b.b, d.index);
    d.valid = v.ok;
    d.reason = v.reason || '';
  }

  function cancelDrag() {
    const d = g.drag;
    if (d && (d.kind === 'move' || d.kind === 'handle') && d.moved) {
      const b = g.bouncers[d.index];
      if (b) { b.a = d.orig.a; b.b = d.orig.b; }
      g.previewDirty = true;
    }
    g.drag = null;
  }

  function toWorld(e) {
    const r = canvas.getBoundingClientRect();
    const x = (e.clientX - r.left) * view.dpr;
    const y = (e.clientY - r.top) * view.dpr;
    return { x: (x - view.ox) / view.scale, y: (y - view.oy) / view.scale };
  }

  function isTouch(e) {
    return e.pointerType === 'touch' || e.pointerType === 'pen';
  }

  // Was liegt unter dem Zeiger? (für Klick und Mauszeiger)
  function pick(p, touch) {
    if (g.selected >= 0) {
      const b = g.bouncers[g.selected];
      if (b) {
        const del = G.deleteAnchor(b.a, b.b, px2w(30));
        if (dist(p, del) < px2w(touch ? 20 : 13)) return { what: 'delete', index: g.selected };
        const ht = px2w(touch ? 22 : 12);
        const da = dist(p, b.a), db = dist(p, b.b);
        if (Math.min(da, db) < ht) return { what: 'handle', index: g.selected, end: da <= db ? 'a' : 'b' };
      }
    }
    const hit = hitBouncer(p, px2w(touch ? 16 : 9) + R.BOUNCER_R);
    if (hit >= 0) return { what: 'bouncer', index: hit };
    return { what: 'empty' };
  }

  function onPointerDown(e) {
    B.audio.unlock();
    if (B.ui.isModalOpen() || g.mode !== 'build') return;
    const p = toWorld(e);
    const touch = isTouch(e);

    if (e.pointerType === 'mouse' && e.button === 2) {
      const i = hitBouncer(p, px2w(10) + R.BOUNCER_R);
      if (i >= 0) removeBouncer(i);
      return;
    }
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (g.drag) return; // zweiter Finger
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* egal */ }

    const target = pick(p, touch);
    const id = e.pointerId;
    if (target.what === 'delete') {
      removeBouncer(target.index);
    } else if (target.what === 'handle') {
      const b = g.bouncers[target.index];
      g.drag = {
        kind: 'handle', id, index: target.index, end: target.end,
        orig: { a: copyPt(b.a), b: copyPt(b.b) }, before: copyList(g.bouncers),
        moved: false, valid: true, reason: '',
      };
    } else if (target.what === 'bouncer') {
      const b = g.bouncers[target.index];
      g.selected = target.index;
      g.drag = {
        kind: 'move', id, index: target.index, start: p,
        orig: { a: copyPt(b.a), b: copyPt(b.b) }, before: copyList(g.bouncers),
        moved: false, valid: true, reason: '',
      };
    } else {
      g.selected = -1;
      g.drag = { kind: 'draw', id, points: [p], fit: null, valid: false, reason: '', short: true, moved: false };
    }
    updateCursor(p, touch);
  }

  function onPointerMove(e) {
    const p = toWorld(e);
    const d = g.drag;
    if (d && e.pointerId === d.id) {
      if (d.kind === 'draw') {
        const last = d.points[d.points.length - 1];
        if (dist(p, last) < 2) return;
        d.points.push(p);
        d.moved = true;
        refitStroke(d);
      } else if (d.kind === 'move') {
        const dx = p.x - d.start.x, dy = p.y - d.start.y;
        if (!d.moved && Math.hypot(dx, dy) < px2w(4)) return;
        d.moved = true;
        const b = g.bouncers[d.index];
        b.a = { x: d.orig.a.x + dx, y: d.orig.a.y + dy };
        b.b = { x: d.orig.b.x + dx, y: d.orig.b.y + dy };
        revalidate(d);
      } else if (d.kind === 'handle') {
        d.moved = true;
        const b = g.bouncers[d.index];
        const fixed = d.end === 'a' ? d.orig.b : d.orig.a;
        const ang = snapAngle(Math.atan2(p.y - fixed.y, p.x - fixed.x));
        const len = Math.min(R.MAX_LEN, Math.max(R.MIN_LEN, dist(p, fixed)));
        const moving = { x: fixed.x + Math.cos(ang) * len, y: fixed.y + Math.sin(ang) * len };
        if (d.end === 'a') { b.a = moving; b.b = copyPt(fixed); }
        else { b.b = moving; b.a = copyPt(fixed); }
        revalidate(d);
      }
      g.previewDirty = true;
      return;
    }
    if (e.pointerType === 'mouse' && g.mode === 'build' && !B.ui.isModalOpen()) {
      g.hover = hitBouncer(p, px2w(9) + R.BOUNCER_R);
      updateCursor(p, false);
    }
  }

  function onPointerUp(e) {
    const d = g.drag;
    if (!d || e.pointerId !== d.id) return;
    g.drag = null;
    if (d.kind === 'draw') {
      if (!d.fit || d.fit.length < 12) return; // nur ein Klick ins Leere
      if (!d.valid) {
        B.audio.play('error');
        B.ui.toast(d.reason, 'bad');
        return;
      }
      addBouncer(d.fit.a, d.fit.b);
    } else if (d.moved) {
      const b = g.bouncers[d.index];
      if (!d.valid) {
        b.a = d.orig.a;
        b.b = d.orig.b;
        B.audio.play('error');
        B.ui.toast(d.reason, 'bad');
      } else {
        pushHistory(d.before);
        B.audio.play('place');
      }
      changed();
    }
    updateCursor(toWorld(e), isTouch(e));
  }

  function updateCursor(p, touch) {
    if (g.mode !== 'build') { canvas.style.cursor = ''; return; }
    if (g.drag) { canvas.style.cursor = g.drag.kind === 'draw' ? 'crosshair' : 'grabbing'; return; }
    if (touch) return;
    const t = pick(p, false);
    canvas.style.cursor = t.what === 'delete' ? 'pointer'
      : t.what === 'handle' ? 'grab'
      : t.what === 'bouncer' ? (t.index === g.selected ? 'move' : 'pointer')
      : '';
  }

  function onWheel(e) {
    if (g.mode !== 'build' || B.ui.isModalOpen() || g.drag) return;
    const p = toWorld(e);
    let i = hitBouncer(p, px2w(14) + R.BOUNCER_R);
    if (i < 0) i = g.selected;
    if (i < 0) return;
    e.preventDefault();
    const delta = (e.deltaMode === 1 ? 33 : 1) * (Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX);
    g.wheelAcc += delta;
    const STEP = 100; // eine Mausrad-Raste ≈ 100 → 5°
    while (Math.abs(g.wheelAcc) >= STEP) {
      const dir = Math.sign(g.wheelAcc);
      g.wheelAcc -= dir * STEP;
      rotateBouncer(i, dir * (e.shiftKey ? 1 : 5) * DEG);
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      if (B.ui.closeTopModal()) return;
      if (g.drag) cancelDrag();
      else g.selected = -1;
      return;
    }
    if (B.ui.isModalOpen()) return;
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    const key = e.key.toLowerCase();

    if (e.code === 'Space' || e.key === 'Enter') {
      if (tag === 'BUTTON') return; // Button übernimmt selbst
      e.preventDefault();
      B.audio.unlock();
      toggleRun();
      return;
    }
    if (key === 'z' && !e.altKey) {
      e.preventDefault();
      undo();
      return;
    }
    if (g.mode !== 'build' || g.drag) return;
    const sel = g.selected;
    if ((e.key === 'Delete' || e.key === 'Backspace') && sel >= 0) {
      e.preventDefault();
      removeBouncer(sel);
    } else if ((key === 'q' || key === 'e') && sel >= 0) {
      e.preventDefault();
      rotateBouncer(sel, (key === 'q' ? -1 : 1) * (e.shiftKey ? 15 : 5) * DEG);
    } else if (e.key.startsWith('Arrow') && sel >= 0) {
      e.preventDefault();
      const s = e.shiftKey ? 20 : 4;
      const dx = e.key === 'ArrowLeft' ? -s : e.key === 'ArrowRight' ? s : 0;
      const dy = e.key === 'ArrowUp' ? -s : e.key === 'ArrowDown' ? s : 0;
      nudgeBouncer(sel, dx, dy);
    }
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
        if (ev.kind === 'mirror') g.mirrorFlash[ev.index] = 1;
        else if (g.bouncers[ev.index]) g.bouncers[ev.index].flash = 1;
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
    for (let i = 0; i < g.mirrorFlash.length; i++) g.mirrorFlash[i] = Math.max(0, g.mirrorFlash[i] - dt * 3);

    // Würfel dreht sich um die eigene Hochachse – im Flug schneller
    let rate = 0.9;
    if (g.mode === 'run' && g.sim) rate = 2.6 + Math.min(8, Math.abs(g.sim.spin) * 0.5);
    else if (g.mode === 'capture') rate = 11;
    else if (g.mode === 'failed' || g.mode === 'won') rate = 0;
    if (!paused) g.yaw = (g.yaw + rate * dt) % TAU;

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
        if (g.winTimer <= 0) B.ui.showWin(g.lastResult, g.levelIndex, hasNext());
      }
    }
    updateParticles(dt);
    spawnMotes(dt);
  }

  function updatePreview() {
    if (!B.settings.preview || g.mode !== 'build' || !g.previewDirty) return;
    g.previewDirty = false;
    g.preview = PH.predict(g.level, g.bouncers, 8, g.bounds);
  }

  /* ---------- Darstellung ---------- */

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth, h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    // Das Entwurfsfeld passt zwischen die Leisten; alles drumherum ist ebenfalls spielbar
    const short = h < 520;
    const padTop = short ? 52 : w < 640 ? 60 : 64;
    const padBottom = short ? 50 : w < 640 ? 74 : 80;
    const padX = w < 640 ? 8 : 16;
    const availW = Math.max(100, w - padX * 2);
    const availH = Math.max(100, h - padTop - padBottom);
    const s = Math.min(availW / B.WORLD.w, availH / B.WORLD.h);
    view.dpr = dpr;
    view.css = s;
    view.scale = s * dpr;
    view.ox = ((w - B.WORLD.w * s) / 2) * dpr;
    view.oy = (padTop + (availH - B.WORLD.h * s) / 2) * dpr;

    const vx0 = -view.ox / view.scale, vy0 = -view.oy / view.scale;
    const vx1 = (canvas.width - view.ox) / view.scale, vy1 = (canvas.height - view.oy) / view.scale;
    g.bounds = {
      x0: Math.max(vx0, -MAX_EXTEND),
      y0: Math.max(vy0, -MAX_EXTEND),
      x1: Math.min(vx1, B.WORLD.w + MAX_EXTEND),
      y1: Math.min(vy1, B.WORLD.h + MAX_EXTEND),
    };
    g.previewDirty = true;
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
    canvas.addEventListener('pointercancel', cancelDrag);
    canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !g.drag) g.hover = -1; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKeyDown);
    requestAnimationFrame(frame);
  }

  function onSettingsChanged(key) {
    if (key === 'preview') g.previewDirty = true;
    if (key === 'snap' && g.drag && g.drag.kind === 'draw') refitStroke(g.drag);
  }

  B.game = {
    init, loadLevel, selectLevel, nextLevel, hasNext, start, toggleRun, resetRun, afterWin,
    undo, clearAll, cancelDrag, onSettingsChanged, starsFor,
    get state() { return g; },
    get view() { return view; },
  };
})(globalThis.Bouncer = globalThis.Bouncer || {});
