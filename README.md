# Live Class Quiz

A live classroom quiz for vocabulary and grammar review. The teacher's screen is projected and students answer on their phones with no login.

- `host.html`: the teacher/projector screen (setup, lobby + QR code, questions, reveal, podium, awards, breakdown, NPC test mode)
- `index.html`: the student phone screen (students arrive here via the QR code, `?g=CODE`)
- `config.js`: Firebase web settings (public by design)
- `database.rules.json`: Realtime Database security rules (paste into Firebase console → Realtime Database → Rules)

Games are created in the Quiz Builder (in Claude) and arrive via `host.html#game=…`; nothing about the game is uploaded until it's played, and answer keys stay on the teacher's computer.
