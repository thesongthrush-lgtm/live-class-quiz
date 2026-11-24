// Last One Standing transports. Same idea as Rapidiom's: a live Firebase transport, an
// in-browser stand-in for test mode, and a hybrid where real phones and NPCs play together.
// Live games live under wl/{code} in the shared Firebase project.

import { pick, randomEmoji } from "../../js/common.js?v=20261124190320";
import { nameMaker } from "./wl-names.js?v=20261124190320";

const SDK = "https://www.gstatic.com/firebasejs/10.12.2/";
let fb = null;

async function boot(config) {
  if (fb) return fb;
  const [appM, authM, dbM] = await Promise.all([
    import(SDK + "firebase-app.js"), import(SDK + "firebase-auth.js"), import(SDK + "firebase-database.js"),
  ]);
  const app = appM.initializeApp(config);
  const auth = authM.getAuth(app);
  const db = dbM.getDatabase(app);
  const user = await new Promise((resolve, reject) => {
    const off = authM.onAuthStateChanged(auth, u => { if (u) { off(); resolve(u); } });
    authM.signInAnonymously(auth).catch(reject);
  });
  let offset = 0;
  dbM.onValue(dbM.ref(db, ".info/serverTimeOffset"), s => { offset = s.val() || 0; });
  fb = { ...dbM, db, uid: user.uid, now: () => Date.now() + offset };
  return fb;
}
const listen = (f, path, fn) => f.onValue(f.ref(f.db, path), s => fn(s.val()), err => console.warn("listen failed", path, err && err.message));

export async function hostNet(config) {
  const f = await boot(config);
  let code = null;
  const p = sub => `wl/${code}/${sub}`;
  return {
    live: true, uid: f.uid,
    now: () => f.now(),
    async createGame(c) { code = c; await f.set(f.ref(f.db, `wl/${c}`), { host: f.uid, createdAt: f.serverTimestamp(), state: { phase: "lobby" } }); },
    async resumeGame(c) { code = c; const s = await f.get(f.ref(f.db, `wl/${c}/host`)); return s.val() === f.uid; },
    async codeFree(c) { try { const s = await f.get(f.ref(f.db, `wl/${c}/state`)); return !s.exists(); } catch { return true; } },
    onPlayers: fn => listen(f, p("players"), v => fn(v || {})),
    onBank: (k, fn) => listen(f, p(`bank/${k}`), v => fn(v || {})),
    onAnswers: (k, fn) => listen(f, p(`answers/${k}`), v => fn(v || {})),
    onVotes: (k, fn) => listen(f, p(`votes/${k}`), v => fn(v || {})),
    setState: s => f.set(f.ref(f.db, p("state")), s),
    setFeedback: (uid, patch) => f.update(f.ref(f.db, p(`feedback/${uid}`)), patch),
    updatePlayer: (uid, patch) => f.update(f.ref(f.db, p(`players/${uid}`)), patch),
    destroy: () => f.remove(f.ref(f.db, `wl/${code}`)),
  };
}

export async function playerNet(config, code) {
  const f = await boot(config);
  const p = sub => `wl/${code}/${sub}`;
  return {
    live: true, uid: f.uid,
    now: () => f.now(),
    async exists(c) { try { const s = await f.get(f.ref(f.db, `wl/${c}/state`)); return s.exists(); } catch { return false; } },
    join: (_c, prof) => f.update(f.ref(f.db, p(`players/${f.uid}`)), { name: prof.name, emoji: prof.emoji, joined: f.serverTimestamp() }),
    onState: fn => listen(f, p("state"), fn),
    onFeedback: fn => listen(f, p(`feedback/${f.uid}`), v => fn(v || {})),
    onSelf: fn => listen(f, p(`players/${f.uid}`), fn),
    bank: (k, yes) => f.set(f.ref(f.db, p(`bank/${k}/${f.uid}`)), !!yes),
    answer: (k, v) => f.set(f.ref(f.db, p(`answers/${k}/${f.uid}`)), { v, t: f.serverTimestamp() }),
    vote: (k, target) => f.set(f.ref(f.db, p(`votes/${k}/${f.uid}`)), target),
  };
}

// ---------------------------------------------------------------- simulated
export class SimHub {
  constructor() { this.state = null; this.players = {}; this.bank = {}; this.answers = {}; this.votes = {}; this.feedback = {}; this.subs = new Set(); }
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
      onBank: (k, fn) => h._sub("bank", () => structuredClone(h.bank[k] || {}), fn),
      onAnswers: (k, fn) => h._sub("answers", () => structuredClone(h.answers[k] || {}), fn),
      onVotes: (k, fn) => h._sub("votes", () => structuredClone(h.votes[k] || {}), fn),
      async setState(s) { h.state = structuredClone(s); h._emit("state"); },
      async setFeedback(uid, patch) { h.feedback[uid] = Object.assign({}, h.feedback[uid], structuredClone(patch)); h._emit("feedback"); },
      async updatePlayer(uid, patch) { if (h.players[uid]) { Object.assign(h.players[uid], patch); h._emit("players"); h._emit("self"); } },
      async destroy() { h.state = { phase: "closed" }; h._emit("state"); },
    };
  }
  playerApi(uid) {
    const h = this;
    const st = () => h.state || {};
    const open = (phase, k) => st().phase === phase && !st().paused && st().turnKey === k && st().allowed && st().allowed[uid] && h.now() <= st().deadline + 1500;
    const put = (bucket, k, v, kind) => { h[bucket][k] = h[bucket][k] || {}; if (h[bucket][k][uid] !== undefined) throw new Error("already sent"); h[bucket][k][uid] = v; h._emit(kind); };
    return {
      uid, live: false,
      now: () => h.now(),
      async join(_c, p) { if (h.players[uid] && h.players[uid].kicked) throw new Error("removed"); h.players[uid] = Object.assign({}, h.players[uid], { name: p.name, emoji: p.emoji, joined: h.now() }); h._emit("players"); h._emit("self"); },
      onState: fn => h._sub("state", () => structuredClone(h.state), fn),
      onFeedback: fn => h._sub("feedback", () => structuredClone(h.feedback[uid] || {}), fn),
      onSelf: fn => h._sub("self", () => structuredClone(h.players[uid] || null), fn),
      async bank(k, yes) { if (!open("bank", k)) throw new Error("closed"); put("bank", k, !!yes, "bank"); },
      async answer(k, v) { if (!open("answer", k)) throw new Error("closed"); put("answers", k, { v, t: h.now() }, "answers"); },
      async vote(k, target) { const s = st(); if (s.phase !== "vote" || s.voteKey !== k || target === uid || !(s.cands && s.cands[target])) throw new Error("closed"); put("votes", k, target, "votes"); },
    };
  }
}

// Real phones over Firebase plus NPCs (and the on-screen phone preview) on this computer.
export function hybridHost(live, hub) {
  const sim = hub.hostApi();
  hub.now = () => live.now();
  const local = uid => uid === "you" || /^npc\d+$/.test(uid);
  const both = (a, b) => fn => { let x = {}, y = {}; const u1 = a(v => { x = v || {}; fn(Object.assign({}, x, y)); }); const u2 = b(v => { y = v || {}; fn(Object.assign({}, x, y)); }); return () => { u1 && u1(); u2 && u2(); }; };
  return {
    live: false, hybrid: true,
    now: () => live.now(),
    async createGame(c) { await live.createGame(c); await sim.createGame(c); },
    codeFree: c => live.codeFree(c),
    onPlayers: both(fn => live.onPlayers(fn), fn => sim.onPlayers(fn)),
    onBank: (k, fn) => both(f => live.onBank(k, f), f => sim.onBank(k, f))(fn),
    onAnswers: (k, fn) => both(f => live.onAnswers(k, f), f => sim.onAnswers(k, f))(fn),
    onVotes: (k, fn) => both(f => live.onVotes(k, f), f => sim.onVotes(k, f))(fn),
    setState: s => Promise.all([live.setState(s), sim.setState(s)]),
    setFeedback: (uid, p) => (local(uid) ? sim : live).setFeedback(uid, p),
    updatePlayer: (uid, p) => (local(uid) ? sim : live).updatePlayer(uid, p),
    destroy: () => Promise.all([live.destroy().catch(() => {}), sim.destroy()]),
  };
}

// ---------------------------------------------------------------- NPC bots
const SKILL = { weak: 0.45, average: 0.68, strong: 0.88 };
const usedNames = new Set(), usedEmojis = new Set();
const botName = nameMaker();
function uniqueProfile() {
  let name = botName(), emoji = randomEmoji(), g = 0;
  while (usedNames.has(name) && g++ < 50) name = botName();
  g = 0; while (usedEmojis.has(emoji) && g++ < 50) emoji = randomEmoji();
  usedNames.add(name); usedEmojis.add(emoji);
  return { name, emoji };
}

// oracle: { answerOf(turnKey) -> correct option number, removed(turnKey) -> 50:50 number, weakest() -> uids }
export class Bot {
  constructor(hub, uid, skillName, oracle) {
    this.api = hub.playerApi(uid); this.uid = uid; this.skillName = skillName; this.skill = SKILL[skillName]; this.oracle = oracle;
    this.done = new Set(); this.timer = null;
    this.api.onState(s => this.onState(s));
  }
  join() { return this.api.join("SIM", uniqueProfile()); }
  later(ms, fn) { clearTimeout(this.timer); this.timer = setTimeout(fn, ms); }
  onState(s) {
    if (!s || s.paused) return;
    const mine = s.allowed && s.allowed[this.uid];
    const key = s.phase + ":" + (s.turnKey || s.voteKey);
    if (this.done.has(key)) return;
    if (s.phase === "bank" && mine) {
      this.done.add(key);
      const greed = { weak: 0.55, average: 0.4, strong: 0.25 }[this.skillName];
      const yes = s.chainIdx >= 2 && Math.random() < Math.min(0.9, greed + s.chainIdx * 0.1);
      this.later(700 + Math.random() * 2200, () => this.api.bank(s.turnKey, yes).catch(() => {}));
    } else if (s.phase === "answer" && mine) {
      this.done.add(key);
      if (Math.random() < 0.03) return; // occasionally freezes
      const dur = s.deadline - this.api.now();
      const speed = this.skillName === "strong" ? 0.25 : this.skillName === "weak" ? 0.6 : 0.4;
      const delay = Math.max(1200, dur * speed * (0.5 + Math.random() * 0.8));
      this.later(delay, () => {
        const right = this.oracle.answerOf(s.turnKey), gone = this.oracle.removed(this.uid, s.turnKey);
        const wrong = [1, 2, 3].filter(n => n !== right && n !== gone);
        this.api.answer(s.turnKey, Math.random() < this.skill ? right : pick(wrong)).catch(() => {});
      });
    } else if (s.phase === "vote" && s.cands && !(s.voted && s.voted[this.uid])) {
      this.done.add(key);
      const others = Object.keys(s.cands).filter(u => u !== this.uid);
      if (!others.length) return;
      const truth = this.oracle.weakest().filter(u => u !== this.uid);
      const sharp = { weak: 0.35, average: 0.55, strong: 0.75 }[this.skillName];
      const target = truth.length && Math.random() < sharp ? pick(truth) : pick(others);
      this.later(1500 + Math.random() * 6000, () => this.api.vote(s.voteKey, target).catch(() => {}));
    }
  }
}

export function makeBots(hub, count, mix, oracle) {
  return Array.from({ length: count }, (_, i) => {
    const sk = ["weak", "average", "strong"].includes(mix) ? mix : ["weak", "average", "average", "strong"][i % 4];
    return new Bot(hub, "npc" + (i + 1), sk, oracle);
  });
}
