// Last One Standing: teacher / TV screen and game engine.
import { el, clean, makeCode, shuffle, pick, decodeGame, storageGet, storageSet } from "../../js/common.js?v=20261124194826";
import { playMusic, stopMusic, setIntensity, setTempo, sfx, audioPrefs, setPref, unlock } from "../../js/audio.js?v=20261124194826";
import { wlSfx as W } from "./wl-audio.js?v=20261124194826";
import { confetti, confettiRain } from "../../js/fx.js?v=20261124194826";
import { SimHub, makeBots, hybridHost } from "./wl-net.js?v=20261124194826";
import { mountPlayer, ringEl, RING_C } from "./wl-player.js?v=20261124194826";
import * as R from "./wl-rules.js?v=20261124194826";
import { SAMPLES } from "./wl-samples.js?v=20261124194826";

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
    if (left < 5500 || (!c.sd && G.roundLeft <= 15000)) return "danger";
    return c && c.sd ? "final" : "play";
  }
  if (ph === "result") { const r = c && c.res[c.uid]; return r && r.correct ? "good" : "bad"; }
  if (ph === "countdown") return "play";
  if (ph === "roundEnd") return "dark";
  if (ph === "vote" || ph === "voteDone") return "vote";
  if (ph === "sdPairs" || ph === "sdResult") return "final";
  if (ph === "end") return "win";
  return "";
}

// Timed sequences (round start and end). Clicking the stage skips to the end.
function seq(steps) {
  const tok = G.seqTok = (G.seqTok || 0) + 1;
  G.seqEnd = Date.now() + Math.max(0, ...steps.map(s => s[0]));
  steps.forEach(([ms, fn]) => setTimeout(() => { if (G && G.seqTok === tok) fn(); }, ms));
}
function skipSeq() {
  if (!G || !(G.seqEnd > Date.now())) return;
  G.seqTok++; G.seqEnd = 0; render();
}

// Full screen for the TV.
const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
function toggleFS() {
  const d = document.documentElement;
  if (!fsEl()) { const f = d.requestFullscreen || d.webkitRequestFullscreen; if (f) Promise.resolve(f.call(d)).catch(() => {}); }
  else { const f = document.exitFullscreen || document.webkitExitFullscreen; if (f) Promise.resolve(f.call(document)).catch(() => {}); }
}
const fsLabel = () => fsEl() ? "🗗 Exit full screen" : "⛶ Full screen";
const fsButton = () => el("button", { class: "btn ghost sm fsbtn", title: "Full screen (F)", text: fsLabel(), onclick: toggleFS });
["fullscreenchange", "webkitfullscreenchange"].forEach(ev => document.addEventListener(ev, () => document.querySelectorAll(".fsbtn").forEach(b => { b.textContent = fsLabel(); })));

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
      detectivePoints: R.DEFAULTS.detectivePoints };
    storageSet("wl.settings", s);
    return s;
  };
  const go = opts => { const s = settings(); if (s) startSession(Object.assign({ settings: s }, opts)); };

  const results = storageGet("wl.results", []);
  app.append(
    el("header", { class: "topbar" }, brand(), el("div", { class: "row" }, el("span", { class: "muted small" }, CONFIG ? "Live games ready" : "Test mode only"), soundControls(), fsButton())),
    el("main", { class: "setup-grid" },
      el("section", { class: "panel" }, el("h2", null, "1 · Choose the questions"),
        BUILDER_URL ? el("a", { class: "btn big ai-link", href: BUILDER_URL, target: "_blank", rel: "noopener" }, "✨ Create questions with AI") : null,
        BUILDER_URL ? el("p", { class: "muted small" }, "Opens the question builder in Claude. When the questions are ready, press ▶ Play there to open them here.") : null,
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
const GAME_NAME = "Last One Standing";
const brand = (t) => el("h1", { class: "brand" }, el("span", { class: "logo" }, "⚡"), el("b", null, t || GAME_NAME));
const field = (label, input) => el("label", { class: "field" }, el("span", null, label), input);

// ============================================================ session
async function startSession({ live, settings, npc }) {
  const game = structuredClone(pending);
  G = {
    live, settings, title: game.title || GAME_NAME, game, level: game.level || "",
    pool: shuffle(game.questions).map(R.prepare), qPtr: 0, reused: false,
    players: {}, order: [], turnPtr: 0, turnN: 0,
    round: 0, phase: "lobby", pot: 0, roundBanked: 0, chainIdx: -1, roundStats: {}, roundLeft: 0, roundTotal: 0,
    timeUp: false, roundMaxed: false, rounds: [], cur: null, vote: null, final: null, sd: null, paused: false,
    code: null, net: null,
  };
  if (live) {
    try {
      const { hostNet } = await import("./wl-net.js?v=20261124194826");
      G.net = await hostNet(CONFIG);
      let code; for (let i = 0; i < 6; i++) { code = makeCode(); if (await G.net.codeFree(code)) break; }
      G.code = code; await G.net.createGame(code);
    } catch (e) { G = null; return toast("Couldn't start the live game: " + (e && e.message)); }
  } else {
    const hub = new SimHub(); G.hub = hub;
    if (CONFIG && npc.phones) {
      try {
        const { hostNet } = await import("./wl-net.js?v=20261124194826");
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
      weakest: () => (G && G.vote && G.vote.hint) || [],
    });
    G.bots.forEach((b, i) => setTimeout(() => b.join(), 300 + i * (200 + Math.random() * 300)));
    G.along = npc.along;
  }
  wire(); publishState(); render();
}

async function resumeSession(saved) {
  try {
    const { hostNet } = await import("./wl-net.js?v=20261124194826");
    const net = await hostNet(CONFIG);
    if (!(await net.resumeGame(saved.code))) throw new Error("this game is no longer available");
    G = Object.assign(saved, { net, live: true, paused: false });
    // A turn or vote that was in progress is started again cleanly.
    if (G.sd && ["answer", "result", "sdResult"].includes(G.phase)) { G.cur = null; G.phase = "sdPairs"; }
    else if (["bank", "answer", "result"].includes(G.phase)) { G.cur = null; G.phase = "resume"; }
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
          credit: 0, lost: 0, bankedOwn: 0, pending: 0, detective: 0, correct: 0, answered: 0, time: 0, wrong: 0, fifty: false, weakestTimes: 0, joinedRound: G.round };
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
    Object.assign(s, { turnKey: c.key, who: c.sd ? [] : c.uids.map(u => ({ n: G.players[u].name, e: G.players[u].emoji })), sdq: !!c.sd,
      deadline: G.deadline, duration: G.duration, chainIdx: G.chainIdx, chainVal: R.chainValue(chain(), G.chainIdx) });
    // The next player's phone flashes "You're next!" while this turn is played.
    const nx = !c.sd && !G.timeUp && !G.roundMaxed ? peekNext() : null;
    if (nx && nx.uid !== c.uid) s.next = nx.uid;
    if (G.paused) s.remaining = G.remaining;
    if (G.phase !== "result" && !c.banked) s.allowed = Object.fromEntries(c.uids.map(u => [u, true]));
    if (c.banked) s.banked = c.banked;
    if (G.phase === "result" && c.res) s.res = Object.fromEntries(Object.entries(c.res).map(([u, r]) => [u, !!r.correct]));
  }
  if (G.phase === "vote" && G.vote) Object.assign(s, { voteKey: G.vote.key, cands: G.vote.cands, deadline: G.deadline, duration: G.duration, remaining: G.paused ? G.remaining : null });
  if (G.phase === "voteDone" && G.vote) s.voteKey = G.vote.key;
  if ((G.phase === "roundIntro" || G.phase === "countdown") && G.lineup && G.lineup.length) {
    const f = G.players[G.lineup[0]]; s.first = G.lineup[0]; s.firstWho = { n: f.name, e: f.emoji };
  }
  if (G.sd && ["sdPairs", "answer", "sdResult"].includes(G.phase)) s.sd = sdPublic();
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
  G.roundLeft = G.roundTotal * 1000; G.roundBest = -1;
  G.lineup = lineup();
  stopMusic(0.3);
  // Title slam, line-up cascade, then the first player is spotlit.
  seq([[0, () => W.roundIntro()], [1900, () => W.sweep()], [4300, () => W.spotlight()], [5400, () => {}]]);
  publishState(); render();
}
// Turn order for this round, starting with whoever plays first.
function lineup() {
  const out = [];
  for (let i = 0; i < G.order.length; i++) { const u = G.order[(G.turnPtr + i) % G.order.length]; if (isActive(u)) out.push(u); }
  return out;
}

// 3, 2, 1, Go! then the first turn.
function beginRound() {
  if (G.phase !== "roundIntro") return;
  G.seqTok = (G.seqTok || 0) + 1; G.seqEnd = 0;
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
    if (G.players[G.cur.uid]) G.players[G.cur.uid].bankedOwn += amount;
    flash(); confetti({ x: 0.1, y: 0.8, power: 70, spread: 0.6, colours: GOLD });
    publishState(); render();
    const key = G.cur.key;
    setTimeout(() => { if (G && G.cur && G.cur.key === key && G.phase === "bank") askQuestion(); }, BANK_FLASH_MS);
  } else askQuestion();
}
function doBank() {
  const amount = R.chainValue(chain(), G.chainIdx);
  G.pot += amount; G.roundBanked += amount;
  for (const [u, p] of Object.entries(G.players)) {
    if (p.pending) { const st = G.roundStats[u] = G.roundStats[u] || { turns: 0, wrong: 0, time: 0, banked: 0, lost: 0 }; st.banked += p.pending; }
    p.credit += p.pending; p.pending = 0;
  }
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
  if (!c.sd) for (const u of c.uids) {
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
    const a = app.querySelector("#answered"); if (a) a.textContent = answeredText();
    if (G.cur.uids.every(u => G.cur.answers[u] || !isActive(u))) lockAnswers();
  });
  publishState(); render(); sfx.whoosh();
}

const answeredText = () => `${G.cur.uids.filter(u => G.cur.answers[u]).length} / ${G.cur.uids.length} answered`;

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
    if (!c.sd) {
      const st = G.roundStats[u] = G.roundStats[u] || { turns: 0, wrong: 0, time: 0, banked: 0, lost: 0 };
      st.turns++; st.time += secs; if (!correct) st.wrong++;
    }
  }
  if (c.sd) return sdResolve();
  G.phase = "result";
  {
    const r = c.res[c.uid];
    if (r.correct) {
      const gain = R.stepGain(chain(), G.chainIdx);
      G.players[c.uid].pending += gain;
      G.chainIdx++; G.roundBest = Math.max(G.roundBest, G.chainIdx);
      c.gain = R.chainValue(chain(), G.chainIdx);
      c.justLit = G.chainIdx;
      W.correct(G.chainIdx);
      if (G.chainIdx === chain().length - 1) { c.bankedFrom = G.chainIdx; c.maxed = doBank(); G.players[c.uid].bankedOwn += c.maxed; G.roundMaxed = true; flash(); confetti({ power: 160, colours: GOLD }); }
    } else {
      c.lost = R.chainValue(chain(), G.chainIdx);
      c.brokeFrom = G.chainIdx;
      if (c.lost) { G.players[c.uid].lost += c.lost; G.roundStats[c.uid].lost += c.lost; }
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
  G.rounds.push({ round: G.round, banked: G.roundBanked, lost, turns, correct: turns - wrong, reason, best: G.roundBest, potBefore: G.pot - G.roundBanked });
  G.phase = "roundEnd"; G.cur = null; G.paused = false;
  stopMusic(0.2); setTempo(1);
  // Lights drop, "Round over" slams in, the pot counts up, then the round's figures.
  seq([
    [0, () => W.lightsOut()],
    [1200, () => { if (reason === "max") { sfx.fanfare(true); confetti({ power: 140, colours: GOLD }); } else W.roundOver(); W.slam(); }],
    [2800, () => countUp()],
    [5000, () => W.pop()], [5600, () => W.pop()], [6200, () => W.pop()],
    [7200, () => W.blip()],
  ]);
  publishState(); render();
}

// ============================================================ voting
function startVote() {
  const stats = Object.fromEntries(Object.entries(G.roundStats).filter(([u]) => isActive(u)));
  // hint: only the NPCs use this, to vote realistically. The class's votes decide.
  const hint = R.weakestLink(stats, G.settings.answerSecs).weakest;
  const cands = Object.fromEntries(Object.keys(stats).filter(u => stats[u].turns).map(u => [u, { n: G.players[u].name, e: G.players[u].emoji }]));
  if (Object.keys(cands).length < 2) { toast("Not enough players had a turn this round to vote."); return afterVote(); }
  G.vote = { key: "v" + G.round, hint, cands, votes: {}, weakest: [] };
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
  const roundPerf = Object.fromEntries(Object.entries(G.roundStats).map(([u, st]) => [u, (st.banked || 0) - (st.lost || 0)]));
  const overall = Object.fromEntries(Object.keys(v.cands).map(u => [u, R.perf(G.players[u])]));
  const vr = R.voteResult(v.votes, Object.keys(v.cands), roundPerf, overall);
  v.weakest = vr.weakest ? [vr.weakest] : []; v.counts = vr.counts;
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
function afterVote() { if (G.round >= G.settings.rounds) goSuddenDeath(); else roundIntro(); }

// ============================================================ sudden death
// Everyone still in the game plays. Players are paired with someone of similar
// banked-minus-lost, and every match answers the same question at the same time.
function goSuddenDeath() {
  const ranked = active().map(([u, p]) => ({ u, s: R.perf(p), c: p.correct, x: Math.random() }))
    .sort((a, b) => b.s - a.s || b.c - a.c || a.x - b.x).map(r => r.u);
  stopMusic(0.3);
  G.final = {};
  if (ranked.length < 2) return finish(ranked[0] || null);
  G.sd = { round: 0, alive: ranked, all: ranked.slice(), outGroups: [], matches: [], reveal: null };
  sdPairUp(true);
}
function sdPairUp(first) {
  const sd = G.sd;
  sd.alive = sd.alive.filter(isActive);
  if (sd.alive.length < 2) return finish(sd.alive[0] || null);
  sd.round++;
  sd.matches = R.pairUp(sd.alive).map((m, i) => ({ id: i, uids: m.uids.slice(), start: m.uids.slice(), oneOut: m.oneOut, done: false, out: [], last: null }));
  sd.reveal = null; sd.void = false;
  G.phase = "sdPairs"; G.cur = null;
  if (first) W.finalStart(); else W.sweep();
  setTimeout(() => { if (G && G.sd && G.phase !== "end") playMusic("wlFinal"); }, first ? 1000 : 0);
  publishState(); render();
}
function sdAsk() {
  const sd = G.sd;
  if (G.phase !== "sdPairs" && G.phase !== "sdResult") return;
  const live = sd.matches.filter(m => !m.done);
  if (!live.length) return sdPairUp();
  const uids = live.flatMap(m => m.uids).filter(isActive);
  if (!uids.length) return sdPairUp();
  sd.reveal = null; sd.void = false;
  G.cur = { key: "t" + (++G.turnN), uids, uid: uids[0], sd: true };
  askQuestion();
}
function sdResolve() {
  const c = G.cur, sd = G.sd;
  const live = sd.matches.filter(m => !m.done);
  const outcomes = live.map(m => ({ m, r: R.resolveMatch(m, c.res) }));
  const outAll = outcomes.flatMap(o => o.r.out);
  // If nobody at all would be left standing, everyone goes again.
  sd.void = sd.alive.every(u => outAll.includes(u));
  for (const { m, r } of outcomes) {
    const played = m.uids.slice();
    if (sd.void) { m.last = { uids: played, out: [], replay: played, void: true }; continue; }
    m.last = { uids: played, out: r.out, replay: r.replay };
    m.out.push(...r.out);
    if (r.replay) m.uids = r.replay;
    else { m.done = true; m.uids = played.filter(u => !r.out.includes(u)); }
  }
  if (!sd.void && outAll.length) { sd.outGroups.push(outAll); sd.alive = sd.alive.filter(u => !outAll.includes(u)); }
  G.phase = "sdResult";
  sd.reveal = { ids: live.map(m => m.id), shown: 0 };
  stopMusic(0.3);
  const roll = W.drumroll(1.4) || 1.4;
  publishState(); render();
  const key = c.key;
  const step = () => {
    if (!G || !G.cur || G.cur.key !== key || G.phase !== "sdResult") return;
    const rv = sd.reveal;
    if (rv.shown < rv.ids.length) {
      const m = sd.matches[rv.ids[rv.shown]]; rv.shown++;
      if (m.last.void) W.chainBreak(0);
      else if (m.last.out.length) { W.eliminate(); flash(true); }
      else W.sweep();
      publishState(); render();
      setTimeout(step, rv.shown < rv.ids.length ? 1500 : 900);
    } else if (sd.alive.length === 1 && sd.matches.every(m => m.done)) {
      setTimeout(() => { if (G && G.phase === "sdResult" && G.cur && G.cur.key === key) finish(sd.alive[0]); }, 1400);
    } else { playMusic("wlFinal"); render(); }
  };
  setTimeout(step, roll * 1000);
}
// What the phones need: each match, and its result once the TV has revealed it.
function sdPublic() {
  const sd = G.sd, shown = G.phase === "sdResult" && sd.reveal ? sd.reveal.ids.slice(0, sd.reveal.shown) : [];
  const nm = u => ({ n: G.players[u].name, e: G.players[u].emoji });
  return {
    round: sd.round, left: sd.alive.length,
    out: G.phase === "sdResult" ? [] : sd.all.filter(u => !sd.alive.includes(u)),
    matches: sd.matches.map(m => ({
      u: G.phase === "sdResult" && m.last ? m.last.uids : m.uids, done: m.done,
      names: Object.fromEntries(m.start.map(u => [u, nm(u)])),
      res: shown.includes(m.id) ? { out: m.last.out, replay: m.last.replay || null } : null,
    })),
  };
}
function finish(winner) {
  unlisten();
  G.phase = "end"; G.cur = null; G.final = G.final || {};
  G.final.winner = winner;
  // Places: the champion is 1st; players knocked out later finish higher.
  const places = {}; if (winner) places[winner] = 1;
  let place = 2;
  const groups = (G.sd && G.sd.outGroups) || [];
  for (let i = groups.length - 1; i >= 0; i--) { groups[i].forEach(u => { places[u] = place; }); place += groups[i].length; }
  G.final.places = places;
  G.final.runnerUp = groups.length && groups[groups.length - 1].length === 1 ? groups[groups.length - 1][0] : null;
  stopMusic(0.2);
  W.winner(); flash(); confetti({ power: 180, colours: GOLD }); confettiRain(6, GOLD.concat(["#ff7aa8", "#4fb4ff", "#6fdc8f"]));
  setTimeout(() => { if (G && G.phase === "end") playMusic("wlChampion"); }, 3200);
  const pts = G.settings.detectivePoints;
  const maxD = Math.max(0, ...active().map(([, p]) => p.detective));
  G.topDetectives = maxD ? active().filter(([, p]) => p.detective === maxD).map(([u]) => u) : [];
  // Awards (ties share): most correct votes, most banked on their own BANK press, best banked-minus-lost.
  const best = (f, min) => { const v = Math.max(...active().map(([, p]) => f(p))); return v > min ? active().filter(([, p]) => f(p) === v).map(([u]) => u) : []; };
  const strongest = (() => { const v = Math.max(...active().map(([, p]) => R.perf(p))); const top = active().filter(([, p]) => R.perf(p) === v); if (v <= 0 && !top.some(([, p]) => p.correct)) return []; const c = Math.max(...top.map(([, p]) => p.correct)); return top.filter(([, p]) => p.correct === c).map(([u]) => u); })();
  G.awards = [
    { k: "detective", icon: "🔍", t: "Best detective", who: G.topDetectives, note: maxD ? `${maxD} correct vote${maxD === 1 ? "" : "s"}` : "" },
    { k: "banker", icon: "🏦", t: "Biggest banker", who: best(p => p.bankedOwn || 0, 0), note: "" },
    { k: "strongest", icon: "💪", t: "Strongest link", who: strongest, note: "" },
  ].filter(a => a.who.length);
  const bk = G.awards.find(a => a.k === "banker"); if (bk) bk.note = M(G.players[bk.who[0]].bankedOwn) + " banked";
  const sg = G.awards.find(a => a.k === "strongest"); if (sg) sg.note = "Best all-round game";
  for (const [u, p] of active()) G.net.setFeedback(u, { final: { champ: u === winner, finalist: places[u] === 2, place: places[u] || null, credit: p.credit, own: p.bankedOwn || 0, detective: p.detective * pts, pot: G.pot, awards: G.awards.filter(a => a.who.includes(u)).map(a => a.icon + " " + a.t), cur: G.settings.currency } }).catch(() => {});
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
// The round clock hit zero: stop at once. A turn in progress is cut off (unless its answer
// is already locked in), and that player goes first next round so they don't lose their turn.
function timeUpNow() {
  const c = G.cur;
  if (c && c.locked) return;   // revealed, then the round ends
  if (c && !c.sd && ["bank", "answer"].includes(G.phase)) {
    const i = G.order.indexOf(c.uid); if (i >= 0) G.turnPtr = i;
  }
  unlisten(); G.cur = null;
  endRound("time");
}
function addRoundTime() { G.roundLeft += 30000; G.roundTotal += 30; if (G.timeUp && G.roundLeft > 0) G.timeUp = false; render(); }
function newQuestion() { if (G.phase !== "answer" || G.cur.locked) return; unlisten(); askQuestion(); }
function skipPlayer() { if (!["bank", "answer"].includes(G.phase) || G.cur.sd) return; unlisten(); G.cur = null; nextTurn(); }

// ============================================================ results
function breakdownData() {
  const places = (G.final && G.final.places) || {};
  return {
    v: 2, title: G.title, at: Date.now(), pot: G.pot, cur: G.settings.currency, rounds: G.rounds,
    rows: Object.entries(G.players).map(([u, p]) => ({ name: `${p.emoji} ${p.name}`, answered: p.answered, correct: p.correct,
      avg: p.answered ? Math.round(p.time / p.answered * 10) / 10 : null, credit: p.credit, lost: p.lost || 0, detective: p.detective, weakest: p.weakestTimes,
      place: places[u] || null, champ: G.final && G.final.winner === u, removed: p.kicked }))
      .sort((a, b) => (a.place || 999) - (b.place || 999) || (b.credit - b.lost) - (a.credit - a.lost)),
  };
}
function saveResults() { if (!G.live) return; const list = storageGet("wl.results", []); list.unshift(breakdownData()); storageSet("wl.results", list.slice(0, 20)); }
const ordinal = n => n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th");
function showBreakdown(b) {
  const money = n => R.money(n, b.cur);
  modal(el("div", null, el("h2", null, "📊 Breakdown (teacher view)"), el("p", { class: "muted" }, `${b.title} · Pot ${money(b.pot)}`),
    el("div", { class: "tablewrap" }, el("table", null,
      el("thead", null, el("tr", null, ...["Finished", "Player", "Questions", "Correct", "Avg time", "Helped bank", "Lost", "Correct votes", "Voted weakest"].map(h => el("th", null, h)))),
      el("tbody", null, ...b.rows.map(r => el("tr", { class: r.removed ? "muted" : "" }, el("td", null, r.place ? ordinal(r.place) : "—"), el("td", null, (r.champ ? "🏆 " : "") + r.name), el("td", null, r.answered), el("td", null, r.correct),
        el("td", null, r.avg == null ? "—" : r.avg + " s"), el("td", null, money(r.credit)), el("td", null, r.lost == null ? "—" : money(r.lost)), el("td", null, r.detective), el("td", null, r.weakest ? r.weakest + "×" : "—")))))),
    el("p", { class: "muted small" }, "Helped bank: money from their correct answers that the team banked. Lost: money in the chain when they answered wrongly. Sudden-death pairs were matched on helped bank minus lost."),
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
      G.round ? el("span", { class: "pill" }, G.sd || G.phase === "end" ? "Sudden death" : `Round ${G.round} of ${G.settings.rounds}`) : null,
      el("span", { class: "pill" }, G.live || G.joinable ? "Code " : "", el("b", null, G.code)), G.hub ? el("span", { class: "pill test" }, "🤖 Test mode") : null,
      soundControls(), el("span", { class: "muted" }, `👥 ${active().length}`),
      G.phase !== "end" && (G.live || G.joinable) ? el("button", { class: "btn ghost sm", text: "📱 QR", onclick: showQR }) : null,
      el("button", { class: "btn ghost sm", text: "👥 Players", onclick: playersModal }), fsButton(),
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
    G.phase === "sdResult" && G.sd.reveal ? G.sd.reveal.shown : "", G.phase === "sdResult" && G.sd.reveal && G.sd.reveal.shown >= G.sd.reveal.ids.length ? "all" : "",
    G.phase === "voteDone" && Date.now() >= (G.revealAt || 0) ? "rv" : ""].join("|");
  const fresh = viewKey !== lastViewKey; lastViewKey = viewKey;
  const main = el("main", { class: "stage" + (fresh ? " fresh" : ""), onclick: e => { if (!e.target.closest("button,input,select,a")) skipSeq(); } });
  app.append(topbar(), main);
  const v = { lobby: lobbyView, roundIntro: roundIntroView, countdown: countdownView, resume: resumeView, bank: playView, answer: playView, result: playView,
    roundEnd: roundEndView, vote: voteView, voteDone: voteDoneView, sdPairs: sdPairsView, sdResult: sdResultView, end: endView }[G.phase];
  if (v) main.append(v());
  if (G.seqEnd > Date.now() && fresh) main.append(el("div", { class: "skiphint" }, "Click to skip"));
  if (G.phase === "roundEnd" && !(fresh && G.seqEnd > Date.now())) countUp(true);
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
        el("p", null, "🗳 After each round, everyone votes in secret for the weakest link. Vote with the class to earn Detective points. Nobody is out yet!"),
        el("p", null, "⚡ The final is sudden death: everyone plays in pairs, and the last one standing wins.")),
      el("button", { class: "btn gold big", disabled: !ps.length, text: "Start the game →", onclick: startGame })));
}

const mmss = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
function roundIntroView() {
  const last = G.round === G.settings.rounds && G.settings.rounds > 1;
  const lu = G.lineup || [];
  const first = lu[0] ? G.players[lu[0]] : null;
  return el("div", { class: "center-view intro" },
    el("div", { class: "introflash" }),
    el("div", { class: "eyebrow big i1" }, last ? "Last round" : "Get ready"),
    el("div", { class: "titleslam" }, el("span", { class: "rw" }, "Round"), el("span", { class: "rn" }, String(G.round)), el("i", { class: "lightsweep" })),
    el("div", { class: "infopills i2" },
      el("span", { class: "pill" }, `⏱ ${mmss(G.roundTotal)} on the clock`),
      el("span", { class: "pill" }, `🔗 Chain up to ${M(chain()[chain().length - 1])}`),
      G.pot ? el("span", { class: "pill gold" }, `💰 Pot so far: ${M(G.pot)}`) : null),
    first ? el("div", { class: "firstup" }, el("div", { class: "cone" }), el("div", { class: "eyebrow big" }, "First up"), el("div", { class: "fname" }, `${first.emoji} ${first.name}`)) : null,
    lu.length > 1 ? el("div", { class: "lineup" + (lu.length > 14 ? " many" : "") }, ...lu.map((u, i) => el("div", { class: "lp" + (i === 0 ? " first" : ""), style: { "--i": i } }, el("b", null, i + 1), `${G.players[u].emoji} ${G.players[u].name}`))) : null,
    G.round > 1 ? el("p", { class: "muted i3" }, "Last round's weakest link has a 50:50 on their phone for their first question.") : null,
    el("button", { class: "btn gold big i4", text: `▶ Start round ${G.round}`, onclick: beginRound }));
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
  if (c && c.sd) return sdPlayView();
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
      G.timeUp ? el("div", { class: "timeup" }, "⏰ Time's up!") : null,
      el("div", { class: "eyebrow" }, `Round ${G.round} of ${G.settings.rounds}`)),
    G.paused ? el("div", { class: "paused" }, "⏸ Paused") : null);
}

function questionBlock(c, reveal) {
  const q = c.q;
  const asking = G.phase === "answer" && !c.locked;
  const picks = c.locked && !reveal && !c.sd ? Object.values(c.answers || {}).map(a => Number(a.v)) : [];
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
  if (c.q && c.q.explanation) b.append(el("div", { class: "explain" }, "💬 " + c.q.explanation));
  return b;
}
function resultLine(c) {
  const r = c.res[c.uid];
  if (r.correct) return el("div", { class: "banner ok" }, c.maxed ? `🎉 Correct! ${M(c.maxed)} banked: the chain is complete!` : `✅ Correct! The chain is at ${M(c.gain)}`, nextBtn());
  return el("div", { class: "banner bad" }, r.v == null ? "⌛ Time's up!" : "❌ Not quite.", c.lost ? ` ${M(c.lost)} lost from the chain.` : "", nextBtn());
}
function nextBtn() { return G.settings.autoNext && !G.paused ? null : el("button", { class: "btn sm", text: "Next →", onclick: afterResult }); }

function controls() {
  const ph = G.phase, c = G.cur;
  if (ph === "result") return el("div", { class: "controls" }, el("button", { class: "btn ghost sm", text: G.autoAt ? "⏸ Hold here" : "Next →", onclick: () => { if (G.autoAt) { G.autoAt = null; render(); } else afterResult(); } }));
  return el("div", { class: "controls" },
    el("button", { class: "btn ghost sm", text: G.paused ? "▶ Resume" : "⏸ Pause", onclick: togglePause }),
    el("button", { class: "btn ghost sm", text: "+10 s", onclick: addTurnTime }),
    !c.sd ? el("button", { class: "btn ghost sm", text: "+30 s round", onclick: addRoundTime }) : null,
    ph === "answer" ? el("button", { class: "btn ghost sm", text: "🔄 New question", onclick: newQuestion }) : null,
    !c.sd ? el("button", { class: "btn ghost sm", text: "⏭ Skip player", onclick: skipPlayer }) : null,
    !c.sd ? el("button", { class: "btn ghost sm", text: "⏹ End round", onclick: () => confirmBox("End this round now? Money in the chain that isn't banked will be lost.", "End round", () => endRound("teacher")) }) : null);
}

function roundEndView() {
  const r = G.rounds[G.rounds.length - 1];
  const reason = { max: "🎉 Chain complete!", time: "⏰ Time's up!" }[r.reason] || "🔔 Stop the clock!";
  return el("div", { class: "center-view roundend" },
    el("div", { class: "lightsdrop" }),
    el("div", { class: "eyebrow big e1" }, reason),
    el("div", { class: "titleslam over" }, el("span", { class: "rw" }, `Round ${r.round}`), el("span", { class: "rn" }, "Over"), el("i", { class: "lightsweep" })),
    el("div", { class: "potreveal e2" }, el("div", { class: "eyebrow" }, "The pot"),
      el("b", { class: "js-count", "data-from": r.potBefore != null ? r.potBefore : G.pot - r.banked, "data-to": G.pot }, M(G.pot)),
      el("div", { class: "plus" }, r.banked ? `+ ${M(r.banked)} banked this round` : "Nothing banked this round")),
    el("div", { class: "statrow late" },
      stat("Correct answers", `${r.correct} / ${r.turns}`),
      stat("Lost (not banked)", M(r.lost || 0), r.lost ? "bad" : ""),
      stat("Longest chain", r.best != null && r.best >= 0 ? M(chain()[r.best]) : "—", "gold")),
    el("button", { class: "btn big e3", text: "🗳 Vote for the weakest link", onclick: startVote }));
}
// The pot ticks up from its old total to the new one.
function countUp(instant) {
  const b = app.querySelector(".js-count"); if (!b || !G) return;
  const from = Number(b.dataset.from) || 0, to = Number(b.dataset.to) || 0;
  if (instant || from === to) { b.textContent = M(to); return; }
  const t0 = performance.now(), dur = 1900, tok = G.seqTok;
  let lastTick = 0;
  const f = t => {
    if (!G || G.seqTok !== tok || !b.isConnected) return;
    const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
    b.textContent = M(from + (to - from) * e);
    if (t - lastTick > 110 && k < 1) { lastTick = t; W.bankTick(); }
    if (k < 1) requestAnimationFrame(f); else { b.classList.add("done"); W.bank(); }
  };
  b.textContent = M(from); requestAnimationFrame(f);
}
const stat = (label, value, cls) => el("div", { class: "stat " + (cls || "") }, el("div", { class: "eyebrow" }, label), el("b", null, value));
const plates = (list, cls) => el("div", { class: "plates " + (cls || "") }, cls && cls.includes("dim") ? null : el("div", { class: "sweeplight" }), ...list.map(([, p]) => el("div", { class: "plate" }, `${p.e || p.emoji} ${p.n || p.name}`)));

function voteView() {
  const n = Object.keys(G.vote.votes).length, tot = active().length;
  return el("div", { class: "center-view" },
    el("div", { class: "eyebrow big" }, "🤫 Secret vote"),
    el("h2", { class: "huge" }, "Who was the weakest link?"),
    plates(Object.entries(G.vote.cands)),
    el("p", { class: "lead" }, "Vote on your phone. Think about wrong answers, slow answers and money lost."),
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
    el("p", { class: "lead big" }, `vote${v.voters === 1 ? "" : "s"} went to this round's weakest link`),
    el("p", { class: "lead" }, "📱 Check your phone to see if you were right."),
    bars,
    el("button", { class: "btn big", text: last ? "⚡ On to sudden death" : `Round ${G.round + 1} →`, onclick: afterVote }));
}

function matchCard(m, opts = {}) {
  const res = opts.res, played = res ? res.uids : m.uids;
  const names = m.start.map(u => {
    let cls = "mp", tag = null;
    if (!played.includes(u)) cls += " gone";
    else if (res) {
      if (res.out.includes(u)) { cls += " out"; tag = "OUT"; }
      else if (res.replay && res.replay.includes(u)) { cls += " again"; tag = "AGAIN"; }
      else { cls += " through"; tag = "THROUGH"; }
    }
    const r = res && opts.c && opts.c.res[u];
    return el("div", { class: cls }, el("span", { class: "mn" }, pname(u)),
      tag ? el("small", null, tag) : null,
      r ? el("em", null, r.correct ? `✔ ${r.secs.toFixed(1)} s` : r.v == null ? "no answer" : "✘ wrong") : null);
  });
  const parts = [];
  names.forEach((n, i) => { if (i) parts.push(el("i", { class: "mvs" }, "vs")); parts.push(n); });
  return el("div", { class: "match" + (m.start.length === 3 ? " trio" : "") + (opts.cls ? " " + opts.cls : ""), style: { "--i": opts.i || 0 } },
    m.start.length === 3 ? el("div", { class: "mtag" }, "Trio · one goes out") : m.oneOut ? el("div", { class: "mtag" }, "Final match") : null,
    el("div", { class: "mrow" }, ...parts),
    opts.note ? el("div", { class: "mnote" }, opts.note) : null);
}
function sdPairsView() {
  const sd = G.sd, live = sd.matches.filter(m => !m.done);
  const replaying = live.some(m => m.last);
  return el("div", { class: "center-view sd" },
    el("div", { class: "eyebrow big" }, sd.alive.length <= 3 ? "The final" : `Round ${sd.round}`),
    el("h2", { class: "huge sdtitle" }, "⚡ Sudden death"),
    el("p", { class: "lead" }, replaying ? "These players go again with a new question." : `${sd.alive.length} players left. Everyone answers the same question at the same time.`),
    el("div", { class: "matches" + (live.length > 6 ? " many" : "") }, ...live.map((m, i) => matchCard(m, { i, note: m.last ? "🔁 Replay" : null }))),
    el("p", { class: "muted rules2" }, "Right beats wrong. Both right: the faster player goes through. Both wrong: both are out!",
      live.some(m => m.oneOut) ? " In a trio or the final match, exactly one player goes out." : ""),
    el("button", { class: "btn gold big", text: replaying ? "▶ Replay question" : "▶ Ask the question", onclick: sdAsk }));
}
function sdPlayView() {
  const c = G.cur, sd = G.sd;
  return el("div", { class: "play sdplay" },
    el("div", { class: "centre" },
      el("div", { class: "turnhead" },
        el("div", { class: "nameplate" }, el("span", { class: "who sdwho" }, "⚡ Sudden death"), el("span", { class: "muted upnext" }, `${sd.alive.length} players left · everyone answers now`)),
        el("div", { class: "row sdcount" }, el("p", { class: "lead", id: "answered" }, answeredText()), G.phase === "answer" ? timerRing("") : null)),
      questionBlock(c, false),
      controls()),
    G.paused ? el("div", { class: "paused" }, "⏸ Paused") : null);
}
function sdResultView() {
  const c = G.cur, sd = G.sd, rv = sd.reveal || { ids: [], shown: 0 };
  const q = c.q, done = rv.shown >= rv.ids.length;
  const pending = sd.matches.filter(m => !m.done);
  const over = sd.alive.length === 1 && sd.matches.every(m => m.done);
  let next = null;
  if (done && !over) {
    next = sd.void ? el("button", { class: "btn gold big", text: "🔁 Everyone goes again", onclick: sdAsk })
      : pending.length ? el("button", { class: "btn gold big", text: "🔁 Replay question", onclick: sdAsk })
      : el("button", { class: "btn gold big", text: sd.alive.length <= 3 ? "⚡ On to the final" : "⚡ Next round", onclick: () => sdPairUp() });
  }
  return el("div", { class: "center-view sd" },
    el("div", { class: "answerline" }, el("span", { class: "eyebrow" }, "The answer"), el("span", { class: "anum o" + q._answer }, q._answer), el("b", null, q._options[q._answer - 1])),
    el("div", { class: "matches" + (rv.ids.length > 6 ? " many" : "") }, ...rv.ids.map((id, i) => {
      const m = sd.matches[id], shown = i < rv.shown;
      return matchCard(m, { i, res: shown ? m.last : null, c, cls: shown ? "shown" + (i === rv.shown - 1 ? " now" : "") : "waiting" });
    })),
    done && sd.void ? el("div", { class: "banner bad" }, "Nobody would be left standing, so everyone goes again!") : null,
    done && pending.length && !sd.void ? el("p", { class: "lead" }, "🔁 Some players go again to settle their match.") : null,
    done && over ? el("h2", { class: "huge champ" }, "🏆 " + pname(sd.alive[0])) : null,
    next);
}

function endView() {
  const f = G.final || {};
  return el("div", { class: "center-view" },
    el("div", { class: "rays" }),
    f.winner ? el("div", { class: "trophy" }, "🏆") : null,
    f.winner ? el("div", { class: "eyebrow big" }, "Champion") : null,
    f.winner ? el("h2", { class: "huge champ" }, pname(f.winner)) : el("h2", { class: "huge" }, "🎉 Well played!"),
    f.winner ? el("p", { class: "lead" }, "Last one standing!") : null,
    el("div", { class: "statrow" },
      stat("The class banked", M(G.pot), "gold"),
      f.runnerUp ? stat("🥈 Runner-up", pname(f.runnerUp), "names") : null,
    ),
    G.awards && G.awards.length ? el("div", { class: "awards" }, ...G.awards.map((a, i) => el("div", { class: "award", style: { "--i": i } },
      el("div", { class: "aicon" }, a.icon), el("div", { class: "eyebrow" }, a.t), el("b", null, a.who.map(pname).join(" · ")), a.note ? el("small", null, a.note) : null))) : null,
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
      el("button", { class: "btn danger", text: "Remove from game", onclick: () => { p.kicked = true; G.net.updatePlayer(uid, { kicked: true }).catch(() => {}); closeModal(); if (G.cur && G.cur.uids.includes(uid) && !G.cur.sd) skipPlayer(); publishState(); render(); } }),
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
    const running = ["bank", "answer"].includes(G.phase) && !G.paused && !(c && (c.sd || c.banked || c.locked));
    if (running && G.roundLeft > 0) {
      G.roundLeft = Math.max(0, G.roundLeft - dt);
      if (G.roundLeft <= 0 && !G.timeUp) { G.timeUp = true; W.timeUp(); timeUpNow(); return; }
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
      if (G.cur.sd) setIntensity(0.6);
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
  if (e.target.matches("input,textarea,select") || document.querySelector(".modal-ov")) return;
  if (e.key.toLowerCase() === "f") { toggleFS(); return; }
  if (!G) return;
  if (e.key.toLowerCase() === "p") togglePause();
  if ((e.key === " " || e.key === "ArrowRight") && G.phase === "result") { e.preventDefault(); afterResult(); }
});

init();
