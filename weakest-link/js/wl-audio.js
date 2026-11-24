// Last One Standing music and sound effects, synthesised in the browser.
// Builds on the shared audio engine; nothing here changes Rapidiom's sounds.
import { registerSongs, audioKit, sfx as base } from "../../js/audio.js?v=20261124190320";

const rnd = (a, b) => a + Math.random() * (b - a);

// ---------------------------------------------------------------- music
registerSongs({
  // Lobby: a cool, moody groove while people join.
  wlLobby: {
    bpm: 100,
    bars: [[40, [59, 62, 67]], [36, [60, 64, 67]], [38, [57, 62, 65]], [35, [59, 62, 66]]],
    play(k) {
      const { bus, s, t, spb, b, chord } = k;
      if (s === 0 || s === 10) k.kick(bus, t, 0.42);
      if (s === 4 || s === 12) k.snare(bus, t, 0.09);
      if (s % 2 === 0) k.hat(bus, t, s % 4 === 2 ? 0.035 : 0.02, s === 14);
      if ([0, 3, 6, 8, 11].includes(s)) k.bass(bus, t, b, spb * 1.8, 0.22);
      if ([2, 5, 9, 13].includes(s)) k.pluck(bus, t, chord[[0, 1, 2, 1][[2, 5, 9, 13].indexOf(s)]] + 12, 0.05, 0.3);
      if (s === 0) k.pad(bus, t, chord, spb * 16, 0.02);
    },
  },
  // Round play: a low, driving pulse. Intensity (0–1) rises as the round clock runs down.
  wlPulse: {
    bpm: 104,
    bars: [[38, [62, 65, 69]], [34, [62, 65, 70]], [43, [62, 67, 70]], [45, [61, 64, 69]]],
    play(k) {
      const { bus, s, t, spb, b, chord, intensity: I } = k;
      if (s % 2 === 0) k.bass(bus, t, b, spb * 1.4, 0.2 + I * 0.08);
      if (s === 0) k.kick(bus, t, 0.5);
      if (s === 3) k.kick(bus, t, 0.28);                     // heartbeat "lub-dub"
      if (I > 0.35 && (s === 8 || s === 11)) k.kick(bus, t, s === 8 ? 0.45 : 0.25);
      if (I > 0.65 && (s === 4 || s === 12)) k.kick(bus, t, 0.4);
      k.hat(bus, t, (s % 4 === 0 ? 0.045 : 0.02) * (0.7 + I * 0.6));
      if (I > 0.6 && s % 4 === 2) k.hat(bus, t, 0.04, true);
      const pat = [0, 2, 1, 2];
      if (s % 2 === 0) k.pluck(bus, t, chord[pat[(s / 2) % 4]] + (I > 0.65 ? 12 : 0), 0.045 + I * 0.03, 0.15);
      if (s === 0) k.pad(bus, t, chord.map(m => m - 12), spb * 16, 0.018 + I * 0.01);
      if (I > 0.85 && s >= 12 && k.bar % 2 === 1) k.snare(bus, t, 0.04 + (s - 12) * 0.03);
    },
  },
  // Voting: calm and mysterious.
  wlVote: {
    bpm: 76,
    bars: [[45, [57, 60, 64]], [41, [57, 60, 65]], [38, [57, 62, 65]], [40, [56, 59, 64]]],
    play(k) {
      const { bus, s, t, spb, b, chord } = k;
      if (s === 0) { k.pad(bus, t, chord, spb * 16, 0.026); k.tone(bus, t, { type: "sine", f: k.hz(b - 12), a: 0.4, d: spb * 15, vol: 0.12 }); k.kick(bus, t, 0.2); }
      if (s === 8) k.kick(bus, t, 0.12);
      if ([0, 3, 6, 10, 13].includes(s)) {
        const m = chord[[0, 1, 2, 1, 2][[0, 3, 6, 10, 13].indexOf(s)]] + 12;
        k.tone(bus, t, { type: "sine", f: k.hz(m), d: 0.9, vol: 0.05 });
        k.tone(bus, t, { type: "sine", f: k.hz(m) * 3.01, d: 0.3, vol: 0.008 });
      }
      if (s % 4 === 2) k.hat(bus, t, 0.012);
    },
  },
  // The final: faster, with toms.
  wlFinal: {
    bpm: 126,
    bars: [[36, [60, 63, 67]], [44, [60, 63, 68]], [46, [58, 62, 65]], [43, [59, 62, 67]]],
    play(k) {
      const { bus, s, t, spb, b, chord } = k;
      if (s % 4 === 0) k.kick(bus, t, 0.5);
      if (s === 4 || s === 12) k.snare(bus, t, 0.12);
      k.hat(bus, t, s % 2 ? 0.018 : 0.035);
      k.bass(bus, t, b + (s % 2 ? 12 : 0), spb * 0.9, 0.18);
      if ([14, 15].includes(s) && k.bar % 2) k.tone(bus, t, { f: s === 14 ? 150 : 110, f2: 60, d: 0.18, vol: 0.3 });
      if ([0, 3, 6, 10].includes(s)) k.pluck(bus, t, chord[[0, 1, 2, 1][[0, 3, 6, 10].indexOf(s)]] + 12, 0.06, 0.14);
      if (s === 0) k.pad(bus, t, chord, spb * 16, 0.02);
    },
  },
  // Champion: bright and triumphant.
  wlChampion: {
    bpm: 120,
    bars: [[41, [65, 69, 72]], [48, [64, 67, 72]], [50, [62, 65, 69]], [46, [62, 65, 70]]],
    play(k) {
      const { bus, s, t, spb, b, chord } = k;
      if (s === 0 || s === 8 || s === 10) k.kick(bus, t, 0.5);
      if (s === 4 || s === 12) k.snare(bus, t, 0.16);
      if (s % 2 === 0) k.hat(bus, t, 0.035, s === 6 || s === 14);
      if ([0, 6, 8, 14].includes(s)) k.bass(bus, t, b, spb * 2, 0.24);
      if ([0, 3, 8, 11].includes(s)) chord.forEach(m => k.tone(bus, t, { type: "sawtooth", f: k.hz(m), a: 0.01, d: spb * (s % 8 ? 1.5 : 2.5), vol: 0.035, filter: 2200, q: 2 }));
      const mel = [12, null, null, 16, null, null, 19, null, 24, null, null, 19, null, 16, null, null];
      if (mel[s] != null) k.pluck(bus, t, chord[0] + mel[s] - 12, 0.07, 0.3);
      if (s === 0) k.pad(bus, t, chord, spb * 16, 0.025);
    },
  },
});

// ---------------------------------------------------------------- effects
function bell(k, t, f, vol = 0.12, d = 1.4) {
  [[1, 1], [2.01, 0.4], [3.02, 0.22], [4.3, 0.12]].forEach(([r, v]) => k.tone(k.sfxBus, t, { f: f * r, a: 0.002, d: d / r ** 0.5, vol: vol * v }));
}
function cymbal(k, t, vol = 0.2, d = 1.6) { k.noise(k.sfxBus, t, { d, vol, f: 5000, a: 0.002 }); }
function stab(k, t, ms, d = 0.5, vol = 0.07) {
  ms.forEach(m => { k.tone(k.sfxBus, t, { type: "sawtooth", f: k.hz(m), a: 0.012, d, vol, filter: 2600, q: 2 }); k.tone(k.sfxBus, t, { type: "sawtooth", f: k.hz(m), detune: 9, a: 0.012, d, vol: vol * 0.5, filter: 1800 }); });
}
function boom(k, t, vol = 0.9) { k.tone(k.sfxBus, t, { f: 120, f2: 32, a: 0.004, d: 0.9, vol }); k.noise(k.sfxBus, t, { d: 0.5, vol: vol * 0.2, type: "lowpass", f: 400 }); }
function riser(k, t, d = 1, vol = 0.16) { k.noise(k.sfxBus, t, { d, vol, type: "bandpass", f: 200, f2: 4000, q: 1.4, a: d * 0.9 }); k.tone(k.sfxBus, t, { type: "sine", f: 110, f2: 440, a: d * 0.9, d: 0.1, vol: vol * 0.4 }); }

export const wlSfx = {
  // A dramatic boom before each round.
  roundIntro() { const k = audioKit(); if (!k) return; const t = k.t(); riser(k, t, 0.8, 0.12); boom(k, t + 0.8); stab(k, t + 0.8, [50, 57, 62, 65], 1.1, 0.06); cymbal(k, t + 0.8, 0.14, 1.8); },
  // 3, 2, 1 …
  count(n) { const k = audioKit(); if (!k) return; const t = k.t(); const f = n === 1 ? 880 : 660; k.tone(k.sfxBus, t, { f, d: 0.28, vol: 0.18 }); k.tone(k.sfxBus, t, { type: "square", f, d: 0.08, vol: 0.04, filter: 2500 }); k.kick(k.sfxBus, t, 0.35); },
  // … Go!
  go() { const k = audioKit(); if (!k) return; const t = k.t(); bell(k, t, 1046, 0.14, 1.6); bell(k, t, 1318, 0.08, 1.4); boom(k, t, 0.7); cymbal(k, t, 0.16, 1.4); base.whoosh(); },
  // Round clock hits zero: a two-tone klaxon.
  timeUp() {
    const k = audioKit(); if (!k) return; const t = k.t();
    [0, 0.32, 0.64].forEach((dt, i) => [440, 349].forEach((f, j) => k.tone(k.sfxBus, t + dt + j * 0.16, { type: "sawtooth", f: f * (i === 2 ? 0.9 : 1), a: 0.01, d: 0.14, vol: 0.09, filter: 1800, q: 3 })));
  },
  roundOver() { base.gong(); const k = audioKit(); if (k) stab(k, k.t() + 0.05, [38, 45, 50, 53], 1.4, 0.05); },
  // Answer locked in: a thunk and a short suspense riser.
  lockIn() { const k = audioKit(); if (!k) return; const t = k.t(); k.tone(k.sfxBus, t, { f: 200, f2: 80, d: 0.16, vol: 0.4 }); k.noise(k.sfxBus, t, { d: 0.03, vol: 0.12, type: "bandpass", f: 2400 }); riser(k, t + 0.08, 0.75, 0.08); },
  // Correct: chime that climbs with the chain step.
  correct(step = 0) {
    const k = audioKit(); if (!k) return; const t = k.t(); const r = 74 + Math.min(step, 12) * 1.5;
    [0, 4, 7, 12].forEach((iv, i) => k.tone(k.sfxBus, t + i * 0.05, { type: "triangle", f: k.hz(r + iv), d: 0.35, vol: 0.13 }));
    bell(k, t + 0.2, k.hz(r + 24), 0.05, 0.8);
  },
  // Wrong: a low buzz and the chain shattering.
  chainBreak(lit = 1) {
    const k = audioKit(); if (!k) return; const t = k.t();
    [98, 104].forEach(f => k.tone(k.sfxBus, t, { type: "sawtooth", f, a: 0.01, d: 0.55, vol: 0.13, filter: 900 }));
    if (lit <= 0) return;
    k.noise(k.sfxBus, t + 0.05, { d: 0.25, vol: 0.2, f: 3000 });
    for (let i = 0; i < 14 + lit * 2; i++) { const dt = 0.05 + Math.random() * 0.5; k.tone(k.sfxBus, t + dt, { type: "triangle", f: rnd(2200, 5200), d: rnd(0.05, 0.14), vol: rnd(0.02, 0.05) }); }
    k.tone(k.sfxBus, t + 0.05, { type: "sine", f: 900, f2: 120, d: 0.6, vol: 0.06 });
  },
  timeout() { base.buzzer(); },
  // Bank: coins and a "ka-ching".
  bank() {
    const k = audioKit(); if (!k) return; const t = k.t();
    k.noise(k.sfxBus, t, { d: 0.05, vol: 0.18, type: "bandpass", f: 3500, q: 2 });
    bell(k, t + 0.04, 1568, 0.1, 1.2); bell(k, t + 0.12, 2093, 0.08, 1.2);
    for (let i = 0; i < 14; i++) k.tone(k.sfxBus, t + 0.15 + i * 0.045 + Math.random() * 0.02, { type: "triangle", f: rnd(1800, 3400), d: 0.12, vol: 0.05 });
    stab(k, t + 0.1, [67, 72, 76, 79], 0.8, 0.04);
  },
  bankTick() { const k = audioKit(); if (!k) return; k.tone(k.sfxBus, k.t(), { type: "triangle", f: 1180, d: 0.05, vol: 0.09 }); },
  // Last five seconds: tick plus a heartbeat thump.
  tick(last) { base.tick(last); const k = audioKit(); if (k) k.kick(k.sfxBus, k.t(), last ? 0.6 : 0.35); },
  fifty() { const k = audioKit(); if (!k) return; const t = k.t(); k.noise(k.sfxBus, t, { d: 0.35, vol: 0.12, type: "bandpass", f: 3000, f2: 300, q: 1.5 }); [79, 72].forEach((m, i) => k.tone(k.sfxBus, t + 0.2 + i * 0.12, { type: "triangle", f: k.hz(m), d: 0.18, vol: 0.12 })); },
  voteIn() { const k = audioKit(); if (!k) return; k.tone(k.sfxBus, k.t(), { type: "sine", f: rnd(900, 1300), d: 0.12, vol: 0.06 }); },
  sweep() { const k = audioKit(); if (!k) return; k.noise(k.sfxBus, k.t(), { d: 0.7, vol: 0.1, type: "bandpass", f: 400, f2: 2600, q: 2, a: 0.3 }); },
  drumroll(d) { return base.drumroll(d); },
  // Vote result: a cymbal and bright chord.
  reveal() { const k = audioKit(); if (!k) return; const t = k.t(); cymbal(k, t, 0.16); k.kick(k.sfxBus, t, 0.8); base.reveal(); },
  // Finalists step into the light.
  finalists() { const k = audioKit(); if (!k) return; const t = k.t(); boom(k, t, 0.9); cymbal(k, t, 0.22, 2.2); stab(k, t, [55, 62, 67, 71, 74], 1.6, 0.06); setTimeout(() => wlSfx.slam(), 700); },
  slam() { const k = audioKit(); if (!k) return; const t = k.t(); boom(k, t, 1); k.noise(k.sfxBus, t, { d: 0.25, vol: 0.2, f: 2500 }); },
  finalStart() { const k = audioKit(); if (!k) return; const t = k.t(); riser(k, t, 0.9, 0.14); boom(k, t + 0.9, 0.8); stab(k, t + 0.9, [48, 55, 60, 63], 0.9, 0.06); },
  // Champion: drum hit, fanfare, bells and applause.
  winner() {
    const k = audioKit(); if (!k) return; const t = k.t();
    boom(k, t, 1); cymbal(k, t, 0.24, 2.6); base.fanfare(true);
    [1046, 1318, 1568, 2093].forEach((f, i) => bell(k, t + 0.6 + i * 0.12, f, 0.06, 1.6));
    setTimeout(() => base.applause(4), 700);
  },
  // A spotlight snapping on: a deep thump and a bright shimmer.
  spotlight() { const k = audioKit(); if (!k) return; const t = k.t(); boom(k, t, 0.8); k.noise(k.sfxBus, t, { d: 0.6, vol: 0.08, type: "bandpass", f: 6000, q: 3 }); bell(k, t + 0.05, 1568, 0.06, 1.2); stab(k, t, [57, 64, 69, 73], 0.9, 0.05); },
  // The lights go down at the end of a round: a power-down sweep.
  lightsOut() {
    const k = audioKit(); if (!k) return; const t = k.t();
    k.tone(k.sfxBus, t, { type: "sawtooth", f: 220, f2: 38, a: 0.01, d: 1.1, vol: 0.12, filter: 900 });
    k.tone(k.sfxBus, t, { type: "sine", f: 90, f2: 30, d: 1.2, vol: 0.35 });
    k.noise(k.sfxBus, t, { d: 0.9, vol: 0.1, type: "lowpass", f: 1800, f2: 120 });
    k.kick(k.sfxBus, t + 0.02, 0.7);
  },
  // Sudden death: a player is knocked out.
  eliminate() {
    const k = audioKit(); if (!k) return; const t = k.t();
    boom(k, t, 0.9);
    [55, 54].forEach((m, i) => k.tone(k.sfxBus, t + 0.05 + i * 0.22, { type: "sawtooth", f: k.hz(m - 12), a: 0.01, d: 0.4, vol: 0.12, filter: 1100, q: 2 }));
    k.noise(k.sfxBus, t, { d: 0.3, vol: 0.14, f: 2600 });
  },
  pause() { base.pause(); },
  blip() { base.blip(); },
  pop() { base.pop(); },
};
