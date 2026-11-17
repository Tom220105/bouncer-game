/* Geometrie-Hilfsfunktionen (Punkte, Strecken, Linien-Fit) */
(function (B) {
  'use strict';

  function closestPoint(p, a, b) {
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const len2 = abx * abx + aby * aby;
    let t = len2 > 0 ? ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return { x: a.x + abx * t, y: a.y + aby * t, t };
  }

  function distPointSeg(p, a, b) {
    const c = closestPoint(p, a, b);
    return Math.hypot(p.x - c.x, p.y - c.y);
  }

  function cross(ax, ay, bx, by) {
    return ax * by - ay * bx;
  }

  function segmentsIntersect(a, b, c, d) {
    const d1 = cross(b.x - a.x, b.y - a.y, c.x - a.x, c.y - a.y);
    const d2 = cross(b.x - a.x, b.y - a.y, d.x - a.x, d.y - a.y);
    const d3 = cross(d.x - c.x, d.y - c.y, a.x - c.x, a.y - c.y);
    const d4 = cross(d.x - c.x, d.y - c.y, b.x - c.x, b.y - c.y);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
           ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
  }

  function distSegSeg(a, b, c, d) {
    if (segmentsIntersect(a, b, c, d)) return 0;
    return Math.min(
      distPointSeg(a, c, d),
      distPointSeg(b, c, d),
      distPointSeg(c, a, b),
      distPointSeg(d, a, b)
    );
  }

  /**
   * Macht aus einem Freihand-Strich eine glatte, gerade Strecke.
   * Hauptachse per Kovarianz (PCA), Ausdehnung = Projektion aller Punkte.
   * snapStep: Winkelraster in Radiant (0 = aus), maxLen: Längenbegrenzung.
   */
  function fitStroke(points, snapStep, maxLen) {
    const n = points.length;
    if (n < 2) return null;

    let mx = 0, my = 0;
    for (const p of points) { mx += p.x; my += p.y; }
    mx /= n; my /= n;

    let sxx = 0, syy = 0, sxy = 0;
    for (const p of points) {
      const dx = p.x - mx, dy = p.y - my;
      sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
    }

    let angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    if (snapStep > 0) angle = Math.round(angle / snapStep) * snapStep;
    const ux = Math.cos(angle), uy = Math.sin(angle);

    let min = Infinity, max = -Infinity;
    for (const p of points) {
      const t = (p.x - mx) * ux + (p.y - my) * uy;
      if (t < min) min = t;
      if (t > max) max = t;
    }

    const mid = (min + max) / 2;
    let half = (max - min) / 2;
    const clamped = maxLen > 0 && half * 2 > maxLen;
    if (clamped) half = maxLen / 2;

    const cx = mx + ux * mid, cy = my + uy * mid;
    let a = { x: cx - ux * half, y: cy - uy * half };
    let b = { x: cx + ux * half, y: cy + uy * half };

    // Anfang dort, wo der Strich begonnen hat
    const s = points[0];
    if (Math.hypot(s.x - b.x, s.y - b.y) < Math.hypot(s.x - a.x, s.y - a.y)) {
      const tmp = a; a = b; b = tmp;
    }
    return { a, b, length: half * 2, clamped };
  }

  /** Abstand Punkt–Strecke mit Skalaren (schnell, ohne Objekte – für die Simulation). */
  function distPS(px, py, ax, ay, bx, by) {
    const abx = bx - ax, aby = by - ay;
    const len2 = abx * abx + aby * aby;
    let t = len2 > 0 ? ((px - ax) * abx + (py - ay) * aby) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = px - (ax + abx * t), dy = py - (ay + aby * t);
    return Math.sqrt(dx * dx + dy * dy);
  }

  function pointInRect(p, r) {
    return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  }

  /** Schneidet oder berührt die Strecke a–b das Rechteck r (optional um pad vergrößert)? */
  function segRectIntersect(a, b, r, pad) {
    const q = pad ? { x: r.x - pad, y: r.y - pad, w: r.w + pad * 2, h: r.h + pad * 2 } : r;
    if (pointInRect(a, q) || pointInRect(b, q)) return true;
    const c = [
      { x: q.x, y: q.y }, { x: q.x + q.w, y: q.y },
      { x: q.x + q.w, y: q.y + q.h }, { x: q.x, y: q.y + q.h },
    ];
    for (let i = 0; i < 4; i++) {
      if (segmentsIntersect(a, b, c[i], c[(i + 1) % 4])) return true;
    }
    return false;
  }

  /** Winkel einer Strecke (Radiant). */
  function segAngle(a, b) {
    return Math.atan2(b.y - a.y, b.x - a.x);
  }

  /** Strecke um ihre Mitte auf einen neuen Winkel drehen (Länge bleibt). */
  function setSegAngle(a, b, angle) {
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const h = Math.hypot(b.x - a.x, b.y - a.y) / 2;
    const ux = Math.cos(angle), uy = Math.sin(angle);
    return { a: { x: mx - ux * h, y: my - uy * h }, b: { x: mx + ux * h, y: my + uy * h } };
  }

  /** Lage des Löschen-Knopfs: über der Mitte, senkrecht zur Strecke (immer nach oben). */
  function deleteAnchor(a, b, offset) {
    const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    let nx = -(b.y - a.y) / L, ny = (b.x - a.x) / L;
    if (ny > 0 || (ny === 0 && nx > 0)) { nx = -nx; ny = -ny; }
    return { x: (a.x + b.x) / 2 + nx * offset, y: (a.y + b.y) / 2 + ny * offset };
  }

  /** Winkel einer Strecke in Grad, 0–179, gegen den Uhrzeigersinn zur Horizontalen. */
  function displayDegrees(a, b) {
    let d = Math.round((Math.atan2(-(b.y - a.y), b.x - a.x) * 180) / Math.PI);
    d = ((d % 180) + 180) % 180;
    return d;
  }

  B.geo = {
    closestPoint, distPointSeg, segmentsIntersect, distSegSeg, fitStroke,
    distPS, pointInRect, segRectIntersect, segAngle, setSegAngle, deleteAnchor, displayDegrees,
  };
})(globalThis.Bouncer = globalThis.Bouncer || {});
