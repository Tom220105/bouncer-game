/*
 * Level-Definitionen. Koordinaten in Welteinheiten (Spielfeld 1600 × 900).
 *
 * cube     Startpunkt, Richtung (Radiant, 0 = nach rechts) und Tempo des Würfels
 * barriers Hindernisse als Kapseln (Strecke x1/y1 → x2/y2 mit Radius r)
 * portal   Ziel: Ellipse rx/ry, Sogradius attract, Fangradius capture,
 *          Sogstärke pull und Wirbel-Dämpfung swirl
 * par      Bouncer-Anzahl für 3 Sterne
 */
(function (B) {
  'use strict';

  B.WORLD = { w: 1600, h: 900 };

  // Anzahl der Kacheln in der Level-Auswahl (noch nicht gebaute Level sind gesperrt)
  B.LEVEL_SLOTS = 8;

  B.LEVELS = [
    {
      id: 'l01',
      name: 'Erster Umweg',
      hint: 'Zeichne Bouncer und lenke den Würfel um die Barriere ins Portal',
      cube: { x: 370, y: 450, angle: 0, speed: 540 },
      barriers: [
        { x1: 800, y1: 336, x2: 800, y2: 564, r: 24 },
      ],
      portal: { x: 1515, y: 450, rx: 34, ry: 80, attract: 340, capture: 56, pull: 3400, swirl: 7 },
      maxBouncers: 3,
      par: 2,
    },
  ];
})(globalThis.Bouncer = globalThis.Bouncer || {});
