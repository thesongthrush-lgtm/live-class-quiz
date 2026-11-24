// The student phone screen. Works with either transport (live or simulated).
import { applyTheme } from "./theme.js?v=20261124194826";
import { el, EMOJIS, randomNick, randomEmoji, clean, fmt, POWERUPS, storageGet, storageSet } from "./common.js?v=20261124194826";

const KEY_ROWS = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];
const add = (t, c) => t.length < 30 ? t + c : t;

export function mountPlayer(root, net, opts = {}) {
  const code = opts.code;
  const saved = storageGet("lq.profile." + (opts.profileKey || "live"), null);
  const prof = { name: saved?.name || randomNick(), emoji: saved?.emoji || randomEmoji() };
  let joined = false, editing = false, state = null, fb = {}, self = null;
  let curQ = null, locked = false, typed = "", seq = [], usePu = false, flagged = false, raf = null;

  root.classList.add("phone");

  // ---------- render ----------
  function render() {
    cancelAnimationFrame(raf);
    root.textContent = "";
    if (self && self.kicked) return root.append(card(el("h2", null, "You've been removed from this game."), el("p", { class: "muted" }, "Ask your teacher if this was a mistake.")));
    if (!joined || editing) return root.append(joinView());
    if (!state || state.phase === "closed") return root.append(card(el("h2", null, "The game has ended."), el("p", { class: "muted" }, "Thanks for playing!")));
    const head = el("div", { class: "ph-head" }, el("span", { class: "ph-me" }, `${prof.emoji} ${prof.name}`), fb.team ? el("span", { class: "ph-team", style: { background: fb.team.color } }, fb.team.name) : null);
    root.append(head);
    if (state.phase === "lobby") root.append(lobbyView());
    else if (state.phase === "intro") root.append(card(el("div", { class: "big-emoji intro-ph" }, "⚡"), el("h2", null, "Get ready!"), el("p", { class: "muted" }, "Look at the screen 👀")));
    else if (state.phase === "question") root.append(state.paused ? card(el("div", { class: "big-emoji" }, "⏸️"), el("h2", null, "Paused")) : questionView());
    else if (state.phase === "reveal") root.append(revealView());
    else if (state.phase === "final") root.append(finalView());
    else root.append(card(el("p", null, "Look at the screen 👀")));
    if (fb.pu && state.phase !== "final") root.append(puBadge());
  }

  const card = (...k) => el("div", { class: "ph-card" }, ...k);

  function joinView() {
    const name = el("input", { type: "text", maxlength: 16, value: prof.name, autocomplete: "off", "aria-label": "Nickname" });
    const grid = el("div", { class: "emoji-grid" });
    EMOJIS.forEach(e => grid.append(el("button", { type: "button", class: e === prof.emoji ? "sel" : "", text: e,
      onclick: ev => { prof.emoji = e; [...grid.children].forEach(b => b.classList.toggle("sel", b === ev.currentTarget)); } })));
    const msg = el("p", { class: "muted small" });
    const go = el("button", { class: "btn-primary wide", text: editing ? "Save" : "Join game", onclick: async () => {
      prof.name = clean(name.value, 16) || randomNick();
      storageSet("lq.profile." + (opts.profileKey || "live"), prof);
      go.disabled = true; msg.textContent = "Joining…";
      try { await net.join(code, prof); joined = true; editing = false; render(); }
      catch (e) { go.disabled = false; msg.textContent = "Couldn't join: " + (e && e.message || "try again"); }
    } });
    return card(
      el("h2", null, editing ? "Change your name" : "Join Rapidiom"),
      code && !opts.hideCode ? el("p", { class: "muted small" }, "Game code ", el("b", null, code)) : null,
      el("label", { class: "lbl" }, "Nickname"),
      el("div", { class: "row" }, name, el("button", { type: "button", class: "btn-ghost", title: "Random name", text: "🎲", onclick: () => { name.value = randomNick(); } })),
      el("label", { class: "lbl" }, "Pick an emoji"), grid, go, msg);
  }

  function lobbyView() {
    return card(
      el("div", { class: "big-emoji" }, prof.emoji),
      el("h2", null, prof.name),
      el("p", { class: "muted" }, state && state.simple ? "You are in! 🙂 Please wait." : "You're in! Waiting for your teacher to start…"),
      state.count ? el("p", { class: "muted small" }, `${state.count} player${state.count === 1 ? "" : "s"} in the game`) : null,
      el("button", { class: "btn-ghost", text: "✏️ Change name or emoji", onclick: () => { editing = true; render(); } }));
  }

  function timerBar() {
    const bar = el("div", { class: "tbar" }, el("i"));
    const label = el("div", { class: "tlabel" });
    const total = state.duration * 1000;
    const tick = () => {
      const left = Math.max(0, state.deadline - net.now());
      bar.firstChild.style.width = Math.min(100, (left / total) * 100) + "%";
      label.textContent = Math.ceil(Math.min(left, total) / 1000) + " s";
      if (left <= 0 && !locked) { locked = true; render(); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return el("div", null, bar, label);
  }

  function questionView() {
    if (curQ !== state.qKey) { curQ = state.qKey; locked = false; typed = ""; seq = []; usePu = false; flagged = false; }
    const head = el("div", { class: "ph-qhead" }, `Question ${state.num} of ${state.total}`);
    const answered = sentFor(state.qKey) || fb.answered === state.qKey;
    if (locked || answered) {
      return card(head, el("div", { class: "big-emoji" }, answered ? "✅" : "⌛"), el("h2", null, answered ? (state.simple ? "Done!" : "Answer locked in") : (state.simple ? "Time is up ⏰" : "Time's up")), el("p", { class: "muted" }, "Look at the screen 👀"));
    }
    const hint = fb.hint && fb.hint.qKey === state.qKey ? fb.hint : null;
    let body;
    if (state.format === "choice") {
      body = el("div", { class: "opts n" + state.nOpts });
      if (hint && hint.remove && hint.remove.length) body = el("div", null, el("p", { class: "hint" }, `💡 ${hint.remove.length} wrong answer${hint.remove.length === 1 ? "" : "s"} removed`), body);
      const grid = body.lastChild || body;
      for (let i = 1; i <= state.nOpts; i++) {
        const removed = hint && hint.remove && hint.remove.includes(i);
        grid.append(el("button", { class: "opt o" + i, disabled: removed, text: String(i), onclick: () => submit(i) }));
      }
    } else if (state.format === "letters") {
      const slots = el("div", { class: "slots" }, typed || "·");
      const draw = () => { slots.textContent = typed || "·"; };
      const kp = el("div", { class: "keypad" });
      KEY_ROWS.forEach(r => { const row = el("div", { class: "krow" }); r.split("").forEach(L => row.append(el("button", { type: "button", text: L, onclick: () => { if (typed.length < 30) { typed += L; draw(); } } }))); kp.append(row); });
      kp.append(el("div", { class: "krow" },
        el("button", { type: "button", class: "k-wide", text: "⌫", "aria-label": "Delete", onclick: () => { typed = typed.slice(0, -1); draw(); } }),
        el("button", { type: "button", class: "k-punct", text: "'", "aria-label": "Apostrophe", onclick: () => { if (typed) { typed = add(typed, "'"); draw(); } } }),
        el("button", { type: "button", class: "k-space", text: "space", onclick: () => { if (typed && !typed.endsWith(" ")) { typed += " "; draw(); } } }),
        el("button", { type: "button", class: "k-punct", text: "-", "aria-label": "Hyphen", onclick: () => { if (typed && !/[ -]$/.test(typed)) { typed = add(typed, "-"); draw(); } } }),
        el("button", { type: "button", class: "k-wide k-go", text: "✓", "aria-label": "Submit", onclick: () => { if (typed.trim()) submit(typed.trim()); } })));
      body = el("div", null, hint ? el("p", { class: "hint" }, `💡 Starts with ${hint.first} · ${hint.len} letters`) : null, slots, kp);
    } else {
      const W = state.words || [];
      const shown = el("div", { class: "seq" }, seq.length ? seq.map(i => W[i - 1] || i).join(" ") : "Tap the words in order");
      const grid = el("div", { class: "ordergrid" });
      for (let i = 1; i <= state.nWords; i++) {
        grid.append(el("button", { class: "ord" + (seq.includes(i) ? " used" : ""), disabled: seq.includes(i), text: W[i - 1] || String(i), onclick: () => { seq.push(i); if (seq.length === state.nWords) submit(seq.slice()); else render(); } }));
      }
      body = el("div", null, hint ? el("p", { class: "hint" }, `💡 The first word is “${hint.firstWord}”`) : null, shown, grid,
        el("div", { class: "row" }, el("button", { class: "btn-ghost", text: "↶ Undo", disabled: !seq.length, onclick: () => { seq.pop(); render(); } }), el("button", { class: "btn-ghost", text: "Clear", disabled: !seq.length, onclick: () => { seq = []; render(); } })));
    }
    const puRow = null;
    return card(head, timerBar(), puRow, body);
  }

  const sent = new Set();
  const sentFor = q => sent.has(q);
  async function submit(v) {
    if (locked) return;
    locked = true; sent.add(state.qKey);
    const pu = null;
    render();
    try { await net.answer(state.qKey, v, pu); }
    catch (e) { root.append(card(el("p", { class: "muted small" }, "That answer arrived too late."))); }
  }

  function revealView() {
    const r = fb.last && fb.last.qKey === state.qKey ? fb.last : null;
    let k;
    if (!r) k = [el("div", { class: "big-emoji" }, "👀"), el("h2", null, "Look at the screen")];
    else if (r.correct) k = [el("div", { class: "big-emoji" }, "🎉"), el("h2", null, "Correct!"), el("p", { class: "pts" }, "+" + fmt(r.points))];
    else if (r.answered) k = [el("div", { class: "big-emoji" }, "😅"), el("h2", null, "Not this time"), r.points ? el("p", { class: "pts" }, `🛟 +${fmt(r.points)}`) : null];
    else k = [el("div", { class: "big-emoji" }, "⌛"), el("h2", null, "No answer")];
    return card(...k, fb.gotPu === state.qKey && fb.pu ? el("p", { class: "gift" }, `🎁 You got a power-up: ${POWERUPS[fb.pu].icon} ${POWERUPS[fb.pu].name}!`) : null);
  }

  function puBadge() {
    const p = POWERUPS[fb.pu];
    const on = state && state.phase === "question";
    const msg = state && state.simple ? { double: on ? "Right answer = 2 × points! ✖️2" : "Next question: 2 × points!",
      safety: on ? "Wrong answer? You still get some points 🙂" : "Help for a wrong answer 🙂",
      hint: on ? "Help comes soon 💡" : "Help in the next question 💡" }[fb.pu] : { double: on ? "is on for this question: get it right for double points!" : "will switch on by itself next question",
      safety: on ? "is ready: if you get this one wrong, you still get half points" : "will switch on by itself if you get one wrong",
      hint: on ? "will pop up halfway through this question" : "will pop up by itself during the next question" }[fb.pu] || p.desc;
    return el("div", { class: "pu-badge" + (on ? " live" : "") }, `${p.icon} ${p.name} `, el("span", { class: "small" }, msg));
  }

  function finalView() {
    const f = fb.final;
    if (!state.showResults || !f) return card(el("div", { class: "big-emoji" }, "🏁"), el("h2", null, "Game over!"), el("p", { class: "muted" }, "Look at the screen for the results…"));
    return card(
      el("div", { class: "big-emoji" }, f.rank <= 3 ? ["🥇", "🥈", "🥉"][f.rank - 1] : "⭐"),
      el("h2", null, `You finished #${f.rank} of ${f.of}`),
      el("p", { class: "pts" }, fmt(f.score) + " points"),
      el("p", { class: "muted" }, `${f.correct} of ${f.total} correct`),
      f.team ? el("p", null, `Your team: ${f.team} — #${f.teamRank}`) : null,
      ...(f.awards || []).map(a => el("p", { class: "award-chip" }, a)));
  }

  // ---------- wiring ----------
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state && state.phase === "question" && !locked && !flagged) { flagged = true; net.flag(state.qKey).catch(() => {}); }
  });
  let selfKey = null;
  net.onSelf(s => {
    self = s;
    if (s && s.name && joined) prof.name = s.name;
    if (s && !joined && s.name) { joined = true; prof.name = s.name; prof.emoji = s.emoji || prof.emoji; }
    const k = s ? [s.name, s.emoji, !!s.kicked, joined].join("|") : "none";
    if (k === selfKey) return;
    selfKey = k; render();
  });
  // Only redraw when something this phone shows has changed. The host updates its
  // "answered" counter after every answer; redrawing on that would drop taps.
  let stateKey = null, fbKey = null;
  net.onState(s => {
    state = s;
    if (s && opts.ownTheme) applyTheme(s.theme || "", { decor: s.decor !== false, count: 9 });
    const k = s ? JSON.stringify(Object.assign({}, s, { answered: undefined, count: s.phase === "lobby" ? s.count : undefined })) : "none";
    if (k === stateKey) return;
    stateKey = k; render();
  });
  net.onFeedback(f => {
    fb = f || {};
    const k = JSON.stringify(fb);
    if (k === fbKey) return;
    fbKey = k; render();
  });
  render();
  return { profile: prof };
}
