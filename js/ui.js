/* Overlay: Kopfzeile, Steuerleiste, Level-Auswahl, Einstellungen, Gewonnen-Dialog */
(function (B) {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const pad = (n) => String(n).padStart(2, '0');

  const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.6l2.85 6.07 6.65.78-4.92 4.55 1.33 6.57L12 17.27l-5.91 3.3 1.33-6.57L2.5 9.45l6.65-.78z"/></svg>';
  const LOCK = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';

  let els = {};
  const stack = [];
  let mode = 'build';
  let toastTimer = null;
  let resetArmed = null;

  function modalEl(name) {
    return document.querySelector(`.modal[data-modal="${name}"]`);
  }

  function openModal(name) {
    const m = modalEl(name);
    if (!m || !m.hidden) return;
    B.game.cancelDrag();
    m.hidden = false;
    stack.push(name);
    B.audio.play('ui');
    const panel = m.querySelector('.panel');
    if (panel) panel.focus({ preventScroll: true });
  }

  function closeModal(name) {
    const m = modalEl(name);
    if (!m || m.hidden) return;
    m.hidden = true;
    const i = stack.lastIndexOf(name);
    if (i >= 0) stack.splice(i, 1);
    if (name === 'win') B.game.afterWin();
  }

  function closeTopModal() {
    if (!stack.length) return false;
    closeModal(stack[stack.length - 1]);
    return true;
  }

  function isModalOpen() {
    return stack.length > 0;
  }

  /* ---------- Level-Auswahl ---------- */

  function starsHtml(n) {
    return [0, 1, 2].map((i) => `<span class="star${i < n ? ' on' : ''}">${STAR}</span>`).join('');
  }

  function renderLevelGrid() {
    const root = els.levelGrid;
    const current = B.game.state.levelIndex;
    root.innerHTML = '';
    let total = 0;

    B.CHAPTERS.forEach((ch, c) => {
      const section = document.createElement('section');
      section.className = 'chapter';
      const levels = B.LEVELS.filter((l) => l.chapter === c);
      const earned = levels.reduce((sum, l) => sum + ((B.progress.get(l.id) || {}).stars || 0), 0);
      total += earned;
      section.innerHTML = `<h3 class="chapter-title"><span>${pad(c + 1)} · ${ch.title}</span><span class="chapter-stars">${earned}/${levels.length * 3} ${STAR}</span></h3>`;
      const grid = document.createElement('div');
      grid.className = 'level-grid';

      for (let i = ch.start; i < ch.start + ch.count && i < B.LEVELS.length; i++) {
        const lvl = B.LEVELS[i];
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'level-tile';
        if (!B.progress.isUnlocked(i)) {
          btn.classList.add('locked');
          btn.disabled = true;
          btn.title = `${lvl.name} – gesperrt`;
          btn.innerHTML = `<span class="tile-num">${pad(i + 1)}</span><span class="tile-lock">${LOCK}</span>`;
        } else {
          const rec = B.progress.get(lvl.id);
          if (i === current) btn.classList.add('current');
          if (rec) btn.classList.add('done');
          btn.title = lvl.name;
          btn.innerHTML = `<span class="tile-num">${pad(i + 1)}</span><span class="tile-stars">${starsHtml(rec ? rec.stars : 0)}</span>`;
          btn.addEventListener('click', () => {
            closeModal('levels');
            B.game.selectLevel(i);
          });
        }
        grid.appendChild(btn);
      }
      section.appendChild(grid);
      root.appendChild(section);
    });
    els.levelsMeta.innerHTML = `${total}/${B.LEVELS.length * 3} ${STAR}`;
  }

  /* ---------- Einstellungen ---------- */

  function syncVolumeRow() {
    els.volumeRow.classList.toggle('disabled', !B.settings.sound);
    els.volume.disabled = !B.settings.sound;
    els.volumeValue.textContent = `${B.settings.volume}%`;
  }

  function bindSettings() {
    const s = B.settings;
    const toggles = { setSound: 'sound', setSnap: 'snap', setPreview: 'preview', setGlow: 'glow' };
    for (const [id, key] of Object.entries(toggles)) {
      const el = $(id);
      el.checked = !!s[key];
      el.addEventListener('change', () => {
        s[key] = el.checked;
        B.saveSettings();
        if (key === 'sound' && el.checked) {
          B.audio.unlock();
          B.audio.play('ui');
        }
        B.game.onSettingsChanged(key);
        syncVolumeRow();
      });
    }

    els.volume.value = s.volume;
    els.volume.addEventListener('input', () => {
      s.volume = Number(els.volume.value);
      B.audio.setVolume();
      syncVolumeRow();
    });
    els.volume.addEventListener('change', () => {
      B.saveSettings();
      B.audio.play('bounce', 3);
    });
    syncVolumeRow();

    const resetBtn = $('btnResetProgress');
    resetBtn.addEventListener('click', () => {
      if (!resetArmed) {
        resetBtn.textContent = 'Wirklich zurücksetzen?';
        resetBtn.classList.add('armed');
        resetArmed = setTimeout(() => {
          resetArmed = null;
          resetBtn.textContent = 'Fortschritt zurücksetzen';
          resetBtn.classList.remove('armed');
        }, 3000);
        return;
      }
      clearTimeout(resetArmed);
      resetArmed = null;
      B.progress.reset();
      resetBtn.textContent = 'Fortschritt zurücksetzen';
      resetBtn.classList.remove('armed');
      toast('Fortschritt zurückgesetzt');
      if (!B.progress.isUnlocked(B.game.state.levelIndex)) B.game.loadLevel(0);
    });
  }

  /* ---------- HUD ---------- */

  function onLevelLoaded(lvl, index) {
    els.levelNum.textContent = pad(index + 1);
    els.levelName.textContent = lvl.name;
    els.hint.textContent = lvl.hint || '';
    els.hint.classList.toggle('hidden', !lvl.hint);
  }

  function updateCounter(used, par, canUndo) {
    const stars = used === 0 ? 3 : B.game.starsFor(used, par);
    els.countUsed.textContent = used;
    els.parLabel.textContent = `Par ${par}`;
    els.miniStars.innerHTML = starsHtml(stars);
    els.counter.classList.toggle('over', used > par);
    els.btnClear.disabled = mode !== 'build' || used === 0;
    els.btnUndo.disabled = mode !== 'build' || !canUndo;
  }

  function onModeChange(m) {
    mode = m;
    const running = m !== 'build';
    document.body.dataset.mode = m;
    els.btnStart.classList.toggle('is-stop', running);
    els.btnStartLabel.textContent = running ? 'Stopp' : 'Start';
    els.icoPlay.style.display = running ? 'none' : '';
    els.icoStop.style.display = running ? '' : 'none';
    els.btnStart.disabled = m === 'capture' || m === 'won';
    const g = B.game.state;
    els.btnClear.disabled = running || g.bouncers.length === 0;
    els.btnUndo.disabled = running || g.history.length === 0;
  }

  function hideHint() {
    els.hint.classList.add('hidden');
  }

  function toast(text, kind) {
    els.toast.textContent = text;
    els.toast.className = 'toast show' + (kind ? ' ' + kind : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2000);
  }

  function showWin(r, index, hasNext) {
    $('winEyebrow').textContent = `Level ${pad(index + 1)}`;
    $('winStars').innerHTML = [0, 1, 2]
      .map((i) => `<span class="star${i < r.stars ? ' on' : ''}" style="--d:${120 + i * 140}ms">${STAR}</span>`)
      .join('');
    $('winStats').textContent = `${r.used} Bouncer · Par ${r.par}`;
    const last = index === B.LEVELS.length - 1;
    $('winNote').textContent = r.stars < 3
      ? `Schaffst du es mit ${r.par} Bouncer${r.par === 1 ? '' : 'n'}?`
      : last ? 'Alle Level geschafft – stark!' : 'Perfekt gelöst.';
    els.btnWinNext.hidden = !hasNext;
    openModal('win');
    (hasNext ? els.btnWinNext : $('btnWinRetry')).focus({ preventScroll: true });
  }

  function init() {
    els = {
      levelNum: $('levelNum'),
      levelName: $('levelName'),
      hint: $('hint'),
      counter: $('counter'),
      miniStars: $('miniStars'),
      countUsed: $('countUsed'),
      parLabel: $('parLabel'),
      btnStart: $('btnStart'),
      btnStartLabel: $('btnStartLabel'),
      icoPlay: $('icoPlay'),
      icoStop: $('icoStop'),
      btnClear: $('btnClear'),
      btnUndo: $('btnUndo'),
      btnWinNext: $('btnWinNext'),
      toast: $('toast'),
      levelGrid: $('levelGrid'),
      levelsMeta: $('levelsMeta'),
      volume: $('setVolume'),
      volumeRow: $('volumeRow'),
      volumeValue: $('volumeValue'),
    };

    $('btnLevels').addEventListener('click', () => { renderLevelGrid(); openModal('levels'); });
    $('btnSettings').addEventListener('click', () => openModal('settings'));
    els.btnStart.addEventListener('click', () => { B.audio.unlock(); B.game.toggleRun(); });
    els.btnClear.addEventListener('click', () => B.game.clearAll());
    els.btnUndo.addEventListener('click', () => B.game.undo());

    document.querySelectorAll('[data-close]').forEach((el) => {
      el.addEventListener('click', () => closeModal(el.closest('.modal').dataset.modal));
    });
    $('btnWinRetry').addEventListener('click', () => closeModal('win'));
    els.btnWinNext.addEventListener('click', () => {
      closeModal('win');
      B.game.nextLevel();
    });
    $('btnWinLevels').addEventListener('click', () => {
      closeModal('win');
      renderLevelGrid();
      openModal('levels');
    });

    // Mausklicks hinterlassen keinen Fokus (sonst löst die Leertaste den Button erneut aus)
    document.addEventListener('click', (e) => {
      const btn = e.target.closest && e.target.closest('button');
      if (btn && e.detail > 0) btn.blur();
    });

    bindSettings();
  }

  B.ui = {
    init, openModal, closeModal, closeTopModal, isModalOpen,
    onLevelLoaded, updateCounter, onModeChange, hideHint, toast, showWin,
  };
})(globalThis.Bouncer = globalThis.Bouncer || {});
