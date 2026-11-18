// Two small sample games for trying the system out.
const times = { choice: 20, letters: 30, order: 60, unscramble: 40 };

export const SAMPLES = [
  {
    id: "sample-travel-b1", title: "Travel vocabulary (B1)", mode: "vocab", level: "B1", settings: { times },
    questions: [
      { qtype: "mc", format: "choice", prompt: "You show this at the airport before you get on the plane.", options: ["boarding pass", "receipt", "menu", "ticket office"], answer: 0, explanation: "A boarding pass lets you get on (board) the plane." },
      { qtype: "definition", format: "letters", prompt: "A bag you carry on your back when you travel.", answers: ["backpack", "rucksack"], explanation: "A backpack (also called a rucksack) is carried on your back." },
      { qtype: "collocation", format: "choice", prompt: "Which verb goes with all three? ___ a flight · ___ a room · ___ a table", options: ["book", "do", "make", "take"], answer: 0, explanation: "We book a flight, a room or a table, meaning we reserve them." },
      { qtype: "missing_letters", format: "letters", prompt: "Complete the word:  ACC _ MM _ DAT _ ON", sub: "a place to stay", answers: ["accommodation"], explanation: "Accommodation has double C and double M." },
      { qtype: "odd_one_out", format: "choice", prompt: "Which word is the odd one out?", options: ["suitcase", "luggage", "baggage", "passport"], answer: 3, explanation: "Suitcase, luggage and baggage are things you carry; a passport is a document." },
      { qtype: "emoji", format: "letters", prompt: "✈️ 🛬 🧳 🏢", sub: "Where are you?", answers: ["airport"], explanation: "Planes, landing and suitcases: you're at the airport." },
      { qtype: "confusables", format: "choice", prompt: "We went on a two-week ___ around Italy.", options: ["trip", "travel", "journey", "voyage"], answer: 0, explanation: "A trip is a visit to a place and back. ‘Travel’ is usually uncountable, so we don't say ‘a travel’." },
      { qtype: "letter_unscramble", format: "letters", scramble: true, prompt: "Unscramble the letters: a word for a person on holiday", answers: ["tourist"], explanation: "A tourist visits places for pleasure." },
      { qtype: "word_formation", format: "letters", prompt: "The hotel was very ________ about our late arrival.", sub: "(UNDERSTAND)", answers: ["understanding"], explanation: "Understanding (adjective) = kind and sympathetic." },
      { qtype: "phrasal_verb", format: "choice", prompt: "What does ‘check in’ mean?", options: ["arrive and register at a hotel or airport", "leave a hotel and pay", "look for information", "cancel a booking"], answer: 0, explanation: "Check in = register when you arrive. Check out = leave and pay." },
      { qtype: "right_wrong", format: "choice", fixed: true, prompt: "Is ‘sightseeing’ used correctly?", sub: "“We did a lot of sightseeing in Rome.”", options: ["Right", "Wrong"], answer: 0, explanation: "We ‘do’ or ‘go’ sightseeing, so this is correct." },
      { qtype: "gap_fill", format: "letters", prompt: "Our flight was ________ because of the storm, so we left the next day.", answers: ["cancelled", "canceled"], explanation: "Cancelled (Irish/British spelling) or canceled (American spelling) are both accepted." },
    ],
  },
  {
    id: "sample-pp-b1", title: "Present perfect vs past simple (B1)", mode: "grammar", level: "B1", settings: { times },
    questions: [
      { qtype: "mc", format: "choice", prompt: "I ________ to Paris three times.", options: ["have been", "was", "have gone", "went been"], answer: 0, explanation: "Life experience with no time given → present perfect. ‘Been’ means went and came back." },
      { qtype: "verb_brackets", format: "letters", prompt: "She ________ (finish) her homework yesterday.", answers: ["finished"], explanation: "‘Yesterday’ is a finished time → past simple." },
      { qtype: "error_spot", format: "choice", fixed: true, prompt: "Which part has the mistake?", sub: "(1) I have seen  (2) that film  (3) last week  (4) with my friends.", options: ["I have seen", "that film", "last week", "with my friends"], answer: 0, explanation: "‘Last week’ needs the past simple: I saw that film last week." },
      { qtype: "correct_sentence", format: "choice", prompt: "Which sentence is correct?", options: ["Have you ever eaten sushi?", "Did you ever eaten sushi?", "Have you ever ate sushi?", "Are you ever eaten sushi?"], answer: 0, explanation: "Have + ever + past participle (eaten)." },
      { qtype: "sentence_unscramble", format: "order", prompt: "Put the words in order.", sentence: ["She", "has", "lived", "here", "since", "2019"], explanation: "Subject + has + past participle + place + since + point in time." },
      { qtype: "transformation", format: "letters", prompt: "I started working here five years ago. → I ________ here for five years.", sub: "Use 2–3 words (HAVE)", answers: ["have worked", "have been working"], explanation: "Started in the past and still true → present perfect (simple or continuous) + for." },
      { qtype: "mc", format: "choice", prompt: "We ________ each other since we were children.", options: ["have known", "knew", "know", "are knowing"], answer: 0, explanation: "‘Since’ + state verb → present perfect simple." },
      { qtype: "sentence_unscramble", format: "order", prompt: "Put the words in order.", sentence: ["Have", "you", "finished", "your", "report", "yet"], explanation: "Question form: Have + subject + past participle … yet?" },
      { qtype: "verb_brackets", format: "letters", prompt: "I ________ (not see) him since Monday.", answers: ["haven't seen", "have not seen"], explanation: "Negative present perfect + since. Punctuation is forgiven, so ‘havent seen’ also counts." },
      { qtype: "error_spot", format: "choice", fixed: true, prompt: "Which part has the mistake?", sub: "(1) When  (2) have you  (3) arrived  (4) in Dublin?", options: ["When", "have you", "arrived", "in Dublin?"], answer: 1, explanation: "Questions with ‘When’ ask about a finished time → past simple: When did you arrive?" },
    ],
  },
];
