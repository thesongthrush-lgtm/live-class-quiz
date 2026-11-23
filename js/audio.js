// Music and sound effects, synthesised in the browser (no audio files needed).
import { storageGet, storageSet } from "./common.js?v=20261123205959";

const prefs = Object.assign({ music: true, sfx: true, vol: 0.8 }, storageGet("lq.audio", {}));
let ctx = null, master, musicBus, sfxBus, noiseBuf;
const MUSIC_LEVEL = 0.3, SFX_LEVEL = 0.9;

export function audioPrefs() { return { ...prefs }; }
export function setPref(k, v) {
  prefs[k] = v; storageSet("lq.audio", prefs);
  if (!ctx) return;
  const t = ctx.currentTime;
  if (k === "music") musicBus.gain.setTargetAtTime(v ? MUSIC_LEVEL : 0, t, 0.1);
  if (k === "sfx") sfxBus.gain.setTargetAtTime(v ? SFX_LEVEL : 0, t, 0.05);
  if (k === "vol") master.gain.setTargetAtTime(v, t, 0.05);
}

export function unlock() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = prefs.vol;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    master.connect(comp); comp.connect(ctx.destination);
    musicBus = ctx.createGain(); musicBus.gain.value = prefs.music ? MUSIC_LEVEL : 0; musicBus.connect(master);
    sfxBus = ctx.createGain(); sfxBus.gain.value = prefs.sfx ? SFX_LEVEL : 0; sfxBus.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    if (pendingSong) { const s = pendingSong; pendingSong = null; playMusic(s); }
  }
  if (ctx.state === "suspended") ctx.resume();
}
["pointerdown", "keydown"].forEach(ev => document.addEventListener(ev, unlock, { capture: true }));

const hz = m => 440 * Math.pow(2, (m - 69) / 12);
const ready = () => ctx && ctx.state === "running";

// ---------------------------------------------------------------- voices
function env(g, t, a, peak, d, sustain = 0.0001) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(Math.max(sustain, 0.0001), t + a + d);
}
function tone(bus, t, { type = "sine", f, f2, a = 0.005, d = 0.3, vol = 0.3, filter, q = 1, detune = 0 }) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); o.detune.value = detune;
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + a + d);
  env(g, t, a, vol, d);
  let node = o;
  if (filter) { const fl = ctx.createBiquadFilter(); fl.type = "lowpass"; fl.frequency.value = filter; fl.Q.value = q; o.connect(fl); node = fl; }
  node.connect(g); g.connect(bus);
  o.start(t); o.stop(t + a + d + 0.05);
}
function noise(bus, t, { d = 0.1, vol = 0.2, type = "highpass", f = 6000, f2, q = 0.8, a = 0.001 }) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
  if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + d);
  const g = ctx.createGain(); env(g, t, a, vol, d);
  s.connect(fl); fl.connect(g); g.connect(bus);
  s.start(t, Math.random()); s.stop(t + a + d + 0.05);
}
const kick = (bus, t, v = 0.7) => tone(bus, t, { f: 150, f2: 45, d: 0.22, vol: v });
const snare = (bus, t, v = 0.25) => { noise(bus, t, { d: 0.14, vol: v, type: "bandpass", f: 1800, q: 0.7 }); tone(bus, t, { type: "triangle", f: 220, f2: 160, d: 0.08, vol: v * 0.5 }); };
const hat = (bus, t, v = 0.06, open) => noise(bus, t, { d: open ? 0.18 : 0.04, vol: v, f: 8000 });
const bass = (bus, t, m, d, v = 0.32) => tone(bus, t, { type: "sawtooth", f: hz(m), d, vol: v, filter: 520, q: 4 });
const pluck = (bus, t, m, v = 0.12, d = 0.28) => { tone(bus, t, { type: "triangle", f: hz(m), d, vol: v }); tone(bus, t, { type: "square", f: hz(m), d: d * 0.5, vol: v * 0.25, filter: 2400 }); };
function pad(bus, t, ms, d, v = 0.05) {
  ms.forEach(m => { [-6, 6].forEach(dt => {
    const o = ctx.createOscillator(), g = ctx.createGain(), fl = ctx.createBiquadFilter();
    o.type = "sawtooth"; o.frequency.value = hz(m); o.detune.value = dt; fl.type = "lowpass"; fl.frequency.value = 1100;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 0.25); g.gain.setValueAtTime(v, t + d - 0.2); g.gain.linearRampToValueAtTime(0.0001, t + d);
    o.connect(fl); fl.connect(g); g.connect(bus); o.start(t); o.stop(t + d + 0.05);
  }); });
}

// ---------------------------------------------------------------- music
// Each bar: [bass note, chord notes]. 16 steps per bar.
const SONGS = {
  lobby:    { bpm: 112, style: "bouncy", bars: [[48, [60, 64, 67]], [43, [59, 62, 67]], [45, [60, 64, 69]], [41, [60, 65, 69]]] },
  question: { bpm: 126, style: "tense",  bars: [[45, [57, 60, 64]], [41, [57, 60, 65]], [43, [55, 59, 62]], [40, [56, 59, 64]]] },
  victory:  { bpm: 122, style: "bright", bars: [[41, [65, 69, 72]], [48, [64, 67, 72]], [50, [62, 65, 69]], [46, [62, 65, 70]]] },
};
let song = null, songGain = null, nextTime = 0, step = 0, timer = null, intensity = 0, pendingSong = null, ducked = false;

export function playMusic(name) {
  if (!ctx) { pendingSong = name; return; }
  if (song === SONGS[name] && timer) return;
  stopMusic(0.4);
  song = SONGS[name]; step = 0; intensity = 0;
  songGain = ctx.createGain(); songGain.gain.value = ducked ? 0.25 : 1; songGain.connect(musicBus);
  nextTime = ctx.currentTime + 0.12;
  timer = setInterval(schedule, 25);
}
export function stopMusic(fade = 0.6) {
  pendingSong = null;
  if (timer) clearInterval(timer); timer = null;
  if (songGain && ctx) { const g = songGain; g.gain.setTargetAtTime(0.0001, ctx.currentTime, fade / 3); setTimeout(() => g.disconnect(), fade * 1000 + 600); }
  songGain = null; song = null;
}
export function setIntensity(n) { intensity = n; }
export function duckMusic(on) { ducked = on; if (songGain && ctx) songGain.gain.setTargetAtTime(on ? 0.25 : 1, ctx.currentTime, 0.15); }

function schedule() {
  if (!song || !ctx) return;
  const spb = 60 / song.bpm / 4;
  while (nextTime < ctx.currentTime + 0.12) {
    playStep(song, step, nextTime, spb);
    nextTime += spb; step++;
  }
}
function playStep(sg, n, t, spb) {
  const bus = songGain; if (!bus) return;
  const s = n % 16, [b, chord] = sg.bars[Math.floor(n / 16) % sg.bars.length];
  if (sg.style === "bouncy") {
    if (s === 0 || s === 8) kick(bus, t, 0.55);
    if (s === 4 || s === 12) snare(bus, t, 0.14);
    if (s % 2 === 0) hat(bus, t, 0.035, s % 4 === 2);
    if ([0, 3, 8, 11].includes(s)) bass(bus, t, b, spb * 2.2, 0.26);
    if (s % 2 === 0) pluck(bus, t, chord[(s / 2) % 3] + 12, 0.07);
    if (s === 0) pad(bus, t, chord, spb * 16, 0.025);
  } else if (sg.style === "tense") {
    if (s % 2 === 0) bass(bus, t, b + (s % 4 === 2 ? 12 : 0), spb * 1.6, 0.24);
    hat(bus, t, intensity ? 0.05 : 0.025);
    if (intensity && s % 4 === 0) kick(bus, t, 0.5);
    if ([0, 3, 6, 10, 13].includes(s)) pluck(bus, t, chord[[0, 1, 2, 1, 2][[0, 3, 6, 10, 13].indexOf(s)]] + 12, 0.06, 0.2);
    if (s === 0) pad(bus, t, chord, spb * 16, 0.02);
  } else {
    if (s === 0 || s === 8 || s === 10) kick(bus, t, 0.55);
    if (s === 4 || s === 12) snare(bus, t, 0.18);
    if (s % 2 === 0) hat(bus, t, 0.04);
    if ([0, 6, 8, 14].includes(s)) bass(bus, t, b, spb * 2, 0.26);
    const mel = [12, null, 16, 19, null, 16, 24, null, 19, null, 16, 12, null, 16, 19, null];
    if (mel[s] != null) pluck(bus, t, chord[0] + mel[s] - 12, 0.08, 0.25);
    if (s === 0) pad(bus, t, chord, spb * 16, 0.03);
  }
}

// ---------------------------------------------------------------- effects
const now = () => ctx.currentTime + 0.01;
export const sfx = {
  pop() { if (!ready()) return; const t = now(); tone(sfxBus, t, { f: 520, f2: 1250, a: 0.005, d: 0.12, vol: 0.25 }); tone(sfxBus, t + 0.06, { f: 1400, d: 0.1, vol: 0.08 }); },
  blip() { if (!ready()) return; tone(sfxBus, now(), { type: "triangle", f: 1046, d: 0.07, vol: 0.12 }); },
  tick(last) { if (!ready()) return; const t = now(); tone(sfxBus, t, { type: "square", f: last ? 1760 : 1320, d: 0.04, vol: 0.12, filter: 3000 }); noise(sfxBus, t, { d: 0.02, vol: 0.06, type: "bandpass", f: 3000 }); },
  whoosh() { if (!ready()) return; noise(sfxBus, now(), { d: 0.45, vol: 0.22, type: "bandpass", f: 300, f2: 3200, q: 1.2, a: 0.12 }); },
  start() { if (!ready()) return; const t = now(); [72, 76, 79].forEach((m, i) => pluck(sfxBus, t + i * 0.07, m, 0.18, 0.35)); sfx.whoosh(); },
  buzzer() { if (!ready()) return; const t = now(); [110, 116].forEach(f => tone(sfxBus, t, { type: "sawtooth", f, a: 0.01, d: 0.55, vol: 0.16, filter: 900 })); },
  reveal() { if (!ready()) return; const t = now(); [84, 88, 91, 96].forEach((m, i) => { tone(sfxBus, t + i * 0.08, { f: hz(m), d: 0.9, vol: 0.14 }); tone(sfxBus, t + i * 0.08, { f: hz(m) * 2.01, d: 0.4, vol: 0.03 }); }); },
  sparkle() { if (!ready()) return; const t = now(); [88, 91, 95, 100, 103, 107].forEach((m, i) => tone(sfxBus, t + i * 0.05, { f: hz(m), d: 0.25, vol: 0.07 })); },
  pause() { if (!ready()) return; const t = now(); tone(sfxBus, t, { type: "triangle", f: 660, f2: 330, d: 0.2, vol: 0.15 }); },
  // Accelerating snare roll with a crescendo; returns its length in seconds.
  drumroll(dur = 2.2) {
    if (!ready()) return dur; const t0 = now(); let t = t0, gap = 0.09;
    while (t < t0 + dur) { const p = (t - t0) / dur; snare(sfxBus, t, 0.05 + p * 0.22); gap = Math.max(0.035, gap * 0.985); t += gap; }
    tone(sfxBus, t0, { type: "sine", f: 55, a: dur * 0.9, d: 0.3, vol: 0.2 });
    return dur;
  },
  cymbal() { if (!ready()) return; noise(sfxBus, now(), { d: 1.6, vol: 0.22, f: 5000, a: 0.002 }); kick(sfxBus, now(), 0.8); },
  fanfare(big) {
    if (!ready()) return; const t = now();
    const notes = big ? [[67, 0, 0.14], [67, 0.16, 0.14], [67, 0.32, 0.14], [72, 0.5, 0.9], [76, 0.5, 0.9], [79, 0.5, 0.9], [84, 0.5, 1.2]] : [[67, 0, 0.12], [72, 0.14, 0.6], [76, 0.14, 0.6]];
    notes.forEach(([m, dt, d]) => { tone(sfxBus, t + dt, { type: "sawtooth", f: hz(m), a: 0.02, d, vol: 0.12, filter: 2600, q: 2 }); tone(sfxBus, t + dt, { type: "sawtooth", f: hz(m), detune: 8, a: 0.02, d, vol: 0.06, filter: 2000 }); });
    if (big) { kick(sfxBus, t + 0.5, 0.9); noise(sfxBus, t + 0.5, { d: 2, vol: 0.18, f: 5000 }); }
  },
  applause(dur = 3) {
    if (!ready()) return; const t0 = now();
    for (let i = 0; i < dur * 70; i++) { const t = t0 + Math.random() * dur; const fade = 1 - (t - t0) / dur; noise(sfxBus, t, { d: 0.03, vol: 0.05 + 0.12 * fade * Math.random(), type: "bandpass", f: 1200 + Math.random() * 2500, q: 1.5 }); }
  },
  award() { if (!ready()) return; const t = now(); sfx.whoosh(); [79, 84, 88].forEach((m, i) => tone(sfxBus, t + 0.25 + i * 0.09, { f: hz(m), d: 0.7, vol: 0.13 })); },
  // Weakest Link extras
  bank() { if (!ready()) return; const t = now(); [79, 84, 88, 91, 96].forEach((m, i) => { tone(sfxBus, t + i * 0.055, { type: "triangle", f: hz(m), d: 0.35, vol: 0.13 }); tone(sfxBus, t + i * 0.055, { f: hz(m) * 2.4, d: 0.12, vol: 0.03 }); }); noise(sfxBus, t + 0.2, { d: 0.5, vol: 0.06, f: 7000 }); },
  correct() { if (!ready()) return; const t = now(); tone(sfxBus, t, { type: "triangle", f: hz(76), d: 0.12, vol: 0.16 }); tone(sfxBus, t + 0.1, { type: "triangle", f: hz(83), d: 0.3, vol: 0.16 }); },
  sting() { if (!ready()) return; const t = now(); [38, 45, 50, 53].forEach(m => tone(sfxBus, t, { type: "sawtooth", f: hz(m), a: 0.08, d: 1.6, vol: 0.07, filter: 700, q: 3 })); noise(sfxBus, t, { d: 1.4, vol: 0.12, type: "bandpass", f: 200, f2: 2400, q: 1, a: 0.6 }); kick(sfxBus, t + 0.62, 0.9); },
  gong() { if (!ready()) return; const t = now(); [98, 147, 196.5, 262].forEach((f, i) => tone(sfxBus, t, { f, a: 0.004, d: 2.4 - i * 0.4, vol: 0.12 / (i + 1) })); noise(sfxBus, t, { d: 0.8, vol: 0.08, type: "bandpass", f: 900, q: 2 }); },
};
