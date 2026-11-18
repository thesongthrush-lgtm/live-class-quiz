// In-browser stand-in for Firebase, used by test mode. Same API as net-firebase.js.
// Everything stays on this device; NPC "phones" are bots driven by the host page.

import { pick, randomNick, randomEmoji, normalise, shuffle } from "./common.js";

export class SimHub {
  constructor() {
    this.state = null; this.players = {}; this.answers = {}; this.reqs = {}; this.flags = {}; this.feedback = {};
    this.subs = new Set();
  }
  _emit(kind) { for (const s of [...this.subs]) if (s.kind === kind) setTimeout(() => this.subs.has(s) && s.fn(s.get()), 0); }
  _sub(kind, get, fn) { const s = { kind, get, fn }; this.subs.add(s); setTimeout(() => this.subs.has(s) && fn(get()), 0); return () => this.subs.delete(s); }
  now() { return Date.now(); }

  hostApi() {
    const h = this;
    return {
      live: false,
      now: () => h.now(),
      async createGame() { h.state = { phase: "lobby" }; h._emit("state"); },
      onPlayers: fn => h._sub("players", () => structuredClone(h.players), fn),
      onAnswers: (qKey, fn) => h._sub("answers", () => structuredClone(h.answers[qKey] || {}), fn),
      onReqs: (qKey, fn) => h._sub("reqs", () => structuredClone(h.reqs[qKey] || {}), fn),
      onFlags: fn => h._sub("flags", () => structuredClone(h.flags), fn),
      async setState(s) { h.state = structuredClone(s); h._emit("state"); },
      async setFeedback(uid, patch) { h.feedback[uid] = Object.assign({}, h.feedback[uid], structuredClone(patch)); h._emit("feedback"); },
      async updatePlayer(uid, patch) { if (h.players[uid]) { Object.assign(h.players[uid], patch); h._emit("players"); h._emit("self"); } },
      async destroy() { h.state = { phase: "closed" }; h._emit("state"); },
    };
  }

  playerApi(uid) {
    const h = this;
    const okToAnswer = qKey => h.state && h.state.phase === "question" && !h.state.paused && h.state.qKey === qKey && h.now() <= h.state.deadline + 1500;
    return {
      uid, live: false,
      now: () => h.now(),
      async join(_code, p) {
        if (h.players[uid] && h.players[uid].kicked) throw new Error("removed");
        h.players[uid] = Object.assign({}, h.players[uid], { name: p.name, emoji: p.emoji, joined: h.now() });
        h._emit("players"); h._emit("self");
      },
      onState: fn => h._sub("state", () => structuredClone(h.state), fn),
      onFeedback: fn => h._sub("feedback", () => structuredClone(h.feedback[uid] || {}), fn),
      onSelf: fn => h._sub("self", () => structuredClone(h.players[uid] || null), fn),
      async answer(qKey, v, pu) {
        if (!okToAnswer(qKey)) throw new Error("closed");
        h.answers[qKey] = h.answers[qKey] || {};
        if (h.answers[qKey][uid]) throw new Error("already answered");
        h.answers[qKey][uid] = { v, t: h.now(), pu: pu || null };
        h._emit("answers");
      },
      async request(qKey, what) {
        if (!h.state || h.state.qKey !== qKey) return;
        h.reqs[qKey] = h.reqs[qKey] || {}; h.reqs[qKey][uid] = what; h._emit("reqs");
      },
      async flag(qKey) { h.flags[qKey] = h.flags[qKey] || {}; h.flags[qKey][uid] = true; h._emit("flags"); },
    };
  }
}

// ---- NPC bots ------------------------------------------------------------
const usedNames = new Set(), usedEmojis = new Set();
function uniqueProfile() {
  let name = randomNick(), emoji = randomEmoji(), g = 0;
  while (usedNames.has(name) && g++ < 50) name = randomNick();
  g = 0; while (usedEmojis.has(emoji) && g++ < 50) emoji = randomEmoji();
  usedNames.add(name); usedEmojis.add(emoji);
  return { name, emoji };
}
const SKILL = { weak: 0.4, average: 0.65, strong: 0.88 };

function misspell(word) {
  const w = word.toUpperCase();
  if (w.length < 3) return w + "E";
  const i = 1 + Math.floor(Math.random() * (w.length - 2));
  const r = Math.random();
  if (r < 0.33) return w.slice(0, i) + w.slice(i + 1);                    // drop a letter
  if (r < 0.66) return w.slice(0, i) + w[i + 1] + w[i] + w.slice(i + 2);  // swap two letters
  return w.slice(0, i) + w[i] + w.slice(i);                                // double a letter
}

export class Bot {
  constructor(hub, uid, skillName, oracle) {
    this.api = hub.playerApi(uid); this.uid = uid; this.skillName = skillName;
    this.skill = SKILL[skillName]; this.oracle = oracle; this.lastQ = null; this.pu = null; this.timer = null;
    this.api.onFeedback(f => { this.pu = f && f.pu ? f.pu : null; this.hint = f && f.hint; });
    this.api.onState(s => this.onState(s));
  }
  join() { return this.api.join("SIM", uniqueProfile()); }
  onState(s) {
    if (!s || s.phase !== "question" || s.paused || s.qKey === this.lastQ) return;
    this.lastQ = s.qKey;
    const q = this.oracle(s.qKey); if (!q) return;
    const dur = s.deadline - this.api.now();
    if (Math.random() < 0.04) return; // occasionally doesn't answer at all
    const speed = this.skillName === "strong" ? 0.35 : this.skillName === "weak" ? 0.75 : 0.55;
    const delay = Math.max(1200, dur * (speed * (0.5 + Math.random() * 0.6)));
    const usePu = this.pu && Math.random() < 0.5 ? this.pu : null;
    if (usePu === "hint") this.api.request(s.qKey, "hint");
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      const right = Math.random() < this.skill * (q.format === "choice" ? 1 : 0.85);
      let v;
      if (q.format === "choice") {
        const wrong = [1, 2, 3, 4].slice(0, q._options.length).filter(n => n !== q._answer);
        v = right ? q._answer : pick(wrong);
      } else if (q.format === "letters") {
        const a = q.answers[0];
        v = right ? a.toUpperCase() : (Math.random() < 0.6 ? misspell(a) : misspell(misspell(a)));
      } else {
        // map each correct word to a display index (handles repeated words)
        const used = new Set(); const idx = q.sentence.map(w => { const i = q._words.findIndex((x, j) => x === w && !used.has(j)); used.add(i); return i + 1; });
        v = right ? idx : shuffle(idx);
      }
      this.api.answer(s.qKey, v, usePu && usePu !== "hint" ? usePu : null).catch(() => {});
    }, delay);
  }
}

export function makeBots(hub, count, mix, oracle) {
  const skills = [];
  for (let i = 0; i < count; i++) {
    if (mix === "weak" || mix === "average" || mix === "strong") skills.push(mix);
    else skills.push(["weak", "average", "average", "strong"][i % 4]);
  }
  return skills.map((sk, i) => new Bot(hub, "npc" + (i + 1), sk, oracle));
}
export { normalise };

// ---- Hybrid: a real Firebase game that NPCs also play in -------------------
// Real phones talk to Firebase; NPCs (and the on-screen phone preview) stay on this
// computer. The host screen sees one merged set of players and answers.
export function hybridHost(live, hub) {
  const sim = hub.hostApi();
  hub.now = () => live.now();               // bots and timers share Firebase's clock
  const local = uid => uid === "you" || /^npc\d+$/.test(uid);
  const both = (subA, subB, merge) => fn => {
    let a = {}, b = {};
    const u1 = subA(v => { a = v || {}; fn(merge(a, b)); });
    const u2 = subB(v => { b = v || {}; fn(merge(a, b)); });
    return () => { u1 && u1(); u2 && u2(); };
  };
  const flat = (a, b) => Object.assign({}, a, b);
  const deep = (a, b) => { const o = {}; for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) o[k] = Object.assign({}, a[k], b[k]); return o; };
  return {
    live: false, hybrid: true,
    now: () => live.now(),
    async createGame(c) { await live.createGame(c); await sim.createGame(c); },
    codeFree: c => live.codeFree(c),
    onPlayers: both(fn => live.onPlayers(fn), fn => sim.onPlayers(fn), flat),
    onAnswers: (q, fn) => both(f => live.onAnswers(q, f), f => sim.onAnswers(q, f), flat)(fn),
    onReqs: (q, fn) => both(f => live.onReqs(q, f), f => sim.onReqs(q, f), flat)(fn),
    onFlags: both(fn => live.onFlags(fn), fn => sim.onFlags(fn), deep),
    setState: s => Promise.all([live.setState(s), sim.setState(s)]),
    setFeedback: (uid, p) => (local(uid) ? sim : live).setFeedback(uid, p),
    updatePlayer: (uid, p) => (local(uid) ? sim : live).updatePlayer(uid, p),
    destroy: () => Promise.all([live.destroy().catch(() => {}), sim.destroy()]),
  };
}
