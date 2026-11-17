/* Zeichnet das Spielfeld auf das Canvas */
(function (B) {
  'use strict';

  const TAU = Math.PI * 2;
  const ORANGE = '#ff7a12';
  const ORANGE_GLOW = 'rgba(255,122,18,0.85)';
  const BG = '#1a1a1a';
  const FONT = '-apple-system, "SF Pro Text", "Inter", system-ui, sans-serif';

  let px = 1;       // Gerätepixel pro Welteinheit (für gleichmäßige Glow-Stärke)
  let cssScale = 1; // CSS-Pixel pro Welteinheit (für gleich große Bedienelemente)
  let noise = null;

  /** Bildschirm-Pixel → Welteinheiten (für Anfasser, Beschriftungen) */
  const ui = (cssPx) => cssPx / cssScale;

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

  function pill(ctx, x, y, text, kind) {
    const fs = ui(12), h = ui(24), padX = ui(9);
    ctx.save();
    ctx.font = `600 ${fs}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width + padX * 2;
    ctx.fillStyle = 'rgba(16,16,16,0.92)';
    ctx.strokeStyle = kind === 'bad' ? 'rgba(255,90,74,0.5)' : 'rgba(255,255,255,0.14)';
    ctx.lineWidth = ui(1);
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x - w / 2, y - h / 2, w, h, ui(7));
    else ctx.rect(x - w / 2, y - h / 2, w, h);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = kind === 'bad' ? '#ffb3aa' : '#ebe7e2';
    ctx.fillText(text, x, y + ui(0.5));
    ctx.restore();
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

  // Ist der spielbare Bereich kleiner als das Fenster, wird seine Grenze dezent markiert
  function drawBoundsFrame(ctx, view, bd) {
    const vx0 = -view.ox / view.scale, vy0 = -view.oy / view.scale;
    const vx1 = (ctx.canvas.width - view.ox) / view.scale, vy1 = (ctx.canvas.height - view.oy) / view.scale;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = ui(1);
    ctx.setLineDash([ui(4), ui(6)]);
    ctx.beginPath();
    if (bd.x0 > vx0 + 1) { ctx.moveTo(bd.x0, bd.y0); ctx.lineTo(bd.x0, bd.y1); }
    if (bd.x1 < vx1 - 1) { ctx.moveTo(bd.x1, bd.y0); ctx.lineTo(bd.x1, bd.y1); }
    if (bd.y0 > vy0 + 1) { ctx.moveTo(bd.x0, bd.y0); ctx.lineTo(bd.x1, bd.y0); }
    if (bd.y1 < vy1 - 1) { ctx.moveTo(bd.x0, bd.y1); ctx.lineTo(bd.x1, bd.y1); }
    ctx.stroke();
    ctx.restore();
  }

  /* ---------- Level-Elemente ---------- */

  function drawZone(ctx, z, active) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(z.x, z.y, z.w, z.h);
    ctx.fillStyle = active ? 'rgba(255,90,74,0.05)' : 'rgba(255,255,255,0.015)';
    ctx.fill();
    ctx.clip();
    ctx.strokeStyle = active ? 'rgba(255,90,74,0.16)' : 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const step = 18;
    for (let k = -z.h; k < z.w; k += step) {
      ctx.moveTo(z.x + k, z.y + z.h);
      ctx.lineTo(z.x + k + z.h, z.y);
    }
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = active ? 'rgba(255,90,74,0.45)' : 'rgba(255,255,255,0.12)';
    ctx.strokeRect(z.x, z.y, z.w, z.h);
    ctx.restore();
  }

  // Bauflächen: alles außerhalb wird schraffiert, die Flächen selbst bekommen Eckmarken
  function drawPads(ctx, pads, bd, active) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(bd.x0, bd.y0, bd.x1 - bd.x0, bd.y1 - bd.y0);
    for (const p of pads) ctx.rect(p.x, p.y, p.w, p.h);
    ctx.fillStyle = active ? 'rgba(255,90,74,0.045)' : 'rgba(255,255,255,0.012)';
    ctx.fill('evenodd');
    ctx.clip('evenodd');
    ctx.strokeStyle = active ? 'rgba(255,90,74,0.12)' : 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const h = bd.y1 - bd.y0;
    for (let k = -h; k < bd.x1 - bd.x0; k += 22) {
      ctx.moveTo(bd.x0 + k, bd.y1);
      ctx.lineTo(bd.x0 + k + h, bd.y0);
    }
    ctx.stroke();
    ctx.restore();

    ctx.save();
    for (const p of pads) {
      ctx.fillStyle = 'rgba(255,122,18,0.035)';
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.setLineDash([4, 6]);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(255,122,18,0.28)';
      ctx.strokeRect(p.x, p.y, p.w, p.h);
      ctx.setLineDash([]);
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255,122,18,0.7)';
      const c = 14;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y + c); ctx.lineTo(p.x, p.y); ctx.lineTo(p.x + c, p.y);
      ctx.moveTo(p.x + p.w - c, p.y); ctx.lineTo(p.x + p.w, p.y); ctx.lineTo(p.x + p.w, p.y + c);
      ctx.moveTo(p.x + p.w, p.y + p.h - c); ctx.lineTo(p.x + p.w, p.y + p.h); ctx.lineTo(p.x + p.w - c, p.y + p.h);
      ctx.moveTo(p.x + c, p.y + p.h); ctx.lineTo(p.x, p.y + p.h); ctx.lineTo(p.x, p.y + p.h - c);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawBarrierShape(ctx, ax, ay, bx, by, r, t, alpha) {
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy);
    ctx.save();
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.translate((ax + bx) / 2, (ay + by) / 2);

    if (len < 1) {
      // Säule: Sechseck mit leuchtendem Kern
      const pts = [];
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 6 + (i * TAU) / 6;
        pts.push([Math.cos(a) * r * 1.1, Math.sin(a) * r * 1.1]);
      }
      poly(ctx, pts);
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = 22 * px;
      const body = ctx.createLinearGradient(0, -r, 0, r);
      body.addColorStop(0, '#242424');
      body.addColorStop(1, '#121212');
      ctx.fillStyle = body;
      ctx.fill();
      noGlow(ctx);
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#050505';
      ctx.stroke();
      glow(ctx, ORANGE_GLOW, 14);
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.3, 0, TAU);
      ctx.lineWidth = 3;
      ctx.strokeStyle = ORANGE;
      ctx.stroke();
      ctx.restore();
      return;
    }

    const L = len / 2 + r;
    const w = r;
    const tip = w * 1.1;
    ctx.rotate(Math.atan2(dy, dx));

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

    const k = 0.72;
    poly(ctx, outer.map(([x, y]) => [x * (1 - ((1 - k) * w) / L), y * k]));
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.stroke();

    const flick = 0.9 + 0.1 * Math.sin(t * 3.1);
    ctx.lineCap = 'round';
    ctx.globalAlpha *= flick;
    glow(ctx, ORANGE_GLOW, 16);
    line(ctx, -L + tip * 1.25, 0, L - tip * 1.25, 0, ORANGE, 5);
    noGlow(ctx);
    line(ctx, -L + tip * 1.3, 0, L - tip * 1.3, 0, 'rgba(255,226,195,0.85)', 1.4);
    ctx.restore();
  }

  // Laufschiene einer beweglichen Barriere
  function drawSliderTrack(ctx, br) {
    const mx = (br.x1 + br.x2) / 2, my = (br.y1 + br.y2) / 2;
    const { dx, dy } = br.move;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,122,18,0.22)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 8]);
    line(ctx, mx - dx, my - dy, mx + dx, my + dy, 'rgba(255,122,18,0.22)', 2);
    ctx.setLineDash([]);
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(mx + dx * s, my + dy * s, 4, 0, TAU);
      ctx.fillStyle = 'rgba(255,122,18,0.35)';
      ctx.fill();
    }
    ctx.restore();
  }

  function drawRotor(ctx, ro, t, ghostT) {
    const tmp = {};
    ctx.save();
    ctx.setLineDash([5, 9]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255,122,18,0.14)';
    ctx.beginPath();
    ctx.arc(ro.x, ro.y, ro.len / 2 + ro.r, 0, TAU);
    ctx.stroke();
    ctx.restore();
    if (ghostT != null) {
      B.physics.rotorAt(ro, ghostT, tmp);
      drawBarrierShape(ctx, tmp.ax, tmp.ay, tmp.bx, tmp.by, ro.r, ghostT, 0.18);
    }
    B.physics.rotorAt(ro, t, tmp);
    drawBarrierShape(ctx, tmp.ax, tmp.ay, tmp.bx, tmp.by, ro.r, t, 1);
    // Nabe
    ctx.save();
    ctx.beginPath();
    ctx.arc(ro.x, ro.y, ro.r * 0.75, 0, TAU);
    ctx.fillStyle = '#121212';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#050505';
    ctx.stroke();
    glow(ctx, ORANGE_GLOW, 10);
    ctx.beginPath();
    ctx.arc(ro.x, ro.y, ro.r * 0.28, 0, TAU);
    ctx.fillStyle = ORANGE;
    ctx.fill();
    ctx.restore();
  }

  function drawMirror(ctx, m, flash) {
    ctx.save();
    ctx.lineCap = 'butt';
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 12 * px;
    line(ctx, m.x1, m.y1, m.x2, m.y2, '#060606', 17);
    noGlow(ctx);
    line(ctx, m.x1, m.y1, m.x2, m.y2, '#262626', 13);
    glow(ctx, 'rgba(255,255,255,0.35)', 8 + flash * 18);
    line(ctx, m.x1, m.y1, m.x2, m.y2, '#d9d4ce', 3 + flash * 2);
    noGlow(ctx);
    // Endplatten
    const L = Math.hypot(m.x2 - m.x1, m.y2 - m.y1) || 1;
    const nx = -(m.y2 - m.y1) / L * 9, ny = (m.x2 - m.x1) / L * 9;
    ctx.lineCap = 'round';
    for (const [x, y] of [[m.x1, m.y1], [m.x2, m.y2]]) {
      line(ctx, x - nx, y - ny, x + nx, y + ny, '#9b968f', 3);
    }
    ctx.restore();
  }

  function drawPortal(ctx, P, t, pulse) {
    const sq = P.ry / P.rx;
    const breathe = 1 + Math.sin(t * 2.2) * 0.02 + pulse * 0.1;
    ctx.save();
    ctx.translate(P.x, P.y);

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

    const well = ctx.createRadialGradient(0, 0, 0, 0, 0, P.rx * breathe);
    well.addColorStop(0, '#000');
    well.addColorStop(0.65, '#060504');
    well.addColorStop(1, '#1e1006');
    ctx.fillStyle = well;
    ctx.beginPath();
    ctx.arc(0, 0, P.rx * breathe, 0, TAU);
    ctx.fill();
    ctx.restore();

    // Sogradius andeuten
    ctx.save();
    ctx.setLineDash([2, 10]);
    ctx.lineDashOffset = t * 12;
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(255,122,18,0.12)';
    ctx.beginPath();
    ctx.arc(0, 0, P.attract, 0, TAU);
    ctx.stroke();
    ctx.restore();

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

    const brx = P.rx * 1.42 * breathe, bry = P.ry * 1.2 * breathe;
    const wob = Math.sin(t * 1.3) * 0.07;
    const span = 0.62;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.strokeStyle = ORANGE;
    glow(ctx, 'rgba(255,122,18,0.9)', 14 + pulse * 20);
    for (let i = 0; i < 4; i++) {
      const c = Math.PI / 4 + (i * Math.PI) / 2 + (i % 2 ? wob : -wob);
      ctx.beginPath();
      ctx.ellipse(0, 0, brx, bry, 0, c - span / 2, c + span / 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  /* ---------- Bouncer ---------- */

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
    else if (o.state === 'selected') { core = '#ffc48f'; glowCol = 'rgba(255,150,60,0.95)'; }
    else if (o.state === 'hover') { core = '#ffa45c'; }

    ctx.save();
    ctx.globalAlpha = o.alpha == null ? 1 : o.alpha;
    ctx.lineCap = 'round';

    if (o.state === 'selected') {
      // Auswahl-Rahmen
      ctx.setLineDash([ui(4), ui(5)]);
      line(ctx, ax, ay, bx, by, 'rgba(255,164,92,0.35)', 15 + ui(10));
      ctx.setLineDash([]);
    }

    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 12 * px;
    line(ctx, ax, ay, bx, by, '#060606', 15);
    noGlow(ctx);
    line(ctx, ax, ay, bx, by, '#232323', 11);

    glow(ctx, glowCol, 10 + flash * 22 + (o.state === 'selected' ? 6 : 0));
    line(ctx, ax, ay, bx, by, core, 3.2 + flash * 2.5);
    noGlow(ctx);
    if (flash > 0) line(ctx, ax, ay, bx, by, `rgba(255,240,222,${flash})`, 1.6);

    for (const [x, y] of [[ax, ay], [bx, by]]) {
      ctx.beginPath();
      ctx.arc(x, y, 4.5, 0, TAU);
      ctx.fillStyle = '#0d0d0d';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = core;
      ctx.stroke();
    }
    ctx.restore();
  }

  // Anfasser, Löschen-Knopf und Winkelanzeige am ausgewählten Bouncer
  function drawSelection(ctx, g) {
    const b = g.bouncers[g.selected];
    if (!b) return;
    const d = g.drag;
    const editing = d && (d.kind === 'move' || d.kind === 'handle') && d.moved;
    const invalid = editing && !d.valid;

    for (const [key, p] of [['a', b.a], ['b', b.b]]) {
      const active = d && d.kind === 'handle' && d.end === key;
      ctx.beginPath();
      ctx.arc(p.x, p.y, ui(active ? 9 : 7.5), 0, TAU);
      ctx.fillStyle = '#141414';
      ctx.fill();
      ctx.lineWidth = ui(2);
      ctx.strokeStyle = invalid ? '#ff4a3d' : '#ffc48f';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(p.x, p.y, ui(2.5), 0, TAU);
      ctx.fillStyle = invalid ? '#ff4a3d' : '#ffc48f';
      ctx.fill();
    }

    if (!editing) {
      const del = B.geo.deleteAnchor(b.a, b.b, ui(30));
      ctx.beginPath();
      ctx.arc(del.x, del.y, ui(11), 0, TAU);
      ctx.fillStyle = '#141414';
      ctx.fill();
      ctx.lineWidth = ui(1.5);
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.stroke();
      const s = ui(3.6);
      ctx.beginPath();
      ctx.moveTo(del.x - s, del.y - s); ctx.lineTo(del.x + s, del.y + s);
      ctx.moveTo(del.x + s, del.y - s); ctx.lineTo(del.x - s, del.y + s);
      ctx.lineWidth = ui(1.6);
      ctx.strokeStyle = '#fff';
      ctx.stroke();
    }

    const lab = B.geo.deleteAnchor(b.a, b.b, -ui(30));
    if (invalid) pill(ctx, lab.x, lab.y, d.reason, 'bad');
    else pill(ctx, lab.x, lab.y, `${B.geo.displayDegrees(b.a, b.b)}°`);
  }

  /* ---------- Würfel (3D, dreht sich um die eigene Hochachse) ---------- */

  const FACES = [[1, 3, 7, 5], [0, 4, 6, 2], [2, 6, 7, 3], [0, 1, 5, 4], [4, 5, 7, 6], [0, 2, 3, 1]];
  const NORMALS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  const TILT = 0.6155; // 35,26° – isometrischer Blick von schräg oben
  const LIGHT = (() => { const l = [0.35, 0.8, 0.45]; const n = Math.hypot(...l); return l.map((v) => v / n); })();

  function drawCube(ctx, x, y, half, yaw, roll) {
    if (half < 0.4) return;
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const ct = Math.cos(TILT), st = Math.sin(TILT);
    const rot = (vx, vy, vz) => {
      const x1 = vx * cy + vz * sy, z1 = -vx * sy + vz * cy;
      return [x1, vy * ct - z1 * st, vy * st + z1 * ct]; // y nach oben
    };
    const P = [];
    for (let i = 0; i < 8; i++) {
      const r = rot(i & 1 ? half : -half, i & 2 ? half : -half, i & 4 ? half : -half);
      P.push([r[0], -r[1]]);
    }
    const visible = [];
    for (let f = 0; f < 6; f++) {
      const n = rot(...NORMALS[f]);
      if (n[2] > 1e-3) {
        const lambert = Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
        visible.push({ f, lambert });
      }
    }

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(roll);
    ctx.lineJoin = 'round';

    // Schatten der Silhouette
    ctx.beginPath();
    for (const v of visible) {
      const q = FACES[v.f];
      ctx.moveTo(P[q[0]][0], P[q[0]][1]);
      for (let k = 1; k < 4; k++) ctx.lineTo(P[q[k]][0], P[q[k]][1]);
      ctx.closePath();
    }
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 20 * px;
    ctx.fillStyle = '#1a1a1a';
    ctx.fill();
    noGlow(ctx);

    for (const v of visible) {
      const q = FACES[v.f];
      const c = Math.round(28 + 58 * v.lambert);
      const g = ctx.createLinearGradient(P[q[0]][0], P[q[0]][1], P[q[2]][0], P[q[2]][1]);
      g.addColorStop(0, `rgb(${c + 8},${c + 8},${c + 8})`);
      g.addColorStop(1, `rgb(${c - 5},${c - 5},${c - 5})`);
      ctx.beginPath();
      ctx.moveTo(P[q[0]][0], P[q[0]][1]);
      for (let k = 1; k < 4; k++) ctx.lineTo(P[q[k]][0], P[q[k]][1]);
      ctx.closePath();
      ctx.fillStyle = g;
      ctx.fill();
      ctx.lineWidth = 2.4;
      ctx.strokeStyle = '#080808';
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.strokeStyle = `rgba(255,255,255,${0.04 + v.lambert * 0.1})`;
      ctx.stroke();
    }
    ctx.restore();
  }

  /* ---------- Zeichnen, Vorschau, Effekte ---------- */

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

  // Abstandszonen, die beim Zeichnen/Verschieben sichtbar werden
  function drawPlacementZones(ctx, L) {
    const R = B.RULES;
    ctx.save();
    ctx.setLineDash([5, 8]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255,90,74,0.22)';
    for (const br of L.barriers) {
      const ox = br.move ? br.move.dx : 0, oy = br.move ? br.move.dy : 0;
      if (br.move) {
        capsulePath(ctx, br.x1 - ox, br.y1 - oy, br.x2 + ox, br.y2 + oy, br.r + R.ZONE_BARRIER);
      } else {
        capsulePath(ctx, br.x1, br.y1, br.x2, br.y2, br.r + R.ZONE_BARRIER);
      }
      ctx.stroke();
    }
    for (const ro of L.rotors) {
      ctx.beginPath();
      ctx.arc(ro.x, ro.y, B.physics.rotorZone(ro), 0, TAU);
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

  function drawStroke(ctx, d) {
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
    if (d.fit && d.fit.length >= 12) {
      const state = d.valid ? 'ok' : d.short ? 'neutral' : 'invalid';
      drawBouncer(ctx, d.fit.a, d.fit.b, { alpha: 0.92, state });
      const lab = B.geo.deleteAnchor(d.fit.a, d.fit.b, -ui(30));
      if (state === 'invalid') pill(ctx, lab.x, lab.y, d.reason, 'bad');
      else pill(ctx, lab.x, lab.y, `${B.geo.displayDegrees(d.fit.a, d.fit.b)}°`);
    }
  }

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

    const building = g.mode === 'build';
    const editing = building && g.drag && (g.drag.kind === 'draw' || g.drag.moved);
    const t = g.sim ? g.sim.t : 0;
    const tmp = {};

    if (g.bounds) drawBoundsFrame(ctx, view, g.bounds);
    if (L.pads.length) drawPads(ctx, L.pads, g.bounds || B.physics.DESIGN_BOUNDS, editing);
    for (const z of L.zones) drawZone(ctx, z, editing);
    if (editing) drawPlacementZones(ctx, L);
    if (g.preview && B.settings.preview && building) drawPreview(ctx, g.preview);

    const head = g.mode === 'run' && g.sim ? g.sim.pos : null;
    drawTrail(ctx, g.trail, head);

    for (const br of L.barriers) {
      if (br.move) {
        drawSliderTrack(ctx, br);
        if (building) {
          B.physics.barrierAt(br, g.clock, tmp);
          drawBarrierShape(ctx, tmp.ax, tmp.ay, tmp.bx, tmp.by, br.r, g.clock, 0.18);
        }
      }
      B.physics.barrierAt(br, t, tmp);
      drawBarrierShape(ctx, tmp.ax, tmp.ay, tmp.bx, tmp.by, br.r, g.clock, 1);
    }
    for (const ro of L.rotors) drawRotor(ctx, ro, t, building ? g.clock : null);
    L.mirrors.forEach((m, i) => drawMirror(ctx, m, (g.mirrorFlash && g.mirrorFlash[i]) || 0));
    drawPortal(ctx, L.portal, g.clock, g.portalPulse);

    g.bouncers.forEach((b, i) => {
      let state = 'ok';
      if (building && i === g.selected) {
        const d = g.drag;
        state = d && d.moved && !d.valid ? 'invalid' : 'selected';
      } else if (building && i === g.hover && !g.drag) {
        state = 'hover';
      }
      drawBouncer(ctx, b.a, b.b, { flash: b.flash, state, grow: (g.clock - b.born) / 0.16 });
    });

    if (!g.cubeHidden) {
      const s = g.sim;
      const pos = s ? s.pos : L.cube;
      drawCube(ctx, pos.x, pos.y, R.CUBE_HALF * (s ? s.scale : 1), g.yaw || 0, s ? s.rot : 0);
    }

    drawParticles(ctx, g.particles, g.rings);

    if (building) {
      if (g.drag && g.drag.kind === 'draw') drawStroke(ctx, g.drag);
      else if (g.selected >= 0) drawSelection(ctx, g);
    }
  }

  B.render = { frame, drawCube };
})(globalThis.Bouncer = globalThis.Bouncer || {});
