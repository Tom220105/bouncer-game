/* Einstiegspunkt */
(function (B) {
  'use strict';

  B.ui.init();
  B.game.init();

  let start = Number(B.progress.lastLevel) || 0;
  if (!B.LEVELS[start] || !B.progress.isUnlocked(start)) start = 0;
  B.game.loadLevel(start);
})(globalThis.Bouncer);
