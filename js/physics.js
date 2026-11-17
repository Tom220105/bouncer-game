/*
 * Deterministische Simulation mit festem Zeitschritt.
 * Wird sowohl vom Spiel als auch von der Flugbahn-Vorschau verwendet.
 */
(function (B) {
  'use strict';
  const G = B.geo;

  const RULES = {
    DT: 1 / 120,
    CUBE_SIZE: 36,     // sichtbarer Radius des Würfels (Sechseck)
    CUBE_R: 32,        // Kollisionsradius gegen Bouncer
    CUBE_HIT_R: 28,    // Kollisionsradius gegen Barrieren (etwas nachsichtiger)
    BOUNCER_R: 6,      // halbe Bouncer-Dicke
    MIN_LEN: 48,       // kürzester erlaubter Bouncer
    MAX_LEN: 340,      // längster erlaubter Bouncer
    MAX_TIME: 14,      // Sekunden bis „Zeit abgelaufen“
    CAPTURE_DUR: 0.8,  // Dauer der Einsaug-Animation
    ZONE_BARRIER: 14,  // Abstand, den Bouncer zur Barriere halten müssen
    ZONE_PORTAL: 26,   // … zum Portal
    ZONE_CUBE: 16,     // … zum Würfel-Start
    BOUNCER_GAP: 10,   // … zu anderen Bouncern
  };
  const DT = RULES.DT;

  function createSim(level) {
    const c = level.cube;
    return {
      t: 0,
      state: 'run',          // run | capture | won | failed
      reason: null,
      pos: { x: c.x, y: c.y },
      vel: { x: Math.cos(c.angle) * c.speed, y: Math.sin(c.angle) * c.speed },
      rot: 0,
      spin: 0,
      scale: 1,
      bounces: 0,
      capture: null,
    };
  }

  function fail(sim, reason, events) {
    sim.state = 'failed';
    sim.reason = reason;
    if (events) events.push({ type: 'fail', reason, x: sim.pos.x, y: sim.pos.y });
  }

  function step(sim, level, bouncers, events) {
    const P = level.portal;

    // Einsaug-Animation: Spirale ins Portal, Würfel schrumpft
    if (sim.state === 'capture') {
      const c = sim.capture;
      c.t += DT;
      const u = Math.min(1, c.t / RULES.CAPTURE_DUR);
      const e = 1 - Math.pow(1 - u, 3);
      const r = c.r0 * (1 - e);
      const a = c.a0 + c.dir * e * Math.PI * 1.2;
      sim.pos.x = P.x + Math.cos(a) * r;
      sim.pos.y = P.y + Math.sin(a) * r;
      sim.scale = 1 - Math.pow(u, 1.4);
      sim.rot += c.dir * DT * (5 + 20 * u);
      if (u >= 1) {
        sim.state = 'won';
        sim.scale = 0;
        if (events) events.push({ type: 'won' });
      }
      return;
    }
    if (sim.state !== 'run') return;

    sim.t += DT;

    // Sog des Portals: Zug zur Mitte + Dämpfung der Querbewegung
    {
      const dx = P.x - sim.pos.x, dy = P.y - sim.pos.y;
      const d = Math.hypot(dx, dy);
      if (d < P.attract && d > 1e-6) {
        const k = 1 - d / P.attract;
        const nx = dx / d, ny = dy / d;
        sim.vel.x += nx * P.pull * k * DT;
        sim.vel.y += ny * P.pull * k * DT;
        const vr = sim.vel.x * nx + sim.vel.y * ny;
        const damp = Math.max(0, 1 - P.swirl * k * DT);
        const tx = (sim.vel.x - vr * nx) * damp;
        const ty = (sim.vel.y - vr * ny) * damp;
        sim.vel.x = vr * nx + tx;
        sim.vel.y = vr * ny + ty;
      }
    }

    sim.pos.x += sim.vel.x * DT;
    sim.pos.y += sim.vel.y * DT;

    // Bouncer: Reflexion an der Strecke (abgerundete Enden ergeben sich aus dem nächsten Punkt)
    const minD = RULES.CUBE_R + RULES.BOUNCER_R;
    for (let i = 0; i < bouncers.length; i++) {
      const b = bouncers[i];
      const cp = G.closestPoint(sim.pos, b.a, b.b);
      let nx = sim.pos.x - cp.x, ny = sim.pos.y - cp.y;
      const dist = Math.hypot(nx, ny);
      if (dist >= minD) continue;
      if (dist < 1e-6) {
        const sx = b.b.x - b.a.x, sy = b.b.y - b.a.y;
        const L = Math.hypot(sx, sy) || 1;
        nx = -sy / L; ny = sx / L;
        if (nx * sim.vel.x + ny * sim.vel.y > 0) { nx = -nx; ny = -ny; }
      } else {
        nx /= dist; ny /= dist;
      }
      const vn = sim.vel.x * nx + sim.vel.y * ny;
      if (vn < 0) {
        sim.vel.x -= 2 * vn * nx;
        sim.vel.y -= 2 * vn * ny;
        sim.bounces++;
        const tangential = sim.vel.x * -ny + sim.vel.y * nx;
        sim.spin += (tangential >= 0 ? 1 : -1) * 7;
        if (events) events.push({ type: 'bounce', index: i, x: cp.x, y: cp.y, n: sim.bounces });
      }
      sim.pos.x += nx * (minD - dist);
      sim.pos.y += ny * (minD - dist);
    }

    // Barrieren
    for (const br of level.barriers) {
      const d = G.distPointSeg(sim.pos, { x: br.x1, y: br.y1 }, { x: br.x2, y: br.y2 });
      if (d < br.r + RULES.CUBE_HIT_R) { fail(sim, 'crash', events); return; }
    }

    // Portal fängt den Würfel
    const dp = Math.hypot(P.x - sim.pos.x, P.y - sim.pos.y);
    if (dp < P.capture) {
      const rx = sim.pos.x - P.x, ry = sim.pos.y - P.y;
      const crossZ = rx * sim.vel.y - ry * sim.vel.x;
      sim.state = 'capture';
      sim.capture = { t: 0, r0: dp, a0: Math.atan2(ry, rx), dir: crossZ >= 0 ? 1 : -1 };
      if (events) events.push({ type: 'capture', x: sim.pos.x, y: sim.pos.y });
      return;
    }

    // Spielfeld verlassen / Zeit abgelaufen
    const W = B.WORLD.w, H = B.WORLD.h, m = RULES.CUBE_R;
    if (sim.pos.x < -m || sim.pos.x > W + m || sim.pos.y < -m || sim.pos.y > H + m) {
      fail(sim, 'out', events); return;
    }
    if (sim.t > RULES.MAX_TIME) { fail(sim, 'timeout', events); return; }

    sim.rot += sim.spin * DT;
    sim.spin *= Math.max(0, 1 - 1.6 * DT);
  }

  /** Berechnet die Flugbahn im Voraus (für die optionale Vorschau). */
  function predict(level, bouncers, maxTime) {
    const sim = createSim(level);
    const pts = [{ x: sim.pos.x, y: sim.pos.y }];
    const maxSteps = Math.round((maxTime || 6) / DT);
    let n = 0;
    while (sim.state === 'run' && n < maxSteps) {
      step(sim, level, bouncers, null);
      n++;
      if (n % 3 === 0) pts.push({ x: sim.pos.x, y: sim.pos.y });
    }
    pts.push({ x: sim.pos.x, y: sim.pos.y });
    return { points: pts, state: sim.state, reason: sim.reason };
  }

  function portalZone(P) {
    return Math.max(P.rx, P.ry) + RULES.ZONE_PORTAL;
  }

  /** Prüft, ob ein Bouncer an dieser Stelle gesetzt werden darf. */
  function validateBouncer(level, bouncers, a, b) {
    if (bouncers.length >= level.maxBouncers) {
      return { ok: false, reason: `Maximal ${level.maxBouncers} Bouncer – klicke einen an, um ihn zu entfernen` };
    }
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < RULES.MIN_LEN) return { ok: false, reason: 'Zu kurz', short: true };

    const W = B.WORLD.w, H = B.WORLD.h, m = 6;
    for (const p of [a, b]) {
      if (p.x < m || p.y < m || p.x > W - m || p.y > H - m) {
        return { ok: false, reason: 'Außerhalb des Spielfelds' };
      }
    }
    for (const br of level.barriers) {
      const d = G.distSegSeg(a, b, { x: br.x1, y: br.y1 }, { x: br.x2, y: br.y2 });
      if (d < br.r + RULES.ZONE_BARRIER) return { ok: false, reason: 'Zu nah an der Barriere' };
    }
    if (G.distPointSeg(level.portal, a, b) < portalZone(level.portal)) {
      return { ok: false, reason: 'Zu nah am Portal' };
    }
    if (G.distPointSeg(level.cube, a, b) < RULES.CUBE_R + RULES.ZONE_CUBE) {
      return { ok: false, reason: 'Zu nah am Würfel' };
    }
    for (const o of bouncers) {
      if (G.distSegSeg(a, b, o.a, o.b) < RULES.BOUNCER_GAP) {
        return { ok: false, reason: 'Berührt einen anderen Bouncer' };
      }
    }
    return { ok: true };
  }

  B.RULES = RULES;
  B.physics = { createSim, step, predict, validateBouncer, portalZone };
})(globalThis.Bouncer = globalThis.Bouncer || {});
