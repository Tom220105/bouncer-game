/*
 * Level-Definitionen. Koordinaten in Welteinheiten; entworfen für den Bereich 1600 × 900.
 * Ist das Fenster größer, wird der spielbare Bereich erweitert (siehe game.js).
 *
 * Helfer:
 *   cube(x, y, winkel°, tempo)                Startpunkt und Flugrichtung des Würfels
 *   portal(x, y, sog)                         Ziel; sog = Radius, in dem der Würfel angezogen wird
 *   wall(x1, y1, x2, y2, r)                   feste Barriere (Kapsel)
 *   pillar(x, y, r)                           runde Säule
 *   slider(x1, y1, x2, y2, dx, dy, T, phase°) Barriere, die sich mit Periode T hin und her bewegt
 *   rotor(x, y, länge, °/s, start°)           drehende Barriere
 *   mirror(x1, y1, x2, y2)                    fester Spiegel, reflektiert wie ein Bouncer
 *   zone(x, y, w, h)                          Sperrzone: hier darf nicht gezeichnet werden
 *   pad(x, y, w, h)                           Baufläche: gibt es welche, darf nur dort gezeichnet werden
 *
 * par: kleinste gefundene Bouncer-Anzahl (tools/verify.html) → 3 Sterne
 */
(function (B) {
  'use strict';

  B.WORLD = { w: 1600, h: 900 };

  const E = 400; // Überstand für Wände, die bis zum Rand reichen
  const deg = (d) => (d * Math.PI) / 180;
  const cube = (x, y, a = 0, speed = 540) => ({ x, y, angle: deg(a), speed });
  const portal = (x, y, attract = 300) => ({ x, y, rx: 34, ry: 80, attract, capture: 56, pull: 3400, swirl: 7 });
  const wall = (x1, y1, x2, y2, r = 24) => ({ x1, y1, x2, y2, r });
  const pillar = (x, y, r = 34) => ({ x1: x, y1: y, x2: x, y2: y, r });
  const slider = (x1, y1, x2, y2, dx, dy, period, phase = 0, r = 22) =>
    ({ x1, y1, x2, y2, r, move: { dx, dy, period, phase: deg(phase) } });
  const rotor = (x, y, len, speed, angle = 0, r = 20) => ({ x, y, len, r, speed: deg(speed), angle: deg(angle) });
  const mirror = (x1, y1, x2, y2) => ({ x1, y1, x2, y2 });
  const zone = (x, y, w, h) => ({ x, y, w, h });
  const pad = (x, y, w, h) => ({ x, y, w, h });

  const L = (def) => Object.assign({ barriers: [], rotors: [], mirrors: [], zones: [], pads: [], hint: '' }, def);

  B.CHAPTERS = [
    { title: 'Grundlagen', count: 8 },
    { title: 'Spiegel & Sperrzonen', count: 8 },
    { title: 'Bewegung', count: 8 },
    { title: 'Meister', count: 6 },
  ];

  B.LEVELS = [
    /* ---------- Kapitel 1: Grundlagen ---------- */
    L({
      name: 'Ein Knick',
      hint: 'Zieh einen Bouncer in die Bahn des Würfels – er prallt daran ab',
      cube: cube(220, 700),
      portal: portal(1300, 220),
      par: 1,
    }),
    L({
      name: 'Erster Umweg',
      hint: 'Lenke den Würfel um die Barriere herum ins Portal',
      cube: cube(370, 450),
      barriers: [wall(800, 336, 800, 564)],
      portal: portal(1515, 450, 340),
      par: 2,
    }),
    L({
      name: 'Hohe Mauer',
      hint: 'Tipp: Bouncer anklicken – dann verschieben, an den Enden drehen oder mit × löschen',
      cube: cube(260, 620),
      barriers: [wall(820, 220, 820, 900 + E)],
      portal: portal(1420, 620, 320),
      par: 2,
    }),
    L({
      name: 'Rückweg',
      hint: 'Das Portal liegt hinter dir',
      cube: cube(820, 450),
      barriers: [wall(520, 280, 520, 620)],
      portal: portal(240, 450),
      par: 2,
    }),
    L({
      name: 'Tasche',
      cube: cube(220, 700),
      barriers: [wall(1180, 480, 1180, 820), wall(1500, 480, 1500, 820), wall(1180, 820, 1500, 820)],
      portal: portal(1340, 660, 200),
      par: 2,
    }),
    L({
      name: 'Säulenwald',
      cube: cube(220, 450),
      barriers: [
        pillar(650, 250), pillar(650, 450), pillar(650, 650),
        pillar(850, 150), pillar(850, 350), pillar(850, 550), pillar(850, 750),
        pillar(1050, 250), pillar(1050, 450), pillar(1050, 650),
      ],
      portal: portal(1440, 450),
      par: 2,
    }),
    L({
      name: 'Slalom',
      cube: cube(200, 250),
      barriers: [wall(620, -E, 620, 560), wall(1020, 340, 1020, 900 + E)],
      portal: portal(1420, 620),
      par: 3,
    }),
    L({
      name: 'Kammer',
      hint: 'Das Portal ist nur von hinten erreichbar',
      cube: cube(220, 450),
      barriers: [wall(1120, 280, 1440, 280), wall(1120, 620, 1440, 620), wall(1120, 280, 1120, 620)],
      portal: portal(1280, 450, 180),
      par: 3,
    }),

    /* ---------- Kapitel 2: Spiegel & Sperrzonen ---------- */
    L({
      name: 'Spiegel',
      hint: 'Neu: Spiegel gehören zum Level und lenken den Würfel genauso ab',
      cube: cube(220, 700),
      barriers: [wall(760, 420, 760, 900 + E)],
      mirrors: [mirror(820, 140, 1180, 140)],
      portal: portal(1300, 650, 280),
      par: 1,
    }),
    L({
      name: 'Sperrgebiet',
      hint: 'Neu: In schraffierten Sperrzonen kannst du keine Bouncer zeichnen',
      cube: cube(220, 450),
      barriers: [wall(800, 300, 800, 600)],
      zones: [zone(330, -E, 360, 900 + 2 * E)],
      portal: portal(1450, 450, 320),
      par: 2,
    }),
    L({
      name: 'Bande',
      hint: 'Nutze den langen Spiegel oben als Bande',
      cube: cube(220, 760),
      barriers: [wall(800, 200, 800, 900 + E)],
      mirrors: [mirror(300, 60, 1300, 60)],
      zones: [zone(-E, -E, 1600 + 2 * E, 380 + E)],
      portal: portal(1350, 700, 280),
      par: 1,
    }),
    L({
      name: 'Engpass',
      cube: cube(220, 300),
      barriers: [wall(800, -E, 800, 380), wall(800, 520, 800, 900 + E)],
      zones: [zone(500, -E, 250, 900 + 2 * E)],
      portal: portal(1450, 650, 280),
      par: 1,
    }),
    L({
      name: 'Fenster',
      cube: cube(220, 450),
      barriers: [wall(900, 330, 900, 570)],
      mirrors: [mirror(1080, 110, 1320, 110), mirror(1080, 790, 1320, 790)],
      zones: [zone(300, -E, 1300 + E, 330 + E), zone(300, 570, 1300 + E, 330 + E)],
      portal: portal(1420, 450, 260),
      par: 1,
    }),
    L({
      name: 'Kleiner Sog',
      hint: 'Dieses Portal zieht nur aus kurzer Distanz',
      cube: cube(220, 200),
      barriers: [wall(700, 260, 700, 900 + E), wall(1100, -E, 1100, 640)],
      portal: portal(1420, 760, 150),
      par: 2,
    }),
    L({
      name: 'Spiegelkabinett',
      cube: cube(220, 450),
      barriers: [wall(760, 330, 760, 570)],
      mirrors: [mirror(1050, 250, 1450, 250), mirror(1050, 650, 1450, 650), mirror(1450, 250, 1450, 650)],
      zones: [zone(860, -E, 160, 900 + 2 * E)],
      portal: portal(1260, 450, 200),
      par: 2,
    }),
    L({
      name: 'Labyrinth',
      cube: cube(160, 160),
      barriers: [wall(-E, 330, 1150, 330), wall(450, 600, 1600 + E, 600)],
      portal: portal(1450, 760, 220),
      par: 3,
    }),

    /* ---------- Kapitel 3: Bewegung ---------- */
    L({
      name: 'Pendel',
      hint: 'Neu: Bewegliche Barrieren – das Timing entscheidet. Die blasse Kopie zeigt die Bewegung',
      cube: cube(220, 450),
      barriers: [slider(800, 370, 800, 530, 0, 260, 2.4, 30)],
      portal: portal(1450, 450),
      par: 2,
    }),
    L({
      name: 'Schiebetür',
      cube: cube(220, 450),
      barriers: [
        wall(800, -E, 800, 360), wall(800, 540, 800, 900 + E),
        slider(800, 380, 800, 520, 0, 170, 1.8, 0),
      ],
      portal: portal(1450, 450),
      par: 2,
    }),
    L({
      name: 'Rotor',
      hint: 'Neu: Rotoren drehen sich ständig um ihre Nabe',
      cube: cube(220, 450),
      rotors: [rotor(800, 450, 300, 90)],
      portal: portal(1450, 450),
      par: 2,
    }),
    L({
      name: 'Zwei Pendel',
      cube: cube(220, 450),
      barriers: [
        slider(650, 380, 650, 520, 0, 280, 2.2, 65),
        slider(1050, 380, 1050, 520, 0, 280, 2.2, 304),
      ],
      portal: portal(1450, 450),
      par: 2,
    }),
    L({
      name: 'Rotortor',
      cube: cube(220, 450),
      barriers: [wall(1200, 300, 1560, 300), wall(1200, 600, 1560, 600), wall(1560, 300, 1560, 600)],
      rotors: [rotor(1110, 450, 260, 120)],
      portal: portal(1400, 450, 200),
      par: 2,
    }),
    L({
      name: 'Uhrzeiger',
      hint: 'Durch den Rotor hindurch – im richtigen Moment',
      cube: cube(220, 450),
      barriers: [wall(800, -E, 800, 110), wall(800, 790, 800, 900 + E)],
      rotors: [rotor(800, 450, 560, 45)],
      zones: [zone(500, -E, 600, 900 + 2 * E)],
      portal: portal(1420, 450, 280),
      par: 2,
    }),
    L({
      name: 'Doppelrotor',
      cube: cube(220, 450),
      rotors: [rotor(760, 300, 280, 100), rotor(760, 600, 280, -100)],
      barriers: [wall(760, -E, 760, 140), wall(760, 760, 760, 900 + E)],
      portal: portal(1420, 450),
      par: 2,
    }),
    L({
      name: 'Hektik',
      hint: 'Dieser Würfel ist schneller',
      cube: cube(200, 450, 0, 760),
      barriers: [
        slider(600, 380, 600, 520, 0, 300, 1.6, 0),
        wall(1000, 220, 1000, 680),
        slider(1250, 120, 1250, 260, 0, 180, 1.3, 90),
      ],
      portal: portal(1460, 450, 260),
      par: 2,
    }),

    /* ---------- Kapitel 4: Meister ---------- */
    L({
      name: 'Inseln',
      hint: 'Neu: Bauflächen – nur in den markierten Feldern darfst du bauen',
      cube: cube(200, 450),
      barriers: [wall(800, 200, 800, 900 + E)],
      pads: [pad(360, 370, 160, 160), pad(360, 40, 160, 160), pad(1080, 40, 160, 160)],
      portal: portal(1430, 700, 220),
      par: 3,
    }),
    L({
      name: 'Spiegelsaal',
      cube: cube(200, 450),
      barriers: [wall(700, -E, 700, 230), wall(700, 670, 700, 900 + E), wall(1050, 330, 1050, 570)],
      mirrors: [
        mirror(880, 60, 1100, 150), mirror(1250, 60, 1480, 60),
        mirror(880, 840, 1100, 750), mirror(1250, 840, 1480, 840),
      ],
      pads: [pad(330, 250, 180, 400)],
      portal: portal(1420, 450, 150),
      par: 1,
    }),
    L({
      name: 'Uhrwerk',
      cube: cube(200, 450),
      rotors: [rotor(620, 300, 260, 110), rotor(620, 640, 260, -110), rotor(1100, 450, 320, 70)],
      barriers: [slider(860, 140, 860, 280, 0, 90, 1.5, 0), slider(860, 620, 860, 760, 0, 90, 1.5, 180)],
      pads: [pad(280, 330, 180, 240), pad(280, 30, 180, 170), pad(280, 700, 180, 170), pad(1180, 30, 230, 150), pad(1180, 720, 230, 150)],
      portal: portal(1460, 450, 240),
      par: 2,
    }),
    L({
      name: 'Festung',
      hint: 'Der Rotor bewacht das Tor – warte auf die Lücke',
      cube: cube(200, 450),
      barriers: [wall(950, 280, 1300, 280), wall(950, 620, 1300, 620), wall(950, 280, 950, 620)],
      rotors: [rotor(1300, 450, 130, 100)],
      pads: [pad(300, 360, 180, 180), pad(300, 40, 180, 170), pad(1440, 40, 150, 170), pad(1460, 300, 130, 300)],
      portal: portal(1110, 450, 160),
      par: 4,
    }),
    L({
      name: 'Zickzack',
      cube: cube(160, 120),
      barriers: [
        wall(-E, 260, 1250, 260), wall(350, 480, 1600 + E, 480), wall(-E, 700, 1250, 700),
      ],
      zones: [zone(400, 290, 500, 160), zone(500, 510, 500, 160)],
      portal: portal(1450, 810, 200),
      par: 5,
    }),
    L({
      name: 'Finale',
      hint: 'Alles zusammen: Baufläche, Spiegel, Rotor',
      cube: cube(160, 120),
      barriers: [
        wall(-E, 320, 1100, 320), wall(540, 600, 1600 + E, 600),
        slider(1300, 60, 1300, 220, 0, 60, 1.4, 0),
      ],
      rotors: [rotor(330, 600, 200, 120)],
      mirrors: [mirror(1190, 545, 1280, 405)],
      pads: [pad(860, 30, 280, 250), pad(470, 360, 260, 190), pad(40, 740, 330, 130)],
      portal: portal(1450, 760, 180),
      par: 4,
    }),
  ];

  B.LEVELS.forEach((lvl, i) => { lvl.id = 'l' + String(i + 1).padStart(2, '0'); });

  // Kapitel-Index pro Level
  let idx = 0;
  B.CHAPTERS.forEach((ch, c) => {
    ch.start = idx;
    for (let i = 0; i < ch.count && idx < B.LEVELS.length; i++, idx++) B.LEVELS[idx].chapter = c;
  });
})(globalThis.Bouncer = globalThis.Bouncer || {});
