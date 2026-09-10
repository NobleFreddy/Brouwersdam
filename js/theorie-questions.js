// Windsurf-Theorieprüfung — Fragenkatalog (25 Fragen, 3 Typen, steigende Schwierigkeit).
//
// Vorfahrtsregeln (Typ "row"): Alle Antworten sind anhand der drei Standardregeln des
// Segel-/Windsurfsports geprüft:
//   1. Steuerbord vor Backbord (unterschiedlicher Bug)
//   2. Lee vor Luv (gleicher Bug: der windabgewandte/leewärtige Surfer hat Vorfahrt)
//   3. Überholer weicht aus (unabhängig vom Bug)
// Der Bug (Steuerbord/Backbord) ergibt sich daraus, auf welcher Seite der Wind auftrifft:
// kommt der Wind - vom Kurs aus gesehen - von rechts, ist es Steuerbordbug, von links Backbordbug.

// Gemeinsame Gradient-Defs für alle Rigg-Illustrationen (jede Frage bekommt ihr eigenes
// <svg>, daher sind gleiche IDs über mehrere Illustrationen hinweg unproblematisch).
const RIG_DEFS = `
  <defs>
    <linearGradient id="tq-sail-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#5b9cee"/><stop offset="55%" stop-color="#2f7de1"/><stop offset="100%" stop-color="#1a4f9c"/>
    </linearGradient>
    <linearGradient id="tq-board-grad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#eef5fc"/><stop offset="100%" stop-color="#c7d9ea"/>
    </linearGradient>
  </defs>`;
const RIG_BOARD = `<path d="M 25,140 C 25,133 38,128 55,128 L 160,128 C 173,128 182,135 182,140 C 182,145 173,152 160,152 L 55,152 C 38,152 25,147 25,140 Z" class="tq-board" />`;
const RIG_BATTENS = `
  <path d="M 108,50 C 130,58 148,78 150,100" class="tq-batten" />
  <path d="M 105,105 C 128,112 145,122 149,132" class="tq-batten" />`;

// Alle vier Varianten teilen dieselben Grundkoordinaten (Board/Mast/Segel/Gabelbaum/Finne) -
// der jeweilige Fehler ist eine deutliche, aber nicht beschriftete Abweichung davon, plus
// ein rot gestrichelter Fehler-Ring als konsistenter visueller Hinweis "hier stimmt was nicht".
const RIG_ILLUSTRATIONS = {
  correct: `
    ${RIG_DEFS}
    <line x1="15" y1="150" x2="185" y2="150" class="tq-water" />
    ${RIG_BOARD}
    <ellipse cx="99" cy="140" rx="8" ry="4.5" class="tq-mastfoot" />
    <rect x="97" y="30" width="5" height="110" rx="2" class="tq-mast" />
    <path d="M 100,32 C 145,40 168,75 163,112 C 160,132 142,145 100,150 Z" class="tq-sail" />
    ${RIG_BATTENS}
    <path d="M 100,90 C 135,93 152,100 152,103 C 152,106 135,112 100,115" class="tq-boom" />
    <path d="M 155,140 L 168,158 L 158,158 Z" class="tq-fin" />
  `,
  mastfuss_offen: `
    ${RIG_DEFS}
    <line x1="15" y1="150" x2="185" y2="150" class="tq-water" />
    ${RIG_BOARD}
    <ellipse cx="99" cy="140" rx="8" ry="4.5" class="tq-mastfoot-slot" />
    <g transform="rotate(16 100 118)">
      <rect x="97" y="30" width="5" height="110" rx="2" class="tq-mast" />
      <path d="M 100,32 C 145,40 168,75 163,112 C 160,132 142,145 100,150 Z" class="tq-sail" />
      ${RIG_BATTENS}
      <path d="M 100,90 C 135,93 152,100 152,103 C 152,106 135,112 100,115" class="tq-boom" />
      <ellipse cx="99" cy="140" rx="8" ry="4.5" class="tq-mastfoot" />
    </g>
    <path d="M 155,140 L 168,158 L 158,158 Z" class="tq-fin" />
    <circle cx="99" cy="132" r="13" class="tq-flaw-ring" />
  `,
  segel_falten: `
    ${RIG_DEFS}
    <line x1="15" y1="150" x2="185" y2="150" class="tq-water" />
    ${RIG_BOARD}
    <ellipse cx="99" cy="140" rx="8" ry="4.5" class="tq-mastfoot" />
    <rect x="97" y="30" width="5" height="110" rx="2" class="tq-mast" />
    <path d="M 100,32 C 145,40 168,75 163,112 C 160,132 142,145 100,150 Z" class="tq-sail" />
    <path d="M 104,42 L 95,53 L 109,61 L 96,72 L 111,81 L 98,91" class="tq-wrinkle" />
    <path d="M 100,90 C 135,93 152,100 152,103 C 152,106 135,112 100,115" class="tq-boom" />
    <path d="M 155,140 L 168,158 L 158,158 Z" class="tq-fin" />
    <circle cx="103" cy="62" r="24" class="tq-flaw-ring" />
  `,
  finne_lose: `
    ${RIG_DEFS}
    <line x1="15" y1="150" x2="185" y2="150" class="tq-water" />
    ${RIG_BOARD}
    <ellipse cx="99" cy="140" rx="8" ry="4.5" class="tq-mastfoot" />
    <rect x="97" y="30" width="5" height="110" rx="2" class="tq-mast" />
    <path d="M 100,32 C 145,40 168,75 163,112 C 160,132 142,145 100,150 Z" class="tq-sail" />
    ${RIG_BATTENS}
    <path d="M 100,90 C 135,93 152,100 152,103 C 152,106 135,112 100,115" class="tq-boom" />
    <path d="M 155,141 L 172,156 L 160,161 Z" class="tq-fin" transform="rotate(28 155 141)" />
    <circle cx="159" cy="148" r="13" class="tq-flaw-ring" />
  `,
};

function rowSurferSvg(x, y, heading, label, colorClass) {
  return `<g class="tq-surfer ${colorClass}" data-id="${label}" transform="translate(${x} ${y})">
    <circle r="19" class="tq-surfer-hit" />
    <g transform="rotate(${heading})"><polygon points="0,-13 8,10 0,5 -8,10" /></g>
    <text y="32" class="tq-surfer-label">${label}</text>
  </g>`;
}

// ---------------- Typ "row": Vorfahrts-Simulation (8 Fragen) ----------------
const ROW_QUESTIONS = [
  {
    type: "row", difficulty: 1, points: 10,
    windFrom: 0,
    surfers: [
      { id: "A", x: 58, y: 88, heading: 135 },
      { id: "B", x: 142, y: 88, heading: 225 },
    ],
    prompt: "Wer muss ausweichen?",
    correctId: "A",
    explanation: "B segelt auf Steuerbordbug (Wind von rechts), A auf Backbordbug. Grundregel: Steuerbord vor Backbord – A muss ausweichen.",
  },
  {
    type: "row", difficulty: 1, points: 10,
    windFrom: 0,
    surfers: [
      { id: "A", x: 152, y: 131, heading: 250 },
      { id: "B", x: 152, y: 169, heading: 290 },
    ],
    prompt: "Beide fahren Halbwind auf gleichem Bug. Wer muss ausweichen?",
    correctId: "A",
    explanation: "Gleicher Bug (beide Steuerbord) – dann gilt Lee vor Luv: Der windabgewandte B (weiter unten/lee) hat Vorfahrt, der luvwärtige A muss ausweichen.",
  },
  {
    type: "row", difficulty: 2, points: 14,
    windFrom: 0,
    surfers: [
      { id: "A", x: 100, y: 120, heading: 180 },
      { id: "B", x: 100, y: 165, heading: 180 },
    ],
    prompt: "A holt von hinten auf und überholt B auf gleichem Kurs. Wer muss ausweichen?",
    correctId: "A",
    explanation: "Unabhängig vom Bug gilt: Der Überholer muss immer ausweichen – hier also A.",
  },
  {
    type: "row", difficulty: 2, points: 14,
    windFrom: 0,
    surfers: [
      { id: "A", x: 75, y: 170, heading: 45 },
      { id: "B", x: 119, y: 101, heading: 200 },
    ],
    prompt: "A fährt Amwind, B fährt Raumwind. Wer muss ausweichen?",
    correctId: "A",
    explanation: "Der Kurs zum Wind ist egal – entscheidend ist nur der Bug. B ist auf Steuerbord, A auf Backbord. A muss ausweichen, obwohl B den 'volleren' Kurs fährt.",
  },
  {
    type: "row", difficulty: 3, points: 18,
    windFrom: 0,
    surfers: [
      { id: "A", x: 93, y: 90, heading: 130 },
      { id: "B", x: 93, y: 150, heading: 50 },
    ],
    prompt: "Beide auf Backbordbug (Wind von links). Wer muss ausweichen?",
    correctId: "A",
    explanation: "Auch auf Backbordbug gilt Lee vor Luv: B liegt weiter lee (windabgewandter), hat Vorfahrt. A ist luvwärts und muss ausweichen.",
  },
  {
    type: "row", difficulty: 3, points: 18,
    windFrom: 0,
    surfers: [
      { id: "A", x: 151, y: 161, heading: 315 },
      { id: "B", x: 102, y: 85, heading: 160 },
    ],
    prompt: "A fährt hoch am Wind, B läuft fast vor dem Wind. Wer muss ausweichen?",
    correctId: "B",
    explanation: "A ist auf Steuerbordbug, B auf Backbordbug – obwohl B optisch 'entspannter' unterwegs wirkt, hat A als Steuerbordbug-Segler Vorfahrt. B muss ausweichen.",
  },
  {
    type: "row", difficulty: 4, points: 22,
    windFrom: 0,
    surfers: [
      { id: "A", x: 63, y: 162, heading: 45 },
      { id: "B", x: 110, y: 88, heading: 200 },
      { id: "C", x: 158, y: 45, heading: 15 },
    ],
    prompt: "Drei Surfer, aber nur zwei kreuzen sich wirklich. Wer muss ausweichen?",
    correctId: "A",
    explanation: "C fährt einen eigenen Kurs ohne Konflikt mit A oder B (reine Ablenkung). Zwischen A (Backbord) und B (Steuerbord) gilt Steuerbord vor Backbord – A muss ausweichen.",
  },
  {
    type: "row", difficulty: 5, points: 28,
    windFrom: 0,
    surfers: [
      { id: "A", x: 55, y: 130, heading: 90 },
      { id: "B", x: 171, y: 109, heading: 250 },
      { id: "C", x: 167, y: 160, heading: 300 },
    ],
    prompt: "Wer muss gleich zwei anderen Surfern ausweichen?",
    correctId: "A",
    explanation: "A ist auf Backbordbug, sowohl B als auch C sind auf Steuerbordbug. A muss also beiden ausweichen – die schwierigste Situation im Vergleich.",
  },
];

// ---------------- Typ "reaction": Reaktionsszenarien (5 Fragen) ----------------
const REACTION_QUESTIONS = [
  {
    type: "reaction", difficulty: 2, points: 14, timeLimitSec: 10,
    icon: "💨", title: "Böe!",
    prompt: "Eine plötzliche Böe erfasst dein Segel. Was tust du sofort?",
    options: [
      "Segel ausstellen (entpowern) und Beine beugen",
      "Segel maximal dichtholen für mehr Speed",
      "Sofort loslassen und ins Wasser springen",
      "Kurs ändern, Segeltrimm unverändert lassen",
    ],
    correctIndex: 0,
    explanation: "Bei Böen entpowerst du das Segel, indem du den Gabelbaum nach außen drückst (ausstellst), und gehst tief in die Knie – so bleibst du kontrolliert.",
  },
  {
    type: "reaction", difficulty: 3, points: 18, timeLimitSec: 9,
    icon: "⛵", title: "Segelboot kreuzt",
    prompt: "Ein größeres Segelboot kreuzt deinen Kurs – unklar, ob es dich bemerkt hat.",
    options: [
      "Kurs halten, da Windsurfer immer Vorfahrt haben",
      "Frühzeitig und deutlich ausweichen",
      "So dicht wie möglich vorbeifahren",
      "Anhalten mitten im Fahrwasser",
    ],
    correctIndex: 1,
    explanation: "Windsurfer haben keine pauschale Vorfahrt vor anderen Booten. Bei Unsicherheit oder größeren, weniger wendigen Fahrzeugen gilt: früh und eindeutig ausweichen.",
  },
  {
    type: "reaction", difficulty: 3, points: 18, timeLimitSec: 8,
    icon: "🪁", title: "Kiter nähert sich",
    prompt: "Ein Kiter mit langen Leinen kommt schnell von der Seite näher.",
    options: [
      "So nah wie möglich vorbeifahren",
      "Vorfahrt einfordern und Kurs stur halten",
      "Frühzeitig großen Abstand halten, Leinenradius bedenken",
      "Direkt vor dem Kiter kreuzen",
    ],
    correctIndex: 2,
    explanation: "Kiteleinen können über 20 m lang sein. Frühzeitig viel Abstand halten ist die sicherste Reaktion.",
  },
  {
    type: "reaction", difficulty: 2, points: 14, timeLimitSec: 9,
    icon: "🛠️", title: "Materialproblem",
    prompt: "Dein Gabelbaum bricht mitten auf dem Wasser.",
    options: [
      "Weiterfahren und Material improvisieren",
      "Sicherheitsposition einnehmen, Aufmerksamkeit erregen, ggf. Hilfe rufen",
      "Sofort ins Wasser springen, Board zurücklassen",
      "Zum nächsten Boot schwimmen, Board treiben lassen",
    ],
    correctIndex: 1,
    explanation: "Bei Materialschaden: auf dem Board sicher liegen bleiben, gut sichtbar bleiben und wenn nötig auf sich aufmerksam machen. Das Board ist dein bestes Auftriebsmittel.",
  },
  {
    type: "reaction", difficulty: 4, points: 22, timeLimitSec: 7,
    icon: "🏊", title: "Person im Wasser",
    prompt: "Direkt vor dir treibt eine Person, die gerade gestürzt ist.",
    options: [
      "Kurs halten, die Person wird schon ausweichen",
      "So schnell wie möglich knapp vorbeifahren",
      "Frühzeitig ausweichen bzw. Fahrt rausnehmen",
      "Direkt neben der Person mit voller Fahrt anhalten",
    ],
    correctIndex: 2,
    explanation: "Schwimmer und gestürzte Surfer haben immer Vorrang. Frühzeitig ausweichen oder die Fahrt rausnehmen ist Pflicht.",
  },
];

// ---------------- Typ "mc": Multiple-Choice (12 Fragen) ----------------
const MC_QUESTIONS = [
  {
    type: "mc", difficulty: 1, points: 10,
    topic: "Vorfahrtsregeln",
    prompt: "Wer hat laut Grundregel Vorfahrt?",
    options: ["Steuerbordbug", "Backbordbug", "Wer zuerst da war", "Der schnellere Surfer"],
    correctIndex: 0,
    explanation: "Die wichtigste Grundregel: Steuerbordbug hat Vorfahrt vor Backbordbug.",
  },
  {
    type: "mc", difficulty: 1, points: 10,
    topic: "Windrichtungen",
    prompt: "Wie nennt man die Seite, aus der der Wind kommt?",
    options: ["Lee", "Luv", "Achterlich", "Vorwind"],
    correctIndex: 1,
    explanation: "Luv ist die dem Wind zugewandte Seite, Lee die windabgewandte Seite.",
  },
  {
    type: "mc", difficulty: 1, points: 10,
    topic: "Kurse zum Wind",
    prompt: "Welcher Kurs führt am dichtesten an den Wind heran?",
    options: ["Vorwind", "Raumwind", "Halbwind", "Amwind"],
    correctIndex: 3,
    explanation: "Amwind (hoch am Wind) ist der Kurs, der am dichtesten gegen den Wind führt.",
  },
  {
    type: "mc", difficulty: 2, points: 14,
    topic: "Material",
    prompt: "Welches Teil verbindet den Mast fest mit dem Board?",
    options: ["Gabelbaum", "Mastfuß", "Finne", "Verlängerung"],
    correctIndex: 1,
    explanation: "Der Mastfuß sitzt in der Mastspur des Boards und verbindet das Rigg mit dem Board.",
  },
  {
    type: "mc", difficulty: 2, points: 14,
    topic: "Beaufort",
    prompt: "Welche Windstärke (Beaufort) entspricht etwa 20–28 km/h?",
    options: ["Bft 2", "Bft 3", "Bft 4", "Bft 6"],
    correctIndex: 2,
    explanation: "Bft 4 ('mäßige Brise') entspricht ungefähr 20–28 km/h.",
  },
  {
    type: "mc", difficulty: 2, points: 14,
    topic: "Wende/Halse",
    prompt: "Wie nennt man das Manöver, bei dem der Bug durch den Wind dreht?",
    options: ["Halse", "Wende", "Beachstart", "Wasserstart"],
    correctIndex: 1,
    explanation: "Bei der Wende dreht der Bug durch den Wind, bei der Halse dreht das Heck durch den Wind.",
  },
  {
    type: "mc-image", difficulty: 3, points: 18,
    topic: "Segeltrimm",
    prompt: "Was zeigt dieses Segel?",
    image: "segel_falten",
    options: ["Vorliek zu straff getrimmt", "Vorliek zu lose – Falten am Mast", "Optimaler Trimm", "Finne falsch montiert"],
    correctIndex: 1,
    explanation: "Diagonale Falten Richtung Mast zeigen ein zu lose getrimmtes Vorliek – nachtrimmen bringt mehr Kontrolle.",
  },
  {
    type: "mc", difficulty: 3, points: 18,
    topic: "Beachstart",
    prompt: "Was ist typisch für einen Beachstart?",
    options: [
      "Start im tiefen Wasser durch Hochziehen des Segels",
      "Start im flachen Wasser, Rigg wird seitlich angehoben",
      "Nur mit Trapez möglich",
      "Nur bei völliger Windstille möglich",
    ],
    correctIndex: 1,
    explanation: "Beim Beachstart steht man im flachen Wasser und hebt das Rigg seitlich an, statt es aus dem Wasser hochzuziehen.",
  },
  {
    type: "mc", difficulty: 3, points: 18,
    topic: "Wasserstart",
    prompt: "Was ist die Grundidee beim Wasserstart?",
    options: [
      "Der Wind hebt Segel und Surfer gemeinsam aufs Board",
      "Man schwimmt zurück zum Strand",
      "Das Board wird an Land getragen",
      "Nur mit Motorboot-Hilfe möglich",
    ],
    correctIndex: 0,
    explanation: "Beim Wasserstart nutzt man die Kraft des Winds im Segel, um sich direkt aus dem Wasser aufs Board ziehen zu lassen.",
  },
  {
    type: "mc", difficulty: 4, points: 22,
    topic: "Materialwahl",
    prompt: "Wonach richtet sich vor allem die passende Segelgröße?",
    options: ["Nur nach der Körpergröße", "Windstärke und Fahrergewicht", "Farbe des Boards", "Tageszeit"],
    correctIndex: 1,
    explanation: "Windstärke und Körpergewicht bestimmen zusammen, welche Segelgröße sinnvoll ist – mehr Wind oder weniger Gewicht bedeutet meist ein kleineres Segel.",
  },
  {
    type: "mc-image", difficulty: 4, points: 22,
    topic: "Material",
    prompt: "Was ist an diesem aufgebauten Rigg falsch?",
    image: "mastfuss_offen",
    options: ["Mastfuß nicht eingerastet", "Segel falsch herum aufgezogen", "Finne fehlt", "Gabelbaum zu hoch eingestellt"],
    correctIndex: 0,
    explanation: "Der Mastfuß muss hörbar einrasten – ein offener/schiefer Mastfuß kann sich beim Fahren komplett lösen.",
  },
  {
    type: "mc", difficulty: 5, points: 28,
    topic: "Verhalten bei Gewitter",
    prompt: "Was ist bei aufziehendem Gewitter die richtige Reaktion?",
    options: [
      "Weiterfahren und dem Gewitter ausweichen",
      "Sofort das Wasser verlassen und Schutz suchen",
      "Möglichst weit aufs offene Wasser fahren",
      "Abwarten, bis der Regen einsetzt",
    ],
    correctIndex: 1,
    explanation: "Bei Gewitter sofort raus aus dem Wasser – als höchster Punkt mit Mast in der Hand ist man dort besonders gefährdet.",
  },
];
