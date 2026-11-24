// Confetti for the results screen.
const COLOURS = ["#cdbff5", "#bfe8d6", "#ffd7c2", "#c4dcf7", "#f7c6d4", "#fbe8a6", "#8f78dc", "#3fa27a"];
let canvas = null, parts = [], raf = null;

function ensure() {
  if (canvas) return;
  canvas = document.createElement("canvas");
  Object.assign(canvas.style, { position: "fixed", inset: "0", width: "100%", height: "100%", pointerEvents: "none", zIndex: 40 });
  document.body.append(canvas);
  const fit = () => { canvas.width = innerWidth * devicePixelRatio; canvas.height = innerHeight * devicePixelRatio; };
  fit(); addEventListener("resize", fit);
}

// x,y in 0..1 of the screen; power ~ how many pieces.
export function confetti({ x = 0.5, y = 0.35, power = 120, spread = 1, fromTop = false, colours = COLOURS } = {}) {
  ensure();
  const W = canvas.width, H = canvas.height, s = devicePixelRatio;
  for (let i = 0; i < power; i++) {
    const ang = fromTop ? Math.PI / 2 + (Math.random() - 0.5) * 0.6 : -Math.PI / 2 + (Math.random() - 0.5) * 2.2 * spread;
    const v = (fromTop ? 2 + Math.random() * 3 : 9 + Math.random() * 10) * s;
    parts.push({
      x: fromTop ? Math.random() * W : x * W, y: fromTop ? -20 * s : y * H,
      vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3,
      w: (6 + Math.random() * 8) * s, h: (8 + Math.random() * 10) * s, c: colours[i % colours.length], life: 1, shape: Math.random() < 0.3 ? "circle" : "rect",
    });
  }
  if (!raf) loop();
}
export function confettiRain(seconds = 4, colours = COLOURS) {
  const end = performance.now() + seconds * 1000;
  const iv = setInterval(() => { if (performance.now() > end) return clearInterval(iv); confetti({ power: 14, fromTop: true, colours }); }, 120);
}
function loop() {
  const g = canvas.getContext("2d"), s = devicePixelRatio;
  g.clearRect(0, 0, canvas.width, canvas.height);
  parts = parts.filter(p => p.life > 0 && p.y < canvas.height + 40 * s);
  for (const p of parts) {
    p.vy += 0.28 * s; p.vx *= 0.985; p.vy *= 0.985; p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life -= 0.004;
    g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.globalAlpha = Math.min(1, p.life * 2); g.fillStyle = p.c;
    if (p.shape === "circle") { g.beginPath(); g.arc(0, 0, p.w / 2, 0, Math.PI * 2); g.fill(); }
    else g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.rot * 2)) + 2);
    g.restore();
  }
  raf = parts.length ? requestAnimationFrame(loop) : (g.clearRect(0, 0, canvas.width, canvas.height), null);
}
