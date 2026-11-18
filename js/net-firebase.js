// Live transport over Firebase Realtime Database. Students sign in anonymously
// (invisible to them) so the security rules can tell phones apart.

const SDK = "https://www.gstatic.com/firebasejs/10.12.2/";
let fb = null;

async function boot(config) {
  if (fb) return fb;
  const [appM, authM, dbM] = await Promise.all([
    import(SDK + "firebase-app.js"), import(SDK + "firebase-auth.js"), import(SDK + "firebase-database.js"),
  ]);
  const app = appM.initializeApp(config);
  const auth = authM.getAuth(app);
  const db = dbM.getDatabase(app);
  const user = await new Promise((resolve, reject) => {
    const off = authM.onAuthStateChanged(auth, u => { if (u) { off(); resolve(u); } });
    authM.signInAnonymously(auth).catch(reject);
  });
  let offset = 0;
  dbM.onValue(dbM.ref(db, ".info/serverTimeOffset"), s => { offset = s.val() || 0; });
  fb = { ...dbM, db, uid: user.uid, now: () => Date.now() + offset };
  return fb;
}

function listen(f, path, fn) {
  return f.onValue(f.ref(f.db, path), s => fn(s.val()), err => console.warn("listen failed", path, err && err.message));
}

export async function hostNet(config) {
  const f = await boot(config);
  let code = null;
  const p = sub => `games/${code}/${sub}`;
  return {
    live: true, uid: f.uid,
    now: () => f.now(),
    async createGame(c) {
      code = c;
      await f.set(f.ref(f.db, `games/${c}`), { host: f.uid, createdAt: f.serverTimestamp(), state: { phase: "lobby" } });
    },
    async resumeGame(c) { code = c; const s = await f.get(f.ref(f.db, `games/${c}/host`)); return s.val() === f.uid; },
    async codeFree(c) {
      try { const s = await f.get(f.ref(f.db, `games/${c}/state`)); return !s.exists(); }
      catch { return true; } // unreadable = belongs to someone else's or doesn't exist; createGame will tell
    },
    onPlayers: fn => listen(f, p("players"), v => fn(v || {})),
    onAnswers: (qKey, fn) => listen(f, p(`answers/${qKey}`), v => fn(v || {})),
    onReqs: (qKey, fn) => listen(f, p(`req/${qKey}`), v => fn(v || {})),
    onFlags: fn => listen(f, p("flags"), v => fn(v || {})),
    setState: s => f.set(f.ref(f.db, p("state")), s),
    setFeedback: (uid, patch) => f.update(f.ref(f.db, p(`feedback/${uid}`)), patch),
    updatePlayer: (uid, patch) => f.update(f.ref(f.db, p(`players/${uid}`)), patch),
    destroy: () => f.remove(f.ref(f.db, `games/${code}`)),
  };
}

export async function playerNet(config, code) {
  const f = await boot(config);
  const p = sub => `games/${code}/${sub}`;
  return {
    live: true, uid: f.uid,
    now: () => f.now(),
    async exists(c) { try { const s = await f.get(f.ref(f.db, `games/${c}/state`)); return s.exists(); } catch { return false; } },
    async join(_c, prof) {
      await f.update(f.ref(f.db, p(`players/${f.uid}`)), { name: prof.name, emoji: prof.emoji, joined: f.serverTimestamp() });
    },
    onState: fn => listen(f, p("state"), fn),
    onFeedback: fn => listen(f, p(`feedback/${f.uid}`), v => fn(v || {})),
    onSelf: fn => listen(f, p(`players/${f.uid}`), fn),
    answer: (qKey, v, pu) => f.set(f.ref(f.db, p(`answers/${qKey}/${f.uid}`)), { v, t: f.serverTimestamp(), pu: pu || null }),
    request: (qKey, what) => f.set(f.ref(f.db, p(`req/${qKey}/${f.uid}`)), what),
    flag: qKey => f.set(f.ref(f.db, p(`flags/${qKey}/${f.uid}`)), true),
  };
}
