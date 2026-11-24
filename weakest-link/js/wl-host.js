// Weakest Link: teacher / TV screen and game engine.
import { el, clean, makeCode, shuffle, pick, decodeGame, storageGet, storageSet } from "../../js/common.js?v=20261124112047";
import { playMusic, stopMusic, setIntensity, setTempo, sfx, audioPrefs, setPref, unlock } from "../../js/audio.js?v=20261124112047";
import { wlSfx as W } from "./wl-audio.js?v=20261124112047";
import { confetti, confettiRain } from "../../js/fx.js?v=20261124112047";
import { SimHub, makeBots, hybridHost } from "./wl-net.js?v=20261124112047";
import { mountPlayer, ringEl, RING_C } from "./wl-player.js?v=20261124112047";
import * as R from "./wl-rules.js?v=20261124112047";
import { SAMPLES } from "./wl-samples.js?v=20261124112047";

const app = document.getElementById("app");
const CONFIG = window.FIREBASE_CONFIG || null;
const BUILDER_URL = "https://claude.ai/artifact/NvE93kWJjYKajB2S8GdKAh";
const RESULT_MS = 2800, BANK_FLASH_MS = 1700, LOCK_MS = 1000;
const GOLD = ["#ffd75e", "#ffc94a", "#fff3c4", "#e0a521", "#ffe9a8", "#ffffff"];

let G = null, pending = null, tick = null, lastViewKey = "";

// The studio backdrop: spotlights, floor and edge lights whose colour follows the game's mood.
document.body.prepend(el("div", { class: "studio", "aria-hidden": "true" },
  ...["b1", "b2", "b3", "b4"].map(b => el("div", { class: "beam " + b })), el("div", { class: "floor" }), el("div", { class: "edge top" }), el("div", { class: "edge bottom" })));
function setMood(m) { if ((document.body.dataset.mood || "") !== (m || "")) { if (m) document.body.dataset.mood = m; else delete document.body.dataset.mood; } }
function flash(red) { const f = el("div", { class: "flashov" + (red ? " red" : "") }); document.body.append(f); setTimeout(() => f.remove(), 1100); }
function moodNow() {
  if (!G) return "";
  const c = G.cur, ph = G.phase;
  const left = G.paused ? G.remaining : G.deadline - now();
  if (ph === "bank") return "bank";
  if (ph === "answer") {
    if (c && c.locked) return "bank";
    if (left < 5500 || (!c.h2h && G.roundLeft <= 15000)) return "danger";
    return c && c.h2h ? "final" : "play";
  }
  if (ph === "result") { const r = c && c.res[c.uid]; return c && c.tb ? (c.winner ? "good" : "bad") : r && r.correct ? "good" : "bad"; }
  if (ph === "countdown") return "play";
  if (ph === "vote" || ph === "voteDone") return "vote";
  if (ph === "finalists") return "final";
  if (ph === "end") return "win";
  return "";
}

// ============================================================ setup
async function init() {
  const m = location.hash.match(/game=([^&]+)/);
  if (m) {
    try {
      const g = await decodeGame(decodeURIComponent(m[1]));
      const errs = R.validateGame(g); if (errs.length) throw new Error(errs.slice(0, 3).join("; "));
      pending = saveGame(g);
      history.replaceState(null, "", location.pathname);
    } catch (e) { toast("That game link couldn't be read: " + e.message); }
  }
  renderSetup();
}

const savedGames = () => storageGet("wl.games", []);
function saveGame(g) {
  const list = savedGames();
  g.id = g.id || ("w" + Date.now().toString(36));
  const entry = { id: g.id, title: g.title || "Untitled game", level: g.level || "", content: g.content || "english", topic: g.topic || "", n: g.questions.length, savedAt: Date.now(), game: g };
  const i = list.findIndex(x => x.id === g.id);
  if (i >= 0) list[i] = entry; else list.unshift(entry);
  storageSet("wl.games", list.slice(0, 60));
  return g;
}
const contentLabel = g => g.content === "gk" ? "General knowledge" + (g.topic ? ": " + g.topic : "") : "English";
const settingsPrefs = () => Object.assign({}, R.DEFAULTS, storageGet("wl.settings", {}));

function renderSetup() {
  stopTick(); stopMusic(); setMood("");
  app.className = "wl-host setup";
  app.textContent = "";
  const sp = settingsPrefs();
  const games = savedGames();
  const session = storageGet("wl.session", null);

  const fileIn = el("input", { type: "file", accept: ".json,application/json", hidden: true, onchange: async e => {
    const f = e.target.files[0]; if (!f) return;
    try { const g = JSON.parse(await f.text()); const errs = R.validateGame(g); if (errs.length) throw new Error(errs[0]); pending = saveGame(g); renderSetup(); }
    catch (err) { toast("Couldn't load that file: " + err.message); }
  } });
  const pasteBox = el("textarea", { rows: 2, placeholder: "…or paste a game code from the builder here" });
  const pasteBtn = el("button", { class: "btn ghost", text: "Load pasted code", onclick: async () => {
    const t = pasteBox.value.trim(); if (!t) return;
    try {
      const raw = t.includes("game=") ? decodeURIComponent(t.split("game=")[1]) : t;
      const g = raw.startsWith("{") ? JSON.parse(raw) : await decodeGame(raw);
      const errs = R.validateGame(g); if (errs.length) throw new Error(errs[0]);
      pending = saveGame(g); renderSetup();
    } catch (err) { toast("That code couldn't be read: " + err.message); }
  } });

  const chosen = pending ? el("div", { class: "chosen" },
    el("div", null, el("div", { class: "eyebrow" }, "Ready to play"), el("h2", null, pending.title || "Untitled game"),
      el("p", { class: "muted" }, `${contentLabel(pending)} · ${pending.level || ""} · ${pending.questions.length} questions`)),
    el("button", { class: "btn ghost", text: "Change", onclick: () => { pending = null; renderSetup(); } })) : null;

  const list = el("div", { class: "glist" });
  if (!games.length) list.append(el("p", { class: "muted" }, "No saved question sets yet. Create one with AI, or try the sample."));
  games.forEach(e => list.append(el("div", { class: "gitem" + (pending && pending.id === e.id ? " sel" : "") },
    el("div", null, el("b", null, e.title), el("div", { class: "muted small" }, `${contentLabel(e)} · ${e.level} · ${e.n} questions`)),
    el("div", { class: "row" },
      el("button", { class: "btn sm", text: "Choose", onclick: () => { pending = e.game; renderSetup(); } }),
      el("button", { class: "btn ghost sm", text: "🗑", title: "Delete", onclick: () => confirmBox(`Delete “${e.title}” from this computer?`, "Delete", () => { storageSet("wl.games", savedGames().filter(x => x.id !== e.id)); if (pending && pending.id === e.id) pending = null; renderSetup(); }) })))));

  const num = (v, min, max) => el("input", { type: "number", min, max, value: v });
  const rounds = num(sp.rounds, 1, 10), bankS = num(sp.bankSecs, 3, 15), ansS = num(sp.answerSecs, 8, 90), voteS = num(sp.voteSecs, 10, 90);
  const roundLen = el("select", null, el("option", { value: 0 }, "Auto: everyone gets a turn"), ...[2, 3, 4, 5, 6, 8, 10, 12].map(n => el("option", { value: n * 60, selected: sp.roundSecs === n * 60 }, `${n} minutes`)));
  const chainIn = el("input", { type: "text", value: sp.chain.join(", ") });
  const cur = el("select", null, ...R.CURRENCIES.map(c => el("option", { value: c, selected: c === sp.currency }, c === "pts" ? "Points" : c)));
  const autoNext = el("input", { type: "checkbox", checked: sp.autoNext });
  const votesTV = el("input", { type: "checkbox", checked: sp.votesOnTV });
  const npcN = num(12, 2, 20);
  const npcMix = el("select", null, ...[["mixed", "Mixed abilities"], ["weak", "All weaker"], ["average", "All average"], ["strong", "All stronger"]].map(([v, t]) => el("option", { value: v }, t)));
  const along = el("input", { type: "checkbox", checked: true });
  const phones = el("input", { type: "checkbox", checked: !!CONFIG, disabled: !CONFIG });

  const settings = () => {
    const clamp = (inp, lo, hi, d) => Math.max(lo, Math.min(hi, Math.round(Number(inp.value)) || d));
    const chain = R.parseChain(chainIn.value);
    if (!chain) { toast("The money chain needs 3–15 amounts, e.g. 20, 50, 100, 200…"); return null; }
    const s = { rounds: clamp(rounds, 1, 10, 3), bankSecs: clamp(bankS, 3, 15, 5), answerSecs: clamp(ansS, 8, 90, 20), voteSecs: clamp(voteS, 10, 90, 30),
      roundSecs: Number(roundLen.value) || 0, chain, currency: cur.value, autoNext: autoNext.checked, votesOnTV: votesTV.checked,
      h2hQuestions: R.DEFAULTS.h2hQuestions, detectivePoints: R.DEFAULTS.detectivePoints };
    storageSet("wl.settings", s);
    return s;
  };
  const go = opts => { const s = settings(); if (s) startSession(Object.assign({ settings: s }, opts)); };

  const results = storageGet("wl.results", []);
  app.append(
    el("header", { class: "topbar" }, brand(), el("div", { class: "row" }, el("span", { class: "muted small" }, CONFIG ? "Live games ready" : "Test mode only"), soundControls())),
    el("main", { class: "setup-grid" },
      el("section", { class: "panel" }, el("h2", null, "1 · Choose the questions"),
        BUILDER_URL ? el("a", { class: "btn big ai-link", href: BUILDER_URL, target: "_blank", rel: "noopener" }, "✨ Create questions with AI") : null,
        BUILDER_URL ? el("p", { class: "muted small" }, "Opens the Weakest Link Builder in Claude. When the questions are ready, press ▶ Play there to open them here.") : null,
        chosen, list,
        el("div", { class: "row wrap" }, el("button", { class: "btn ghost sm", text: "📂 Load file", onclick: () => fileIn.click() }),
          ...SAMPLES.map(s => el("button", { class: "btn ghost sm", text: "✨ Sample: " + s.title, onclick: () => { pending = saveGame(structuredClone(s)); renderSetup(); } }))),
        pasteBox, pasteBtn, fileIn),
      el("section", { class: "panel" }, el("h2", null, "2 · Game settings"),
        field("Rounds", rounds), field("Round length", roundLen),
        field("Time to bank (seconds)", bankS), field("Time to answer (seconds)", ansS), field("Time to vote (seconds)", voteS),
        field("Money chain", chainIn), field("Currency", cur),
        field("Move on to the next turn by itself", autoNext), field("Show how many votes each player got on the TV", votesTV),
        el("button", { class: "btn big wide", disabled: !pending || !CONFIG, text: "▶ Start live game", onclick: () => go({ live: true }) }),
        el("hr"), el("h3", null, "Test mode"),
        field("Number of NPCs", npcN), field("NPC ability", npcMix), field("Play along on a phone preview", along), field("Let real phones join too (QR code)", phones),
        el("button", { class: "btn ghost big wide", disabled: !pending, text: "🤖 Test with NPCs", onclick: () => go({ live: false, npc: { n: Math.max(2, Math.min(20, Number(npcN.value) || 12)), mix: npcMix.value, along: along.checked, phones: phones.checked } }) })),
      session && session.live && Date.now() - session.savedAt < 4 * 3600e3 ? el("section", { class: "panel" }, el("h2", null, "Unfinished game"),
        el("p", null, `Game ${session.code} · ${session.title} · round ${session.round} of ${session.settings.rounds}`),
        el("div", { class: "row" }, el("button", { class: "btn", text: "Resume", onclick: () => resumeSession(session) }),
          el("button", { class: "btn ghost", text: "Discard", onclick: () => { storageSet("wl.session", null); renderSetup(); } }))) : null,
      results.length ? el("section", { class: "panel" }, el("h2", null, "Past results"),
        ...results.slice(0, 10).map(r => el("div", { class: "gitem" }, el("div", null, el("b", null, r.title), el("div", { class: "muted small" }, new Date(r.at).toLocaleString("en-IE"))),
          el("button", { class: "btn ghost sm", text: "View breakdown", onclick: () => showBreakdown(r) })))) : null));
}
const brand = (t) => el("h1", { class: "brand" }, el("span", { class: "logo" }, "🔗"), el("b", null, t || "Weakest Link"));
const field = (label, input) => el("label", { class: "field" }, el("span", null, label), input);

// ============================================================ session
async function startSession({ live, settings, npc }) {
  const game = structuredClone(pending);
  G = {
    live, settings, title: game.title || "Weakest Link", game, level: game.level || "",
    pool: shuffle(game.questions).map(R.prepare), qPtr: 0, reused: false,
    players: {}, order: [], turnPtr: 0, turnN: 0,
    round: 0, phase: "lobby", pot: 0, roundBanked: 0, chainIdx: -1, roundStats: {}, roundLeft: 0, roundTotal: 0,
    timeUp: false, roundMaxed: false, rounds: [], cur: null, vote: null, final: null, paused: false,
    code: null, net: null,
  };
  if (live) {
    try {
      const { hostNet } = await import("./wl-net.js?v=20261124112047");
      G.net = await hostNet(CONFIG);
      let code; for (let i = 0; i < 6; i++) { code = makeCode(); if (await G.net.codeFree(code)) break; }
      G.code = code; await G.net.createGame(code);
    } catch (e) { G = null; return toast("Couldn't start the live game: " + (e && e.message)); }
  } else {
    const hub = new SimHub(); G.hub = hub;
    if (CONFIG && npc.phones) {
      try {
        const { hostNet } = await import("./wl-net.js?v=20261124112047");
        const liveNet = await hostNet(CONFIG);
        let code; for (let i = 0; i < 6; i++) { code = makeCode(); if (await liveNet.codeFree(code)) break; }
        G.net = hybridHost(liveNet, hub); G.code = code; G.joinable = true;
        await G.net.createGame(code);
      } catch (e) { toast("Phones can't join right now, so this test uses NPCs only."); G.joinable = false; }
    }
    if (!G.joinable) { G.net = hub.hostApi(); G.code = "TEST"; await G.net.createGame("TEST"); }
    G.bots = makeBots(hub, npc.n, npc.mix, {
      answerOf: k => G && G.cur && G.cur.key === k && G.cur.q ? G.cur.q._answer : 1,
      removed: (uid, k) => G && G.cur && G.cur.key === k && G.cur.fifty ? G.cur.fifty[uid] : null,
      weakest: () => (G && G.vote && G.vote.weakest) || [],
    });
    G.bots.forEach((b, i) => setTimeout(() => b.join(), 300 + i * (200 + Math.random() * 300)));
    G.along = npc.along;
  }
  wire(); publishState(); render();
}

async function resumeSession(saved) {
  try {
    const { hostNet } = await import("./wl-net.js?v=20261124112047");
    const net = await hostNet(CONFIG);
    if (!(await net.resumeGame(saved.code))) throw new Error("this game is no longer available");
    G = Object.assign(saved, { net, live: true, paused: false });
    // A turn or vote that was in progress is started again cleanly.
    if (["bank", "answer", "result"].includes(G.phase)) { G.cur = null; G.phase = G.final ? "finalists" : "resume"; }
    if (G.phase === "countdown") G.phase = "roundIntro";
    if (G.phase === "vote") G.phase = "roundEnd";
    wire(); publishState(); render();
  } catch (e) { G = null; toast("Couldn't resume: " + (e && e.message)); storageSet("wl.session", null); renderSetup(); }
}
function persist() {
  if (!G || !G.live) return;
  const { net, hub, bots, unsub, ...rest } = G;
  try { storageSet("wl.session", Object.assign(JSON.parse(JSON.stringify(rest)), { savedAt: Date.now() })); } catch {}
}

function wire() {
  G.net.onPlayers(obj => {
    let changed = false;
    for (const [uid, p] of Object.entries(obj)) {
      if (!p || typeof p !== "object") continue;
      const known = G.players[uid];
      if (!known) {
        G.players[uid] = { name: clean(p.name, 16) || "Player", emoji: clean(p.emoji, 8) || "🙂", kicked: !!p.kicked,
          credit: 0, pending: 0, detective: 0, correct: 0, answered: 0, time: 0, wrong: 0, fifty: false, weakestTimes: 0, joinedRound: G.round };
        if (G.phase !== "lobby") G.order.push(uid);
        changed = true;
        if (G.phase === "lobby") sfx.pop();
      } else if (G.phase === "lobby" && !known.kicked) {
        const n = clean(p.name, 16) || known.name, e = clean(p.emoji, 8) || known.emoji;
        if (n !== known.name || e !== known.emoji) { known.name = n; known.emoji = e; changed = true; }
      }
    }
    if (changed) { publishState(); if (G.phase === "lobby" || G.phase === "roundIntro") render(); }
  });
  startTick();
}

const active = () => Object.entries(G.players).filter(([, p]) => !p.kicked);
const isActive = uid => G.players[uid] && !G.players[uid].kicked;
const pname = uid => { const p = G.players[uid]; return p ? `${p.emoji} ${p.name}` : "?"; };
const M = n => R.money(n, G.settings.currency);
const chain = () => G.settings.chain;
const now = () => G.net.now();

function publishState() {
  const s = { phase: G.phase, round: G.round, rounds: G.settings.rounds, cur: G.settings.currency, paused: !!G.paused, count: active().length };
  const c = G.cur;
  if (c && ["bank", "answer", "result"].includes(G.phase)) {
    Object.assign(s, { turnKey: c.key, who: c.uids.map(u => ({ n: G.players[u].name, e: G.players[u].emoji })), h2h: !!c.h2h, tb: !!c.tb,
      deadline: G.deadline, duration: G.duration, chainIdx: G.chainIdx, chainVal: R.chainValue(chain(), G.chainIdx) });
    if (G.paused) s.remaining = G.remaining;
    if (G.phase !== "result" && !c.banked) s.allowed = Object.fromEntries(c.uids.map(u => [u, true]));
    if (c.banked) s.banked = c.banked;
    if (G.phase === "result" && c.res) s.res = Object.fromEntries(Object.entries(c.res).map(([u, r]) => [u, !!r.correct]));
  }
  if (G.phase === "vote" && G.vote) Object.assign(s, { voteKey: G.vote.key, cands: G.vote.cands, deadline: G.deadline, duration: G.duration, remaining: G.paused ? G.remaining : null });
  if (G.phase === "voteDone" && G.vote) s.voteKey = G.vote.key;
  if (G.final && G.final.shown) s.finalists = [G.final.a, G.final.b].map(u => ({ n: G.players[u].name, e: G.players[u].emoji }));
  G.net.setState(JSON.parse(JSON.stringify(s))).catch(e => console.warn(e));
  persist();
}

// ============================================================ rounds and turns
function startGame() {
  if (!active().length) return;
  G.order = shuffle(active().map(([u]) => u));
  G.turnPtr = 0;
  roundIntro();
}

function roundIntro() {
  G.round++;
  Object.assign(G, { phase: "roundIntro", chainIdx: -1, roundBanked: 0, roundStats: {}, timeUp: false, roundMaxed: false, cur: null, vote: null });
  for (const [, p] of active()) p.pending = 0;
  G.roundTotal = G.settings.roundSecs || R.autoRoundSecs(active().length, G.settings.bankSecs, G.settings.answerSecs);
  G.roundLeft = G.roundTotal * 1000;
  stopMusic(0.3); W.roundIntro();
  publishState(); render();
}

// 3, 2, 1, Go! then the first turn.
function beginRound() {
  if (G.phase !== "roundIntro") return;
  G.phase = "countdown"; G.cdN = 3; publishState(); render(); W.count(3);
  const tok = G.cdTok = (G.cdTok || 0) + 1;
  const step = () => {
    if (!G || G.cdTok !== tok || G.phase !== "countdown") return;
    G.cdN--;
    if (G.cdN > 0) { W.count(G.cdN); render(); setTimeout(step, 900); }
    else if (G.cdN === 0) { W.go(); render(); setTimeout(step, 800); }
    else { playMusic("wlPulse"); setIntensity(0); nextTurn(); }
  };
  setTimeout(step, 900);
}

function peekNext(from = G.turnPtr) {
  for (let i = 0; i < G.order.length; i++) { const u = G.order[(from + i) % G.order.length]; if (isActive(u)) return { uid: u, at: (from + i) % G.order.length }; }
  return null;
}
function nextTurn() {
  if (G.phase === "roundEnd") return;
  if (G.timeUp) return endRound("time");
  const nx = peekNext(); if (!nx) return endRound("empty");
  G.turnPtr = (nx.at + 1) % G.order.length;
  G.cur = { key: "t" + (++G.turnN), uids: [nx.uid], uid: nx.uid, answers: {}, res: {} };
  if (G.chainIdx >= 0) startBank(); else askQuestion();
}

function setTimer(secs) { G.duration = secs; G.deadline = now() + secs * 1000; G.paused = false; G.remaining = 0; }

function startBank() {
  G.phase = "bank"; setTimer(G.settings.bankSecs);
  const key = G.cur.key;
  unlisten();
  G.unsub = G.net.onBank(key, obj => { const v = obj[G.cur && G.cur.uid]; if (v !== undefined && G.phase === "bank" && G.cur.key === key) bankDecision(!!v); });
  publishState(); render();
}
function bankDecision(yes) {
  if (G.phase !== "bank" || G.cur.banked) return;
  unlisten();
  if (yes && G.chainIdx >= 0) {
    G.cur.bankedFrom = G.chainIdx;
    const amount = doBank();
    G.cur.banked = amount;
    flash(); confetti({ x: 0.1, y: 0.8, power: 70, spread: 0.6, colours: GOLD });
    publishState(); render();
    const key = G.cur.key;
    setTimeout(() => { if (G && G.cur && G.cur.key === key && G.phase === "bank") askQuestion(); }, BANK_FLASH_MS);
  } else askQuestion();
}
function doBank() {
  const amount = R.chainValue(chain(), G.chainIdx);
  G.pot += amount; G.roundBanked += amount;
  for (const [, p] of Object.entries(G.players)) { p.credit += p.pending; p.pending = 0; }
  G.chainIdx = -1;
  W.bank();
  return amount;
}

function drawQuestion() {
  if (G.qPtr >= G.pool.length) { G.pool = shuffle(G.game.questions).map(R.prepare); G.qPtr = 0; if (!G.reused) { G.reused = true; toast("All the questions have been used, so they'll start to repeat."); } }
  return G.pool[G.qPtr++];
}

function askQuestion() {
  const c = G.cur;
  if (c.q) c.key = "t" + (++G.turnN);  // a fresh question needs a fresh key
  c.q = drawQuestion(); c.answers = {}; c.res = {}; c.fifty = {}; c.banked = 0; c.pausedMs = 0;
  G.phase = "answer"; setTimer(G.settings.answerSecs);
  c.shownAt = G.deadline - G.duration * 1000;
  if (!c.h2h) for (const u of c.uids) {
    const p = G.players[u];
    if (p.fifty) {
      p.fifty = false;
      c.fifty[u] = pick([1, 2, 3].filter(n => n !== c.q._answer));
      G.net.setFeedback(u, { fifty: { key: c.key, remove: c.fifty[u] }, fiftyReady: false }).catch(() => {});
    }
  }
  const key = c.key;
  unlisten();
  G.unsub = G.net.onAnswers(key, obj => {
    if (!G.cur || G.cur.key !== key || G.phase !== "answer") return;
    for (const u of G.cur.uids) if (obj[u] && !G.cur.answers[u]) G.cur.answers[u] = obj[u];
    if (G.cur.uids.every(u => G.cur.answers[u])) lockAnswers();
  });
  publishState(); render(); sfx.whoosh();
}

// Answer in: highlight it, hold a beat of suspense, then reveal.
function lockAnswers() {
  const c = G.cur;
  if (!c || c.locked || G.phase !== "answer") return;
  unlisten();
  c.locked = true; c.lockLeft = G.paused ? G.remaining : Math.max(0, G.deadline - now());
  W.lockIn(); render();
  const key = c.key;
  setTimeout(() => { if (G && G.cur && G.cur.key === key && G.phase === "answer") resolveTurn(); }, LOCK_MS);
}

function resolveTurn() {
  const c = G.cur;
  if (G.phase !== "answer") return;
  unlisten();
  for (const u of c.uids) {
    const a = c.answers[u];
    const correct = !!a && Number(a.v) === c.q._answer;
    const secs = a ? Math.max(0, Math.min(G.duration, (a.t - c.shownAt - c.pausedMs) / 1000)) : G.duration;
    c.res[u] = { correct, v: a ? Number(a.v) : null, secs, t: a ? a.t - c.pausedMs : Infinity };
    const p = G.players[u];
    if (p) { p.answered++; p.time += secs; if (correct) p.correct++; else p.wrong++; }
    if (!c.h2h) {
      const st = G.roundStats[u] = G.roundStats[u] || { turns: 0, wrong: 0, time: 0 };
      st.turns++; st.time += secs; if (!correct) st.wrong++;
    }
  }
  G.phase = "result";
  if (c.h2h) {
    const r = c.res[c.uid];
    if (c.tb) { c.winner = R.tiebreakWinner(c.res, G.final.a, G.final.b); c.winner ? W.correct(6) : W.chainBreak(0); }
    else { (c.uid === G.final.a ? G.final.ra : G.final.rb).push(r.correct); r.correct ? W.correct(6) : W.chainBreak(0); }
  } else {
    const r = c.res[c.uid];
    if (r.correct) {
      const gain = R.stepGain(chain(), G.chainIdx);
      G.players[c.uid].pending += gain;
      G.chainIdx++;
      c.gain = R.chainValue(chain(), G.chainIdx);
      c.justLit = G.chainIdx;
      W.correct(G.chainIdx);
      if (G.chainIdx === chain().length - 1) { c.bankedFrom = G.chainIdx; c.maxed = doBank(); G.roundMaxed = true; flash(); confetti({ power: 160, colours: GOLD }); }
    } else {
      c.lost = R.chainValue(chain(), G.chainIdx);
      c.brokeFrom = G.chainIdx;
      W.chainBreak(G.chainIdx + 1);
      if (G.chainIdx >= 0) flash(true);
      G.chainIdx = -1;
      for (const [, p] of Object.entries(G.players)) p.pending = 0;
    }
    G.log = G.log || []; G.log.push({ round: G.round, uid: c.uid, correct: r.correct, secs: r.secs });
  }
  G.autoAt = G.settings.autoNext ? now() + RESULT_MS + (c.maxed ? 1500 : 0) : null;
  publishState(); render();
}

function afterResult() {
  if (G.phase !== "result") return;
  G.autoAt = null;
  const c = G.cur;
  if (c.h2h) return c.tb ? (c.winner ? finish(c.winner) : tiebreak()) : h2hTurn();
  if (G.roundMaxed) return endRound("max");
  nextTurn();
}

function endRound(reason) {
  unlisten();
  const lost = R.chainValue(chain(), G.chainIdx);
  for (const [, p] of Object.entries(G.players)) p.pending = 0;
  G.chainIdx = -1;
  const st = Object.values(G.roundStats);
  const turns = st.reduce((n, s) => n + s.turns, 0), wrong = st.reduce((n, s) => n + s.wrong, 0);
  G.rounds.push({ round: G.round, banked: G.roundBanked, lost, turns, correct: turns - wrong, reason });
  G.phase = "roundEnd"; G.cur = null; G.paused = false;
  stopMusic(0.4); setTempo(1);
  if (reason === "max") { sfx.fanfare(true); confetti({ power: 140, colours: GOLD }); } else W.roundOver();
  publishState(); render();
}

// ============================================================ voting
function startVote() {
  const stats = Object.fromEntries(Object.entries(G.roundStats).filter(([u]) => isActive(u)));
  const wl = R.weakestLink(stats, G.settings.answerSecs);
  const cands = Object.fromEntries(Object.keys(stats).filter(u => stats[u].turns).map(u => [u, { n: G.players[u].name, e: G.players[u].emoji }]));
  if (Object.keys(cands).length < 2) { toast("Not enough players had a turn this round to vote."); return afterVote(); }
  G.vote = { key: "v" + G.round, weakest: wl.weakest, scores: wl.scores, cands, votes: {} };
  G.phase = "vote"; setTimer(G.settings.voteSecs);
  unlisten();
  const key = G.vote.key;
  G.unsub = G.net.onVotes(key, obj => {
    if (G.phase !== "vote" || !G.vote || G.vote.key !== key) return;
    const before = Object.keys(G.vote.votes).length;
    for (const [u, t] of Object.entries(obj)) if (isActive(u) && !G.vote.votes[u] && t !== u && cands[t]) G.vote.votes[u] = t;
    const n = Object.keys(G.vote.votes).length;
    if (n > before) W.voteIn();
    const el2 = app.querySelector("#voted"); if (el2) el2.textContent = votedText();
    app.querySelectorAll(".votedots i").forEach((d, i) => d.classList.toggle("on", i < n));
    if (active().every(([u]) => G.vote.votes[u])) closeVote();
  });
  stopMusic(0.3); playMusic("wlVote"); W.sweep();
  publishState(); render();
}
const votedText = () => `${Object.keys(G.vote.votes).length} / ${active().length} voted`;

function closeVote() {
  if (G.phase !== "vote") return;
  unlisten();
  const v = G.vote, last = G.round >= G.settings.rounds, pts = G.settings.detectivePoints;
  let right = 0;
  const fbs = [];
  for (const [u, p] of active()) {
    const t = v.votes[u];
    const ok = !!t && v.weakest.includes(t);
    if (ok) { p.detective++; right++; }
    const fb = { vote: { key: v.key, voted: !!t, correct: ok, total: p.detective * pts } };
    fb.weakest = v.weakest.includes(u) ? { key: v.key, fifty: !last } : null;
    if (fb.weakest && !last) fb.fiftyReady = true;
    fbs.push([u, fb]);
  }
  for (const u of v.weakest) { const p = G.players[u]; if (!p) continue; p.weakestTimes++; if (!last) p.fifty = true; }
  v.right = right; v.voters = Object.keys(v.votes).length;
  G.phase = "voteDone"; G.paused = false;
  stopMusic(0.2);
  const roll = W.drumroll(2.2) || 2.2;
  G.revealAt = Date.now() + roll * 1000;
  publishState(); render();
  // Phones find out at the same moment as the TV reveal.
  setTimeout(() => { if (!G) return; fbs.forEach(([u, fb]) => G.net.setFeedback(u, fb).catch(() => {})); if (G.phase === "voteDone") { W.reveal(); render(); } }, roll * 1000);
}
function afterVote() { if (G.round >= G.settings.rounds) goFinalists(); else roundIntro(); }

// ============================================================ the final
function goFinalists() {
  const pl = Object.fromEntries(active());
  const ranked = R.finalistScores(pl);
  stopMusic(0.3);
  if (ranked.length < 2) { G.final = { a: ranked[0] && ranked[0].uid, b: null, ranked, ra: [], rb: [] }; return finish(G.final.a); }
  G.final = { a: ranked[0].uid, b: ranked[1].uid, ranked, ra: [], rb: [], shown: false, tbs: 0 };
  G.phase = "finalists"; G.cur = null;
  publishState(); render();
}
function revealFinalists() {
  if (G.rolling) return;
  const roll = W.drumroll(2.6) || 2.6;
  G.rolling = true; render();
  setTimeout(() => {
    if (!G || !G.final) return;
    G.rolling = false; G.final.shown = true; W.finalists(); flash(); confetti({ power: 110, colours: GOLD });
    for (const [u] of active()) G.net.setFeedback(u, { finalist: u === G.final.a || u === G.final.b }).catch(() => {});
    publishState(); render();
  }, roll * 1000);
}
function h2hTurn() {
  const f = G.final, n = G.settings.h2hQuestions;
  const d = R.h2hDecided(f.ra, f.rb, n);
  if (d === "a" || d === "b") return finish(f[d]);
  if (d === "tie") return tiebreak();
  const uid = f.ra.length <= f.rb.length ? f.a : f.b;
  if (G.phase === "finalists") { W.finalStart(); setTimeout(() => { if (G && G.final && !G.final.winner) playMusic("wlFinal"); }, 900); }
  G.cur = { key: "t" + (++G.turnN), uids: [uid], uid, h2h: true };
  askQuestion();
}
function tiebreak() {
  const f = G.final; f.tbs++;
  G.cur = { key: "t" + (++G.turnN), uids: [f.a, f.b], uid: f.a, h2h: true, tb: true };
  if (f.tbs === 1) toast("It's a tie! Both finalists answer the same question: the fastest correct answer wins.");
  askQuestion();
}
function finish(winner) {
  unlisten();
  G.phase = "end"; G.cur = null; G.final = G.final || {};
  G.final.winner = winner;
  stopMusic(0.2);
  W.winner(); flash(); confetti({ power: 180, colours: GOLD }); confettiRain(6, GOLD.concat(["#ff7aa8", "#4fb4ff", "#6fdc8f"]));
  setTimeout(() => { if (G && G.phase === "end") playMusic("wlChampion"); }, 3200);
  const pts = G.settings.detectivePoints;
  const maxD = Math.max(0, ...active().map(([, p]) => p.detective));
  G.topDetectives = maxD ? active().filter(([, p]) => p.detective === maxD).map(([u]) => u) : [];
  for (const [u, p] of active()) G.net.setFeedback(u, { final: { champ: u === winner, finalist: u === G.final.a || u === G.final.b, credit: p.credit, detective: p.detective * pts, pot: G.pot, topDetective: G.topDetectives.includes(u), cur: G.settings.currency } }).catch(() => {});
  saveResults();
  publishState(); render();
}

// ============================================================ teacher controls
function unlisten() { if (G && G.unsub) { G.unsub(); G.unsub = null; } }
function togglePause() {
  if (!["bank", "answer", "vote"].includes(G.phase) || (G.cur && G.cur.banked)) return;
  if (G.cur && G.cur.locked) return;
  if (!G.paused) { G.paused = true; G.remaining = Math.max(0, G.deadline - now()); G.pauseAt = now(); W.pause(); }
  else { G.paused = false; G.deadline = now() + G.remaining; if (G.cur && G.phase === "answer") G.cur.pausedMs += now() - G.pauseAt; }
  publishState(); render();
}
function addTurnTime() { if (!["bank", "answer", "vote"].includes(G.phase)) return; if (G.paused) G.remaining += 10000; else G.deadline += 10000; G.duration += 10; publishState(); render(); }
function addRoundTime() { G.roundLeft += 30000; G.roundTotal += 30; if (G.timeUp && G.roundLeft > 0) G.timeUp = false; render(); }
function newQuestion() { if (G.phase !== "answer" || G.cur.locked) return; unlisten(); askQuestion(); }
function skipPlayer() { if (!["bank", "answer"].includes(G.phase) || G.cur.h2h) return; unlisten(); G.cur = null; nextTurn(); }

// ============================================================ results
function breakdownData() {
  const ranked = G.final && G.final.ranked ? Object.fromEntries(G.final.ranked.map(r => [r.uid, r.score])) : {};
  return {
    title: G.title, at: Date.now(), pot: G.pot, cur: G.settings.currency, rounds: G.rounds,
    rows: Object.entries(G.players).map(([u, p]) => ({ name: `${p.emoji} ${p.name}`, answered: p.answered, correct: p.correct,
      avg: p.answered ? Math.round(p.time / p.answered * 10) / 10 : null, credit: p.credit, detective: p.detective, weakest: p.weakestTimes,
      score: ranked[u] != null ? ranked[u] : null, champ: G.final && G.final.winner === u, removed: p.kicked }))
      .sort((a, b) => (b.score || 0) - (a.score || 0)),
  };
}
function saveResults() { if (!G.live) return; const list = storageGet("wl.results", []); list.unshift(breakdownData()); storageSet("wl.results", list.slice(0, 20)); }
function showBreakdown(b) {
  const money = n => R.money(n, b.cur);
  modal(el("div", null, el("h2", null, "📊 Breakdown (teacher view)"), el("p", { class: "muted" }, `${b.title} · Pot ${money(b.pot)}`),
    el("div", { class: "tablewrap" }, el("table", null,
      el("thead", null, el("tr", null, ...["Player", "Questions", "Correct", "Avg time", "Banked credit", "Correct votes", "Weakest link", "Final score"].map(h => el("th", null, h)))),
      el("tbody", null, ...b.rows.map(r => el("tr", { class: r.removed ? "muted" : "" }, el("td", null, (r.champ ? "🏆 " : "") + r.name), el("td", null, r.answered), el("td", null, r.correct),
        el("td", null, r.avg == null ? "—" : r.avg + " s"), el("td", null, money(r.credit)), el("td", null, r.detective), el("td", null, r.weakest ? r.weakest + "×" : "—"), el("td", null, r.score == null ? "—" : r.score)))))),
    el("p", { class: "muted small" }, "Final score = 60% banked credit + 40% correct votes, each scaled so the class's best is 100."),
    el("h3", null, "Rounds"), el("ul", null, ...b.rounds.map(r => el("li", null, `Round ${r.round}: banked ${money(r.banked)}${r.lost ? `, ${money(r.lost)} lost when the round ended` : ""} · ${r.correct}/${r.turns} correct`))),
    el("button", { class: "btn", text: "Close", onclick: closeModal })), true);
}

// ============================================================ rendering
function joinUrl() {
  if (!G || !(G.live || G.joinable)) return "";
  return location.href.split("#")[0].replace(/host\.html.*$/, "") + "?g=" + G.code;
}
function topbar() {
  return el("header", { class: "topbar" },
    brand(G.title),
    el("div", { class: "row" },
      G.round ? el("span", { class: "pill" }, G.phase === "end" || G.final && G.phase !== "voteDone" && G.phase !== "roundEnd" ? "Final" : `Round ${G.round} of ${G.settings.rounds}`) : null,
      el("span", { class: "pill" }, G.live || G.joinable ? "Code " : "", el("b", null, G.code)), G.hub ? el("span", { class: "pill test" }, "🤖 Test mode") : null,
      soundControls(), el("span", { class: "muted" }, `👥 ${active().length}`),
      G.phase !== "end" && (G.live || G.joinable) ? el("button", { class: "btn ghost sm", text: "📱 QR", onclick: showQR }) : null,
      el("button", { class: "btn ghost sm", text: "👥 Players", onclick: playersModal }),
      el("button", { class: "btn ghost sm", text: "✕ End", onclick: () => confirmBox(G.phase === "end" ? "Close the game for students?" : "End this game now?", "End game", () => endGame()) })));
}

function render() {
  if (!G) return renderSetup();
  app.className = "wl-host play" + (G.hub && G.along ? " with-phone" : "");
  const keepPhone = app.querySelector(".phone-wrap");
  app.textContent = "";
  const c = G.cur;
  // Entrance animations only play when the moment changes, not on every redraw.
  const viewKey = [G.phase, G.round, c && c.key, c && c.banked ? "b" : "", c && c.locked ? "l" : "", G.phase === "countdown" ? G.cdN : "",
    G.rolling ? "r" : "", G.final && G.final.shown ? "s" : "", G.phase === "voteDone" && Date.now() >= (G.revealAt || 0) ? "rv" : ""].join("|");
  const fresh = viewKey !== lastViewKey; lastViewKey = viewKey;
  const main = el("main", { class: "stage" + (fresh ? " fresh" : "") });
  app.append(topbar(), main);
  const v = { lobby: lobbyView, roundIntro: roundIntroView, countdown: countdownView, resume: resumeView, bank: playView, answer: playView, result: playView,
    roundEnd: roundEndView, vote: voteView, voteDone: voteDoneView, finalists: finalistsView, end: endView }[G.phase];
  if (v) main.append(v());
  if (G.phase === "lobby") playMusic("wlLobby");
  if (G.hub && G.along) {
    if (keepPhone) app.append(keepPhone);
    else {
      const ph = el("div", { class: "phone-screen" });
      app.append(el("aside", { class: "phone-wrap" }, el("div", { class: "phone-label" }, "📱 Your phone (preview)"), ph));
      mountPlayer(ph, G.hub.playerApi("you"), { code: "TEST", profileKey: "sim", hideCode: true });
    }
  }
  updateClocks();
}

function lobbyView() {
  const ps = active();
  G.seen = G.seen || {};
  const qr = el("div", { class: "qr" });
  if (G.live || G.joinable) makeQR(qr, joinUrl(), 300); else qr.append(el("div", { class: "qr-ph" }, "🤖", el("small", null, "Test mode: NPCs join by themselves")));
  const chips = ps.map(([u, p]) => el("button", { class: "pchip" + (G.seen[u] ? "" : " new"), onclick: () => editPlayer(u) }, `${p.emoji} ${p.name}`));
  ps.forEach(([u]) => { G.seen[u] = 1; });
  return el("div", { class: "lobby" },
    el("div", { class: "card joinbox" }, el("h2", null, "Scan to join"), qr, G.live || G.joinable ? el("p", { class: "joinurl" }, joinUrl()) : null, G.live || G.joinable ? el("p", { class: "bigcode" }, G.code) : null),
    el("div", { class: "card" },
      el("h2", null, `Players (${ps.length})`),
      ps.length ? el("div", { class: "pgrid" }, ...chips) : el("p", { class: "muted" }, "Waiting for players…"),
      el("p", { class: "muted small" }, "Tap a player to rename or remove them. Late arrivals can still join during the game."),
      el("div", { class: "rules" },
        el("p", null, `🔗 ${G.settings.rounds} round${G.settings.rounds === 1 ? "" : "s"}. Answer in turn to climb the money chain. A wrong answer breaks the chain, so bank before your question!`),
        el("p", null, "🗳 After each round, vote for the weakest link. A correct vote earns Detective points. Nobody is eliminated."),
        el("p", null, "🏆 The top two go head-to-head in the final.")),
      el("button", { class: "btn gold big", disabled: !ps.length, text: "Start the game →", onclick: startGame })));
}

const mmss = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
function roundIntroView() {
  const last = G.round === G.settings.rounds && G.settings.rounds > 1;
  return el("div", { class: "center-view" },
    el("div", { class: "eyebrow big" }, last ? "Last round" : "Get ready"),
    el("h2", { class: "huge shine" }, "Round"),
    el("div", { class: "roundno" }, String(G.round)),
    el("div", { class: "infopills" },
      el("span", { class: "pill" }, `⏱ ${mmss(G.roundTotal)} on the clock`),
      el("span", { class: "pill" }, `🔗 Chain up to ${M(chain()[chain().length - 1])}`),
      G.pot ? el("span", { class: "pill gold" }, `💰 Pot so far: ${M(G.pot)}`) : null),
    G.round > 1 ? el("p", { class: "muted" }, "Last round's weakest link has a 50:50 on their phone for their first question.") : null,
    el("button", { class: "btn gold big", text: `▶ Start round ${G.round}`, onclick: beginRound }));
}
function countdownView() {
  return el("div", { class: "center-view" }, el("div", { class: "countdown" + (G.cdN <= 0 ? " go" : "") }, G.cdN > 0 ? String(G.cdN) : "GO!"));
}
function resumeView() {
  return el("div", { class: "center-view" }, el("div", { class: "eyebrow big" }, "Welcome back"), el("h2", { class: "huge" }, `Round ${G.round}`), el("p", { class: "lead" }, "The game was interrupted. The turn in progress will start again."),
    el("button", { class: "btn gold big", text: "▶ Continue", onclick: () => { playMusic("wlPulse"); nextTurn(); } }));
}

function chainView() {
  const ch = chain(), top = ch.length - 1, c = G.cur || {}, ph = G.phase;
  const hit = (ph === "bank" && c.banked) || (ph === "result" && c.maxed);
  return el("aside", { class: "chain" },
    ...ch.slice().reverse().map((v, ri) => {
      const i = top - ri;
      let cls = "step" + (i === top ? " top" : "");
      if (hit && i <= c.bankedFrom) cls += " fly";
      else if (ph === "result" && c.brokeFrom != null && i <= c.brokeFrom) cls += " broke";
      else {
        if (i <= G.chainIdx) cls += " lit";
        if (ph === "result" && c.justLit === i) cls += " just";
        if (i === G.chainIdx + 1 && ((ph === "bank" && !c.banked) || ph === "answer")) cls += " next";
      }
      return el("div", { class: cls }, M(v));
    }),
    el("div", { class: "bankbox" + (hit ? " hit" : "") }, el("div", { class: "eyebrow" }, "Banked this round"), el("b", null, M(G.roundBanked))),
    el("div", { class: "potbox" + (hit ? " hit" : "") }, el("div", { class: "eyebrow" }, "Pot"), el("b", null, M(G.pot))));
}
const timerRing = cls => ringEl("js-ring " + (cls || ""));

function playView() {
  const c = G.cur;
  if (c && c.h2h) return h2hView();
  const p = G.players[c.uid] || { name: "?", emoji: "" };
  const nx = peekNext();
  let body;
  if (G.phase === "bank") {
    body = c.banked
      ? el("div", { class: "banked-flash" }, el("div", { class: "lbl2" }, "🏦 Banked"), el("b", null, M(c.banked)))
      : el("div", { class: "bankask" }, el("div", { class: "bankq" }, "BANK?"), el("div", { class: "chainval" }, M(R.chainValue(chain(), G.chainIdx))),
          el("p", { class: "muted" }, `${p.name} decides on their phone…`),
          el("div", { class: "row center-row" }, el("button", { class: "btn gold sm", text: "🏦 Bank for them", onclick: () => bankDecision(true) }), el("button", { class: "btn ghost sm", text: "▶ Play on", onclick: () => bankDecision(false) })));
  } else body = questionBlock(c, G.phase === "result");
  const ring = (G.phase === "bank" && !c.banked) || G.phase === "answer";
  const newTurn = G.nameShown !== c.key; G.nameShown = c.key;
  return el("div", { class: "play" },
    chainView(),
    el("div", { class: "centre" },
      el("div", { class: "turnhead" },
        el("div", { class: "nameplate" + (newTurn ? " newturn" : "") }, el("span", { class: "who" }, `${p.emoji} ${p.name}`), nx && G.phase !== "result" ? el("span", { class: "muted upnext" }, "Up next: " + pname(nx.uid)) : null),
        ring ? timerRing(G.phase === "bank" ? "gold" : "") : null),
      body,
      G.phase === "result" ? resultBanner(c) : null,
      controls()),
    el("aside", { class: "side" },
      el("div", { class: "clockpanel" }, el("div", { class: "eyebrow" }, "Round clock"), el("div", { class: "roundclock js-round" }, "–:––")),
      G.timeUp ? el("div", { class: "timeup" }, "⏰ Time's up! This is the last question.") : null,
      el("div", { class: "eyebrow" }, `Round ${G.round} of ${G.settings.rounds}`)),
    G.paused ? el("div", { class: "paused" }, "⏸ Paused") : null);
}

function questionBlock(c, reveal) {
  const q = c.q;
  const asking = G.phase === "answer" && !c.locked;
  const picks = c.locked && !reveal ? Object.values(c.answers || {}).map(a => Number(a.v)) : [];
  return el("div", { class: "qblock" },
    el("div", { class: "qtext" + (asking ? " asking" : "") + ((q.prompt || "").length > 70 ? " long" : "") }, q.prompt),
    q.sub ? el("div", { class: "qsub" }, q.sub) : null,
    el("div", { class: "opts" + (asking ? " asking" : "") + (picks.length ? " locked" : "") }, ...q._options.map((o, i) => {
      const n = i + 1, picked = reveal && Object.values(c.res).some(r => r.v === n);
      return el("div", { class: "optbox o" + n + (picks.includes(n) ? " pick" : "") + (reveal && n === q._answer ? " right" : "") + (reveal && picked && n !== q._answer ? " wrong" : "") + (reveal && n !== q._answer && !picked ? " dim" : "") },
        el("span", { class: "num" }, n), el("span", null, o));
    })));
}

function resultBanner(c) {
  const b = resultLine(c);
  if (c.q && c.q.explanation && !c.tb) b.append(el("div", { class: "explain" }, "💬 " + c.q.explanation));
  return b;
}
function resultLine(c) {
  const r = c.res[c.uid];
  if (c.h2h && c.tb) return el("div", { class: "banner " + (c.winner ? "ok" : "bad") }, c.winner ? `⚡ ${pname(c.winner)} was fastest!` : "Nobody got it. Another question…", nextBtn());
  if (r.correct) return el("div", { class: "banner ok" }, c.maxed ? `🎉 Correct! ${M(c.maxed)} banked: the chain is complete!` : c.h2h ? "✅ Correct!" : `✅ Correct! The chain is at ${M(c.gain)}`, nextBtn());
  return el("div", { class: "banner bad" }, r.v == null ? "⌛ Time's up!" : "❌ Not quite.", !c.h2h && c.lost ? ` ${M(c.lost)} lost from the chain.` : "", nextBtn());
}
function nextBtn() { return G.settings.autoNext && !G.paused ? null : el("button", { class: "btn sm", text: "Next →", onclick: afterResult }); }

function controls() {
  const ph = G.phase, c = G.cur;
  if (ph === "result") return el("div", { class: "controls" }, el("button", { class: "btn ghost sm", text: G.autoAt ? "⏸ Hold here" : "Next →", onclick: () => { if (G.autoAt) { G.autoAt = null; render(); } else afterResult(); } }));
  return el("div", { class: "controls" },
    el("button", { class: "btn ghost sm", text: G.paused ? "▶ Resume" : "⏸ Pause", onclick: togglePause }),
    el("button", { class: "btn ghost sm", text: "+10 s", onclick: addTurnTime }),
    !c.h2h ? el("button", { class: "btn ghost sm", text: "+30 s round", onclick: addRoundTime }) : null,
    ph === "answer" ? el("button", { class: "btn ghost sm", text: "🔄 New question", onclick: newQuestion }) : null,
    !c.h2h ? el("button", { class: "btn ghost sm", text: "⏭ Skip player", onclick: skipPlayer }) : null,
    !c.h2h ? el("button", { class: "btn ghost sm", text: "⏹ End round", onclick: () => confirmBox("End this round now? Money in the chain that isn't banked will be lost.", "End round", () => endRound("teacher")) }) : null);
}

function roundEndView() {
  const r = G.rounds[G.rounds.length - 1];
  const reason = { max: "🎉 Chain complete!", time: "⏰ Time's up!", teacher: "Round over", empty: "Round over" }[r.reason] || "Round over";
  return el("div", { class: "center-view" },
    el("div", { class: "eyebrow big" }, reason),
    el("h2", { class: "huge" }, `Round ${r.round} complete`),
    el("div", { class: "statrow" },
      stat("Banked this round", M(r.banked), "gold"), r.lost ? stat("Lost (not banked)", M(r.lost), "bad") : null,
      stat("Correct answers", `${r.correct} / ${r.turns}`), stat("Pot", M(G.pot), "gold")),
    el("button", { class: "btn big", text: "🗳 Vote for the weakest link", onclick: startVote }));
}
const stat = (label, value, cls) => el("div", { class: "stat " + (cls || "") }, el("div", { class: "eyebrow" }, label), el("b", null, value));
const plates = (list, cls) => el("div", { class: "plates " + (cls || "") }, cls && cls.includes("dim") ? null : el("div", { class: "sweeplight" }), ...list.map(([, p]) => el("div", { class: "plate" }, `${p.e || p.emoji} ${p.n || p.name}`)));

function voteView() {
  const n = Object.keys(G.vote.votes).length, tot = active().length;
  return el("div", { class: "center-view" },
    el("div", { class: "eyebrow big" }, "🤫 Secret vote"),
    el("h2", { class: "huge" }, "Who was the weakest link?"),
    plates(Object.entries(G.vote.cands)),
    el("p", { class: "lead" }, "Vote on your phone: who got the most wrong and took the longest?"),
    el("div", { class: "voteline" }, timerRing("vote"),
      el("div", null, el("p", { class: "lead", id: "voted" }, votedText()), el("div", { class: "votedots" }, ...Array.from({ length: tot }, (_, i) => el("i", { class: i < n ? "on" : "" }))))),
    el("div", { class: "controls" },
      el("button", { class: "btn ghost sm", text: G.paused ? "▶ Resume" : "⏸ Pause", onclick: togglePause }),
      el("button", { class: "btn ghost sm", text: "+10 s", onclick: addTurnTime }),
      el("button", { class: "btn sm", text: "Close voting", onclick: closeVote })),
    G.paused ? el("div", { class: "paused" }, "⏸ Paused") : null);
}

function voteDoneView() {
  const v = G.vote, revealed = Date.now() >= (G.revealAt || 0);
  const last = G.round >= G.settings.rounds;
  if (!revealed) return el("div", { class: "center-view" },
    el("div", { class: "eyebrow big" }, "Checking the votes"),
    el("h2", { class: "huge" }, "🥁 …"),
    plates(Object.entries(v.cands), "fast"));
  let bars = null;
  if (G.settings.votesOnTV) {
    const counts = {}; Object.values(v.votes).forEach(t => counts[t] = (counts[t] || 0) + 1);
    const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const max = Math.max(1, ...rows.map(r => r[1]));
    bars = el("div", { class: "votebars" }, ...rows.map(([u, n]) => el("div", { class: "vbar" }, el("span", null, pname(u)), el("span", { class: "vb" }, el("i", { style: { width: (n / max * 100) + "%" } })), el("b", null, n))));
  }
  return el("div", { class: "center-view" },
    el("div", { class: "eyebrow big" }, "🔍 The results are in"),
    el("div", { class: "bignum" }, `${v.right} of ${v.voters}`),
    el("p", { class: "lead big" }, `detective${v.voters === 1 ? "" : "s"} spotted the weakest link`),
    el("p", { class: "lead" }, "📱 Check your phone to see if you were right."),
    bars,
    el("button", { class: "btn big", text: last ? "🏆 On to the final" : `Round ${G.round + 1} →`, onclick: afterVote }));
}

function finalistsView() {
  const f = G.final;
  if (!f.shown) return el("div", { class: "center-view" },
    el("div", { class: "eyebrow big" }, "The final"),
    el("h2", { class: "huge" }, G.rolling ? "And the finalists are…" : "Who will reach the final?"),
    plates(active().map(([u, p]) => [u, p]), G.rolling ? "fast" : ""),
    el("p", { class: "lead" }, "The two players with the best mix of banked money (60%) and correct votes (40%)."),
    G.rolling ? null : el("button", { class: "btn gold big", text: "🥁 Reveal the finalists", onclick: revealFinalists }));
  return el("div", { class: "center-view" },
    el("div", { class: "eyebrow big" }, "Head-to-head"),
    el("div", { class: "vs" }, el("div", { class: "finalist spot a" }, pname(f.a)), el("div", { class: "vsx" }, "VS"), el("div", { class: "finalist spot b" }, pname(f.b))),
    el("p", { class: "lead" }, `${G.settings.h2hQuestions} questions each, in turn. Most correct answers wins.`),
    el("button", { class: "btn gold big", text: "▶ Start the final", onclick: h2hTurn }));
}
function h2hView() {
  const f = G.final, c = G.cur, n = G.settings.h2hQuestions;
  const dots = (arr, isTurn) => el("div", { class: "dots" + (isTurn ? " turn" : "") }, ...Array.from({ length: n }, (_, i) => el("span", { class: "dot" + (i < arr.length ? (arr[i] ? " ok" : " bad") : "") })));
  const turnA = !c.tb && c.uid === f.a, turnB = !c.tb && c.uid === f.b;
  return el("div", { class: "play h2h" },
    el("div", { class: "centre" },
      el("div", { class: "score2" },
        el("div", { class: "fside" + (turnA || c.tb ? " on" : "") }, el("div", { class: "who" }, pname(f.a)), dots(f.ra, turnA)),
        el("div", { class: "mid" }, el("div", { class: "vsx" }, c.tb ? "⚡ Tie-break" : "VS"), G.phase === "answer" ? timerRing("") : null),
        el("div", { class: "fside" + (turnB || c.tb ? " on" : "") }, el("div", { class: "who" }, pname(f.b)), dots(f.rb, turnB))),
      c.tb ? el("p", { class: "lead center" }, "Both answer: the fastest correct answer wins!") : null,
      questionBlock(c, G.phase === "result"),
      G.phase === "result" ? resultBanner(c) : null,
      controls()),
    G.paused ? el("div", { class: "paused" }, "⏸ Paused") : null);
}

function endView() {
  const f = G.final || {};
  return el("div", { class: "center-view" },
    el("div", { class: "rays" }),
    f.winner ? el("div", { class: "trophy" }, "🏆") : null,
    f.winner ? el("div", { class: "eyebrow big" }, "Champion") : null,
    f.winner ? el("h2", { class: "huge champ" }, pname(f.winner)) : el("h2", { class: "huge" }, "🎉 Well played!"),
    el("div", { class: "statrow" },
      stat("The class banked", M(G.pot), "gold"),
      G.topDetectives && G.topDetectives.length ? stat(G.topDetectives.length > 1 ? "🔍 Top detectives" : "🔍 Top detective", G.topDetectives.map(pname).join(" · "), "names") : null),
    el("div", { class: "controls" },
      el("button", { class: "btn ghost", text: "📊 Breakdown", onclick: () => showBreakdown(breakdownData()) }),
      el("button", { class: "btn ghost", text: "🔁 Play again", onclick: () => { const g = G.game; endGame(true); pending = g; renderSetup(); } }),
      el("button", { class: "btn", text: "Close game for students", onclick: () => endGame() })));
}

function soundControls() {
  const pr = audioPrefs();
  const mus = el("button", { class: "btn ghost sm" + (pr.music ? "" : " off"), title: "Music on/off", text: pr.music ? "🎵" : "🎵 Off", onclick: () => { unlock(); const v = !audioPrefs().music; setPref("music", v); mus.textContent = v ? "🎵" : "🎵 Off"; } });
  const fx = el("button", { class: "btn ghost sm" + (pr.sfx ? "" : " off"), title: "Sound effects on/off", text: pr.sfx ? "🔊" : "🔇", onclick: () => { unlock(); const v = !audioPrefs().sfx; setPref("sfx", v); fx.textContent = v ? "🔊" : "🔇"; if (v) sfx.blip(); } });
  const vol = el("input", { type: "range", min: 0, max: 1, step: 0.05, value: pr.vol, class: "vol", title: "Volume", oninput: e => { unlock(); setPref("vol", Number(e.target.value)); } });
  return el("span", { class: "row" }, mus, fx, vol);
}

// ============================================================ dialogs
function editPlayer(uid) {
  const p = G.players[uid];
  const name = el("input", { type: "text", value: p.name, maxlength: 16 });
  modal(el("div", null, el("h2", null, `${p.emoji} Edit player`), field("Name", name),
    el("div", { class: "row gap" },
      el("button", { class: "btn", text: "Save", onclick: () => { const n = clean(name.value, 16) || p.name; p.name = n; G.net.updatePlayer(uid, { name: n }).catch(() => {}); closeModal(); publishState(); render(); } }),
      el("button", { class: "btn danger", text: "Remove from game", onclick: () => { p.kicked = true; G.net.updatePlayer(uid, { kicked: true }).catch(() => {}); closeModal(); if (G.cur && G.cur.uids.includes(uid) && !G.cur.h2h) skipPlayer(); publishState(); render(); } }),
      el("button", { class: "btn ghost", text: "Cancel", onclick: closeModal }))));
}
function playersModal() {
  modal(el("div", null, el("h2", null, "Players"), el("p", { class: "muted small" }, "Tap a player to rename or remove them."),
    el("div", { class: "pgrid" }, ...active().map(([u, p]) => el("button", { class: "pchip", onclick: () => editPlayer(u) }, `${p.emoji} ${p.name}`))),
    el("div", { class: "row gap" }, el("button", { class: "btn ghost", text: "Close", onclick: closeModal }))), true);
}
function showQR() {
  const box = el("div", { class: "qr big" });
  makeQR(box, joinUrl(), 420);
  modal(el("div", { class: "center" }, el("h2", null, "Scan to join"), box, el("p", { class: "bigcode" }, G.code), el("p", { class: "joinurl" }, joinUrl()),
    el("button", { class: "btn", text: "Close", onclick: closeModal })), true);
}
function makeQR(node, text, size) {
  try { new window.QRCode(node, { text, width: size, height: size, correctLevel: window.QRCode.CorrectLevel.M }); }
  catch { node.append(el("p", { class: "muted" }, "QR code unavailable: use the link below.")); }
}
function modal(content, wide) {
  closeModal();
  const ov = el("div", { class: "modal-ov", onclick: e => { if (e.target === ov) closeModal(); } }, el("div", { class: "modal" + (wide ? " wide" : "") }, content));
  document.body.append(ov);
}
function closeModal() { document.querySelectorAll(".modal-ov").forEach(m => m.remove()); }
function confirmBox(msg, okText, fn) {
  modal(el("div", null, el("p", null, msg), el("div", { class: "row gap" },
    el("button", { class: "btn", text: okText, onclick: () => { closeModal(); fn(); } }),
    el("button", { class: "btn ghost", text: "Cancel", onclick: closeModal }))));
}
export function toast(msg) { const t = el("div", { class: "toast" }, msg); document.body.append(t); setTimeout(() => t.remove(), 4500); }

function endGame(silent) {
  if (!G) return;
  stopTick(); stopMusic(0.3); unlisten();
  G.net.destroy().catch(() => {});
  if (G.bots) G.bots.forEach(b => clearTimeout(b.timer));
  storageSet("wl.session", null);
  G = null;
  if (!silent) renderSetup();
}

// ============================================================ clock
let lastT = 0;
function startTick() {
  stopTick(); lastT = 0;
  tick = setInterval(() => {
    if (!G) return;
    const t = now(), dt = lastT ? t - lastT : 0; lastT = t;
    const c = G.cur;
    const running = ["bank", "answer"].includes(G.phase) && !G.paused && !(c && (c.h2h || c.banked || c.locked));
    if (running && G.roundLeft > 0) {
      G.roundLeft = Math.max(0, G.roundLeft - dt);
      if (G.roundLeft <= 0 && !G.timeUp) { G.timeUp = true; W.timeUp(); render(); }
    }
    if (["bank", "answer", "vote"].includes(G.phase) && !G.paused && !(c && (c.banked || c.locked))) {
      const left = G.deadline - t, secs = Math.ceil(left / 1000);
      const tk = G.phase + (c ? c.key : "") + ":" + secs;
      if (secs > 0 && tk !== G.lastTick) {
        if (G.phase === "answer" && secs <= 5) { G.lastTick = tk; W.tick(secs === 1); }
        else if (G.phase === "bank") { G.lastTick = tk; W.bankTick(); }
      }
      if (left <= 0) {
        if (G.phase === "bank") bankDecision(false);
        else if (G.phase === "answer") resolveTurn();
        else closeVote();
      }
    }
    // The music tightens as the round clock runs down.
    if (G && ["bank", "answer"].includes(G.phase) && G.cur) {
      if (G.cur.h2h) setIntensity(0.6);
      else {
        const prog = G.roundTotal ? Math.max(0, Math.min(1, 1 - G.roundLeft / (G.roundTotal * 1000))) : 0;
        const low = G.phase === "answer" && G.deadline - t < 5500;
        setIntensity(Math.min(1, prog * 0.85 + (low ? 0.35 : 0) + (G.timeUp ? 0.3 : 0)));
        setTempo(1 + 0.22 * prog);
      }
    }
    if (G && G.phase === "result" && G.autoAt && !G.paused && t >= G.autoAt) afterResult();
    updateClocks();
  }, 150);
}
function stopTick() { if (tick) clearInterval(tick); tick = null; }
function updateClocks() {
  if (!G) return;
  const rc = app.querySelector(".js-round");
  if (rc) { const s = Math.ceil(G.roundLeft / 1000); rc.textContent = mmss(s); rc.classList.toggle("low", s <= 15); }
  const ring = app.querySelector(".js-ring");
  if (ring && G.duration) {
    const c = G.cur;
    const left = c && c.locked ? c.lockLeft : G.paused ? G.remaining : Math.max(0, G.deadline - now());
    const frac = Math.max(0, Math.min(1, left / (G.duration * 1000)));
    ring.querySelector(".prg").style.strokeDashoffset = RING_C * (1 - frac);
    ring.classList.toggle("low", left < 5500 && G.phase === "answer" && !(c && c.locked));
    ring.classList.toggle("paused", !!G.paused);
    ring.querySelector(".rnum").textContent = G.paused ? "⏸" : String(Math.ceil(Math.min(left, G.duration * 1000) / 1000));
  }
  setMood(moodNow());
}

document.addEventListener("keydown", e => {
  if (!G || e.target.matches("input,textarea,select") || document.querySelector(".modal-ov")) return;
  if (e.key.toLowerCase() === "p") togglePause();
  if ((e.key === " " || e.key === "ArrowRight") && G.phase === "result") { e.preventDefault(); afterResult(); }
});

init();
