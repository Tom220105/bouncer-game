/* Synthetische Soundeffekte über die Web Audio API (keine Audiodateien nötig) */
(function (B) {
  'use strict';

  let ctx = null;
  let master = null;
  let noiseBuf = null;

  function level() {
    return (B.settings.volume / 100) * 0.6;
  }

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    master.gain.value = level();
    return ctx;
  }

  function tone({ type = 'sine', f0, f1 = f0, dur = 0.12, gain = 0.2, delay = 0, attack = 0.005, filter = 0 }) {
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = osc;
    if (filter) {
      const fl = ctx.createBiquadFilter();
      fl.type = 'lowpass';
      fl.frequency.value = filter;
      osc.connect(fl);
      node = fl;
    }
    node.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  function noise({ dur = 0.3, gain = 0.3, filter = 1200, delay = 0 }) {
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.8), ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const fl = ctx.createBiquadFilter();
    fl.type = 'lowpass';
    fl.frequency.setValueAtTime(filter, t);
    fl.frequency.exponentialRampToValueAtTime(120, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(fl);
    fl.connect(g);
    g.connect(master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  const SOUNDS = {
    ui() { tone({ type: 'triangle', f0: 1400, f1: 1100, dur: 0.04, gain: 0.05 }); },
    place() { tone({ type: 'triangle', f0: 520, f1: 780, dur: 0.08, gain: 0.12 }); },
    remove() { tone({ type: 'triangle', f0: 500, f1: 240, dur: 0.1, gain: 0.1 }); },
    error() {
      tone({ type: 'square', f0: 170, dur: 0.07, gain: 0.04, filter: 900 });
      tone({ type: 'square', f0: 135, dur: 0.09, gain: 0.04, filter: 900, delay: 0.08 });
    },
    start() { tone({ type: 'sawtooth', f0: 180, f1: 520, dur: 0.22, gain: 0.07, filter: 1800 }); },
    bounce(n = 0) {
      const f = 440 * Math.pow(2, (Math.min(n, 12) * 2) / 12);
      tone({ type: 'sine', f0: f * 1.5, f1: f, dur: 0.16, gain: 0.2 });
      tone({ type: 'triangle', f0: f * 3, f1: f * 2, dur: 0.06, gain: 0.04 });
    },
    crash() {
      noise({ dur: 0.35, gain: 0.3, filter: 1600 });
      tone({ type: 'sine', f0: 120, f1: 45, dur: 0.3, gain: 0.28 });
    },
    out() { tone({ type: 'sine', f0: 400, f1: 120, dur: 0.35, gain: 0.1 }); },
    capture() {
      tone({ type: 'sine', f0: 220, f1: 1200, dur: 0.7, gain: 0.12 });
      noise({ dur: 0.7, gain: 0.06, filter: 3000 });
    },
    win() {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
        tone({ type: 'triangle', f0: f, dur: 0.38, gain: 0.1, delay: i * 0.09 }));
    },
  };

  B.audio = {
    /** Muss nach einer Nutzeraktion aufgerufen werden (Autoplay-Regeln der Browser). */
    unlock() {
      if (B.settings.sound) ensure();
    },
    play(name, arg) {
      if (!B.settings.sound || !SOUNDS[name]) return;
      if (!ensure()) return;
      try { SOUNDS[name](arg); } catch (e) { /* Audio ist optional */ }
    },
    setVolume() {
      if (master) master.gain.value = level();
    },
  };
})(globalThis.Bouncer = globalThis.Bouncer || {});
