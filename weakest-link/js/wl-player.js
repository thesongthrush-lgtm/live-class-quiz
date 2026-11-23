// Weakest Link: the student phone screen. Phones only ever show numbers (1, 2, 3),
// never the question or option text, so translation apps can't help.
import { el, EMOJIS, randomNick, randomEmoji, clean, storageGet, storageSet } from "../../js/common.js?v=20261123205517";
import { money } from "./wl-rules.js?v=20261123205517";

export function mountPlayer(root, net, opts = {}) {
  const code = opts.code;
  const pkey = "wl.profile." + (opts.profileKey || "live");
  const saved = storageGet(pkey, null);
  const prof = { name: saved?.name || randomNick(), emoji: saved?.emoji || randomEmoji() };
  let joined = false, editing = false, state = null, fb = {}, self = null, raf = null;
  const sent = new Set();      // keys this phone has already answered / banked / voted
  let pickedVote = null;

  root.classList.add("wl-phone");

  const card = (...k) => el("div", { class: "ph-card" }, ...k);
  const mine = () => state && state.allowed && state.allowed[net.uid];
  const M = n => money(n, state && state.cur);

  function render() {
    cancelAnimationFrame(raf);
    root.textContent = "";
    if (self && self.kicked) return root.append(card(el("h2", null, "You've been removed from this game."), el("p", { class: "muted" }, "Ask your teacher if this was a mistake.")));
    if (!joined || editing) return root.append(joinView());
    if (!state || state.phase === "closed") return root.append(card(el("h2", null, "The game has ended."), el("p", { class: "muted" }, "Thanks for playing!")));
    root.append(el("div", { class: "ph-head" }, el("span", null, `${prof.emoji} ${prof.name}`), state.round ? el("span", { class: "muted" }, state.finalists || state.phase === "end" ? "Final" : `Round ${state.round}/${state.rounds}`) : null));
    const v = {
      lobby: lobbyView, roundIntro: () => card(el("div", { class: "big-emoji" }, "🔗"), el("h2", null, `Round ${state.round}`), el("p", { class: "muted" }, "Get ready! Look at the screen 👀"), fiftyNote()),
      resume: () => card(el("h2", null, "Back in a moment…"), el("p", { class: "muted" }, "Look at the screen 👀")),
      bank: bankView, answer: answerView, result: resultView,
      roundEnd: () => card(el("div", { class: "big-emoji" }, "⏱"), el("h2", null, "Round over!"), el("p", { class: "muted" }, "Get ready to vote for the weakest link.")),
      vote: voteView, voteDone: voteDoneView, finalists: finalistsView, end: endView,
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
    return card(el("h2", null, editing ? "Change your name" : "Join Weakest Link"),
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
  function timer() {
    const bar = el("div", { class: "tbar" }, el("i")), label = el("div", { class: "tlabel" });
    const total = (state.duration || 1) * 1000;
    const draw = () => {
      const left = state.paused ? (state.remaining || 0) : Math.max(0, state.deadline - net.now());
      bar.firstChild.style.width = Math.min(100, left / total * 100) + "%";
      bar.classList.toggle("low", left < 5000);
      label.textContent = state.paused ? "⏸ Paused" : Math.ceil(Math.min(left, total) / 1000) + " s";
      if (!state.paused && left > 0) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return el("div", { class: "timer" }, bar, label);
  }
  const whoText = () => (state.who || []).map(w => `${w.e} ${w.n}`).join(" & ");

  function bankView() {
    if (state.banked) return card(el("div", { class: "big-emoji" }, "🏦"), el("h2", null, `${M(state.banked)} banked!`), mine() || sent.has("b" + state.turnKey) ? el("p", { class: "muted" }, "Your question is coming… 👀") : null);
    if (!mine()) return card(el("p", { class: "muted" }, "Now playing"), el("h2", null, whoText()), el("p", { class: "muted" }, "Deciding whether to bank…"), timer());
    const k = "b" + state.turnKey;
    if (sent.has(k)) return card(el("div", { class: "big-emoji" }, "👀"), el("h2", null, "Look at the screen!"));
    const send = yes => { if (sent.has(k) || state.paused) return; sent.add(k); render(); net.bank(state.turnKey, yes).catch(() => {}); };
    return card(el("h2", null, "Your turn!"), el("p", { class: "muted" }, "Bank the money before your question?"), timer(),
      el("button", { class: "bankbtn", disabled: state.paused, onclick: () => send(true) }, "🏦 BANK", el("small", null, M(state.chainVal))),
      el("button", { class: "btn ghost big wide", disabled: state.paused, text: "Play on ▶", onclick: () => send(false) }),
      fiftyNote());
  }

  function answerView() {
    if (!mine()) return card(el("p", { class: "muted" }, state.tb ? "Tie-break" : "Now answering"), el("h2", null, whoText()), el("p", { class: "muted" }, "Look at the screen 👀"), timer());
    const k = "a" + state.turnKey;
    if (sent.has(k)) return card(el("div", { class: "big-emoji" }, "✅"), el("h2", null, "Answer sent"), el("p", { class: "muted" }, "Look at the screen 👀"));
    const fifty = fb.fifty && fb.fifty.key === state.turnKey ? fb.fifty.remove : null;
    const send = n => { if (sent.has(k) || state.paused) return; sent.add(k); render(); net.answer(state.turnKey, n).catch(() => { root.append(card(el("p", { class: "muted small" }, "That answer arrived too late."))); }); };
    return card(el("h2", null, state.tb ? "⚡ Tie-break: be quick!" : "Your question!"), el("p", { class: "muted" }, "Read it on the screen, then tap the number."), timer(),
      fifty ? el("p", { class: "fifty" }, "🎯 50:50: one wrong answer is gone") : null,
      el("div", { class: "nums" }, ...[1, 2, 3].map(n => el("button", { class: "num o" + n, disabled: state.paused || n === fifty, text: String(n), onclick: () => send(n) }))));
  }

  function resultView() {
    const r = state.res && state.res[net.uid];
    if (r === undefined) return card(el("p", { class: "muted" }, whoText()), el("h2", null, "Look at the screen 👀"));
    return card(el("div", { class: "big-emoji" }, r ? "🎉" : "😅"), el("h2", null, r ? "Correct!" : "Not this time"), el("p", { class: "muted" }, r ? "Well done!" : "Keep going, you'll get the next one."));
  }

  function voteView() {
    const k = "v" + state.voteKey;
    const cands = Object.entries(state.cands || {}).filter(([u]) => u !== net.uid);
    if (sent.has(k)) return card(el("div", { class: "big-emoji" }, "🗳"), el("h2", null, "Vote sent"), el("p", { class: "muted" }, "Waiting for everyone else…"), timer());
    const confirm = el("button", { class: "btn big wide", disabled: !pickedVote || state.paused, text: pickedVote ? "Vote" : "Choose someone", onclick: () => {
      if (!pickedVote || sent.has(k)) return; sent.add(k); const t = pickedVote; pickedVote = null; render(); net.vote(state.voteKey, t).catch(() => {});
    } });
    return card(el("h2", null, "Who was the weakest link?"), el("p", { class: "muted small" }, "Think: most wrong answers and slowest. Your vote is secret."), timer(),
      el("div", { class: "cands" }, ...cands.map(([u, c]) => el("button", { class: "cand" + (pickedVote === u ? " sel" : ""), onclick: () => { pickedVote = u; render(); } }, `${c.e} ${c.n}`))),
      confirm);
  }

  function voteDoneView() {
    const v = fb.vote && fb.vote.key === state.voteKey ? fb.vote : null;
    const w = fb.weakest && fb.weakest.key === state.voteKey ? fb.weakest : null;
    const parts = [];
    if (!v) parts.push(el("div", { class: "big-emoji" }, "🥁"), el("h2", null, "Checking the votes…"));
    else {
      if (!v.voted) parts.push(el("div", { class: "big-emoji" }, "⌛"), el("h2", null, "You didn't vote this time"));
      else parts.push(el("div", { class: "big-emoji" }, v.correct ? "🔍" : "🤔"), el("h2", null, v.correct ? "Great detective work!" : "Not this time"), el("p", { class: "muted" }, v.correct ? "You spotted the weakest link." : "The person you chose wasn't the weakest link this round."));
      parts.push(el("p", { class: "pts" }, `Detective points: ${v.total}`));
    }
    if (w) parts.push(el("div", { class: "private" }, el("b", null, "Just for you 🤫"), el("p", null, "This round, your answers made you the weakest link."),
      el("p", null, w.fifty ? "Don't worry! Next round you get a 🎯 50:50 on your first question: one wrong number disappears." : "Don't worry, everyone has rounds like that!")));
    return card(...parts);
  }

  function finalistsView() {
    if (!state.finalists) return card(el("div", { class: "big-emoji" }, "🥁"), el("h2", null, "Who will be in the final?"), el("p", { class: "muted" }, "Look at the screen 👀"));
    return card(el("div", { class: "big-emoji" }, fb.finalist ? "⭐" : "🍿"), el("h2", null, fb.finalist ? "You're in the final!" : "Watch the final"),
      el("p", { class: "muted" }, state.finalists.map(f => `${f.e} ${f.n}`).join("  vs  ")));
  }

  function endView() {
    const f = fb.final;
    if (!f) return card(el("div", { class: "big-emoji" }, "🏁"), el("h2", null, "Game over!"), el("p", { class: "muted" }, "Look at the screen 👀"));
    const m = n => money(n, f.cur);
    return card(el("div", { class: "big-emoji" }, f.champ ? "🏆" : f.finalist ? "🥈" : "⭐"),
      el("h2", null, f.champ ? "You're the champion!" : f.finalist ? "Brilliant final!" : "Thanks for playing!"),
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
