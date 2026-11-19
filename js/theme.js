// Seasonal colour themes. The colours live in css/style.css ([data-theme=…]);
// this file switches them on and draws the slow background decorations.
export const THEMES = [
  { id: "", label: "No theme" },
  { id: "spring", label: "🌸 Spring" },
  { id: "summer", label: "☀️ Summer" },
  { id: "autumn", label: "🍂 Autumn" },
  { id: "winter", label: "❄️ Winter" },
];

const DECOR = {
  spring: ["🌸", "🌸", "🌼", "🌷", "🍃"],
  summer: ["🫧", "🫧", "☀️", "🐚", "🌊"],
  autumn: ["🍂", "🍁", "🍂", "🍁", "🌰"],
  winter: ["❄️", "❄️", "❅", "❆", "⛄"],
};
const BAR = { "": "#cdbff5", spring: "#a9dc9e", summer: "#7fd8d6", autumn: "#eba573", winter: "#a3c9ee" };

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
  if (!id || !decor) return;
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
