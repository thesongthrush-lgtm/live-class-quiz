// Pure game rules for Weakest Link (no DOM, no network), so they can be tested on their own.

export const DEFAULT_CHAIN = [20, 50, 100, 200, 300, 450, 600, 800, 1000];
export const CURRENCIES = ["€", "£", "$", "pts"];
export const DEFAULTS = {
  rounds: 3, bankSecs: 5, answerSecs: 20, voteSecs: 30, roundSecs: 0 /* 0 = auto */,
  chain: DEFAULT_CHAIN, currency: "€", autoNext: true, votesOnTV: false,
  h2hQuestions: 5, detectivePoints: 100,
};
// Finalist score weighting (Neill's choice): 60% banked credit, 40% Detective points.
export const W_CREDIT = 0.6, W_DETECTIVE = 0.4;
// Weakest-link score: share of wrong answers counts more than slowness.
export const W_WRONG = 0.7, W_TIME = 0.3;

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

// stats: { uid: { turns, wrong, time } } for one round (time = total seconds used).
// Returns { scores: {uid: 0..1}, weakest: [uids] }. Ties (to 3 decimals) are all weakest.
export function weakestLink(stats, answerSecs) {
  const scores = {};
  for (const [uid, s] of Object.entries(stats)) {
    if (!s || !s.turns) continue;
    const wrongRate = s.wrong / s.turns;
    const slow = Math.min(1, (s.time / s.turns) / answerSecs);
    scores[uid] = Math.round((W_WRONG * wrongRate + W_TIME * slow) * 1000) / 1000;
  }
  const vals = Object.values(scores);
  if (!vals.length) return { scores, weakest: [] };
  const top = Math.max(...vals);
  return { scores, weakest: Object.keys(scores).filter(u => scores[u] === top) };
}

// players: { uid: { credit, detective, correct, answered, time } }.
// Both parts are scaled so the class's best = 100, then weighted 60/40.
export function finalistScores(players) {
  const ids = Object.keys(players);
  const maxC = Math.max(0, ...ids.map(u => players[u].credit || 0));
  const maxD = Math.max(0, ...ids.map(u => players[u].detective || 0));
  const out = ids.map(u => {
    const p = players[u];
    const c = maxC ? (p.credit || 0) / maxC * 100 : 0, d = maxD ? (p.detective || 0) / maxD * 100 : 0;
    return { uid: u, creditPct: c, detectivePct: d, score: Math.round((W_CREDIT * c + W_DETECTIVE * d) * 10) / 10,
      correct: p.correct || 0, avgTime: p.answered ? p.time / p.answered : 99, tie: Math.random() };
  });
  // Ties: more correct answers, then faster average time, then a coin toss.
  out.sort((a, b) => b.score - a.score || b.correct - a.correct || a.avgTime - b.avgTime || a.tie - b.tie);
  return out;
}

// Head-to-head: a/b are arrays of true/false (answers so far), n = questions each.
// Returns "a" | "b" | null (not decided yet) | "tie" (all asked, level).
export function h2hDecided(a, b, n) {
  const sa = a.filter(Boolean).length, sb = b.filter(Boolean).length;
  const leftA = n - a.length, leftB = n - b.length;
  if (sa > sb + leftB) return "a";
  if (sb > sa + leftA) return "b";
  if (!leftA && !leftB) return sa === sb ? "tie" : sa > sb ? "a" : "b";
  return null;
}

// Tie-break: both answer the same question; fastest correct answer wins.
// ans: { uid: { correct, t } }. Returns winner uid or null (ask another).
export function tiebreakWinner(ans, a, b) {
  const A = ans[a], B = ans[b];
  const okA = A && A.correct, okB = B && B.correct;
  if (okA && okB) return A.t <= B.t ? a : b;
  if (okA) return a;
  if (okB) return b;
  return null;
}
