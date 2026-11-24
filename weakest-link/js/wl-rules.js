// Pure game rules for Last One Standing (no DOM, no network), so they can be tested on their own.

export const DEFAULT_CHAIN = [20, 50, 100, 200, 300, 450, 600, 800, 1000];
export const CURRENCIES = ["€", "£", "$", "pts"];
export const DEFAULTS = {
  rounds: 3, bankSecs: 5, answerSecs: 20, voteSecs: 30, roundSecs: 0 /* 0 = auto */,
  chain: DEFAULT_CHAIN, currency: "€", autoNext: true, votesOnTV: false,
  detectivePoints: 100,
};

export function money(n, cur = "€") {
  const s = Math.round(n || 0).toLocaleString("en-IE");
  return cur === "pts" ? `${s} pts` : cur + s;
}

export function parseChain(text) {
  const nums = String(text || "").split(/[,\s;]+/).map(s => Number(s.replace(/[^\d.]/g, ""))).filter(n => n > 0);
  const chain = [...new Set(nums)].sort((a, b) => a - b);
  return chain.length >= 3 && chain.length <= 15 ? chain : null;
}

// Auto round length: enough for every player to use a full bank window and a full answer.
export function autoRoundSecs(nPlayers, bankSecs, answerSecs) {
  const n = Math.max(1, nPlayers);
  return Math.max(60, Math.ceil((n * (bankSecs + answerSecs)) / 10) * 10);
}

export function chainValue(chain, idx) { return idx >= 0 ? chain[idx] : 0; }

// A correct answer moves the chain up one step. Returns the money that step added.
export function stepGain(chain, idx) { return chain[idx + 1] - chainValue(chain, idx); }

// Shuffle a 3-option question for play; the answer key stays on the teacher's computer.
export function prepare(q) {
  const opts = q.options.map((text, i) => ({ text, correct: i === q.answer }));
  for (let i = opts.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [opts[i], opts[j]] = [opts[j], opts[i]]; }
  return Object.assign({}, q, { _options: opts.map(o => o.text), _answer: opts.findIndex(o => o.correct) + 1 });
}

export function validateGame(g) {
  if (!g || !Array.isArray(g.questions) || !g.questions.length) return ["The game has no questions."];
  const errs = [];
  g.questions.forEach((q, i) => {
    if (!q || !q.prompt) errs.push(`Q${i + 1}: missing question`);
    else if (!Array.isArray(q.options) || q.options.length !== 3 || q.options.some(o => !String(o).trim())) errs.push(`Q${i + 1}: needs exactly 3 options`);
    else if (!(q.answer >= 0 && q.answer <= 2)) errs.push(`Q${i + 1}: no correct option marked`);
  });
  return errs;
}

// A player's overall performance: money they helped bank minus money lost on their wrong answers.
export const perf = p => (p && (p.credit || 0) - (p.lost || 0)) || 0;

// stats: { uid: { turns, wrong, time, banked, lost } } for one round.
// Only used to give the NPCs a realistic idea of who played worst; the class's votes decide.
export function weakestLink(stats, answerSecs) {
  const scores = {};
  const swing = Math.max(1, ...Object.values(stats).map(s => Math.abs((s.lost || 0) - (s.banked || 0))));
  for (const [uid, s] of Object.entries(stats)) {
    if (!s || !s.turns) continue;
    const wrongRate = s.wrong / s.turns;
    const slow = Math.min(1, (s.time / s.turns) / answerSecs);
    const money = ((s.lost || 0) - (s.banked || 0)) / swing;   // -1 (banked a lot) … 1 (lost a lot)
    scores[uid] = Math.round((0.5 * wrongRate + 0.2 * slow + 0.3 * (money + 1) / 2) * 1000) / 1000;
  }
  const vals = Object.values(scores);
  if (!vals.length) return { scores, weakest: [] };
  const top = Math.max(...vals);
  return { scores, weakest: Object.keys(scores).filter(u => scores[u] === top) };
}

// The class's votes decide the weakest link. A tie goes to the player with the lower
// banked-minus-lost this round, then overall, then a coin toss.
// votes: { voter: target }, cands: [uids], roundPerf / overallPerf: { uid: number }.
export function voteResult(votes, cands, roundPerf = {}, overallPerf = {}) {
  const counts = Object.fromEntries(cands.map(u => [u, 0]));
  for (const t of Object.values(votes)) if (t in counts) counts[t]++;
  const top = Math.max(0, ...Object.values(counts));
  const tied = cands.filter(u => counts[u] === top);
  const order = tied.map(u => ({ u, r: roundPerf[u] || 0, o: overallPerf[u] || 0, x: Math.random() }))
    .sort((a, b) => a.r - b.r || a.o - b.o || a.x - b.x);
  return { weakest: order.length ? order[0].u : null, counts, tie: tied.length > 1 };
}

// ---------------------------------------------------------------- sudden death
// ranked: uids best first. Neighbours play each other; with an odd number the last
// three form a trio. A trio, and the very last pair, always knock out exactly one player.
export function pairUp(ranked) {
  const n = ranked.length, out = [];
  if (n < 2) return out;
  let i = 0;
  while (n - i >= 2) {
    if (n - i === 3) { out.push({ uids: ranked.slice(i, i + 3), oneOut: true }); i += 3; }
    else { out.push({ uids: ranked.slice(i, i + 2), oneOut: n === 2 }); i += 2; }
  }
  return out;
}

// One question for one match. res: { uid: { correct, t } } (t = answer time, Infinity if none).
// Returns { out: [uids], replay: [uids] | null } — replay players answer a fresh question.
export const NEAR_MS = 300;
export function resolveMatch(m, res, near = NEAR_MS) {
  const ok = m.uids.filter(u => res[u] && res[u].correct);
  const bad = m.uids.filter(u => !ok.includes(u));
  const byTime = ok.slice().sort((a, b) => res[a].t - res[b].t);
  const slowest = () => {
    const last = byTime[byTime.length - 1];
    const near2 = byTime.filter(u => res[last].t - res[u].t < near);
    return near2.length > 1 ? { out: [], replay: near2 } : { out: [last], replay: null };
  };
  if (m.oneOut) {
    if (bad.length === 1) return { out: bad, replay: null };
    if (bad.length === 0) return slowest();
    return { out: [], replay: bad };                // two or more wrong: only they go again
  }
  // An ordinary pair.
  if (ok.length === 1) return { out: bad, replay: null };
  if (ok.length === 0) return { out: bad, replay: null };   // both wrong: both out
  return slowest();
}
