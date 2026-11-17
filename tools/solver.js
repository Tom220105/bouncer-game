/*
 * Level-Löser (Entwicklerwerkzeug): sucht per Strahlsuche (beam search) eine Lösung
 * mit möglichst wenigen Bouncern. Dient zum Prüfen der Level und zum Bestimmen von „Par“.
 *
 * Idee: Entlang der aktuellen Flugbahn werden Bouncer so gesetzt, dass der Würfel in eine
 * von N Richtungen abprallt. Bewertet wird, wie nah die neue Bahn dem Portal kommt –
 * gemessen als Wegstrecke um Hindernisse herum (Distanzfeld auf einem Raster).
 */
(function (B) {
  'use strict';

  const PH = B.physics;
  const R = B.RULES;
  const G = B.geo;
  const TAU = Math.PI * 2;

  const DEFAULTS = {
    maxDepth: 7,      // maximale Bouncer-Anzahl
    beam: 40,         // Zustände pro Tiefe
    randomKeep: 16,   // zusätzliche Zufallszustände für Vielfalt
    angles: 48,       // Abprallrichtungen
    spacing: 26,      // Abstand der Ansatzpunkte entlang der Bahn
    length: 96,       // Länge der gesetzten Bouncer
    cell: 16,         // Rastergröße des Distanzfelds
  };

  function buildField(level, bounds, cell) {
    const cols = Math.ceil((bounds.x1 - bounds.x0) / cell);
    const rows = Math.ceil((bounds.y1 - bounds.y0) / cell);
    const n = cols * rows;
    const blocked = new Uint8Array(n);
    const dist = new Float32Array(n).fill(Infinity);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = bounds.x0 + (c + 0.5) * cell, y = bounds.y0 + (r + 0.5) * cell;
        let blk = false;
        for (const br of level.barriers) {
          if (br.move) continue;
          if (G.distPS(x, y, br.x1, br.y1, br.x2, br.y2) < br.r + R.CUBE_HIT_R) { blk = true; break; }
        }
        if (!blk) {
          for (const m of level.mirrors) {
            if (G.distPS(x, y, m.x1, m.y1, m.x2, m.y2) < R.MIRROR_R + R.CUBE_R * 0.8) { blk = true; break; }
          }
        }
        blocked[r * cols + c] = blk ? 1 : 0;
      }
    }
    const P = level.portal;
    const pc = Math.min(cols - 1, Math.max(0, Math.floor((P.x - bounds.x0) / cell)));
    const pr = Math.min(rows - 1, Math.max(0, Math.floor((P.y - bounds.y0) / cell)));
    const queue = new Int32Array(n);
    let head = 0, tail = 0;
    const start = pr * cols + pc;
    dist[start] = 0;
    blocked[start] = 0;
    queue[tail++] = start;
    while (head < tail) {
      const i = queue[head++];
      const r = (i / cols) | 0, c = i % cols;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const nr = r + dr, nc = c + dc;
          if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
          const j = nr * cols + nc;
          if (blocked[j] || dist[j] !== Infinity) continue;
          dist[j] = dist[i] + 1;
          queue[tail++] = j;
        }
      }
    }
    return { cols, rows, cell, x0: bounds.x0, y0: bounds.y0, dist };
  }

  function fieldAt(F, x, y) {
    const c = Math.floor((x - F.x0) / F.cell), r = Math.floor((y - F.y0) / F.cell);
    if (c < 0 || r < 0 || c >= F.cols || r >= F.rows) return 1e9;
    const d = F.dist[r * F.cols + c];
    return d === Infinity ? 1e9 : d * F.cell;
  }

  function snapOf(sim) {
    return { x: sim.pos.x, y: sim.pos.y, vx: sim.vel.x, vy: sim.vel.y, t: sim.t };
  }

  const isWin = (s) => s === 'capture' || s === 'won';

  /** Vollständige Simulation ab Start mit Ansatzpunkten entlang der Bahn. */
  function trace(level, bouncers, bounds, F, spacing) {
    const sim = PH.createSim(level, bounds);
    const snaps = [snapOf(sim)];
    let acc = 0, lx = sim.pos.x, ly = sim.pos.y, best = 1e9;
    while (sim.state === 'run') {
      PH.step(sim, level, bouncers, null);
      if (sim.state !== 'run') break;
      acc += Math.hypot(sim.pos.x - lx, sim.pos.y - ly);
      lx = sim.pos.x; ly = sim.pos.y;
      if (acc >= spacing) { snaps.push(snapOf(sim)); acc = 0; }
      const d = fieldAt(F, sim.pos.x, sim.pos.y);
      if (d < best) best = d;
    }
    return { won: isWin(sim.state), best, snaps, end: sim.state, reason: sim.reason };
  }

  /** Simulation ab einem Ansatzpunkt; liefert -1 bei Treffer, sonst die beste Restdistanz. */
  function scoreFrom(level, bouncers, bounds, F, snap) {
    const sim = PH.createSim(level, bounds);
    sim.pos.x = snap.x; sim.pos.y = snap.y;
    sim.vel.x = snap.vx; sim.vel.y = snap.vy;
    sim.t = snap.t;
    let best = 1e9;
    while (sim.state === 'run') {
      PH.step(sim, level, bouncers, null);
      const d = fieldAt(F, sim.pos.x, sim.pos.y);
      if (d < best) best = d;
    }
    return isWin(sim.state) ? -1 : best;
  }

  function fullCheck(level, bouncers, bounds) {
    const sim = PH.createSim(level, bounds);
    while (sim.state === 'run') PH.step(sim, level, bouncers, null);
    return isWin(sim.state);
  }

  const tick = () => new Promise((r) => setTimeout(r, 0));

  /**
   * Sucht eine Lösung. Gibt { solved, par, bouncers, ms, evaluated } zurück.
   * onProgress(info) wird zwischendurch aufgerufen.
   */
  async function solve(level, options, onProgress) {
    const o = Object.assign({}, DEFAULTS, options || {});
    const bounds = PH.DESIGN_BOUNDS;
    const F = buildField(level, bounds, o.cell);
    const t0 = performance.now();
    let evaluated = 0;

    const root = trace(level, [], bounds, F, o.spacing);
    if (root.won) return { solved: true, par: 0, bouncers: [], ms: performance.now() - t0, evaluated };

    let beam = [{ bouncers: [], tr: root }];
    const minD = R.CUBE_R + R.BOUNCER_R + 1;
    const h = o.length / 2;

    for (let depth = 1; depth <= o.maxDepth; depth++) {
      const cands = [];
      for (const st of beam) {
        const snaps = st.tr.snaps;
        for (let i = 1; i < snaps.length; i++) {
          const s = snaps[i];
          const sp = Math.hypot(s.vx, s.vy) || 1;
          const dix = s.vx / sp, diy = s.vy / sp;
          for (let k = 0; k < o.angles; k++) {
            const ang = (k * TAU) / o.angles;
            const dox = Math.cos(ang), doy = Math.sin(ang);
            if (dix * dox + diy * doy > 0.95) continue;
            let mx = dox - dix, my = doy - diy;
            const ml = Math.hypot(mx, my);
            mx /= ml; my /= ml;
            const cx = s.x - mx * minD, cy = s.y - my * minD;
            const tx = -my, ty = mx;
            const a = { x: cx - tx * h, y: cy - ty * h };
            const b = { x: cx + tx * h, y: cy + ty * h };
            if (!PH.validateBouncer(level, st.bouncers, a, b, { bounds }).ok) continue;
            const nb = st.bouncers.concat([{ a, b }]);
            const sc = scoreFrom(level, nb, bounds, F, snaps[i - 1]);
            evaluated++;
            if (sc < 0 && fullCheck(level, nb, bounds)) {
              return { solved: true, par: depth, bouncers: nb, ms: performance.now() - t0, evaluated };
            }
            // Schlüssel für Vielfalt: Lage des neuen Bouncers + grobe Abprallrichtung
            const key = `${Math.round(cx / 90)},${Math.round(cy / 90)},${Math.round((k / o.angles) * 8) % 8}`;
            cands.push({ bouncers: nb, score: sc < 0 ? 0 : sc, key });
          }
          if (evaluated % 400 === 0) await tick();
        }
      }
      if (!cands.length) break;
      cands.sort((p, q) => p.score - q.score);
      // Pro Schlüssel nur den besten Kandidaten – so bleiben auch Umwege im Rennen
      const seen = new Set();
      const diverse = [];
      const rest = [];
      for (const c of cands) {
        if (seen.has(c.key)) rest.push(c);
        else { seen.add(c.key); diverse.push(c); }
      }
      const next = diverse.slice(0, o.beam);
      const pool = diverse.slice(o.beam).concat(rest);
      for (let i = 0; i < o.randomKeep && pool.length; i++) {
        next.push(pool.splice((Math.random() * pool.length) | 0, 1)[0]);
      }
      beam = next.map((c) => ({ bouncers: c.bouncers, tr: trace(level, c.bouncers, bounds, F, o.spacing) }));
      for (const st of beam) {
        if (st.tr.won) return { solved: true, par: depth, bouncers: st.bouncers, ms: performance.now() - t0, evaluated };
      }
      if (onProgress) onProgress({ depth, evaluated, best: cands[0].score });
      await tick();
    }
    return { solved: false, par: null, bouncers: [], ms: performance.now() - t0, evaluated };
  }

  B.solver = { solve, buildField, fieldAt, fullCheck };
})(globalThis.Bouncer = globalThis.Bouncer || {});
