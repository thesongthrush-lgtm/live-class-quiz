// Shared helpers for host and player screens.

export const EMOJIS = ["🦊","🐼","🐸","🐙","🦉","🐝","🦄","🐢","🐧","🦋","🐳","🦁","🐨","🦔","🌵","🍉","🍕","🚀","⚽","🎸","🌈","⭐","🍀","🎈"];
const ADJ = ["Blue","Happy","Quick","Brave","Sunny","Clever","Lucky","Calm","Jolly","Swift","Cosy","Bold"];
const NOUN = ["Otter","Fox","Panda","Robin","Tiger","Koala","Whale","Owl","Badger","Falcon","Puffin","Hare"];
export const pick = a => a[Math.floor(Math.random() * a.length)];
export const randomNick = () => pick(ADJ) + " " + pick(NOUN);
export const randomEmoji = () => pick(EMOJIS);

export const TEAM_NAMES = [
  { name: "Lavender Llamas", color: "#cdbff5" },
  { name: "Mint Moose",      color: "#bfe8d6" },
  { name: "Peach Penguins",  color: "#ffd7c2" },
  { name: "Sky Sharks",      color: "#c4dcf7" },
  { name: "Rose Robins",     color: "#f7c6d4" },
];

// Three answer formats cover every question type.
//  choice  – tap a number (2–4 options)
//  letters – tap letters on the on-screen keypad (1–3 words)
//  order   – tap numbered words in the right order
export const DEFAULT_TIMES = { choice: 20, letters: 30, order: 60, unscramble: 40 };
// Letter unscrambles get their own limit; word-order (sentence) unscrambles use the "order" limit.
export function timeFor(q, settings) {
  if (q.time) return q.time;
  const t = Object.assign({}, DEFAULT_TIMES, settings && settings.times);
  if (q.qtype === "letter_unscramble") return t.unscramble || 40;
  return t[q.format] || 20;
}

export const QTYPE_LABELS = {
  mc: "Multiple choice", definition: "Definition → word", odd_one_out: "Odd one out",
  collocation: "Collocations", confusables: "Confusable words", missing_letters: "Missing letters",
  letter_unscramble: "Unscramble the letters", emoji: "Emoji clues", word_formation: "Word formation",
  phrasal_verb: "Phrasal verbs", right_wrong: "Right or wrong?", gap_fill: "Gap fill",
  error_spot: "Spot the error", correct_sentence: "Which sentence is correct?",
  verb_brackets: "Verb in brackets", transformation: "Key-word transformation",
  sentence_unscramble: "Put the words in order",
};
export const qtypeLabel = q => QTYPE_LABELS[q.qtype] || "Question";

// Capitalisation, punctuation, accents and spacing are forgiven; spelling is not.
export function normalise(s) {
  return String(s == null ? "" : s)
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// Vocabulary answers: ignore a leading a/an/the, plus spaces, hyphens, apostrophes, case and accents.
export function normAnswer(s) {
  return normalise(String(s == null ? "" : s).trim().replace(/^(a|an|the)\s+/i, ""));
}

export function isCorrect(q, v, extraAccepted) {
  if (v == null) return false;
  if (q.format === "choice") return Number(v) === q._answer;
  if (q.format === "letters") {
    const n = normAnswer(v);
    return !!n && [...(q.answers || []), ...(extraAccepted || [])].some(a => normAnswer(a) === n || normalise(a) === n);
  }
  if (q.format === "order") {
    if (!Array.isArray(v)) return false;
    const got = v.map(i => q._words[Number(i) - 1]).join(" ");
    return normalise(got) === normalise(q.sentence.join(" "));
  }
  return false;
}

export function answerText(q) {
  if (q.format === "choice") return `${q._answer}. ${q._options[q._answer - 1]}`;
  if (q.format === "letters") return q.answers[0] + (q.answers.length > 1 ? `  (also: ${q.answers.slice(1).join(", ")})` : "");
  if (q.format === "order") return q.sentence.join(" ");
  return "";
}

export function displayValue(q, v) {
  if (v == null) return "—";
  if (q.format === "choice") return q._options && q._options[Number(v) - 1] ? `${v}. ${q._options[Number(v) - 1]}` : String(v);
  if (q.format === "letters") return String(v).toUpperCase();
  if (q.format === "order") return Array.isArray(v) ? v.join("-") : "?";
  return String(v);
}

export function shuffle(a) {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
  return b;
}

// Scramble letters but never return the word unchanged.
export function scrambleWord(w) {
  const letters = w.replace(/\s+/g, "").split("");
  if (new Set(letters).size < 2) return letters.join("");
  let s; let guard = 0;
  do { s = shuffle(letters).join(""); } while (s === letters.join("") && guard++ < 20);
  return s;
}

// Prepare a question for play: shuffle options/words, keep the key on this device only.
export function prepareQuestion(q) {
  const p = Object.assign({}, q);
  if (q.format === "choice") {
    const opts = q.options.map((text, i) => ({ text, correct: i === q.answer }));
    const order = q.fixed ? opts : shuffle(opts);
    p._options = order.map(o => o.text);
    p._answer = order.findIndex(o => o.correct) + 1;
  } else if (q.format === "order") {
    let w; let guard = 0;
    do { w = shuffle(q.sentence); } while (w.join(" ") === q.sentence.join(" ") && guard++ < 20);
    p._words = w;
  } else if (q.format === "letters" && q.scramble) {
    p._scrambled = scrambleWord(q.answers[0].toUpperCase());
  }
  return p;
}

export const POWERUPS = {
  double: { icon: "✖️2", name: "Double points", desc: "Switches on by itself: your next correct answer scores double." },
  hint:   { icon: "💡",  name: "Hint",          desc: "Pops up by itself halfway through the next question." },
  safety: { icon: "🛟",  name: "Safety net",    desc: "Switches on by itself the first time you get one wrong: you still get half points." },
};

const CODE_CHARS = "BCDFGHJKLMNPQRSTVWXZ23456789";
export function makeCode(n = 5) { let s = ""; for (let i = 0; i < n; i++) s += pick(CODE_CHARS.split("")); return s; }

// Tiny DOM helper. Strings become text nodes (never HTML).
export function el(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k === "style" && typeof v === "object") Object.assign(e.style, v);
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (k === "text") e.textContent = v;
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return e;
}
export const clean = (s, max) => String(s == null ? "" : s).replace(/[\u0000-\u001f\u007f<>]/g, "").trim().slice(0, max);
export const fmt = n => Math.round(n).toLocaleString("en-IE");

// Game hand-off format: compressed JSON in the URL hash, so nothing is uploaded.
function b64url(bytes) { let s = ""; bytes.forEach(b => s += String.fromCharCode(b)); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function unb64url(str) { const s = atob(str.replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(s, c => c.charCodeAt(0)); }
export async function encodeGame(obj) {
  const json = new TextEncoder().encode(JSON.stringify(obj));
  if (typeof CompressionStream === "function") {
    const buf = await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream("deflate-raw"))).arrayBuffer();
    return "z." + b64url(new Uint8Array(buf));
  }
  return "j." + b64url(json);
}
export async function decodeGame(str) {
  const [kind, data] = [str.slice(0, 2), str.slice(2)];
  let bytes = unb64url(data);
  if (kind === "z.") bytes = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer());
  return JSON.parse(new TextDecoder().decode(bytes));
}

// Light validation so a malformed game fails clearly rather than mid-lesson.
export function validateGame(g) {
  const errs = [];
  if (!g || !Array.isArray(g.questions) || !g.questions.length) return ["The game has no questions."];
  g.questions.forEach((q, i) => {
    const n = i + 1;
    if (!q.prompt) errs.push(`Q${n}: missing prompt`);
    if (q.format === "choice") {
      if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 4) errs.push(`Q${n}: needs 2–4 options`);
      if (!(q.answer >= 0 && q.answer < (q.options || []).length)) errs.push(`Q${n}: answer index out of range`);
    } else if (q.format === "letters") {
      if (!Array.isArray(q.answers) || !q.answers.length) errs.push(`Q${n}: no accepted answers`);
    } else if (q.format === "order") {
      if (!Array.isArray(q.sentence) || q.sentence.length < 3 || q.sentence.length > 12) errs.push(`Q${n}: sentence needs 3–12 words`);
    } else errs.push(`Q${n}: unknown format "${q.format}"`);
  });
  return errs;
}

export function storageGet(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } }
export function storageSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } }
