# Rapidiom

A live classroom quiz game for vocabulary and grammar review. The teacher's screen is projected and students answer on their phones with no login.

- `host.html`: the teacher/projector screen (setup, lobby + QR code, questions, reveal, podium, awards, breakdown, NPC test mode)
- `index.html`: the student phone screen (students arrive here via the QR code, `?g=CODE`)
- `js/theme.js` + `css/style.css`: seasonal themes (spring, summer, autumn, winter); phones follow the host's theme
- `config.js`: Firebase web settings (public by design)
- `database.rules.json`: Realtime Database security rules (paste into Firebase console → Realtime Database → Rules)

Games are created in the Rapidiom Builder (in Claude) and arrive via `host.html#game=…`; nothing about the game is uploaded until it's played, and answer keys stay on the teacher's computer.

## Last One Standing (`weakest-link/`)

A separate game on the same site and Firebase project (data under `wl/`).

- `weakest-link/host.html`: the TV screen (setup, lobby + QR, rounds with money chain and banking, secret weakest-link vote, sudden-death final, full screen, NPC test mode)
- `weakest-link/index.html`: the phone screen (`weakest-link/?g=CODE`); phones only show the numbers 1–3, never the question text
- `weakest-link/js/wl-rules.js`: rules (the class's votes decide the weakest link, ties go to the lower banked-minus-lost; sudden death pairs neighbours by banked-minus-lost, with a trio for odd numbers)
- `weakest-link/js/wl-names.js`: random player names (about 150 adjectives, 150 nouns and 20 titles)
- Question sets come from the question builder (in Claude) via `host.html#game=…`
