// Teacher / projector screen.
import {
  el, fmt, clean, timeFor, qtypeLabel, prepareQuestion, isCorrect, answerText, displayValue, normalise,
  POWERUPS, TEAM_NAMES, makeCode, pick, shuffle, decodeGame, validateGame, storageGet, storageSet,
} from "./common.js?v=20261121215231";
import { SimHub, makeBots, hybridHost } from "./net-sim.js?v=20261121215231";
import { playMusic, stopMusic, setIntensity, duckMusic, sfx, audioPrefs, setPref, unlock } from "./audio.js?v=20261121215231";
import { confetti, confettiRain } from "./fx.js?v=20261121215231";
import { mountPlayer } from "./player.js?v=20261121215231";
import { THEMES, applyTheme } from "./theme.js?v=20261121215231";
import { SAMPLES } from "./samples.js?v=20261121215231";

const app = document.getElementById("app");
const CONFIG = window.FIREBASE_CONFIG || null;
const BASE = 1000, SPEED_MAX = 250, SAFETY = 500;

let G = null;          // the running session
let pending = null;    // game chosen on the setup screen
let tick = null;

// ============================================================ setup
async function init() {
  const m = location.hash.match(/game=([^&]+)/);
  if (m) {
    try {
      const g = await decodeGame(decodeURIComponent(m[1]));
      const errs = validateGame(g);
      if (errs.length) throw new Error(errs.slice(0, 3).join("; "));
      pending = saveGame(g);
      history.replaceState(null, "", location.pathname);
    } catch (e) { toast("That game link couldn't be read: " + e.message); }
  }
  renderSetup();
}

function savedGames() { return storageGet("lq.games", []); }
function saveGame(g) {
  const list = savedGames();
  const id = g.id || ("g" + Date.now().toString(36));
  g.id = id;
  const i = list.findIndex(x => x.id === id);
  const entry = { id, title: g.title || "Untitled game", mode: g.mode, level: g.level, n: g.questions.length, savedAt: Date.now(), game: g };
  if (i >= 0) list[i] = entry; else list.unshift(entry);
  storageSet("lq.games", list.slice(0, 60));
  return g;
}

// Test mode is hidden on the live site; add ?test to the address to bring it back.
const SHOW_TEST = !CONFIG || new URLSearchParams(location.search).has("test");

function themePrefs() { return Object.assign({ theme: "", decor: true }, storageGet("lq.theme", {})); }

function renderSetup() {
  stopTick(); stopMusic();
  const tp = themePrefs();
  applyTheme(tp.theme, { decor: tp.decor });
  app.className = "host setup";
  app.textContent = "";
  const games = savedGames();
  const session = storageGet("lq.session", null);
  const fileIn = el("input", { type: "file", accept: ".json,application/json", hidden: true, onchange: async e => {
    const f = e.target.files[0]; if (!f) return;
    try { const g = JSON.parse(await f.text()); const errs = validateGame(g); if (errs.length) throw new Error(errs[0]); pending = saveGame(g); renderSetup(); }
    catch (err) { toast("Couldn't load that file: " + err.message); }
  } });

  const pasteBox = el("textarea", { rows: 2, placeholder: "…or paste a game code from the builder here" });
  const pasteBtn = el("button", { class: "btn-ghost", text: "Load pasted code", onclick: async () => {
    const t = pasteBox.value.trim(); if (!t) return;
    try {
      const raw = t.includes("game=") ? decodeURIComponent(t.split("game=")[1]) : t;
      const g = raw.startsWith("{") ? JSON.parse(raw) : await decodeGame(raw);
      const errs = validateGame(g); if (errs.length) throw new Error(errs[0]);
      pending = saveGame(g); renderSetup();
    } catch (err) { toast("That code couldn't be read: " + err.message); }
  } });

  const chosen = pending ? el("div", { class: "chosen" },
    el("div", null, el("div", { class: "eyebrow" }, "Ready to play"), el("h2", null, pending.title || "Untitled game"),
      el("p", { class: "muted" }, `${pending.mode === "grammar" ? "Grammar" : "Vocabulary"} · ${pending.level || ""} · ${pending.questions.length} questions`)),
    el("button", { class: "btn-ghost", text: "Change", onclick: () => { pending = null; renderSetup(); } })) : null;

  const list = el("div", { class: "glist" });
  if (!games.length) list.append(el("p", { class: "muted" }, "No saved games yet. Build one in Claude, or try a sample below."));
  games.forEach(e => list.append(el("div", { class: "gitem" + (pending && pending.id === e.id ? " sel" : "") },
    el("div", null, el("b", null, e.title), el("div", { class: "muted small" }, `${e.mode === "grammar" ? "Grammar" : "Vocabulary"} · ${e.level || ""} · ${e.n} questions`)),
    el("div", { class: "row" },
      el("button", { class: "btn-primary sm", text: "Choose", onclick: () => { pending = e.game; renderSetup(); } }),
      el("button", { class: "btn-ghost sm", text: "🗑", title: "Delete", onclick: () => confirmBox(`Delete “${e.title}” from this computer?`, "Delete", () => { storageSet("lq.games", savedGames().filter(x => x.id !== e.id)); if (pending && pending.id === e.id) pending = null; renderSetup(); }) })))));

  // play settings
  const teamSel = el("select", null, el("option", { value: "0" }, "Individual"), ...[2, 3, 4, 5].map(n => el("option", { value: n }, `${n} teams`)));
  const speed = el("input", { type: "checkbox", checked: true });
  const pups = el("input", { type: "checkbox", checked: true });
  const npcN = el("input", { type: "number", min: 1, max: 20, value: 12 });
  const npcMix = el("select", null, ...[["mixed", "Mixed abilities"], ["weak", "All weaker"], ["average", "All average"], ["strong", "All stronger"]].map(([v, t]) => el("option", { value: v }, t)));
  const along = el("input", { type: "checkbox", checked: true });
  const phones = el("input", { type: "checkbox", checked: !!CONFIG, disabled: !CONFIG });

  const opt = t => el("option", { value: t.id, selected: t.id === tp.theme }, t.label);
  const themeSel = el("select", null, opt(THEMES[0]), ...["Seasons", "Holidays", "Other"].map(g => el("optgroup", { label: g }, ...THEMES.filter(t => t.group === g).map(opt))));
  const decor = el("input", { type: "checkbox", checked: tp.decor, disabled: !tp.theme });
  const themeChanged = () => {
    const v = { theme: themeSel.value, decor: decor.checked };
    decor.disabled = !v.theme;
    storageSet("lq.theme", v); applyTheme(v.theme, { decor: v.decor });
  };
  themeSel.onchange = themeChanged; decor.onchange = themeChanged;

  const settings = () => ({ teams: Number(teamSel.value), speed: speed.checked, powerups: pups.checked, theme: themeSel.value, decor: decor.checked });

  const liveBtn = el("button", { class: "btn-primary big", disabled: !pending || !CONFIG, text: "▶ Start live game", onclick: () => startSession({ live: true, settings: settings() }) });
  const testBtn = el("button", { class: "btn-ghost big", disabled: !pending, text: "🤖 Test with NPCs", onclick: () => startSession({ live: false, settings: settings(), npc: { n: Math.max(1, Math.min(20, Number(npcN.value) || 12)), mix: npcMix.value, along: along.checked, phones: phones.checked } }) });

  const results = storageGet("lq.results", []);

  app.append(
    el("header", { class: "topbar" }, brand(), el("div", { class: "row" }, el("span", { class: "muted small" }, CONFIG ? "Live games ready" : "Test mode only: live games not connected yet"), soundControls())),
    el("main", { class: "setup-grid" },
      el("section", { class: "panel" }, el("h2", null, "1 · Choose a game"), chosen, list,
        el("div", { class: "row wrap" }, el("button", { class: "btn-ghost sm", text: "📂 Load game file", onclick: () => fileIn.click() }),
          ...SAMPLES.map(s => el("button", { class: "btn-ghost sm", text: "✨ Sample: " + s.title, onclick: () => { pending = saveGame(structuredClone(s)); renderSetup(); } }))),
        pasteBox, pasteBtn, fileIn),
      el("section", { class: "panel" }, el("h2", null, "2 · How to play"),
        field("Players", teamSel), field("Speed bonus (small, capped)", speed), field("Comeback power-ups", pups),
        field("Theme", themeSel), field("Moving decorations (petals, leaves, snow…)", decor),
        el("div", { class: "row wrap gap" }, liveBtn),
        !CONFIG ? el("p", { class: "muted small" }, "Live games switch on once Firebase is connected.") : null,
        ...(SHOW_TEST ? [el("hr"),
        el("h3", null, "Test mode"),
        field("Number of NPCs", npcN), field("NPC ability", npcMix), field("Play along on a phone preview", along),
        field("Let real phones join too (shows a QR code)", phones),
        testBtn] : [])),
      session && session.live && Date.now() - session.savedAt < 4 * 3600e3 ? el("section", { class: "panel" }, el("h2", null, "Unfinished game"),
        el("p", null, `Game ${session.code} · ${session.title} · question ${Math.max(0, session.qi + 1)} of ${session.total}`),
        el("div", { class: "row" }, el("button", { class: "btn-primary", text: "Resume", onclick: () => resumeSession(session) }),
          el("button", { class: "btn-ghost", text: "Discard", onclick: () => { storageSet("lq.session", null); renderSetup(); } }))) : null,
      results.length ? el("section", { class: "panel" }, el("h2", null, "Past results"),
        ...results.slice(0, 10).map(r => el("div", { class: "gitem" }, el("div", null, el("b", null, r.title), el("div", { class: "muted small" }, new Date(r.at).toLocaleString("en-IE"))),
          el("button", { class: "btn-ghost sm", text: "View breakdown", onclick: () => renderBreakdown(r) })))) : null));
}

function brand() { return el("h1", { class: "brand" }, "⚡", el("b", null, "Rapidiom")); }
function field(label, input) { return el("label", { class: "field" }, el("span", null, label), input); }

// ============================================================ session
async function startSession({ live, settings, npc }) {
  const game = structuredClone(pending);
  G = {
    live, settings, title: game.title || "Untitled game", gameId: game.id, game,
    qs: game.questions.map(prepareQuestion),
    players: {}, results: [], inventory: {}, flags: {}, qi: -1, phase: "lobby", finalStage: 0, halfRanks: null,
    code: null, net: null,
  };
  if (live) {
    try {
      const { hostNet } = await import("./net-firebase.js?v=20261121215231");
      G.net = await hostNet(CONFIG);
      let code; for (let i = 0; i < 6; i++) { code = makeCode(); if (await G.net.codeFree(code)) break; }
      G.code = code; await G.net.createGame(code);
    } catch (e) { G = null; return toast("Couldn't start the live game: " + (e && e.message)); }
  } else {
    const hub = new SimHub();
    G.hub = hub;
    if (CONFIG && npc.phones) {
      // Real phones join through Firebase; NPCs stay on this computer.
      try {
        const { hostNet } = await import("./net-firebase.js?v=20261121215231");
        const live = await hostNet(CONFIG);
        let code; for (let i = 0; i < 6; i++) { code = makeCode(); if (await live.codeFree(code)) break; }
        G.net = hybridHost(live, hub); G.code = code; G.joinable = true;
        await G.net.createGame(code);
      } catch (e) { toast("Phones can't join right now, so this test uses NPCs only."); G.joinable = false; }
    }
    if (!G.joinable) { G.net = hub.hostApi(); G.code = "TEST"; await G.net.createGame("TEST"); }
    G.bots = makeBots(hub, npc.n, npc.mix, qKey => G.qs[Number(qKey.slice(1))]);
    G.bots.forEach((b, i) => setTimeout(() => b.join(), 400 + i * (250 + Math.random() * 350)));
    G.along = npc.along;
  }
  wire();
  publishState();
  render();
}

async function resumeSession(saved) {
  try {
    const { hostNet } = await import("./net-firebase.js?v=20261121215231");
    const net = await hostNet(CONFIG);
    if (!(await net.resumeGame(saved.code))) throw new Error("this game is no longer available");
    G = Object.assign(saved, { net, live: true });
    wire();
    if (G.phase === "question" && G.cur) {
      // collect any answers that arrived while this screen was away, then reveal
      const qKey = G.cur.qKey;
      G.unsubA = G.net.onAnswers(qKey, obj => { for (const [u, a] of Object.entries(obj)) if (G.cur && !G.cur.answers[u]) G.cur.answers[u] = a; });
      render(); setTimeout(() => closeQuestion(), 1500);
    } else { publishState(); render(); }
  } catch (e) { G = null; toast("Couldn't resume: " + (e && e.message)); storageSet("lq.session", null); renderSetup(); }
}

function persist() {
  if (!G || !G.live) return;
  const { net, hub, bots, unsubA, unsubR, ...rest } = G;
  storageSet("lq.session", Object.assign(structuredClone(rest), { savedAt: Date.now(), total: G.qs.length }));
}

function wire() {
  G.net.onPlayers(obj => {
    let changed = false;
    for (const [uid, p] of Object.entries(obj)) {
      if (!p || typeof p !== "object") continue;
      const known = G.players[uid];
      if (!known) {
        G.players[uid] = { name: clean(p.name, 16) || "Player", emoji: clean(p.emoji, 8) || "🙂", team: null, kicked: !!p.kicked, joinedAt: Date.now(), joinedAtQ: Math.max(0, G.qi) };
        if (G.settings.teams) assignTeam(uid);
        changed = true;
        if (G.phase === "lobby") sfx.pop();
      } else if (G.phase === "lobby" && !known.kicked) {
        const n = clean(p.name, 16) || known.name, e = clean(p.emoji, 8) || known.emoji;
        if (n !== known.name || e !== known.emoji) { known.name = n; known.emoji = e; changed = true; }
      }
    }
    if (changed) { publishState(); render(); }
  });
  G.net.onFlags(f => { G.flags = f || {}; });
  startTick();
}

const active = () => Object.entries(G.players).filter(([, p]) => !p.kicked);
const teamOf = uid => G.settings.teams ? TEAM_NAMES[G.players[uid].team] : null;

function assignTeam(uid) {
  const counts = Array.from({ length: G.settings.teams }, () => 0);
  active().forEach(([id, p]) => { if (id !== uid && p.team != null) counts[p.team]++; });
  const min = Math.min(...counts);
  G.players[uid].team = pick(counts.map((c, i) => c === min ? i : -1).filter(i => i >= 0));
  G.net.setFeedback(uid, { team: TEAM_NAMES[G.players[uid].team] }).catch(() => {});
}
function shuffleTeams() {
  const ids = shuffle(active().map(([id]) => id));
  ids.forEach((id, i) => { G.players[id].team = i % G.settings.teams; G.net.setFeedback(id, { team: TEAM_NAMES[G.players[id].team] }).catch(() => {}); });
  render();
}

function publishState() {
  const q = G.qi >= 0 ? G.qs[G.qi] : null;
  const s = { phase: G.phase, count: active().length, total: G.qs.length, theme: G.settings.theme || "", decor: G.settings.decor !== false };
  if (q && (G.phase === "question" || G.phase === "reveal")) {
    Object.assign(s, { qKey: "q" + G.qi, num: G.qi + 1, format: q.format, deadline: G.deadline, duration: G.duration, paused: !!G.paused, answered: G.cur ? Object.keys(G.cur.answers).length : 0 });
    if (q.format === "choice") s.nOpts = q._options.length;
    if (q.format === "order") { s.nWords = q._words.length; s.words = q._words; }
  }
  if (G.phase === "final") s.showResults = G.finalStage >= summaryStage();
  G.net.setState(s).catch(e => console.warn(e));
  persist();
}

// ============================================================ question flow
function startIntro() {
  if (G.phase !== "lobby") return;
  G.phase = "intro"; publishState(); stopMusic(0.3); render();
  const box = app.querySelector(".intro"), beat = app.querySelector(".intro-beat");
  sfx.whoosh(); setTimeout(() => sfx.sparkle(), 450);
  const steps = [["3", 2300], ["2", 3200], ["1", 4100]];
  steps.forEach(([n, t]) => setTimeout(() => { if (G.phase !== "intro") return; box.classList.add("counting"); beat.textContent = n; beat.className = "intro-beat go-anim"; void beat.offsetWidth; beat.className = "intro-beat num-anim"; sfx.tick(n === "1"); }, t));
  setTimeout(() => { if (G.phase !== "intro") return; beat.textContent = "Go!"; beat.className = "intro-beat"; void beat.offsetWidth; beat.className = "intro-beat go-anim"; sfx.start(); confetti(); }, 5000);
  setTimeout(() => { if (G && G.phase === "intro") startQuestion(0); }, 5900);
}

function introView() {
  const n = active().length;
  return el("div", { class: "intro" },
    el("div", { class: "intro-logo" }, "⚡", el("b", null, "Rapidiom")),
    el("div", { class: "intro-title" }, G.title),
    el("div", { class: "intro-meta" }, `${n} player${n === 1 ? "" : "s"} · ${G.qs.length} questions`),
    el("div", { class: "intro-beat" }, "Get ready!"));
}

function startQuestion(i) {
  if (G.unsubA) G.unsubA(); if (G.unsubR) G.unsubR();
  G.qi = i; G.phase = "question"; G.paused = false;
  const q = G.qs[i];
  G.duration = timeFor(q, G.game.settings);
  const now = G.net.now();
  G.deadline = now + G.duration * 1000 + 800; // small grace so phones settle
  G.cur = { qKey: "q" + i, idx: i, startedAt: now + 800, pausedMs: 0, answers: {}, accepted: [], usedPu: {}, dealt: 0, voided: false, puAtStart: Object.assign({}, G.inventory) };
  const qKey = G.cur.qKey;
  G.unsubA = G.net.onAnswers(qKey, obj => {
    if (!G.cur || G.cur.qKey !== qKey) return;
    for (const [uid, a] of Object.entries(obj)) {
      if (!G.players[uid] || G.players[uid].kicked) continue;
      if (!G.cur.answers[uid]) { G.cur.answers[uid] = a; G.net.setFeedback(uid, { answered: qKey }).catch(() => {}); if (G.phase === "question") sfx.blip(); }
    }
    if (G.phase === "question") {
      publishState(); renderLive();
      const n = active().length;
      if (n && Object.keys(G.cur.answers).filter(u => G.players[u] && !G.players[u].kicked).length >= n) setTimeout(() => { if (G.phase === "question" && G.cur.qKey === qKey) closeQuestion(); }, 700);
    }
  });
  G.unsubR = G.net.onReqs(qKey, obj => {
    for (const [uid, what] of Object.entries(obj)) {
      if (what !== "hint" || G.inventory[uid] !== "hint" || G.cur.usedPu[uid]) continue;
      G.cur.usedPu[uid] = "hint"; delete G.inventory[uid];
      G.net.setFeedback(uid, { pu: null, hint: Object.assign({ qKey }, makeHint(q)) }).catch(() => {});
    }
  });
  G.lastTick = null; setIntensity(0); duckMusic(false);
  sfx.start(); playMusic("question");
  publishState(); render();
}

function makeHint(q) {
  if (q.format === "choice") {
    const wrong = shuffle([1, 2, 3, 4].slice(0, q._options.length).filter(n => n !== q._answer));
    return { remove: wrong.slice(0, Math.max(0, q._options.length - 2)) };
  }
  if (q.format === "letters") { const a = q.answers[0]; return { first: a[0].toUpperCase(), len: a.replace(/\s/g, "").length }; }
  return { firstWord: q.sentence[0] };
}
function sendHints() {
  const res = G.cur; if (!res || res.hintsSent) return;
  res.hintsSent = true;
  const q = G.qs[res.idx];
  for (const [uid, type] of Object.entries(res.puAtStart)) {
    if (type !== "hint" || G.inventory[uid] !== "hint" || res.answers[uid]) continue;
    res.usedPu[uid] = "hint"; delete G.inventory[uid];
    G.net.setFeedback(uid, { pu: null, hint: Object.assign({ qKey: res.qKey }, makeHint(q)) }).catch(() => {});
  }
}

function togglePause() {
  if (G.phase !== "question") return;
  const now = G.net.now();
  if (!G.paused) { G.paused = true; G.remaining = Math.max(0, G.deadline - now); G.pauseStart = now; }
  else { G.paused = false; G.deadline = now + G.remaining; G.cur.pausedMs += now - G.pauseStart; }
  sfx.pause(); duckMusic(G.paused);
  publishState(); render();
}
function addTime() { if (G.phase !== "question") return; if (G.paused) G.remaining += 10000; else G.deadline += 10000; G.duration += 10; publishState(); render(); }
function skipQuestion() {
  if (G.phase !== "question") return;
  G.cur.voided = true; G.results.push(G.cur); G.cur = null;
  sfx.whoosh();
  if (G.qi + 1 < G.qs.length) startQuestion(G.qi + 1); else goFinal();
}

function closeQuestion() {
  if (!G || !G.cur || G.phase !== "question") return;
  G.phase = "reveal"; G.paused = false;
  const res = G.cur;
  const timedOut = Object.keys(res.answers).filter(u => G.players[u] && !G.players[u].kicked).length < active().length;
  stopMusic(0.25); duckMusic(false);
  if (timedOut) { sfx.buzzer(); setTimeout(() => sfx.reveal(), 500); } else sfx.reveal();
  // power-ups used on this question (only if they held it when the question began)
  // Power-ups apply automatically: double on a correct answer, safety net on a wrong one.
  const q0 = G.qs[res.idx];
  for (const [uid, type] of Object.entries(res.puAtStart)) {
    if (G.inventory[uid] !== type || res.usedPu[uid] || type === "hint") continue;
    const a = res.answers[uid]; if (!a) continue;
    const ok = isCorrect(q0, a.v, res.accepted) || (q0.format === "letters" && res.accepted.includes(normalise(a.v)));
    if ((type === "double" && ok) || (type === "safety" && !ok)) { res.usedPu[uid] = type; delete G.inventory[uid]; G.net.setFeedback(uid, { pu: null }).catch(() => {}); }
  }
  if (!G.results.includes(res)) G.results.push(res);
  recompute();
  sendRoundFeedback(res);
  // half-way snapshot for the "comeback" award
  if (!G.halfRanks && G.qi + 1 >= Math.ceil(G.qs.length / 2)) G.halfRanks = rankMap();
  if (G.settings.powerups && (G.qi + 1) % 3 === 0 && G.qi < G.qs.length - 1) dealPowerups(res);
  if (res.dealt) setTimeout(() => sfx.sparkle(), 1100);
  setTimeout(() => { if (G && G.phase === "reveal") { duckMusic(true); playMusic("lobby"); } }, 2200);
  publishState(); render();
}

function scoreAnswer(q, res, uid) {
  const a = res.answers[uid];
  if (!a) return { answered: false, correct: false, points: 0 };
  const correct = isCorrect(q, a.v, res.accepted) || (q.format === "letters" && res.accepted.includes(normalise(a.v)));
  const pu = res.usedPu[uid];
  const ms = Math.max(0, (a.t || 0) - res.startedAt - res.pausedMs);
  let points = 0;
  if (correct) {
    const frac = Math.max(0, 1 - ms / (timeFor(q, G.game.settings) * 1000));
    points = BASE + (G.settings.speed ? Math.round(SPEED_MAX * frac) : 0);
    if (pu === "double") points *= 2;
  } else if (pu === "safety") points = SAFETY;
  return { answered: true, correct, points, ms };
}

function recompute() {
  for (const p of Object.values(G.players)) Object.assign(p, { score: 0, correct: 0, streak: 0, best: 0, times: [], letters: 0, answered: 0 });
  for (const res of G.results) {
    if (res.voided) continue;
    const q = G.qs[res.idx];
    res.scored = {};
    for (const [uid, p] of Object.entries(G.players)) {
      const r = scoreAnswer(q, res, uid);
      res.scored[uid] = r;
      p.score += r.points;
      if (r.answered) p.answered++;
      if (r.correct) { p.correct++; p.streak++; p.best = Math.max(p.best, p.streak); p.times.push(r.ms); if (q.format === "letters") p.letters++; }
      else p.streak = 0;
    }
  }
}

function sendRoundFeedback(res) {
  for (const [uid] of active()) {
    const r = res.scored[uid] || { answered: false, correct: false, points: 0 };
    G.net.setFeedback(uid, { last: { qKey: res.qKey, correct: r.correct, answered: r.answered, points: r.points } }).catch(() => {});
  }
}

function rankMap() {
  const ranked = active().sort((a, b) => b[1].score - a[1].score);
  const m = {}; ranked.forEach(([uid], i) => m[uid] = i + 1); return m;
}

function dealPowerups(res) {
  const ranked = active().sort((a, b) => a[1].score - b[1].score); // lowest first
  const free = ranked.filter(([uid]) => !G.inventory[uid]);
  if (!free.length) return;
  const k = Math.max(1, Math.round(ranked.length * 0.2));
  const bottom = free.slice(0, Math.ceil(free.length / 2));
  const chosen = new Set();
  for (let i = 0; i < k && chosen.size < free.length; i++) {
    const pool = (Math.random() < 0.7 ? bottom : free).filter(([u]) => !chosen.has(u));
    const pickFrom = pool.length ? pool : free.filter(([u]) => !chosen.has(u));
    if (!pickFrom.length) break;
    chosen.add(pick(pickFrom)[0]);
  }
  for (const uid of chosen) {
    const type = pick(Object.keys(POWERUPS));
    G.inventory[uid] = type;
    G.net.setFeedback(uid, { pu: type, gotPu: res.qKey }).catch(() => {});
  }
  res.dealt = chosen.size;
}

function next() {
  if (G.phase === "reveal") { if (G.qi + 1 < G.qs.length) startQuestion(G.qi + 1); else goFinal(); }
}

// ------------------------------------------------------------ override
function toggleAccept(norm, original) {
  const res = G.results[G.results.length - 1];
  const q = G.qs[res.idx];
  const i = res.accepted.indexOf(norm);
  if (i >= 0) res.accepted.splice(i, 1); else res.accepted.push(norm);
  recompute(); sendRoundFeedback(res);
  // remember the variant for next time (live games only; test runs don't change the saved game)
  if (!G.live) { persist(); render(); return; }
  if (i < 0) {
    const src = G.game.questions[res.idx];
    if (!src.answers.some(a => normalise(a) === norm)) { src.answers.push(original.toLowerCase()); q.answers = src.answers.slice(); }
  } else {
    const src = G.game.questions[res.idx];
    src.answers = src.answers.filter((a, j) => j === 0 || normalise(a) !== norm); q.answers = src.answers.slice();
  }
  saveGame(structuredClone(G.game));
  persist(); render();
}

// ============================================================ final
function goFinal() {
  if (G.unsubA) G.unsubA(); if (G.unsubR) G.unsubR();
  G.phase = "final"; G.finalStage = 0; G.cur = null; G.revealing = false;
  recompute();
  G.awards = computeAwards();
  stopMusic(0.8); sfx.whoosh();
  publishState(); render();
}
const summaryStage = () => 4 + (G.awards ? G.awards.length : 0);

function podiumData() {
  if (G.settings.teams) return teamStandings().slice(0, 3).map(t => ({ label: t.name, sub: `${fmt(t.score)} average`, color: t.color, team: true }));
  return active().sort((a, b) => b[1].score - a[1].score).slice(0, 3).map(([, p]) => ({ label: `${p.emoji} ${p.name}`, sub: `${fmt(p.score)} points` }));
}

function teamStandings() {
  return TEAM_NAMES.slice(0, G.settings.teams).map((t, i) => {
    const members = active().filter(([, p]) => p.team === i);
    const avg = members.length ? members.reduce((s, [, p]) => s + p.score, 0) / members.length : 0;
    return { i, ...t, members, score: avg };
  }).filter(t => t.members.length).sort((a, b) => b.score - a.score);
}

function computeAwards() {
  // Awards are spread out: each goes to the best-qualifying player who hasn't
  // already been recognised (podium or an earlier award), if there is one.
  const ps = active();
  const ranks = rankMap();
  const taken = new Set(G.settings.teams ? [] : ps.filter(([u]) => ranks[u] <= 3).map(([u]) => u));
  const out = [];
  // cands: [{uid, v}] where higher v is better; only qualifying players included
  const award = (icon, title, cands, detail) => {
    if (!cands.length) return;
    cands.sort((a, b) => b.v - a.v);
    const free = cands.filter(c => !taken.has(c.uid));
    const pool = free.length ? free : cands;
    const top = pool[0].v;
    const winners = pool.filter(c => c.v === top).slice(0, 2);
    winners.forEach(c => taken.add(c.uid));
    out.push({ icon, title, uids: winners.map(c => c.uid), detail: detail(top) });
  };
  const list = fn => ps.map(([u, p]) => ({ uid: u, v: fn(p, u) })).filter(c => c.v != null);

  if (G.settings.teams) award("🏅", "Top scorer", list(p => p.score > 0 ? p.score : null), v => fmt(v) + " points");
  // toughest question someone cracked
  let hard = null;
  for (const res of G.results) {
    if (res.voided || !res.scored) continue;
    const vals = ps.map(([u]) => res.scored[u]).filter(Boolean);
    const right = ps.filter(([u]) => res.scored[u] && res.scored[u].correct).map(([u]) => u);
    const pct = vals.length ? right.length / vals.length : 1;
    if (right.length && pct < 0.5 && (!hard || pct < hard.pct)) hard = { pct, right, num: res.idx + 1 };
  }
  if (hard) award("🧗", "Cracked the toughest question", hard.right.map(u => ({ uid: u, v: 1 })), () => `Q${hard.num}: only ${Math.round(hard.pct * 100)}% got it`);
  if (G.halfRanks) {
    const now = ranks;
    award("📈", "Comeback of the game", list((p, u) => { const h = G.halfRanks[u]; const g = h ? h - now[u] : 0; return g >= 2 ? g : null; }), v => `up ${v} places in the second half`);
  }
  award("🔥", "Longest streak", list(p => p.best >= 3 ? p.best : null), v => `${v} in a row`);
  if (G.game.mode !== "grammar" && G.qs.some(q => q.format === "letters"))
    award("🔤", "Super speller", list(p => p.letters >= 2 ? p.letters : null), v => `${v} spelling answers right`);
  award("⚡", "Fastest fingers", list(p => p.times.length >= 3 ? -Math.round(p.times.reduce((s, t) => s + t, 0) / p.times.length) : null), v => `${(-v / 1000).toFixed(1)} s average when correct`);
  award("🎯", "Most accurate", list(p => p.answered >= 3 ? Math.round(p.correct / p.answered * 100) : null), v => `${v}% of answers correct`);
  return out;
}

function sendFinalFeedback() {
  const ranks = rankMap();
  const teams = G.settings.teams ? teamStandings() : [];
  const answeredQs = G.results.filter(r => !r.voided).length;
  for (const [uid, p] of active()) {
    const team = teams.find(t => t.i === p.team);
    G.net.setFeedback(uid, { final: {
      rank: ranks[uid], of: active().length, score: p.score, correct: p.correct, total: answeredQs,
      team: team ? team.name : null, teamRank: team ? teams.indexOf(team) + 1 : null,
      awards: G.awards.filter(a => a.uids.includes(uid)).map(a => `${a.icon} ${a.title}`),
    } }).catch(() => {});
  }
}

// Stages: 0 intro · 1 3rd place · 2 2nd place · 3 winner · 4… one award each · summary.
function advanceFinal() {
  if (!G || G.revealing) return;
  const next = G.finalStage + 1;
  if (next <= 3) {
    const idx = 3 - next;                      // podium index: 2 = 3rd place, 0 = winner
    const pod = podiumData();
    if (!pod[idx]) { G.finalStage = next; return advanceFinal(); }
    G.revealing = next; render();
    const dur = next === 3 ? 3.4 : 2.3;
    sfx.drumroll(dur);
    setTimeout(() => {
      if (!G || G.phase !== "final") return;
      G.revealing = false; G.finalStage = next; render();
      sfx.cymbal();
      if (next === 3) {
        sfx.fanfare(true); sfx.applause(5);
        confetti({ x: 0.5, y: 0.45, power: 240 });
        setTimeout(() => confetti({ x: 0.12, y: 0.85, power: 120 }), 250);
        setTimeout(() => confetti({ x: 0.88, y: 0.85, power: 120 }), 450);
        confettiRain(5);
        setTimeout(() => { if (G && G.phase === "final") playMusic("victory"); }, 3800);
      } else { sfx.fanfare(false); confetti({ x: [0.5, 0.28, 0.72][idx], y: 0.55, power: 90 }); }
    }, dur * 1000);
    return;
  }
  G.finalStage = next;
  if (next < summaryStage()) { sfx.award(); confetti({ x: 0.5, y: 0.35, power: 70, spread: 0.7 }); }
  else { sendFinalFeedback(); saveResults(); sfx.fanfare(false); confettiRain(2.5); playMusic("victory"); }
  publishState(); render();
}

// ============================================================ breakdown
function buildBreakdown() {
  const ps = Object.entries(G.players).filter(([, p]) => !p.kicked);
  const ranks = rankMap();
  const questions = G.results.map(res => {
    const q = G.qs[res.idx];
    if (res.voided) return { num: res.idx + 1, type: qtypeLabel(q), prompt: q.prompt, voided: true };
    const wrong = {};
    ps.forEach(([u]) => { const a = res.answers[u]; const s = res.scored[u]; if (a && s && !s.correct) { const d = displayValue(q, a.v); wrong[d] = (wrong[d] || 0) + 1; } });
    const common = Object.entries(wrong).sort((a, b) => b[1] - a[1])[0];
    const right = ps.filter(([u]) => res.scored[u] && res.scored[u].correct).length;
    return { num: res.idx + 1, type: qtypeLabel(q), prompt: q.prompt, answer: answerText(q), right, of: ps.length, pct: ps.length ? Math.round(right / ps.length * 100) : 0, commonWrong: common ? `${common[0]} (${common[1]})` : "" };
  });
  const students = ps.map(([u, p]) => {
    const missed = G.results.filter(r => !r.voided && r.scored && !(r.scored[u] && r.scored[u].correct)).map(r => r.idx + 1);
    const left = Object.entries(G.flags || {}).filter(([, v]) => v && v[u]).map(([k]) => Number(k.slice(1)) + 1);
    return { name: p.name, emoji: p.emoji, team: p.team != null && G.settings.teams ? TEAM_NAMES[p.team].name : "", rank: ranks[u], score: p.score, correct: p.correct, answered: p.answered, missed, left };
  }).sort((a, b) => a.rank - b.rank);
  return { title: G.title, at: Date.now(), questions, students, total: G.results.filter(r => !r.voided).length };
}
function saveResults() {
  if (!G.live) return;
  const list = storageGet("lq.results", []); list.unshift(buildBreakdown()); storageSet("lq.results", list.slice(0, 30));
}

function toCSV(b) {
  const esc = v => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
  const rows = [["Rank", "Student", "Team", "Score", "Correct", "Out of", "Missed questions", "Left the page during"]];
  b.students.forEach(s => rows.push([s.rank, s.name, s.team, s.score, s.correct, b.total, s.missed.join(" "), s.left.join(" ")]));
  rows.push([]); rows.push(["Question", "Type", "Prompt", "Answer", "% correct", "Most common wrong answer"]);
  b.questions.forEach(q => rows.push(q.voided ? [q.num, q.type, q.prompt, "(skipped)"] : [q.num, q.type, q.prompt, q.answer, q.pct, q.commonWrong]));
  return rows.map(r => r.map(esc).join(",")).join("\n");
}

function renderBreakdown(b) {
  stopTick(); stopMusic();
  app.className = "host breakdown"; app.textContent = "";
  const csv = toCSV(b);
  app.append(
    el("header", { class: "topbar" }, el("h1", null, "📊 " + b.title), el("div", { class: "row" },
      el("button", { class: "btn-ghost sm", text: "Copy as spreadsheet", onclick: async () => { try { await navigator.clipboard.writeText(csv.replace(/","/g, '"\t"')); toast("Copied: paste into a spreadsheet"); } catch { toast("Copy isn't allowed here"); } } }),
      el("button", { class: "btn-ghost sm", text: "Download CSV", onclick: () => { const a = el("a", { href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })), download: (b.title || "results").replace(/[^\w-]+/g, "_") + ".csv" }); document.body.append(a); a.click(); a.remove(); } }),
      el("button", { class: "btn-primary sm", text: G && G.phase === "final" ? "← Back to results" : "← Back", onclick: () => G && G.phase === "final" ? render() : renderSetup() }))),
    el("main", { class: "bd big-bd" }, ...breakdownBody(b)));
}
function breakdownBody(b) {
  const qs = b.questions.filter(q => !q.voided);
  const right = qs.reduce((a, q) => a + q.right, 0), of = qs.reduce((a, q) => a + q.of, 0);
  const pct = of ? Math.round(right / of * 100) : 0;
  const hard = qs.filter(q => q.pct < 50).sort((x, y) => x.pct - y.pct);
  return [
    el("section", { class: "panel overall" },
      el("div", { class: "ov-pct pct " + (pct < 50 ? "low" : pct < 75 ? "mid" : "hi") }, pct + "%"),
      el("div", null, el("div", { class: "ov-label" }, "of answers were correct"),
        el("div", { class: "ov-counts" }, el("span", { class: "ok" }, `✅ ${right} correct`), el("span", { class: "bad" }, `❌ ${of - right} incorrect`)),
        el("div", { class: "muted" }, `${qs.length} question${qs.length === 1 ? "" : "s"} · unanswered counts as incorrect`))),
    el("section", { class: "panel" }, el("h2", null, "Difficult questions (fewer than half got them right)"),
      hard.length ? el("div", { class: "hardlist" }, ...hard.map(q => el("div", { class: "hardq" },
        el("div", { class: "hq-top" }, el("span", { class: "hq-num" }, "Q" + q.num), el("span", { class: "pct low" }, `${q.pct}% · ${q.right}/${q.of}`)),
        el("div", { class: "hq-prompt" }, q.prompt),
        el("div", { class: "hq-ans" }, "Answer: ", el("b", null, q.answer)),
        q.commonWrong ? el("div", { class: "hq-wrong" }, "Most common wrong answer: ", el("b", null, q.commonWrong)) : null)))
      : el("p", { class: "hq-none" }, "🎉 No difficult questions: at least half the class got every question right.")),
  ];
}
function table(head, rows) {
  return el("div", { class: "tablewrap" }, el("table", null, el("thead", null, el("tr", null, ...head.map(h => el("th", null, h)))),
    el("tbody", null, ...rows.map(r => el("tr", null, ...r.map(c => el("td", null, c)))))));
}

// ============================================================ rendering
function joinUrl() {
  if (!G || !(G.live || G.joinable)) return "(test mode: no join link)";
  return location.href.split("#")[0].replace(/host\.html.*$/, "") + "?g=" + G.code;
}

function topbar() {
  const n = active().length;
  return el("header", { class: "topbar" },
    el("h1", { class: "brand" }, "⚡", el("span", null, G.title)),
    el("div", { class: "row" },
      el("span", { class: "codepill" }, G.live || G.joinable ? "Code " : "", el("b", null, G.code)), G.joinable ? el("span", { class: "testpill" }, "🤖 Test mode") : null,
      soundControls(),
      el("span", { class: "muted" }, `👥 ${n}`),
      G.phase !== "final" ? el("button", { class: "btn-ghost sm", text: "📱 QR code", onclick: showQR }) : null,
      el("button", { class: "btn-ghost sm", text: "✕ End", onclick: () => confirmBox("End this game now?" + (G.phase !== "final" ? " The results so far will be shown." : ""), "End game", endGame) })));
}

function render() {
  if (!G) return renderSetup();
  app.className = "host play" + (G.hub && G.along ? " with-phone" : "");
  applyTheme(G.settings.theme || "", { decor: G.settings.decor !== false });
  const keepPhone = app.querySelector(".phone-wrap");
  app.textContent = "";
  const main = el("main", { class: "stage" });
  app.append(topbar(), main);
  if (G.phase === "lobby") { main.append(lobbyView()); duckMusic(false); playMusic("lobby"); }
  else if (G.phase === "intro") main.append(introView());
  else if (G.phase === "question") main.append(questionView());
  else if (G.phase === "reveal") main.append(revealView());
  else if (G.phase === "final") main.append(finalView());
  if (G.hub && G.along) {
    if (keepPhone) app.append(keepPhone);
    else {
      const ph = el("div", { class: "phone-screen" });
      app.append(el("aside", { class: "phone-wrap" }, el("div", { class: "phone-label" }, "📱 Your phone (preview)"), ph));
      mountPlayer(ph, G.hub.playerApi("you"), { code: "TEST", profileKey: "sim", hideCode: true });
    }
  }
}
function renderLive() { // cheap update of counters during a question
  const c = app.querySelector("#answered"); if (c && G.cur) c.textContent = `${Object.keys(G.cur.answers).length} / ${active().length} answered`;
}

function lobbyView() {
  const ps = active();
  const qr = el("div", { class: "qr" });
  if (G.live || G.joinable) makeQR(qr, joinUrl(), 300); else qr.append(el("div", { class: "qr-ph" }, "🤖", el("small", null, "Test mode: NPCs join by themselves")));
  const card = ([uid, p]) => el("button", { class: "pchip", style: G.settings.teams ? { background: TEAM_NAMES[p.team].color } : null, onclick: () => editPlayer(uid) }, `${p.emoji} ${p.name}`);
  let roster;
  if (G.settings.teams) {
    roster = el("div", { class: "teams" }, ...TEAM_NAMES.slice(0, G.settings.teams).map((t, i) => el("div", { class: "teamcol", style: { borderColor: t.color } },
      el("h3", { style: { background: t.color } }, t.name), ...ps.filter(([, p]) => p.team === i).map(card))));
  } else roster = el("div", { class: "pgrid" }, ...ps.map(card));
  return el("div", { class: "lobby" },
    el("div", { class: "joinbox" }, el("h2", null, "Scan to join"), qr, G.live || G.joinable ? el("p", { class: "joinurl" }, joinUrl()) : null, G.live || G.joinable ? el("p", { class: "bigcode" }, G.code) : null),
    el("div", { class: "rosterbox" },
      el("h2", null, `Players (${ps.length})`), ps.length ? roster : el("p", { class: "muted" }, "Waiting for players…"),
      el("p", { class: "muted small" }, "Tap a player to rename or remove them."),
      el("div", { class: "row gap" },
        G.settings.teams ? el("button", { class: "btn-ghost", text: "🔀 Shuffle teams", onclick: shuffleTeams }) : null,
        el("button", { class: "btn-primary big", disabled: !ps.length, text: `Start game (${G.qs.length} questions) →`, onclick: startIntro }))));
}

function promptBlock(q) {
  return el("div", { class: "qprompt" },
    el("div", { class: "qtype" }, qtypeLabel(q)),
    el("div", { class: "qtext" + (q.qtype === "emoji" ? " emoji" : "") }, q.prompt),
    q.sub ? el("div", { class: "qsub" }, q.sub) : null);
}

function questionView() {
  const q = G.qs[G.qi];
  let body;
  if (q.format === "choice") body = el("div", { class: "optgrid n" + q._options.length }, ...q._options.map((o, i) => el("div", { class: "optbox o" + (i + 1) }, el("span", { class: "num" }, i + 1), el("span", null, o))));
  else if (q.format === "letters") body = q._scrambled ? el("div", { class: "tiles" }, ...q._scrambled.split("").map(c => el("span", { class: "tile" }, c))) : el("p", { class: "tapnote" }, "⌨️ Spell your answer on your phone");
  else body = el("div", { class: "tiles words" }, ...q._words.map((w, i) => el("span", { class: "tile word" }, el("sup", null, i + 1), w)));
  const bar = el("div", { class: "tbar big" }, el("i"));
  const secs = el("div", { class: "secs" });
  const wrap = el("div", { class: "qview" },
    el("div", { class: "qnum" }, `Question ${G.qi + 1} of ${G.qs.length}`),
    promptBlock(q), body,
    el("div", { class: "qfoot" }, el("div", { class: "timerwrap" }, bar, secs), el("div", { id: "answered", class: "answered" }, `${G.cur ? Object.keys(G.cur.answers).length : 0} / ${active().length} answered`)),
    el("div", { class: "controls" },
      el("button", { class: "btn-ghost", text: G.paused ? "▶ Resume" : "⏸ Pause", onclick: togglePause }),
      el("button", { class: "btn-ghost", text: "+10 s", onclick: addTime }),
      el("button", { class: "btn-ghost", text: "⏭ Skip question", onclick: () => confirmBox("Skip this question? It won't count for anyone.", "Skip", skipQuestion) }),
      el("button", { class: "btn-primary", text: "⏹ Stop & reveal", onclick: () => closeQuestion() })),
    G.paused ? el("div", { class: "paused" }, "⏸ Paused") : null);
  wrap._bar = bar; wrap._secs = secs;
  return wrap;
}

function revealView() {
  const res = G.results[G.results.length - 1];
  const q = G.qs[res.idx];
  const ps = active();
  const right = ps.filter(([u]) => res.scored[u] && res.scored[u].correct).length;
  const answered = ps.filter(([u]) => res.answers[u]).length;
  let detail = null;
  if (q.format === "choice") {
    const counts = q._options.map((_, i) => ps.filter(([u]) => res.answers[u] && Number(res.answers[u].v) === i + 1).length);
    const max = Math.max(1, ...counts);
    detail = el("div", { class: "dist" }, ...q._options.map((o, i) => el("div", { class: "distrow" + (i + 1 === q._answer ? " right" : "") },
      el("span", { class: "num o" + (i + 1) }, i + 1), el("span", { class: "dtext" }, o),
      el("span", { class: "dbar" }, el("i", { style: { width: (counts[i] / max * 100) + "%" } })), el("b", null, counts[i]))));
  } else if (q.format === "letters") {
    const groups = {};
    ps.forEach(([u]) => { const a = res.answers[u]; if (!a) return; const n = normalise(a.v); if (isCorrect(q, a.v) ) return; (groups[n] = groups[n] || { text: String(a.v).toUpperCase(), n: 0 }).n++; });
    const entries = Object.entries(groups).sort((a, b) => b[1].n - a[1].n);
    detail = entries.length ? el("div", { class: "override" }, el("h3", null, "Answers that didn't match: tap to accept"),
      el("div", { class: "ovlist" }, ...entries.map(([n, g]) => el("button", { class: "ovchip" + (res.accepted.includes(n) ? " ok" : ""), onclick: () => toggleAccept(n, g.text) },
        (res.accepted.includes(n) ? "✓ " : "") + g.text, el("small", null, " ×" + g.n))))) : null;
  }
  return el("div", { class: "rview" },
    el("div", { class: "qnum" }, `Question ${res.idx + 1} of ${G.qs.length}`),
    promptBlock(q),
    el("div", { class: "answerbox" }, el("div", { class: "eyebrow" }, "Answer"), el("div", { class: "answer" }, answerText(q))),
    el("div", { class: "stat" }, el("b", null, `${right} of ${answered}`), " got it right", answered < ps.length ? el("span", { class: "muted" }, ` · ${ps.length - answered} didn't answer`) : null),
    q.explanation ? el("p", { class: "explain" }, "💬 " + q.explanation) : null,
    detail,
    res.dealt ? el("p", { class: "gift" }, `🎁 ${res.dealt} power-up${res.dealt === 1 ? " has" : "s have"} been handed out. Check your phones!`) : null,
    el("div", { class: "controls" }, el("button", { class: "btn-primary big", text: G.qi + 1 < G.qs.length ? "Next question →" : "See the results 🏁", onclick: next })));
}

function finalView() {
  const st = G.finalStage, sum = summaryStage(), pod = podiumData();
  const name = uid => { const p = G.players[uid]; return p ? `${p.emoji} ${p.name}` : "?"; };

  // One award at a time, big enough to read from the back of the room.
  if (st >= 4 && st < sum) {
    const a = G.awards[st - 4];
    return el("div", { class: "fview" },
      el("div", { class: "award-count" }, `Award ${st - 3} of ${G.awards.length}`),
      el("div", { class: "award-spot", key: st }, el("div", { class: "aicon" }, a.icon), el("div", { class: "atitle" }, a.title),
        el("div", { class: "anames" }, a.uids.map(name).join("  &  ")), el("div", { class: "adetail" }, a.detail)),
      el("div", { class: "controls" }, el("button", { class: "btn-primary big", text: st + 1 < sum ? "Next award →" : "See all the results 🎉", onclick: advanceFinal })));
  }

  const places = [1, 0, 2].map(i => {
    const d = pod[i], shownAt = 3 - i;          // 3rd at stage 1, 2nd at stage 2, winner at stage 3
    const shown = d && st >= shownAt, rolling = G.revealing === shownAt;
    return el("div", { class: `place p${i + 1}${shown ? " shown" : ""}${rolling ? " rolling" : ""}${shown && i === 0 ? " champ" : ""}${!d ? " none" : ""}` },
      shown ? el("div", { class: "who", style: d.color ? { background: d.color } : null }, i === 0 ? el("div", { class: "crown" }, "👑") : null, el("b", null, d.label), el("small", null, d.sub))
            : el("div", { class: "who empty" }, d ? (rolling ? "🥁" : "?") : ""),
      el("div", { class: "block" }, el("span", { class: "medal" }, ["🥇", "🥈", "🥉"][i]), el("span", { class: "placeno" }, ["1st", "2nd", "3rd"][i])));
  });

  let title, subtitle = null;
  if (st === 0 && !G.revealing) {
    const correct = active().reduce((n, [, p]) => n + p.correct, 0);
    title = "🏁 Game over!";
    const nq = G.results.filter(r => !r.voided).length, np = active().length;
    subtitle = `${np} player${np === 1 ? "" : "s"} · ${nq} question${nq === 1 ? "" : "s"} · ${fmt(correct)} correct answer${correct === 1 ? "" : "s"}`;
  } else if (st < 3) title = G.revealing ? "🥁 And in " + ["", "3rd", "2nd", "1st"][G.revealing] + " place…" : "The results are in…";
  else title = pod[0] ? `🏆 ${pod[0].label} ${pod[0].team ? "win" : "wins"}!` : "🎉 Well done, everyone!";

  const labels = ["🥁 Reveal 3rd place", "🥁 Reveal 2nd place", "🥁 Reveal the winner", G.awards.length ? "🏅 On to the awards" : "See all the results 🎉"];
  const done = st >= sum;
  return el("div", { class: "fview" + (done ? " summary" : "") },
    el("h2", { class: "ftitle" + (st >= 3 && !done ? " glow" : "") }, title),
    subtitle ? el("p", { class: "fsub" }, subtitle) : null,
    el("div", { class: "podium" + (done ? " small" : "") }, ...places),
    el("div", { class: "controls" },
      !done ? el("button", { class: "btn-primary big", disabled: !!G.revealing, text: G.revealing ? "🥁 …" : labels[Math.min(st, 3)], onclick: advanceFinal }) : null,
      done ? el("button", { class: "btn-ghost", text: "📊 Breakdown", onclick: () => renderBreakdown(buildBreakdown()) }) : null,
      done ? el("button", { class: "btn-ghost", text: "🔁 Play again", onclick: () => { const g = G.game; endGame(true); pending = g; renderSetup(); } }) : null,
      done ? el("button", { class: "btn-ghost", text: "Close game for students", onclick: () => confirmBox("Close the game? Phones will show “The game has ended”. Your breakdown stays on this computer.", "Close game", () => endGame()) }) : null),
    done && G.awards.length ? el("div", { class: "awards" }, ...G.awards.map(a => el("div", { class: "award" }, el("div", { class: "aicon" }, a.icon), el("b", null, a.title), el("div", { class: "anm" }, a.uids.map(name).join(", ")), el("small", null, a.detail)))) : null);
}

function soundControls() {
  const pr = audioPrefs();
  const mus = el("button", { class: "btn-ghost sm snd" + (pr.music ? "" : " off"), title: "Music on/off", text: pr.music ? "🎵 Music" : "🎵 Off", onclick: () => { unlock(); const v = !audioPrefs().music; setPref("music", v); mus.textContent = v ? "🎵 Music" : "🎵 Off"; mus.classList.toggle("off", !v); } });
  const fx = el("button", { class: "btn-ghost sm snd" + (pr.sfx ? "" : " off"), title: "Sound effects on/off", text: pr.sfx ? "🔊 Sounds" : "🔇 Off", onclick: () => { unlock(); const v = !audioPrefs().sfx; setPref("sfx", v); fx.textContent = v ? "🔊 Sounds" : "🔇 Off"; fx.classList.toggle("off", !v); if (v) sfx.blip(); } });
  const vol = el("input", { type: "range", min: 0, max: 1, step: 0.05, value: pr.vol, class: "vol", title: "Volume", oninput: e => { unlock(); setPref("vol", Number(e.target.value)); } });
  return el("span", { class: "row sndrow" }, mus, fx, vol);
}

// ============================================================ dialogs
function editPlayer(uid) {
  const p = G.players[uid];
  const name = el("input", { type: "text", value: p.name, maxlength: 16 });
  const teamSel = G.settings.teams ? el("select", null, ...TEAM_NAMES.slice(0, G.settings.teams).map((t, i) => el("option", { value: i, selected: i === p.team }, t.name))) : null;
  modal(el("div", null, el("h2", null, `${p.emoji} Edit player`), field("Name", name), teamSel ? field("Team", teamSel) : null,
    el("div", { class: "row gap" },
      el("button", { class: "btn-primary", text: "Save", onclick: () => {
        const n = clean(name.value, 16) || p.name; p.name = n; G.net.updatePlayer(uid, { name: n }).catch(() => {});
        if (teamSel) { p.team = Number(teamSel.value); G.net.setFeedback(uid, { team: TEAM_NAMES[p.team] }).catch(() => {}); }
        closeModal(); render();
      } }),
      el("button", { class: "btn-danger", text: "Remove from game", onclick: () => { p.kicked = true; G.net.updatePlayer(uid, { kicked: true }).catch(() => {}); closeModal(); publishState(); render(); } }),
      el("button", { class: "btn-ghost", text: "Cancel", onclick: closeModal }))));
}

function showQR() {
  const box = el("div", { class: "qr big" });
  if (G.live || G.joinable) makeQR(box, joinUrl(), 420); else box.append(el("div", { class: "qr-ph" }, "🤖", el("small", null, "Test mode")));
  modal(el("div", { class: "center" }, el("h2", null, "Scan to join"), box, G.live || G.joinable ? el("p", { class: "bigcode" }, G.code) : null, G.live || G.joinable ? el("p", { class: "joinurl" }, joinUrl()) : null,
    el("button", { class: "btn-primary", text: "Close", onclick: closeModal })), true);
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
    el("button", { class: "btn-primary", text: okText, onclick: () => { closeModal(); fn(); } }),
    el("button", { class: "btn-ghost", text: "Cancel", onclick: closeModal }))));
}
export function toast(msg) {
  const t = el("div", { class: "toast" }, msg); document.body.append(t); setTimeout(() => t.remove(), 4200);
}

function endGame(silent) {
  if (!G) return;
  if (G.phase !== "final" && G.phase !== "lobby" && !silent) {
    if (G.phase === "question") closeQuestion();
    goFinal(); return;
  }
  stopTick(); stopMusic(0.3);
  if (G.unsubA) G.unsubA(); if (G.unsubR) G.unsubR();
  G.net.destroy().catch(() => {});
  if (G.bots) G.bots.forEach(b => clearTimeout(b.timer));
  storageSet("lq.session", null);
  G = null;
  if (!silent) renderSetup();
}

// ============================================================ clock
function startTick() {
  stopTick();
  tick = setInterval(() => {
    if (!G || G.phase !== "question") return;
    const view = app.querySelector(".qview"); if (!view) return;
    const left = G.paused ? G.remaining : Math.max(0, G.deadline - G.net.now());
    view._bar.firstChild.style.width = Math.min(100, left / (G.duration * 1000) * 100) + "%";
    view._secs.textContent = Math.ceil(Math.min(left, G.duration * 1000) / 1000) + " s";
    view._bar.classList.toggle("low", left < 5000);
    const secs = Math.ceil(left / 1000);
    if (!G.paused) {
      if (secs <= 10) setIntensity(1);
      if (secs <= 5 && secs > 0 && secs !== G.lastTick) { G.lastTick = secs; sfx.tick(secs === 1); }
    }
    if (!G.paused && left <= G.duration * 500) sendHints();
    if (!G.paused && left <= 0) closeQuestion();
  }, 150);
}
function stopTick() { if (tick) clearInterval(tick); tick = null; }

document.addEventListener("keydown", e => {
  if (!G || e.target.matches("input,textarea,select") || document.querySelector(".modal-ov")) return;
  if ((e.key === " " || e.key === "ArrowRight") && G.phase === "reveal") { e.preventDefault(); next(); }
  if (e.key.toLowerCase() === "p" && G.phase === "question") togglePause();
});

init();
