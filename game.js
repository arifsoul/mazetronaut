// =============================================================
//  ARIF & AJENG: THE REUNION  —  Space Isometric Maze
// =============================================================

// ── Shared Globals (Window Scope) ───────────────────────────
const MAZE_W = 25;
const MAZE_H = 25;
const CELL = 4;
const WALL_H = 3.5;
const MOVE_SPD = 8.5;
const WIN_DIST = CELL * 1.6;
const LIGHT_RANGE = 17;

let scene, camera, renderer;
let mazeData = [];
let arif, ajeng;
let fogOverlay, fogCtx;
let gameStarted = false;
let gameWon = false;
let elapsedSec = 0;
let timerID = null;
let particles = [];
let minimapCvs, minimapCtx;
let moveQueue = null;
let lastMoveDir = null;
let asteroids = [];
const heldKeys = { up: false, down: false, left: false, right: false };

const BASE_VIEW = MAZE_W * CELL * 0.58;
let currentZoom = 1.0;
let currentFrustum = BASE_VIEW;
let camTarget = null;
let menuCam = null;

const THEMES = [
    { fog: [12, 12, 15], amb: [40, 40, 60], pink: [255, 105, 180], blue: [68, 187, 255], name: 'monochrome-1' },
    { fog: [25, 25, 30], amb: [30, 30, 50], pink: [0, 191, 255], blue: [148, 0, 255], name: 'monochrome-2' },
    { fog: [8, 8, 12], amb: [50, 50, 70], pink: [255, 90, 90], blue: [255, 150, 0], name: 'monochrome-3' },
    { fog: [20, 20, 25], amb: [45, 45, 65], pink: [0, 255, 180], blue: [80, 200, 255], name: 'monochrome-4' },
];
let themeIdx = 0, themeNext = 1, themeT = 0, themeTimer = 0;
const THEME_DUR = 12;
let curFog = [...THEMES[0].fog], curAmb = [...THEMES[0].amb];
let curPink = [...THEMES[0].pink], curBlue = [...THEMES[0].blue];
let ambLight = null, fusionEffect = null;
let meetingPoint = { col: 0, row: 0, mesh: null };
let meteors = [], meteorTimer = 0;

let lives = 3, questNodes = [], questionsPool = [];
let activeQuestIdx = -1, questPaused = false, fusionComplete = false;
let questsAnswered = 0, endGoalCell = { col: 0, row: 0, mesh: null };

let menuPhys = {
    arif: { vel: new THREE.Vector3(), rotVel: new THREE.Vector3() },
    ajeng: { vel: new THREE.Vector3(), rotVel: new THREE.Vector3() },
    initialized: false
};

// ── Engine Initialization ───────────────────────────────────

function createFogOverlay() {
    fogOverlay = document.createElement('canvas');
    fogOverlay.id = 'fog-overlay';
    fogOverlay.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:5';
    fogOverlay.width = window.innerWidth;
    fogOverlay.height = window.innerHeight;
    document.getElementById('game-container').appendChild(fogOverlay);
    fogCtx = fogOverlay.getContext('2d');
    window.addEventListener('resize', () => {
        fogOverlay.width = window.innerWidth;
        fogOverlay.height = window.innerHeight;
    });
}

function projectToScreen(worldPos) {
    const v = worldPos.clone();
    v.project(camera);
    return { x: (v.x + 1) / 2 * fogOverlay.width, y: (-v.y + 1) / 2 * fogOverlay.height };
}

function getCharScreenAngle(charGroup) {
    const headPos = new THREE.Vector3(charGroup.position.x, 2.3, charGroup.position.z);
    const rotY = charGroup.rotation.y;
    const facing = new THREE.Vector3(Math.sin(rotY), 0, Math.cos(rotY));
    const aheadPos = headPos.clone().add(facing.multiplyScalar(4));
    const sc0 = projectToScreen(headPos), sc1 = projectToScreen(aheadPos);
    return Math.atan2(sc1.y - sc0.y, sc1.x - sc0.x);
}

function drawFogOverlay() {
    if (!gameStarted) return;
    const W = fogOverlay.width, H = fogOverlay.height;
    fogCtx.clearRect(0, 0, W, H);
    fogCtx.fillStyle = fogOverlay.dataset.fogColor || 'rgba(15,15,18,0.74)';
    fogCtx.fillRect(0, 0, W, H);

    const torchR = (Math.min(W, H) * 0.32) * (window.isSuperTorch ? 1.8 : 1.0);
    const HALF_ANGLE = Math.PI / 4;
    const chars = [
        { group: arif.group, color: '135, 206, 250', visible: true },
        { group: ajeng.group, color: '255, 182, 193', visible: !fusionComplete }
    ];

    fogCtx.globalCompositeOperation = 'destination-out';
    chars.forEach(({ group, color, visible }) => {
        if (!visible) return;
        const headPos = new THREE.Vector3(group.position.x, 2.3, group.position.z);
        const sc = projectToScreen(headPos);
        const angle = getCharScreenAngle(group);
        const grad = fogCtx.createRadialGradient(sc.x, sc.y, 0, sc.x, sc.y, torchR);
        grad.addColorStop(0, 'rgba(255,255,255,1)');
        grad.addColorStop(0.2, 'rgba(255,255,255,0.98)');
        grad.addColorStop(0.5, `rgba(${color}, 0.6)`);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        fogCtx.fillStyle = grad;
        fogCtx.beginPath();
        fogCtx.moveTo(sc.x, sc.y);
        fogCtx.arc(sc.x, sc.y, torchR, angle - HALF_ANGLE, angle + HALF_ANGLE);
        fogCtx.closePath();
        fogCtx.fill();

        // Single consolidated ambient glow around character (safe zone)
        const ambR = torchR * 0.28;
        const ambGrad = fogCtx.createRadialGradient(sc.x, sc.y, 0, sc.x, sc.y, ambR);
        // Blend white center with subtle tinted edge
        ambGrad.addColorStop(0, `rgba(255,255,255,0.88)`);
        ambGrad.addColorStop(0.5, `rgba(${color}, 0.25)`);
        ambGrad.addColorStop(1, 'rgba(0,0,0,0)');

        fogCtx.fillStyle = ambGrad;
        fogCtx.beginPath();
        fogCtx.arc(sc.x, sc.y, ambR, 0, Math.PI * 2);
        fogCtx.fill();

        // Neutral core to punch through fog tint (white center)
        const coreR = ambR * 0.4;
        const coreGrad = fogCtx.createRadialGradient(sc.x, sc.y, 0, sc.x, sc.y, coreR);
        coreGrad.addColorStop(0, 'rgba(255,255,255,0.92)');
        coreGrad.addColorStop(1, 'rgba(255,255,255,0)');
        fogCtx.fillStyle = coreGrad;
        fogCtx.beginPath();
        fogCtx.arc(sc.x, sc.y, coreR, 0, Math.PI * 2);
        fogCtx.fill();
    });
    fogCtx.globalCompositeOperation = 'source-over';
}

function lerpArr(a, b, t) { return a.map((v, i) => v + (b[i] - v) * t); }
function arrToHex(a) { return (Math.round(a[0]) << 16) | (Math.round(a[1]) << 8) | Math.round(a[2]); }
function arrToCSS(a) { return `rgb(${Math.round(a[0])},${Math.round(a[1])},${Math.round(a[2])})`; }

function updateColorTheme(dt) {
    themeTimer += dt;
    if (themeTimer >= THEME_DUR) {
        themeTimer = 0; themeIdx = themeNext;
        themeNext = (themeIdx + 1) % THEMES.length;
    }
    themeT = Math.min(1, themeTimer / (THEME_DUR * 0.35));
    const easedT = themeT * themeT * (3 - 2 * themeT);
    const A = THEMES[themeIdx], B = THEMES[themeNext];
    curFog = lerpArr(A.fog, B.fog, easedT);
    curAmb = lerpArr(A.amb, B.amb, easedT);
    curPink = lerpArr(A.pink, B.pink, easedT);
    curBlue = lerpArr(A.blue, B.blue, easedT);

    const fogCol = arrToHex(curFog);
    if (scene.fog) scene.fog.color.setHex(fogCol);
    scene.background.setHex(fogCol);
    if (ambLight) ambLight.color.setHex(arrToHex(curAmb));

    const root = document.documentElement.style;
    root.setProperty('--pink', arrToCSS(curPink));
    root.setProperty('--blue', arrToCSS(curBlue));
    if (fogCtx) fogOverlay.dataset.fogColor = `rgba(${Math.round(curFog[0])},${Math.round(curFog[1])},${Math.round(curFog[2])},0.76)`;
}

function startGame() {
    if (gameStarted) return;
    gameStarted = true;
    document.getElementById('start-screen').classList.add('hidden');
    const h = document.getElementById('hud'), m = document.getElementById('minimap');
    if (h) h.style.opacity = '1';
    if (m) m.style.opacity = '1';

    updateMobileUIToggle();
    if (scene.fog) scene.fog.density = 0.006;

    arif.group.position.copy(cellToWorld(1, 1));
    arif.group.scale.setScalar(arif.baseScale || 1);
    ajeng.group.position.copy(cellToWorld(MAZE_W - 2, MAZE_H - 2));
    ajeng.group.scale.setScalar(ajeng.baseScale || 1);

    const cx = (MAZE_W - 1) * CELL / 2, cz = (MAZE_H - 1) * CELL / 2;
    if (camTarget) camTarget.set(cx, 0, cz);
    camera.position.set(cx + 80, 80, cz + 80);
    camera.lookAt(cx, 0, cz);

    timerID = setInterval(() => {
        elapsedSec++;
        const el = document.getElementById('timer');
        if (el) el.textContent = formatTime(elapsedSec);
    }, 1000);

    const music = document.getElementById('bg-music');
    if (music) music.play().catch(() => { });

    placeQuestNodes();
    spawnPowerUps();
    spawnHazards();
    updateLives();
    updateQuestStatus();
}

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x01000a);
    scene.fog = new THREE.FogExp2(0x01000a, 0);

    setupCamera();

    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    document.getElementById('game-container').appendChild(renderer.domElement);

    ambLight = new THREE.AmbientLight(0x2a1055, 2.8);
    scene.add(ambLight);
    const dl = new THREE.DirectionalLight(0xaaaaff, 1.4);
    dl.position.set(50, 80, 50);
    scene.add(dl);

    fusionEffect = new FusionEffect();
    const dl2 = new THREE.DirectionalLight(0x551188, 0.7);
    dl2.position.set(-30, 40, -30);
    scene.add(dl2);

    generateMaze();
    buildScene();
    createLoveStarField();
    createAsteroids();

    // --- Maze Floor (Grid) ---
    const floorGeo = new THREE.PlaneGeometry(MAZE_W * CELL, MAZE_H * CELL);
    const floorMat = new THREE.MeshStandardMaterial({
        color: 0x01000a,
        roughness: 0.1,
        metalness: 0.9,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set((MAZE_W - 1) * CELL / 2, -0.05, (MAZE_H - 1) * CELL / 2);
    scene.add(floor);

    // Grid lines for professional depth
    const grid = new THREE.GridHelper(Math.max(MAZE_W, MAZE_H) * CELL, Math.max(MAZE_W, MAZE_H), 0x220044, 0x110022);
    grid.position.set((MAZE_W - 1) * CELL / 2, 0.05, (MAZE_H - 1) * CELL / 2);
    scene.add(grid);

    const MX0 = (MAZE_W - 1) * CELL / 2, MZ0 = (MAZE_H - 1) * CELL / 2;
    menuCam = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 800);
    menuCam.position.set(MX0 - 18, 12, MZ0 + 25);
    menuCam.lookAt(MX0, 6, MZ0);

    createFogOverlay();
    initMinimap();
    setupControls();

    window.addEventListener('resize', () => {
        const aspect = window.innerWidth / window.innerHeight;
        const vw = BASE_VIEW * currentZoom;
        camera.left = -vw * aspect; camera.right = vw * aspect;
        camera.top = vw; camera.bottom = -vw;
        camera.updateProjectionMatrix();

        if (menuCam) {
            menuCam.aspect = aspect;
            menuCam.position.set(MX0, 6, aspect < 1 ? MZ0 + 36 : MZ0 + 22);
            menuCam.lookAt(MX0, 5, MZ0);
            menuCam.updateProjectionMatrix();
        }
        renderer.setSize(window.innerWidth, window.innerHeight);
        if (gameStarted) updateMobileUIToggle();
    });

    const startBtn = document.getElementById('start-button');
    if (startBtn) { startBtn.disabled = true; startBtn.textContent = 'Memuat karakter...'; }

    loadQuestions();
    loadChats();
    loadCharacters(() => {
        if (startBtn) { startBtn.disabled = false; startBtn.textContent = 'Mulai Petualangan '; }
        animate();
    });

    renderer.render(scene, menuCam || camera);
}

// ── Animation Loop ──────────────────────────────────────────

let prevT = performance.now();
function animate() {
    requestAnimationFrame(animate);
    const now = performance.now(), dt = Math.min((now - prevT) / 1000, 0.05);
    prevT = now;
    const t = now / 1000;

    // --- Screen Shake Offset ---
    let shakeX = 0, shakeY = 0;
    if (window.isShaking) {
        shakeX = (Math.random() - 0.5) * 1.5;
        shakeY = (Math.random() - 0.5) * 1.5;
    }

    if (gameStarted && !gameWon) {
        if (!questPaused) {
            updateHazards(dt);
            updatePowerUps(dt, t);
            updateCharTrails(dt);
            if (!arif.moving && !ajeng.moving) {
                // ... (existing move logic)
                const held = getHeldDir();
                if (moveQueue) {
                    tryMove(arif, moveQueue.dc, moveQueue.dr);
                    if (!fusionComplete) tryMove(ajeng, moveQueue.dc, moveQueue.dr);
                    moveQueue = null;
                } else if (held) {
                    tryMove(arif, held.dc, held.dr);
                    if (!fusionComplete) tryMove(ajeng, held.dc, held.dr);
                }
            }
            updateCharPos(arif, dt);
            updateCharPos(ajeng, dt);
            updateCameraTracking(dt);

            // Apply shake to camera
            camera.position.x += shakeX;
            camera.position.z += shakeY;

            checkWin();
            updateHUD();
            drawMinimap();
            checkQuestCollision();
        }
        processChatQueue();
        updateAsteroids(dt);
        spawnThrustParticles(arif, dt);
        if (!fusionComplete) spawnThrustParticles(ajeng, dt);
        drawFogOverlay();

        const hoverY = 0.5 + Math.sin(t * 3.5) * 0.25;
        arif.group.position.y = hoverY;
        ajeng.group.position.y = hoverY + Math.sin(t * 3.5 + 1.5) * 0.1;

        if (!fusionComplete) {
            const d = arif.group.position.distanceTo(ajeng.group.position);
            if (d < 1.3) {
                if (questsAnswered < 4) {
                    triggerGameOver('Arif & Ajeng bersatu terlalu cepat! Selesaikan semua quest dulu.');
                    return;
                }
                if (fusionEffect) {
                    fusionEffect.active = true;
                    fusionEffect.update(arif.group.position.clone().lerp(ajeng.group.position, 0.5), dt);
                }
            } else if (fusionEffect) {
                fusionEffect.active = false;
            }
        } else if (fusionEffect && fusionEffect.active) {
            fusionEffect.update(arif.group.position, dt);
        }
    } else if (!gameStarted) {
        const aspect = window.innerWidth / window.innerHeight;
        const MXm = (MAZE_W - 1) * CELL / 2, MZm = (MAZE_H - 1) * CELL / 2;
        if (!menuPhys.initialized) {
            const initVel = () => new THREE.Vector3((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2);
            menuPhys.arif.vel.copy(initVel());
            menuPhys.ajeng.vel.copy(initVel());
            arif.group.position.set(MXm - 6, 6, MZm + 17);
            ajeng.group.position.set(MXm + 6, 6, MZm + 17);
            menuPhys.initialized = true;
        }
        [arif, ajeng].forEach((c, i) => {
            const phys = i === 0 ? menuPhys.arif : menuPhys.ajeng;
            c.group.position.addScaledVector(phys.vel, dt);
            if (c.group.position.x < MXm - 12 || c.group.position.x > MXm + 12) phys.vel.x *= -1;
            if (c.group.position.y < 5 || c.group.position.y > 10) phys.vel.y *= -1;
            c.group.rotation.y += dt;
        });
        menuSynth.update(dt);
        const startBtn = document.getElementById('start-button');
        if (startBtn && !startBtn.onclick_hooked) {
            startBtn.onclick_hooked = true;
            startBtn.onclick = () => { menuSynth.start(); startGame(); };
        }
    }

    if (arif && ajeng) {
        arif.group.traverse(o => { if (o.isPointLight) o.intensity = 3.5 + Math.sin(t * 4) * 0.6; });
        ajeng.group.traverse(o => { if (o.isPointLight) o.intensity = 3.5 + Math.sin(t * 4 + Math.PI) * 0.6; });
    }
    updateMeteors(dt);
    updateColorTheme(dt);
    updateParticles(dt);
    renderer.render(scene, gameStarted ? camera : (menuCam || camera));
}

// ── Bootstrap ───────────────────────────────────────────────
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
