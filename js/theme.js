// Seasonal colour themes. The colours live in css/style.css ([data-theme=…]);
// this file switches them on and draws the slow background decorations.
export const THEMES = [
  { id: "", label: "No theme" },
  { id: "spring", label: "🌸 Spring" },
  { id: "summer", label: "☀️ Summer" },
  { id: "autumn", label: "🍂 Autumn" },
  { id: "winter", label: "❄️ Winter" },
  { id: "christmas", label: "🎄 Christmas", group: "Holidays" },
  { id: "halloween", label: "🎃 Halloween", group: "Holidays" },
  { id: "easter", label: "🐣 Easter", group: "Holidays" },
  { id: "stpatricks", label: "☘️ St Patrick's Day", group: "Holidays" },
  { id: "arcade", label: "👾 Retro arcade", group: "Other" },
  { id: "ocean", label: "🐠 Ocean", group: "Other" },
  { id: "cafe", label: "☕ Cosy café", group: "Other" },
  { id: "travel", label: "✈️ Travel", group: "Other" },
  { id: "jungle", label: "🦜 Jungle", group: "Other" },
  { id: "candy", label: "🍭 Candy shop", group: "Other" },
  { id: "contrast", label: "🔆 High contrast (no decorations)", group: "Other" },
];
THEMES.slice(1, 5).forEach(t => t.group = "Seasons");

const DECOR = {
  spring: ["🌸", "🌸", "🌼", "🌷", "🍃"],
  summer: ["🫧", "🫧", "☀️", "🐚", "🌊"],
  autumn: ["🍂", "🍁", "🍂", "🍁", "🌰"],
  winter: ["❄️", "❄️", "❅", "❆", "⛄"],
  christmas: ["❄️", "⭐", "🎄", "🎁", "❄️", "🔔"],
  halloween: ["🎃", "🦇", "👻", "🕸️", "🦇", "🍬"],
  easter: ["🐣", "🐰", "🥚", "🌷", "🐥", "🥚"],
  stpatricks: ["☘️", "🍀", "☘️", "🌈", "🪙"],
  arcade: ["👾", "🕹️", "⭐", "💎", "🍒", "👾"],
  ocean: ["🫧", "🐠", "🫧", "🐙", "🐚", "🐟"],
  cafe: ["☕", "🥐", "📚", "🍪", "☕", "🧁"],
  travel: ["✈️", "🗺️", "🧳", "☁️", "🌍", "📸"],
  jungle: ["🍃", "🦜", "🦋", "🌴", "🍃", "🐒"],
  candy: ["🍭", "🍬", "🧁", "🍩", "🍭", "🍓"],
  contrast: [],
};
const BAR = { christmas: "#d65a5f", halloween: "#e99a55", easter: "#d5c6f5", stpatricks: "#79bb7f", arcade: "#b47cf8", ocean: "#6fbcd3", cafe: "#c9a07c", travel: "#8bbbea", jungle: "#7fbb7f", candy: "#f7b3d2", contrast: "#ffd43b", "": "#cdbff5", spring: "#a9dc9e", summer: "#7fd8d6", autumn: "#eba573", winter: "#a3c9ee" };

let current = null;

export function applyTheme(id = "", { decor = true, count = 22 } = {}) {
  id = DECOR[id] ? id : "";
  const key = id + "|" + (decor ? 1 : 0) + "|" + count;
  if (key === current) return;
  current = key;
  const body = document.body;
  if (id) body.dataset.theme = id; else delete body.dataset.theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = BAR[id];
  document.querySelector(".season-fx")?.remove();
  if (!id || !decor || !DECOR[id].length) return;
  const layer = document.createElement("div");
  layer.className = "season-fx " + id;
  layer.setAttribute("aria-hidden", "true");
  const icons = DECOR[id];
  for (let i = 0; i < count; i++) {
    const s = document.createElement("span");
    s.textContent = icons[i % icons.length];
    const dur = 18 + Math.random() * 16;
    s.style.left = (Math.random() * 100).toFixed(1) + "%";
    s.style.fontSize = (1.2 + Math.random() * 1.6).toFixed(2) + "rem";
    s.style.animationDuration = dur.toFixed(1) + "s, " + (3 + Math.random() * 3).toFixed(1) + "s";
    s.style.animationDelay = (-Math.random() * dur).toFixed(1) + "s, 0s";
    layer.append(s);
  }
  body.prepend(layer);
}
