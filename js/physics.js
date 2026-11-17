/*
 * Deterministische Simulation mit festem Zeitschritt.
 * Wird vom Spiel, von der Flugbahn-Vorschau und vom Level-Löser (tools/) verwendet.
 *
 * Level-Elemente:
 *   barriers  Kapseln (x1/y1 → x2/y2, Radius r), optional move: { dx, dy, period, phase }
 *   rotors    drehende Kapseln um (x, y) mit Länge len, Radius r, speed (rad/s), Startwinkel angle
 *   mirrors   feste Reflektoren (wie Bouncer, gehören aber zum Level)
 *   zones     Sperrzonen (Rechtecke), in denen keine Bouncer gezeichnet werden dürfen
 *   pads      Bauflächen (Rechtecke); gibt es welche, darf nur dort gezeichnet werden
 */
(function (B) {
  'use strict';
  const G = B.geo;
  const TAU = Math.PI * 2;

  const RULES = {
    DT: 1 / 120,
    CUBE_SIZE: 36,     // sichtbarer Radius des Würfels
    CUBE_HALF: 22,     // halbe Kantenlänge des 3D-Würfels
    CUBE_R: 32,        // Kollisionsradius gegen Bouncer und Spiegel
    CUBE_HIT_R: 28,    // Kollisionsradius gegen Barrieren (etwas nachsichtiger)
    BOUNCER_R: 6,      // halbe Bouncer-Dicke
    MIRROR_R: 7,       // halbe Spiegel-Dicke
    MIN_LEN: 40,       // kürzester erlaubter Bouncer
    MAX_LEN: 420,      // längster erlaubter Bouncer
    MAX_TIME: 16,      // Sekunden bis „Zeit abgelaufen“
    CAPTURE_DUR: 0.8,  // Dauer der Einsaug-Animation
    ZONE_BARRIER: 10,  // Mindestabstand Bouncer ↔ Barriere
    ZONE_PORTAL: 26,   // … ↔ Portal
    ZONE_CUBE: 16,     // … ↔ Würfel-Start
    BOUNCER_GAP: 8,    // … ↔ andere Bouncer / Spiegel
  };
  const DT = RULES.DT;

  // Kleinster Bereich, der immer spielbar ist (Level werden darin entworfen und geprüft)
  const DESIGN_BOUNDS = { x0: 0, y0: 0, x1: 1600, y1: 900 };

  /* ---------- Bewegliche Teile ---------- */

  const tmp = { ax: 0, ay: 0, bx: 0, by: 0, r: 0 };

  function barrierAt(br, t, out) {
    let ox = 0, oy = 0;
    if (br.move) {
      const s = Math.sin((TAU * t) / br.move.period + (br.move.phase || 0));
      ox = br.move.dx * s;
      oy = br.move.dy * s;
    }
    out.ax = br.x1 + ox; out.ay = br.y1 + oy;
    out.bx = br.x2 + ox; out.by = br.y2 + oy;
    out.r = br.r;
    return out;
  }

  function rotorAt(ro, t, out) {
    const a = ro.angle + ro.speed * t;
    const c = (Math.cos(a) * ro.len) / 2, s = (Math.sin(a) * ro.len) / 2;
    out.ax = ro.x - c; out.ay = ro.y - s;
    out.bx = ro.x + c; out.by = ro.y + s;
    out.r = ro.r;
    return out;
  }

  /* ---------- Simulation ---------- */

  function createSim(level, bounds) {
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
      bounds: bounds || DESIGN_BOUNDS,
    };
  }

  function fail(sim, reason, events) {
    sim.state = 'failed';
    sim.reason = reason;
    if (events) events.push({ type: 'fail', reason, x: sim.pos.x, y: sim.pos.y });
  }

  // Reflexion an einer Strecke; gibt true zurück, wenn ein Abprall stattfand
  function reflect(sim, ax, ay, bx, by, rad, events, kind, index) {
    const minD = RULES.CUBE_R + rad;
    const abx = bx - ax, aby = by - ay;
    const len2 = abx * abx + aby * aby;
    let t = len2 > 0 ? ((sim.pos.x - ax) * abx + (sim.pos.y - ay) * aby) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx = ax + abx * t, cy = ay + aby * t;
    let nx = sim.pos.x - cx, ny = sim.pos.y - cy;
    const dist = Math.sqrt(nx * nx + ny * ny);
    if (dist >= minD) return false;
    if (dist < 1e-6) {
      const L = Math.sqrt(len2) || 1;
      nx = -aby / L; ny = abx / L;
      if (nx * sim.vel.x + ny * sim.vel.y > 0) { nx = -nx; ny = -ny; }
    } else {
      nx /= dist; ny /= dist;
    }
    const vn = sim.vel.x * nx + sim.vel.y * ny;
    let bounced = false;
    if (vn < 0) {
      sim.vel.x -= 2 * vn * nx;
      sim.vel.y -= 2 * vn * ny;
      sim.bounces++;
      const tangential = sim.vel.x * -ny + sim.vel.y * nx;
      sim.spin += (tangential >= 0 ? 1 : -1) * 7;
      if (events) events.push({ type: 'bounce', kind, index, x: cx, y: cy, n: sim.bounces });
      bounced = true;
    }
    sim.pos.x += nx * (minD - dist);
    sim.pos.y += ny * (minD - dist);
    return bounced;
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
    const t = sim.t;

    // Sog des Portals: Zug zur Mitte + Dämpfung der Querbewegung
    {
      const dx = P.x - sim.pos.x, dy = P.y - sim.pos.y;
      const d = Math.sqrt(dx * dx + dy * dy);
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

    // Feste Spiegel und gezeichnete Bouncer reflektieren
    const mirrors = level.mirrors;
    for (let i = 0; i < mirrors.length; i++) {
      const m = mirrors[i];
      reflect(sim, m.x1, m.y1, m.x2, m.y2, RULES.MIRROR_R, events, 'mirror', i);
    }
    for (let i = 0; i < bouncers.length; i++) {
      const b = bouncers[i];
      reflect(sim, b.a.x, b.a.y, b.b.x, b.b.y, RULES.BOUNCER_R, events, 'bouncer', i);
    }

    // Barrieren und Rotoren zerstören den Würfel
    const px = sim.pos.x, py = sim.pos.y, hr = RULES.CUBE_HIT_R;
    for (const br of level.barriers) {
      barrierAt(br, t, tmp);
      if (G.distPS(px, py, tmp.ax, tmp.ay, tmp.bx, tmp.by) < tmp.r + hr) { fail(sim, 'crash', events); return; }
    }
    for (const ro of level.rotors) {
      rotorAt(ro, t, tmp);
      if (G.distPS(px, py, tmp.ax, tmp.ay, tmp.bx, tmp.by) < tmp.r + hr) { fail(sim, 'crash', events); return; }
    }

    // Portal fängt den Würfel
    const dpx = px - P.x, dpy = py - P.y;
    const dp = Math.sqrt(dpx * dpx + dpy * dpy);
    if (dp < P.capture) {
      const crossZ = dpx * sim.vel.y - dpy * sim.vel.x;
      sim.state = 'capture';
      sim.capture = { t: 0, r0: dp, a0: Math.atan2(dpy, dpx), dir: crossZ >= 0 ? 1 : -1 };
      if (events) events.push({ type: 'capture', x: px, y: py });
      return;
    }

    // Spielfeld verlassen / Zeit abgelaufen
    const bd = sim.bounds, m = RULES.CUBE_R;
    if (px < bd.x0 - m || px > bd.x1 + m || py < bd.y0 - m || py > bd.y1 + m) {
      fail(sim, 'out', events); return;
    }
    if (t > RULES.MAX_TIME) { fail(sim, 'timeout', events); return; }

    sim.rot += sim.spin * DT;
    sim.spin *= Math.max(0, 1 - 1.6 * DT);
  }

  /** Berechnet die Flugbahn im Voraus (für die optionale Vorschau). */
  function predict(level, bouncers, maxTime, bounds) {
    const sim = createSim(level, bounds);
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

  /* ---------- Regeln fürs Platzieren ---------- */

  function portalZone(P) {
    return Math.max(P.rx, P.ry) + RULES.ZONE_PORTAL;
  }

  function rotorZone(ro) {
    return ro.len / 2 + ro.r + RULES.ZONE_BARRIER;
  }

  /** Mindestabstand einer Strecke zu einer (evtl. beweglichen) Barriere über ihren ganzen Weg. */
  function barrierClearance(br, a, b) {
    if (!br.move) {
      return G.distSegSeg(a, b, { x: br.x1, y: br.y1 }, { x: br.x2, y: br.y2 });
    }
    let min = Infinity;
    for (let i = 0; i <= 16; i++) {
      const s = -1 + i / 8;
      const ox = br.move.dx * s, oy = br.move.dy * s;
      const d = G.distSegSeg(a, b, { x: br.x1 + ox, y: br.y1 + oy }, { x: br.x2 + ox, y: br.y2 + oy });
      if (d < min) min = d;
    }
    return min;
  }

  /**
   * Prüft, ob ein Bouncer an dieser Stelle liegen darf.
   * opts.bounds: spielbarer Bereich, opts.ignore: Index eines Bouncers, der gerade bearbeitet wird
   */
  function validateBouncer(level, bouncers, a, b, opts) {
    opts = opts || {};
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < RULES.MIN_LEN) return { ok: false, reason: 'Zu kurz', short: true };
    if (len > RULES.MAX_LEN + 0.5) return { ok: false, reason: 'Zu lang' };

    const bd = opts.bounds || DESIGN_BOUNDS, m = 6;
    for (const p of [a, b]) {
      if (p.x < bd.x0 + m || p.y < bd.y0 + m || p.x > bd.x1 - m || p.y > bd.y1 - m) {
        return { ok: false, reason: 'Außerhalb des Spielfelds' };
      }
    }
    if (level.pads.length) {
      const inset = RULES.BOUNCER_R;
      const inside = (p, r) => p.x >= r.x + inset && p.x <= r.x + r.w - inset && p.y >= r.y + inset && p.y <= r.y + r.h - inset;
      if (!level.pads.some((r) => inside(a, r) && inside(b, r))) return { ok: false, reason: 'Nur auf Bauflächen' };
    }
    for (const z of level.zones) {
      if (G.segRectIntersect(a, b, z, RULES.BOUNCER_R)) return { ok: false, reason: 'In einer Sperrzone' };
    }
    for (const br of level.barriers) {
      if (barrierClearance(br, a, b) < br.r + RULES.ZONE_BARRIER) {
        return { ok: false, reason: br.move ? 'Im Weg einer beweglichen Barriere' : 'Zu nah an der Barriere' };
      }
    }
    for (const ro of level.rotors) {
      if (G.distPointSeg(ro, a, b) < rotorZone(ro)) return { ok: false, reason: 'Im Bereich eines Rotors' };
    }
    for (const mi of level.mirrors) {
      const d = G.distSegSeg(a, b, { x: mi.x1, y: mi.y1 }, { x: mi.x2, y: mi.y2 });
      if (d < RULES.MIRROR_R + RULES.BOUNCER_R + RULES.BOUNCER_GAP) return { ok: false, reason: 'Berührt einen Spiegel' };
    }
    if (G.distPointSeg(level.portal, a, b) < portalZone(level.portal)) {
      return { ok: false, reason: 'Zu nah am Portal' };
    }
    if (G.distPointSeg(level.cube, a, b) < RULES.CUBE_R + RULES.ZONE_CUBE) {
      return { ok: false, reason: 'Zu nah am Würfel' };
    }
    for (let i = 0; i < bouncers.length; i++) {
      if (i === opts.ignore) continue;
      const o = bouncers[i];
      if (G.distSegSeg(a, b, o.a, o.b) < RULES.BOUNCER_R * 2 + RULES.BOUNCER_GAP) {
        return { ok: false, reason: 'Berührt einen anderen Bouncer' };
      }
    }
    return { ok: true };
  }

  B.RULES = RULES;
  B.physics = {
    DESIGN_BOUNDS, createSim, step, predict, validateBouncer,
    portalZone, rotorZone, barrierAt, rotorAt,
  };
})(globalThis.Bouncer = globalThis.Bouncer || {});
