// =============================================
// GLOBALS, CONFIG, AND STATE
// =============================================

// ── Config ─────────────────────────────────────────────────
const MAZE_W = 25;   // must be odd — bigger maze!
const MAZE_H = 25;
const CELL = 4;
const WALL_H = 3.5;
const MOVE_SPD = 8.5;  // snappy movement
const WIN_DIST = CELL * 1.6;
const LIGHT_RANGE = 17;   // torch radius (world units)

// ── State ───────────────────────────────────────────────────
let scene, camera, renderer;
let mazeData = [];
let arif, ajeng;
let fogOverlay, fogCtx;  // 2D canvas for torchlight effect
let gameStarted = false;
let gameWon = false;
let elapsedSec = 0;
let timerID = null;
let particles = [];
let minimapCvs, minimapCtx;
let moveQueue = null;
let lastMoveDir = null;
let asteroids = [];
let starField = null; // Starfield reference for animation
const heldKeys = { up: false, down: false, left: false, right: false };

// Camera zoom + tracking
const BASE_VIEW = MAZE_W * CELL * 0.58;
let currentZoom = 1.0;
let currentFrustum = BASE_VIEW;  // actual smoothed frustum half-size
let camTarget = null;       // world look-at target, initialized after maze
let menuCam = null;  // perspective camera for main menu showcase

// ── Color Theme Cycling ──────────────────────────────────────
const THEMES = [
    { fog: [1, 0, 10], amb: [42, 16, 85], pink: [255, 105, 180], blue: [68, 187, 255], name: 'cosmic' },
    { fog: [0, 5, 18], amb: [0, 20, 90], pink: [0, 191, 255], blue: [148, 0, 255], name: 'nebula' },
    { fog: [10, 0, 5], amb: [80, 10, 30], pink: [255, 90, 90], blue: [255, 150, 0], name: 'solar' },
    { fog: [0, 10, 10], amb: [0, 55, 55], pink: [0, 255, 180], blue: [80, 200, 255], name: 'aurora' },
];
let themeIdx = 0;
let themeNext = 1;
let themeT = 0;      // 0..1 lerp progress
const THEME_DUR = 12;     // seconds per theme
let themeTimer = 0;
// Working interpolated values
let curFog = [...THEMES[0].fog];
let curAmb = [...THEMES[0].amb];
let curPink = [...THEMES[0].pink];
let curBlue = [...THEMES[0].blue];
let ambLight = null;   // ref to ambient light for recolor
let fusionEffect = null; // fusion visual controller

// ── Meeting Point & Meteors ──────────────────────────────────
let meetingPoint = { col: 0, row: 0, mesh: null };
let meteors = [];     // { mesh, trail[], vel, life, maxLife }
let meteorTimer = 0;

// ── Quest System ─────────────────────────────────────────────
let lives = 3;
let questNodes = [];        // { col, row, mesh, owner, answered, question }
let questionsPool = [];     // parsed from question.md
let activeQuestIdx = -1;    // which quest node is being answered
let questPaused = false;    // movement paused during modal
let fusionComplete = false; // true after characters fuse
let questsAnswered = 0;     // 0..4
let endGoalCell = { col: 0, row: 0, mesh: null }; // post-fusion goal

// ── Menu Physics ─────────────────────────────────────────────
let menuPhys = {
    arif: { vel: new THREE.Vector3(), rotVel: new THREE.Euler() },
    ajeng: { vel: new THREE.Vector3(), rotVel: new THREE.Euler() },
    initialized: false
};

// ── Tutorial Chat ─────────────────────────────────────────────
let chatQueue = [
    { char: 'arif', text: 'Sayang! Kamu di mana?', delay: 2 },
    { char: 'ajeng', text: 'Aku di sisi lain labirin! Sinyalku terputus.', delay: 4 },
    { char: 'arif', text: 'Kita hanya bisa bergerak searah bersamaan. Arahkan kita berdua, sayang!', delay: 7 },
    { char: 'ajeng', text: 'Hati-hati, ada Quest Node energi yang menghalangi jalan kita.', delay: 10 },
    { char: 'arif', text: 'Ayo selesaikan 4 Quest baru kita bisa bertemu di titik terang (🩷)!', delay: 13 },
];
let chatActive = false;
let chatTimeout = null;
let lastRandomChatTime = 0;
const RANDOM_CHAT_INTERVAL = 17; // seconds between random chats
let soloArifChats = [];
let soloAjengChats = [];
let duoChats = [];

let prevT = performance.now(); // Used in animation loop
