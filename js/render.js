/* Zeichnet das Spielfeld auf das Canvas (Welt 1600 × 900, eingepasst ins Fenster) */
(function (B) {
  'use strict';

  const TAU = Math.PI * 2;
  const ORANGE = '#ff7a12';
  const ORANGE_GLOW = 'rgba(255,122,18,0.85)';
  const BG = '#1a1a1a';

  let px = 1;       // Gerätepixel pro Welteinheit (für gleichmäßige Glow-Stärke)
  let cssScale = 1; // CSS-Pixel pro Welteinheit (für lesbare Beschriftungen)
  let noise = null;

  /* ---------- Hilfen ---------- */

  function glow(ctx, color, blur) {
    if (B.settings.glow) {
      ctx.shadowColor = color;
      ctx.shadowBlur = blur * px;
    } else {
      ctx.shadowBlur = 0;
    }
  }

  function noGlow(ctx) {
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
  }

  function line(ctx, ax, ay, bx, by, color, width) {
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  function poly(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
  }

  function easeOutBack(x) {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
  }

  function makeNoise(ctx) {
    try {
      const c = document.createElement('canvas');
      c.width = c.height = 180;
      const n = c.getContext('2d');
      const img = n.createImageData(180, 180);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = (Math.random() * 255) | 0;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 9;
      }
      n.putImageData(img, 0, 0);
      return ctx.createPattern(c, 'repeat');
    } catch (e) {
      return null;
    }
  }

  /* ---------- Hintergrund ---------- */

  function drawBackground(ctx) {
    const cw = ctx.canvas.width, ch = ctx.canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, cw, ch);
    // Gleiche Grundfarbe in beiden Stopps, sonst mischt der Verlauf Grau hinein
    const vg = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.25, cw / 2, ch / 2, Math.hypot(cw, ch) * 0.6);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.32)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, cw, ch);
    if (!noise) noise = makeNoise(ctx);
    if (noise) {
      ctx.fillStyle = noise;
      ctx.fillRect(0, 0, cw, ch);
    }
  }

  // Dezente Eckmarken zeigen die Spielfeldgrenze
  function drawFrameMarks(ctx, W, H) {
    const s = 22;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, s); ctx.lineTo(0, 0); ctx.lineTo(s, 0);
    ctx.moveTo(W - s, 0); ctx.lineTo(W, 0); ctx.lineTo(W, s);
    ctx.moveTo(W, H - s); ctx.lineTo(W, H); ctx.lineTo(W - s, H);
    ctx.moveTo(s, H); ctx.lineTo(0, H); ctx.lineTo(0, H - s);
    ctx.stroke();
    ctx.restore();
  }

  /* ---------- Spielobjekte ---------- */

  function drawTrail(ctx, pts, head) {
    if (!pts.length) return;
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'butt';
    ctx.strokeStyle = ORANGE;
    ctx.lineWidth = 28;
    glow(ctx, 'rgba(255,122,18,0.35)', 14);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    if (head) ctx.lineTo(head.x, head.y);
    ctx.stroke();
    ctx.restore();
  }

  function drawBarrier(ctx, br, t) {
    const dx = br.x2 - br.x1, dy = br.y2 - br.y1;
    const len = Math.hypot(dx, dy);
    const L = len / 2 + br.r;
    const w = br.r;
    const tip = w * 1.1;

    ctx.save();
    ctx.translate((br.x1 + br.x2) / 2, (br.y1 + br.y2) / 2);
    ctx.rotate(Math.atan2(dy, dx));

    // Körper (gestreckter Sechskant)
    const outer = [[-L, 0], [-L + tip, -w], [L - tip, -w], [L, 0], [L - tip, w], [-L + tip, w]];
    poly(ctx, outer);
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 26 * px;
    const body = ctx.createLinearGradient(0, -w, 0, w);
    body.addColorStop(0, '#222');
    body.addColorStop(0.5, '#181818');
    body.addColorStop(1, '#111');
    ctx.fillStyle = body;
    ctx.fill();
    noGlow(ctx);
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#050505';
    ctx.stroke();

    // Innenkante
    const k = 0.72;
    poly(ctx, outer.map(([x, y]) => [x * (1 - (1 - k) * w / L), y * k]));
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.stroke();

    // Leuchtender Kern
    const flick = 0.9 + 0.1 * Math.sin(t * 3.1);
    ctx.lineCap = 'round';
    ctx.globalAlpha = flick;
    glow(ctx, ORANGE_GLOW, 16);
    line(ctx, -L + tip * 1.25, 0, L - tip * 1.25, 0, ORANGE, 5);
    noGlow(ctx);
    line(ctx, -L + tip * 1.3, 0, L - tip * 1.3, 0, 'rgba(255,226,195,0.85)', 1.4);
    ctx.restore();
  }

  function drawPortal(ctx, P, t, pulse) {
    const sq = P.ry / P.rx;
    const breathe = 1 + Math.sin(t * 2.2) * 0.02 + pulse * 0.1;
    ctx.save();
    ctx.translate(P.x, P.y);

    // Halo
    ctx.save();
    ctx.scale(1, sq);
    const haloR = P.rx * (3.2 + pulse);
    const halo = ctx.createRadialGradient(0, 0, P.rx * 0.6, 0, 0, haloR);
    halo.addColorStop(0, `rgba(255,122,18,${0.14 + pulse * 0.2})`);
    halo.addColorStop(1, 'rgba(255,122,18,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, haloR, 0, TAU);
    ctx.fill();

    // Schlund
    const well = ctx.createRadialGradient(0, 0, 0, 0, 0, P.rx * breathe);
    well.addColorStop(0, '#000');
    well.addColorStop(0.65, '#060504');
    well.addColorStop(1, '#1e1006');
    ctx.fillStyle = well;
    ctx.beginPath();
    ctx.arc(0, 0, P.rx * breathe, 0, TAU);
    ctx.fill();
    ctx.restore();

    // Wirbel im Inneren
    ctx.save();
    ctx.setLineDash([5, 9]);
    ctx.lineDashOffset = -t * 28;
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = 'rgba(255,122,18,0.28)';
    ctx.beginPath();
    ctx.ellipse(0, 0, P.rx * 0.6, P.ry * 0.62, 0, 0, TAU);
    ctx.stroke();
    ctx.lineDashOffset = t * 18;
    ctx.strokeStyle = 'rgba(255,122,18,0.14)';
    ctx.beginPath();
    ctx.ellipse(0, 0, P.rx * 0.3, P.ry * 0.34, 0, 0, TAU);
    ctx.stroke();
    ctx.restore();

    // Ring
    ctx.lineWidth = 4;
    ctx.strokeStyle = ORANGE;
    glow(ctx, 'rgba(255,122,18,0.95)', 18 + pulse * 30);
    ctx.beginPath();
    ctx.ellipse(0, 0, P.rx * breathe, P.ry * breathe, 0, 0, TAU);
    ctx.stroke();
    noGlow(ctx);
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(255,222,190,0.7)';
    ctx.stroke();

    // Äußere Klammern
    const brx = P.rx * 1.42 * breathe, bry = P.ry * 1.2 * breathe;
    const wob = Math.sin(t * 1.3) * 0.07;
    const span = 0.62;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.strokeStyle = ORANGE;
    glow(ctx, 'rgba(255,122,18,0.9)', 14 + pulse * 20);
    for (let i = 0; i < 4; i++) {
      const c = Math.PI / 4 + i * Math.PI / 2 + (i % 2 ? wob : -wob);
      ctx.beginPath();
      ctx.ellipse(0, 0, brx, bry, 0, c - span / 2, c + span / 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawBouncer(ctx, a, b, o) {
    o = o || {};
    let ax = a.x, ay = a.y, bx = b.x, by = b.y;
    const grow = o.grow == null || o.grow >= 1 ? 1 : easeOutBack(Math.max(0, o.grow));
    if (grow !== 1) {
      const mx = (ax + bx) / 2, my = (ay + by) / 2;
      ax = mx + (ax - mx) * grow; ay = my + (ay - my) * grow;
      bx = mx + (bx - mx) * grow; by = my + (by - my) * grow;
    }
    const flash = o.flash || 0;

    let core = ORANGE, glowCol = ORANGE_GLOW;
    if (o.state === 'invalid') { core = '#ff4a3d'; glowCol = 'rgba(255,74,61,0.8)'; }
    else if (o.state === 'neutral') { core = '#77726d'; glowCol = 'rgba(0,0,0,0)'; }
    else if (o.hover) { core = '#ffe2c8'; }

    ctx.save();
    ctx.globalAlpha = o.alpha == null ? 1 : o.alpha;
    ctx.lineCap = 'round';

    // Körper
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 12 * px;
    line(ctx, ax, ay, bx, by, '#060606', 15);
    noGlow(ctx);
    line(ctx, ax, ay, bx, by, '#232323', 11);

    // Leuchtkern
    glow(ctx, glowCol, 10 + flash * 22);
    line(ctx, ax, ay, bx, by, core, 3.2 + flash * 2.5);
    noGlow(ctx);
    if (flash > 0) line(ctx, ax, ay, bx, by, `rgba(255,240,222,${flash})`, 1.6);

    // Endknoten
    for (const [x, y] of [[ax, ay], [bx, by]]) {
      ctx.beginPath();
      ctx.arc(x, y, 4.5, 0, TAU);
      ctx.fillStyle = '#0d0d0d';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = core;
      ctx.stroke();
    }

    // Entfernen-Markierung beim Überfahren
    if (o.hover) {
      const L = Math.hypot(bx - ax, by - ay) || 1;
      let nx = -(by - ay) / L, ny = (bx - ax) / L;
      if (ny > 0) { nx = -nx; ny = -ny; }
      const mx = (ax + bx) / 2 + nx * 24, my = (ay + by) / 2 + ny * 24;
      ctx.beginPath();
      ctx.arc(mx, my, 10, 0, TAU);
      ctx.fillStyle = '#141414';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(mx - 3.5, my - 3.5); ctx.lineTo(mx + 3.5, my + 3.5);
      ctx.moveTo(mx + 3.5, my - 3.5); ctx.lineTo(mx - 3.5, my + 3.5);
      ctx.strokeStyle = '#fff';
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawCube(ctx, x, y, size, rot) {
    if (size <= 0.5) return;
    const s = size, cx = s * 0.8660254, hy = s / 2;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);

    // Schatten + Grundform
    poly(ctx, [[0, -s], [cx, -hy], [cx, hy], [0, s], [-cx, hy], [-cx, -hy]]);
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 20 * px;
    ctx.fillStyle = '#1c1c1c';
    ctx.fill();
    noGlow(ctx);

    // Oberseite
    const top = ctx.createLinearGradient(-cx, -s, cx, 0);
    top.addColorStop(0, '#565656');
    top.addColorStop(1, '#383838');
    poly(ctx, [[0, -s], [cx, -hy], [0, 0], [-cx, -hy]]);
    ctx.fillStyle = top;
    ctx.fill();

    // Linke Seite
    const left = ctx.createLinearGradient(-cx, 0, 0, 0);
    left.addColorStop(0, '#272727');
    left.addColorStop(1, '#1d1d1d');
    poly(ctx, [[-cx, -hy], [0, 0], [0, s], [-cx, hy]]);
    ctx.fillStyle = left;
    ctx.fill();

    // Rechte Seite
    const right = ctx.createLinearGradient(0, 0, cx, 0);
    right.addColorStop(0, '#2f2f2f');
    right.addColorStop(1, '#262626');
    poly(ctx, [[0, 0], [cx, -hy], [cx, hy], [0, s]]);
    ctx.fillStyle = right;
    ctx.fill();

    // Kanten
    ctx.lineJoin = 'round';
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(0, s);
    ctx.moveTo(0, 0); ctx.lineTo(-cx, -hy);
    ctx.moveTo(0, 0); ctx.lineTo(cx, -hy);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.moveTo(-cx, -hy); ctx.lineTo(0, -s); ctx.lineTo(cx, -hy);
    ctx.stroke();

    poly(ctx, [[0, -s], [cx, -hy], [cx, hy], [0, s], [-cx, hy], [-cx, -hy]]);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#070707';
    ctx.stroke();
    ctx.restore();
  }

  /* ---------- Zeichnen & Hilfsanzeigen ---------- */

  function capsulePath(ctx, x1, y1, x2, y2, r) {
    const dx = x2 - x1, dy = y2 - y1;
    const h = Math.hypot(dx, dy) / 2;
    ctx.save();
    ctx.translate((x1 + x2) / 2, (y1 + y2) / 2);
    ctx.rotate(Math.atan2(dy, dx));
    ctx.beginPath();
    ctx.moveTo(-h, -r);
    ctx.lineTo(h, -r);
    ctx.arc(h, 0, r, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(-h, r);
    ctx.arc(-h, 0, r, Math.PI / 2, Math.PI * 1.5);
    ctx.closePath();
    ctx.restore();
  }

  // Sperrzonen, die beim Zeichnen sichtbar werden
  function drawZones(ctx, L) {
    const R = B.RULES;
    ctx.save();
    ctx.setLineDash([5, 8]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255,90,74,0.22)';
    for (const br of L.barriers) {
      capsulePath(ctx, br.x1, br.y1, br.x2, br.y2, br.r + R.ZONE_BARRIER);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(L.portal.x, L.portal.y, B.physics.portalZone(L.portal), 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(L.cube.x, L.cube.y, R.CUBE_R + R.ZONE_CUBE, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  function drawLabel(ctx, a, b, text) {
    const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    let nx = -(b.y - a.y) / L, ny = (b.x - a.x) / L;
    if (ny > 0) { nx = -nx; ny = -ny; }
    // Schriftgröße in Welteinheiten so wählen, dass sie auf dem Bildschirm ~13 px ergibt
    const u = Math.max(1, 1 / cssScale);
    const fs = 13 * u, bh = 26 * u;
    const off = 24 + 18 * u;
    const x = (a.x + b.x) / 2 + nx * off, y = (a.y + b.y) / 2 + ny * off;
    ctx.save();
    ctx.font = `600 ${fs}px -apple-system, "SF Pro Text", "Inter", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width + 20 * u;
    ctx.fillStyle = 'rgba(16,16,16,0.92)';
    ctx.strokeStyle = 'rgba(255,90,74,0.45)';
    ctx.lineWidth = u;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x - w / 2, y - bh / 2, w, bh, 7 * u);
    else ctx.rect(x - w / 2, y - bh / 2, w, bh);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffb3aa';
    ctx.fillText(text, x, y + 0.5);
    ctx.restore();
  }

  function drawStroke(ctx, d) {
    // Freihand-Strich (Rohdaten)
    if (d.points.length > 1) {
      ctx.save();
      ctx.setLineDash([3, 6]);
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.beginPath();
      ctx.moveTo(d.points[0].x, d.points[0].y);
      for (let i = 1; i < d.points.length; i++) ctx.lineTo(d.points[i].x, d.points[i].y);
      ctx.stroke();
      ctx.restore();
    }
    // Geglättete, gerade Vorschau
    if (d.fit && d.fit.length >= 12) {
      const state = d.valid ? 'ok' : d.short ? 'neutral' : 'invalid';
      drawBouncer(ctx, d.fit.a, d.fit.b, { alpha: 0.92, state });
      if (state === 'invalid') drawLabel(ctx, d.fit.a, d.fit.b, d.reason);
    }
  }

  function drawPreview(ctx, pv) {
    const pts = pv.points;
    if (pts.length < 2) return;
    ctx.save();
    ctx.setLineDash([8, 10]);
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(255,165,95,0.45)';
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
    ctx.setLineDash([]);
    const e = pts[pts.length - 1];
    if (pv.state === 'failed') {
      ctx.strokeStyle = 'rgba(255,90,74,0.8)';
      ctx.beginPath();
      ctx.moveTo(e.x - 7, e.y - 7); ctx.lineTo(e.x + 7, e.y + 7);
      ctx.moveTo(e.x + 7, e.y - 7); ctx.lineTo(e.x - 7, e.y + 7);
      ctx.stroke();
    } else if (pv.state === 'capture' || pv.state === 'won') {
      ctx.strokeStyle = 'rgba(255,165,95,0.8)';
      ctx.beginPath();
      ctx.arc(e.x, e.y, 8, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawParticles(ctx, parts, rings) {
    ctx.save();
    for (const r of rings) {
      const u = 1 - r.life / r.max;
      const rad = r.r0 + (r.r1 - r.r0) * (1 - Math.pow(1 - u, 2));
      ctx.globalAlpha = Math.max(0, 1 - u) * 0.8;
      ctx.lineWidth = r.width;
      ctx.strokeStyle = ORANGE;
      ctx.beginPath();
      ctx.ellipse(r.x, r.y, rad, rad * r.squash, 0, 0, TAU);
      ctx.stroke();
    }
    for (const p of parts) {
      const a = Math.max(0, p.life / p.max);
      if (p.kind === 'shard') {
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = a;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = '#2c2c2c';
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.strokeStyle = 'rgba(255,122,18,0.5)';
        ctx.lineWidth = 1;
        ctx.strokeRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      } else if (p.kind === 'mote') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = Math.min(1, a * 2) * 0.7;
        ctx.fillStyle = ORANGE;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, TAU);
        ctx.fill();
      } else if (p.kind === 'dust') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = a * 0.7;
        ctx.fillStyle = ORANGE;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      } else {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = a;
        ctx.strokeStyle = a > 0.5 ? '#ffd2a6' : ORANGE;
        ctx.lineWidth = p.size;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /* ---------- Frame ---------- */

  function frame(ctx, view, g) {
    const R = B.RULES;
    const W = B.WORLD.w, H = B.WORLD.h;
    drawBackground(ctx);

    const L = g.level;
    if (!L) return;

    let sx = 0, sy = 0;
    if (g.shake > 0) {
      const m = g.shake * g.shake * 12;
      sx = (Math.random() - 0.5) * m;
      sy = (Math.random() - 0.5) * m;
    }
    px = view.scale;
    cssScale = view.scale / (view.dpr || 1);
    ctx.setTransform(view.scale, 0, 0, view.scale, view.ox + sx * view.scale, view.oy + sy * view.scale);

    drawFrameMarks(ctx, W, H);
    if (g.drawing) drawZones(ctx, L);
    if (g.preview && B.settings.preview && g.mode === 'build') drawPreview(ctx, g.preview);

    const head = g.mode === 'run' && g.sim ? g.sim.pos : null;
    drawTrail(ctx, g.trail, head);

    for (const br of L.barriers) drawBarrier(ctx, br, g.clock);
    drawPortal(ctx, L.portal, g.clock, g.portalPulse);

    g.bouncers.forEach((b, i) => drawBouncer(ctx, b.a, b.b, {
      flash: b.flash,
      hover: i === g.hover && g.mode === 'build' && !g.drawing,
      grow: (g.clock - b.born) / 0.16,
    }));

    if (!g.cubeHidden) {
      const s = g.sim;
      const pos = s ? s.pos : L.cube;
      drawCube(ctx, pos.x, pos.y, R.CUBE_SIZE * (s ? s.scale : 1), s ? s.rot : 0);
    }

    drawParticles(ctx, g.particles, g.rings);
    if (g.drawing) drawStroke(ctx, g.drawing);
  }

  B.render = { frame };
})(globalThis.Bouncer = globalThis.Bouncer || {});
