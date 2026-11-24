// Last One Standing: the student phone screen. Phones only ever show numbers (1, 2, 3),
// never the question or option text, so translation apps can't help.
import { el, EMOJIS, randomEmoji, clean, storageGet, storageSet } from "../../js/common.js?v=20261124190320";
import { randomName as randomNick } from "./wl-names.js?v=20261124190320";
import { money } from "./wl-rules.js?v=20261124190320";

// Circular countdown shared by the TV and the phones.
export const RING_C = 326.73;
export function ringEl(cls = "", size) {
  const d = el("div", { class: "ring " + cls });
  if (size) d.style.setProperty("--size", size);
  d.innerHTML = '<svg viewBox="0 0 120 120" aria-hidden="true"><circle class="trk" cx="60" cy="60" r="52"/><circle class="prg" cx="60" cy="60" r="52"/></svg><b class="rnum"></b>';
  return d;
}

export function mountPlayer(root, net, opts = {}) {
  const code = opts.code;
  const pkey = "wl.profile." + (opts.profileKey || "live");
  const saved = storageGet(pkey, null);
  const prof = { name: saved?.name || randomNick(), emoji: saved?.emoji || randomEmoji() };
  let joined = false, editing = false, state = null, fb = {}, self = null, raf = null;
  const sent = new Set();      // keys this phone has already answered / banked / voted
  let pickedVote = null, buzzed = null, nextBuzzed = null;
  const buzz = p => { try { navigator.vibrate && navigator.vibrate(p); } catch {} };

  root.classList.add("wl-phone");

  const card = (...k) => el("div", { class: "ph-card" }, ...k);
  const mine = () => state && state.allowed && state.allowed[net.uid];
  const M = n => money(n, state && state.cur);

  // Background glow follows the moment, like the lights on the TV.
  function mood() {
    if (!state) return "";
    const ph = state.phase;
    if (ph === "bank" && mine() && !state.banked) return "bank";
    if (ph === "answer" && mine()) return "play";
    if (ph === "result") { const r = state.res && state.res[net.uid]; return r === undefined ? "" : r ? "good" : "bad"; }
    if (ph === "vote" || ph === "voteDone") return "vote";
    if (ph === "sdPairs" || ph === "sdResult" || (ph === "answer" && state.sdq)) {
      const me = myMatch();
      if (!me) return "";
      if (me.res && me.res.out.includes(net.uid)) return "bad";
      if (me.res) return "good";
      return "final";
    }
    if (ph === "roundEnd") return "";
    if (ph === "end") return "win";
    if (ph === "countdown") return "play";
    return "";
  }
  function render() {
    cancelAnimationFrame(raf);
    root.textContent = "";
    const m = mood(); if (m) root.dataset.mood = m; else delete root.dataset.mood;
    // A short buzz when it's this student's turn (on phones that support it).
    const turnKey = state && (state.phase === "bank" || state.phase === "answer") && mine() ? state.phase + state.turnKey : null;
    if (turnKey && turnKey !== buzzed && !sent.has((state.phase === "bank" ? "b" : "a") + state.turnKey)) { buzzed = turnKey; buzz([120, 60, 120]); }
    if (self && self.kicked) return root.append(card(el("h2", null, "You've been removed from this game."), el("p", { class: "muted" }, "Ask your teacher if this was a mistake.")));
    if (!joined || editing) return root.append(joinView());
    if (!state || state.phase === "closed") return root.append(card(el("h2", null, "The game has ended."), el("p", { class: "muted" }, "Thanks for playing!")));
    root.append(el("div", { class: "ph-head" }, el("span", null, `${prof.emoji} ${prof.name}`), state.round ? el("span", { class: "muted" }, state.sd || state.phase === "end" ? "Sudden death" : `Round ${state.round}/${state.rounds}`) : null));
    // The next player's phone flashes while the current turn is played.
    if (["bank", "answer", "result"].includes(state.phase) && !state.sdq && state.next === net.uid && !mine()) {
      if (nextBuzzed !== state.turnKey) { nextBuzzed = state.turnKey; buzz([60, 80, 60, 80, 200]); }
      return root.append(alertCard("👀", "You're next!", "Get ready: your turn is coming up.", fiftyNote()));
    }
    const v = {
      lobby: lobbyView, roundIntro: introView, countdown: introView,
      resume: () => card(el("h2", null, "Back in a moment…"), el("p", { class: "muted" }, "Look at the screen 👀")),
      bank: bankView, answer: answerView, result: resultView,
      roundEnd: () => card(el("div", { class: "badge" }, "⏱"), el("h2", { class: "disp" }, "Round over!"), el("p", { class: "muted" }, "Get ready to vote for the weakest link.")),
      vote: voteView, voteDone: voteDoneView, sdPairs: sdPairsView, sdResult: sdResultView, end: endView,
    }[state.phase];
    root.append(v ? v() : card(el("p", null, "Look at the screen 👀")));
  }

  function joinView() {
    const name = el("input", { type: "text", maxlength: 16, value: prof.name, autocomplete: "off", "aria-label": "Nickname" });
    const grid = el("div", { class: "emoji-grid" });
    EMOJIS.forEach(e => grid.append(el("button", { type: "button", class: e === prof.emoji ? "sel" : "", text: e,
      onclick: ev => { prof.emoji = e; [...grid.children].forEach(b => b.classList.toggle("sel", b === ev.currentTarget)); } })));
    const msg = el("p", { class: "muted small" });
    const go = el("button", { class: "btn wide big", text: editing ? "Save" : "Join game", onclick: async () => {
      prof.name = clean(name.value, 16) || randomNick();
      storageSet(pkey, prof);
      go.disabled = true; msg.textContent = "Joining…";
      try { await net.join(code, prof); joined = true; editing = false; render(); }
      catch (e) { go.disabled = false; msg.textContent = "Couldn't join: " + (e && e.message || "try again"); }
    } });
    return card(el("h2", null, editing ? "Change your name" : "Join Last One Standing"),
      code && !opts.hideCode ? el("p", { class: "muted small" }, "Game code ", el("b", null, code)) : null,
      el("label", { class: "lbl" }, "Nickname"),
      el("div", { class: "row" }, name, el("button", { type: "button", class: "btn ghost", title: "Random name", text: "🎲", onclick: () => { name.value = randomNick(); } })),
      el("label", { class: "lbl" }, "Pick an emoji"), grid, go, msg);
  }

  function lobbyView() {
    return card(el("div", { class: "big-emoji" }, prof.emoji), el("h2", null, prof.name),
      el("p", { class: "muted" }, "You're in! Waiting for your teacher to start…"),
      state.count ? el("p", { class: "muted small" }, `${state.count} player${state.count === 1 ? "" : "s"} in the game`) : null,
      el("button", { class: "btn ghost", text: "✏️ Change name or emoji", onclick: () => { editing = true; render(); } }));
  }

  // Countdown from the shared clock; shows "Paused" when the teacher pauses.
  function timer(cls = "", size = "120px") {
    const r = ringEl(cls, size), prg = r.querySelector(".prg"), num = r.querySelector(".rnum");
    const total = (state.duration || 1) * 1000;
    const draw = () => {
      const left = state.paused ? (state.remaining || 0) : Math.max(0, state.deadline - net.now());
      prg.style.strokeDashoffset = RING_C * (1 - Math.max(0, Math.min(1, left / total)));
      const low = left < 5000 && cls !== "gold";
      r.classList.toggle("low", low); r.classList.toggle("paused", !!state.paused);
      if (cls === "" && mine() && state.phase === "answer") root.dataset.mood = low ? "danger" : "play";
      num.textContent = state.paused ? "⏸" : String(Math.ceil(Math.min(left, total) / 1000));
      if (!state.paused && left > 0) raf = requestAnimationFrame(draw);
    };
    draw();
    return r;
  }
  const whoText = () => (state.who || []).map(w => `${w.e} ${w.n}`).join(" & ");

  function bankView() {
    if (state.banked) return card(el("div", { class: "badge" }, "🏦"), el("h2", { class: "disp" }, `${M(state.banked)} banked!`), (state.who || []).length ? el("p", { class: "muted" }, mine() || sent.has("b" + state.turnKey) ? "Your question is coming… 👀" : `Banked by ${whoText()}`) : null);
    if (!mine()) return card(el("p", { class: "muted" }, "Now playing"), el("h2", { class: "disp" }, whoText()), el("p", { class: "muted" }, "Deciding whether to bank…"), timer("gold", "90px"));
    const k = "b" + state.turnKey;
    if (sent.has(k)) return card(el("div", { class: "badge" }, "👀"), el("h2", { class: "disp" }, "Look at the screen!"));
    const send = yes => { if (sent.has(k) || state.paused) return; sent.add(k); render(); net.bank(state.turnKey, yes).catch(() => {}); };
    const c = card(el("h2", { class: "disp" }, "Your turn!"), el("p", { class: "muted" }, "Bank the money before your question?"), timer("gold"),
      el("button", { class: "bankbtn", disabled: state.paused, onclick: () => send(true) }, "🏦 BANK", el("small", null, M(state.chainVal))),
      el("button", { class: "btn ghost big wide", disabled: state.paused, text: "Play on ▶", onclick: () => send(false) }),
      fiftyNote());
    c.classList.add("yourturn");
    return c;
  }

  // "You're first!" before the round, flashing on that player's phone.
  function alertCard(icon, title, sub, extra) {
    const c = card(el("div", { class: "badge" }, icon), el("h2", { class: "disp alert" }, title), el("p", null, sub), extra || null);
    c.classList.add("alertcard");
    return c;
  }
  function introView() {
    if (state.first === net.uid) {
      if (nextBuzzed !== "first" + state.round) { nextBuzzed = "first" + state.round; buzz([60, 80, 60, 80, 200]); }
      return alertCard("🎯", "You're first!", `Round ${state.round} starts with you. Look at the screen 👀`, fiftyNote());
    }
    return card(el("div", { class: "eyebrow" }, state.phase === "countdown" ? "Starting now" : "Get ready"), el("h2", { class: "disp" }, `Round ${state.round}`),
      state.firstWho ? el("p", null, `First up: ${state.firstWho.e} ${state.firstWho.n}`) : null,
      el("p", { class: "muted" }, "Look at the screen 👀"), fiftyNote());
  }

  // ---------- sudden death ----------
  function myMatch() { return state && state.sd ? (state.sd.matches || []).find(m => m.names && m.names[net.uid]) || null : null; }
  const isOut = () => state.sd && (state.sd.out || []).includes(net.uid);
  const opponents = m => (m.u || []).filter(u => u !== net.uid).map(u => `${m.names[u].e} ${m.names[u].n}`).join(" and ");
  function sdPairsView() {
    const m = myMatch();
    if (isOut() || !m) return card(el("div", { class: "badge" }, "🍿"), el("h2", { class: "disp" }, isOut() ? "You're out" : "Sudden death"), el("p", { class: "muted" }, "Watch who is the last one standing! 👀"));
    if (m.done || !(m.u || []).includes(net.uid)) return card(el("div", { class: "badge" }, "✅"), el("h2", { class: "disp" }, "You're through!"), el("p", { class: "muted" }, "Wait for the others to finish their match."));
    const trio = (m.u || []).length === 3;
    const c = card(el("div", { class: "eyebrow" }, "⚡ Sudden death"), el("p", { class: "muted" }, "You're up against"), el("h2", { class: "disp" }, opponents(m)),
      el("p", null, trio ? "Only one of you three goes out." : "Right beats wrong. If you're both right, the faster one goes through."),
      el("p", { class: "muted" }, "Get ready to answer 👀"));
    c.classList.add("yourturn");
    return c;
  }
  function sdResultView() {
    const m = myMatch();
    if (!m || !(m.u || []).includes(net.uid)) return card(el("div", { class: "badge" }, "🍿"), el("h2", { class: "disp" }, "Look at the screen 👀"));
    if (!m.res) return card(el("div", { class: "badge" }, "🥁"), el("h2", { class: "disp" }, "Your match…"), el("p", { class: "muted" }, "Look at the screen 👀"));
    if (m.res.out.includes(net.uid)) return card(el("div", { class: "badge" }, "😢"), el("h2", { class: "disp" }, "You're out"), el("p", { class: "muted" }, "Great effort! Stay and watch who wins."));
    if (m.res.replay && m.res.replay.includes(net.uid)) return card(el("div", { class: "badge" }, "🔁"), el("h2", { class: "disp" }, "Go again!"), el("p", { class: "muted" }, "Your match isn't settled yet. Get ready for another question."));
    return card(el("div", { class: "badge" }, "✅"), el("h2", { class: "disp" }, "You're through!"), el("p", { class: "muted" }, state.sd.left > 1 ? "Still standing! Get ready for the next round." : "Look at the screen 👀"));
  }

  function answerView() {
    if (state.sdq && !mine()) return card(el("div", { class: "badge" }, isOut() ? "🍿" : "✅"), el("h2", { class: "disp" }, isOut() ? "You're out" : "Wait a moment"), el("p", { class: "muted" }, isOut() ? "Watch the screen 👀" : "Others are settling their match."), timer("", "90px"));
    if (!mine()) return card(el("p", { class: "muted" }, "Now answering"), el("h2", { class: "disp" }, whoText()), el("p", { class: "muted" }, "Look at the screen 👀"), timer("", "90px"));
    const k = "a" + state.turnKey;
    if (sent.has(k)) return card(el("div", { class: "badge" }, "🔒"), el("h2", { class: "disp" }, "Answer locked in"), el("p", { class: "muted" }, "Look at the screen 👀"));
    const fifty = fb.fifty && fb.fifty.key === state.turnKey ? fb.fifty.remove : null;
    const send = n => { if (sent.has(k) || state.paused) return; sent.add(k); render(); net.answer(state.turnKey, n).catch(() => { root.append(card(el("p", { class: "muted small" }, "That answer arrived too late."))); }); };
    const m = state.sdq ? myMatch() : null;
    const c = card(el("h2", { class: "disp" }, state.sdq ? "⚡ Be quick!" : "Your question!"), m ? el("p", null, "vs " + opponents(m)) : null, el("p", { class: "muted" }, "Read it on the screen, then tap the number."), timer("", "96px"),
      fifty ? el("p", { class: "fifty" }, "🎯 50:50: one wrong answer is gone") : null,
      el("div", { class: "nums" }, ...[1, 2, 3].map(n => el("button", { class: "num o" + n, disabled: state.paused || n === fifty, text: String(n), onclick: () => send(n) }))));
    c.classList.add("yourturn");
    return c;
  }

  function resultView() {
    const r = state.res && state.res[net.uid];
    if (r === undefined) return card(el("p", { class: "muted" }, whoText()), el("h2", null, "Look at the screen 👀"));
    return card(el("div", { class: "badge" }, r ? "🎉" : "😅"), el("h2", { class: "disp" }, r ? "Correct!" : "Not this time"), el("p", { class: "muted" }, r ? "Well done!" : "Keep going, you'll get the next one."));
  }

  function voteView() {
    const k = "v" + state.voteKey;
    const cands = Object.entries(state.cands || {}).filter(([u]) => u !== net.uid);
    if (sent.has(k)) return card(el("div", { class: "badge" }, "🗳"), el("h2", { class: "disp" }, "Vote sent"), el("p", { class: "muted" }, "Waiting for everyone else…"), timer("vote", "90px"));
    const confirm = el("button", { class: "btn big wide", disabled: !pickedVote || state.paused, text: pickedVote ? "Vote" : "Choose someone", onclick: () => {
      if (!pickedVote || sent.has(k)) return; sent.add(k); const t = pickedVote; pickedVote = null; render(); net.vote(state.voteKey, t).catch(() => {});
    } });
    return card(el("h2", { class: "disp" }, "Who was the weakest link?"), el("p", { class: "muted small" }, "Think about wrong answers, slow answers and money lost. Your vote is secret."), timer("vote", "90px"),
      el("div", { class: "cands" }, ...cands.map(([u, c]) => el("button", { class: "cand" + (pickedVote === u ? " sel" : ""), onclick: () => { pickedVote = u; render(); } }, `${c.e} ${c.n}`))),
      confirm);
  }

  function voteDoneView() {
    const v = fb.vote && fb.vote.key === state.voteKey ? fb.vote : null;
    const w = fb.weakest && fb.weakest.key === state.voteKey ? fb.weakest : null;
    const parts = [];
    if (!v) parts.push(el("div", { class: "badge" }, "🥁"), el("h2", { class: "disp" }, "Checking the votes…"));
    else {
      if (!v.voted) parts.push(el("div", { class: "badge" }, "⌛"), el("h2", { class: "disp" }, "You didn't vote this time"));
      else parts.push(el("div", { class: "badge" }, v.correct ? "🔍" : "🤔"), el("h2", { class: "disp" }, v.correct ? "Great detective work!" : "Not this time"), el("p", { class: "muted" }, v.correct ? "You voted for the class's weakest link." : "Most of the class voted for someone else."));
      if (v.correct) parts.push(el("span", { class: "ptchip" }, "✔ Correct vote"));
      parts.push(el("p", { class: "pts" }, `Detective points: ${v.total}`));
    }
    if (w) parts.push(el("div", { class: "private" }, el("b", null, "Just for you 🤫"), el("p", null, "This round, the class voted you the weakest link."),
      el("p", null, w.fifty ? "Don't worry! Next round you get a 🎯 50:50 on your first question: one wrong number disappears." : "Don't worry, everyone has rounds like that!")));
    return card(...parts);
  }

  function endView() {
    const f = fb.final;
    if (!f) return card(el("div", { class: "badge" }, "🏁"), el("h2", { class: "disp" }, "Game over!"), el("p", { class: "muted" }, "Look at the screen 👀"));
    const m = n => money(n, f.cur);
    const ord = n => n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th");
    return card(el("div", { class: "badge" }, f.champ ? "🏆" : f.finalist ? "🥈" : "⭐"),
      el("h2", { class: "disp" }, f.champ ? "Last one standing!" : f.finalist ? "Brilliant final!" : "Thanks for playing!"),
      f.place && !f.champ ? el("p", null, `You finished ${ord(f.place)}`) : null,
      el("p", null, `The class banked ${m(f.pot)}`),
      el("p", { class: "muted" }, `Your banked money: ${m(f.credit)} · Detective points: ${f.detective}`),
      f.topDetective ? el("p", { class: "award-chip" }, "🔍 Top detective!") : null);
  }

  function fiftyNote() { return fb.fiftyReady ? el("p", { class: "fifty" }, "🎯 You have a 50:50 for your next question.") : null; }

  // ---------- wiring ----------
  let selfKey = null;
  net.onSelf(s => {
    self = s;
    if (s && !joined && s.name) { joined = true; prof.name = s.name; prof.emoji = s.emoji || prof.emoji; }
    else if (s && s.name) prof.name = s.name;
    const k = s ? [s.name, s.emoji, !!s.kicked, joined].join("|") : "none";
    if (k !== selfKey) { selfKey = k; render(); }
  });
  let stateKey = null, fbKey = null;
  net.onState(s => {
    if (s && state && s.voteKey !== state.voteKey) pickedVote = null;
    state = s;
    const k = s ? JSON.stringify(Object.assign({}, s, { count: s.phase === "lobby" ? s.count : undefined })) : "none";
    if (k !== stateKey) { stateKey = k; render(); }
  });
  net.onFeedback(f => { fb = f || {}; const k = JSON.stringify(fb); if (k !== fbKey) { fbKey = k; render(); } });
  render();
  return { profile: prof };
}
