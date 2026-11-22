// audio.js — every sound in Port Aurelia is synthesized in the browser.
// No audio files: WebAudio oscillators and noise buffers only.
import { clamp } from './util.js';

export class AudioEngine {
  constructor() {
    this.ctx = null; this.master = null; this.engineOsc = null; this.engineGain = null;
    this.sirenOsc = null; this.sirenGain = null; this.radioTimer = null;
    this.station = 0; this.radioOn = false; this.muted = false;
    this.stations = [
      { name: 'AURELIA FM 88.4 — Sunset Drive', bpm: 96, minor: true },
      { name: 'DELTA 101.7 — Neon Nights', bpm: 122, minor: false },
      { name: 'CAUSEWAY 94.2 — Harbor Blues', bpm: 76, minor: true },
    ];
  }
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    } catch (e) { this.ctx = null; }
  }
  now() { return this.ctx ? this.ctx.currentTime : 0; }
  blip(freq, dur, type, vol) {
    if (!this.ctx || this.muted) return;
    const t = this.now();
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type || 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(vol || 0.15, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  noiseBurst(dur, vol, lowpass) {
    if (!this.ctx || this.muted) return;
    const t = this.now();
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const g = this.ctx.createGain(); g.gain.value = vol || 0.3;
    let node = src;
    if (lowpass) {
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = lowpass;
      src.connect(f); node = f;
    }
    node.connect(g); g.connect(this.master);
    src.start(t);
  }
  gunshot() { this.noiseBurst(0.12, 0.5, 1800); this.blip(160, 0.08, 'square', 0.12); }
  explosion() {
    this.noiseBurst(0.9, 0.7, 500);
    this.blip(55, 0.7, 'sine', 0.4);
  }
  pickup() { this.blip(660, 0.09, 'sine', 0.18); setTimeout(() => this.blip(990, 0.12, 'sine', 0.18), 70); }
  missionOk() { [523, 659, 784].forEach((f, i) => setTimeout(() => this.blip(f, 0.16, 'triangle', 0.2), i * 90)); }
  missionFail() { [392, 330, 262].forEach((f, i) => setTimeout(() => this.blip(f, 0.2, 'sawtooth', 0.12), i * 110)); }
  siren(on) {
    if (!this.ctx) return;
    if (on && !this.sirenOsc) {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = 'triangle'; o.frequency.value = 700;
      g.gain.value = 0.05;
      const lfo = this.ctx.createOscillator(), lg = this.ctx.createGain();
      lfo.frequency.value = 0.6; lg.gain.value = 280;
      lfo.connect(lg); lg.connect(o.frequency);
      o.connect(g); g.connect(this.master);
      o.start(); lfo.start();
      this.sirenOsc = o; this.sirenGain = g; this.sirenLfo = lfo;
    } else if (!on && this.sirenOsc) {
      try { this.sirenOsc.stop(); this.sirenLfo.stop(); } catch (e) {}
      this.sirenOsc = null; this.sirenGain = null; this.sirenLfo = null;
    }
  }
  setEngine(rpm01, on) {
    if (!this.ctx) return;
    if (on && !this.engineOsc) {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = 'sawtooth'; o.frequency.value = 60;
      g.gain.value = 0.04;
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 500;
      o.connect(f); f.connect(g); g.connect(this.master);
      o.start();
      this.engineOsc = o; this.engineGain = g; this.engineFilter = f;
    } else if (!on && this.engineOsc) {
      try { this.engineOsc.stop(); } catch (e) {}
      this.engineOsc = null; this.engineGain = null; this.engineFilter = null;
    }
    if (this.engineOsc) {
      this.engineOsc.frequency.value = 55 + rpm01 * 140;
      this.engineFilter.frequency.value = 300 + rpm01 * 900;
      this.engineGain.gain.value = 0.03 + rpm01 * 0.05;
    }
  }
  radioStep() {
    if (!this.ctx || !this.radioOn || this.muted) return;
    const st = this.stations[this.station];
    const scale = st.minor ? [0, 3, 5, 7, 10, 12] : [0, 2, 4, 7, 9, 12];
    const root = 110;
    const note = scale[Math.floor(Math.random() * scale.length)];
    const f = root * Math.pow(2, note / 12) * (Math.random() < 0.25 ? 2 : 1);
    this.blip(f, 0.42, 'triangle', 0.1);
    if (Math.random() < 0.3) this.blip(f / 2, 0.5, 'sine', 0.12);
  }
  setRadio(on, station) {
    this.radioOn = on;
    if (typeof station === 'number') this.station = station % 3;
    if (this.radioTimer) { clearInterval(this.radioTimer); this.radioTimer = null; }
    if (on) {
      const st = this.stations[this.station];
      this.radioTimer = setInterval(() => this.radioStep(), 60000 / st.bpm / 2);
    }
  }
  nextStation() {
    this.station = (this.station + 1) % 3;
    if (this.radioOn) this.setRadio(true, this.station);
    return this.stations[this.station].name;
  }
}
