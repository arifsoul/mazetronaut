// =============================================================
//  ARIF & AJENG: THE REUNION  —  Space Isometric Maze
//  • Single-input dual-character (same direction simultaneously)
//  • Orthographic isometric camera with dynamic zoom
//  • Limited visibility: only character torchlight illuminates
//  • Space theme: deep cosmos + 🩷 love-heart star field
// =============================================================
(function () {
    'use strict';

    // ── Config ─────────────────────────────────────────────────
    const MAZE_W = 25;   // must be odd — bigger maze!
    const MAZE_H = 25;
    const CELL = 4;
    const WALL_H = 3.5;
    const MOVE_SPD = 7.0;  // cells per second
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
    let keyHoldTimer = 0;
    const KEY_REPEAT = 0.17;
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

    // ── Meeting Point & Meteors ──────────────────────────────────
    let meetingPoint = { col: 0, row: 0, mesh: null };
    let meteors = [];     // { mesh, trail[], vel, life, maxLife }
    let meteorTimer = 0;

    // =============================================
    // MAZE GENERATION
    // =============================================
    function generateMaze() {
        mazeData = [];
        for (let r = 0; r < MAZE_H; r++) {
            mazeData.push([]);
            for (let c = 0; c < MAZE_W; c++) mazeData[r].push(1);
        }
        function carve(c, r) {
            mazeData[r][c] = 0;
            const dirs = [[0, -2], [0, 2], [-2, 0], [2, 0]].sort(() => Math.random() - 0.5);
            for (const [dc, dr] of dirs) {
                const nc = c + dc, nr = r + dr;
                if (nc > 0 && nc < MAZE_W - 1 && nr > 0 && nr < MAZE_H - 1 && mazeData[nr][nc] === 1) {
                    mazeData[r + dr / 2][c + dc / 2] = 0;
                    carve(nc, nr);
                }
            }
        }
        carve(1, 1);
        mazeData[1][1] = 0;
        mazeData[MAZE_H - 2][MAZE_W - 2] = 0;
        // Extra openings for playability
        for (let i = 0; i < Math.floor(MAZE_W * MAZE_H * 0.055); i++) {
            const rc = 1 + Math.floor(Math.random() * (MAZE_W - 2));
            const rr = 1 + Math.floor(Math.random() * (MAZE_H - 2));
            mazeData[rr][rc] = 0;
        }

        // Pick a RANDOM meeting point somewhere in the middle-ish area
        let validSpots = [];
        for (let r = 5; r < MAZE_H - 5; r++) {
            for (let c = 5; c < MAZE_W - 5; c++) {
                if (mazeData[r][c] === 0) validSpots.push({ c, r });
            }
        }
        if (validSpots.length === 0) {
            meetingPoint.col = Math.floor(MAZE_W / 2);
            meetingPoint.row = Math.floor(MAZE_H / 2);
            mazeData[meetingPoint.row][meetingPoint.col] = 0;
        } else {
            const spot = validSpots[Math.floor(Math.random() * validSpots.length)];
            meetingPoint.col = spot.c;
            meetingPoint.row = spot.r;
        }
    }

    function isWallCell(c, r) {
        if (c < 0 || c >= MAZE_W || r < 0 || r >= MAZE_H) return true;
        return mazeData[r][c] === 1;
    }

    function cellToWorld(c, r) {
        return new THREE.Vector3(c * CELL, 0, r * CELL);
    }

    // =============================================
    // CAMERA — Isometric Orthographic + Dynamic Zoom
    // =============================================
    function setupCamera() {
        const aspect = window.innerWidth / window.innerHeight;
        camera = new THREE.OrthographicCamera(
            -BASE_VIEW * aspect, BASE_VIEW * aspect,
            BASE_VIEW, -BASE_VIEW,
            0.1, 1500
        );
        const cx = (MAZE_W - 1) * CELL / 2;
        const cz = (MAZE_H - 1) * CELL / 2;
        camTarget = new THREE.Vector3(cx, 0, cz);
        camera.position.set(cx + 80, 80, cz + 80);
        camera.lookAt(camTarget);
        camera.updateProjectionMatrix();
    }

    // Camera tracking by character world positions — never crops characters
    function updateCameraTracking(dt) {
        if (!arif || !ajeng) return;

        // Actual world positions (smooth movement already in group.position)
        const pA = new THREE.Vector3(arif.group.position.x, 0, arif.group.position.z);
        const pJ = new THREE.Vector3(ajeng.group.position.x, 0, ajeng.group.position.z);

        // Midpoint between both characters
        const mid = pA.clone().add(pJ).multiplyScalar(0.5);

        // World distance
        const worldDist = pA.distanceTo(pJ);

        // Smooth camera look-at target → midpoint
        if (!camTarget) camTarget = mid.clone();
        camTarget.lerp(mid, Math.min(1, dt * 2.2));

        // Required frustum = half of world dist + generous padding
        // Minimum = 5 cells so we're never too tight even when they meet
        const minF = CELL * 6;
        const required = Math.max(minF, worldDist * 0.62 + CELL * 4);
        // Global zoom-out cap for portrait
        const aspect = window.innerWidth / window.innerHeight;
        const portraitScale = aspect < 1 ? Math.max(1, 1.15 / aspect) : 1;
        const cap = BASE_VIEW * portraitScale;
        const targetFrustum = Math.min(cap, required);
        currentFrustum += (targetFrustum - currentFrustum) * Math.min(1, dt * 1.6);

        // Move camera to keep isometric angle, tracking midpoint
        const ISO_OFFSET = new THREE.Vector3(80, 80, 80);
        camera.position.copy(camTarget.clone().add(ISO_OFFSET));
        camera.lookAt(camTarget);

        const vw = currentFrustum;
        camera.left = -vw * aspect;
        camera.right = vw * aspect;
        camera.top = vw;
        camera.bottom = -vw;
        camera.updateProjectionMatrix();
    }

    // =============================================
    // 🩷 LOVE-STAR FIELD (Space Background)
    // =============================================
    function createLoveStarField() {
        // Canvas texture: tiny 🩷 emoji
        const cvs = document.createElement('canvas');
        cvs.width = 64; cvs.height = 64;
        const ctx = cvs.getContext('2d');
        ctx.clearRect(0, 0, 64, 64);
        // Draw glowing pink heart
        ctx.shadowColor = '#ff69b4';
        ctx.shadowBlur = 12;
        ctx.font = '36px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🩷', 32, 32);
        const tex = new THREE.CanvasTexture(cvs);

        // Scatter stars in a wide volume above and around the maze
        const starCount = 800;
        const positions = new Float32Array(starCount * 3);
        const sizes = new Float32Array(starCount);
        const MX = MAZE_W * CELL;
        const MZ = MAZE_H * CELL;

        for (let i = 0; i < starCount; i++) {
            positions[i * 3 + 0] = (Math.random() - 0.5) * MX * 3.5;
            positions[i * 3 + 1] = 10 + Math.random() * 80;
            positions[i * 3 + 2] = (Math.random() - 0.5) * MZ * 3.5;
            sizes[i] = 1.5 + Math.random() * 4.5;
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

        const mat = new THREE.PointsMaterial({
            map: tex,
            size: 5,
            transparent: true,
            opacity: 0.75,
            sizeAttenuation: true,
            depthWrite: false,
            alphaTest: 0.05,
            blending: THREE.AdditiveBlending
        });

        const stars = new THREE.Points(geo, mat);
        scene.add(stars);

        // Also add distant nebula planes (colored glow sheets)
        addNebulaPlanes();
        return stars;
    }

    function addNebulaPlanes() {
        const nebulaColors = [0x3a0060, 0x001a50, 0x500020, 0x002040];
        const MX = MAZE_W * CELL;
        const MZ = MAZE_H * CELL;
        nebulaColors.forEach((c, i) => {
            const geo = new THREE.PlaneGeometry(MX * 1.6, MZ * 1.6);
            const mat = new THREE.MeshBasicMaterial({
                color: c, transparent: true, opacity: 0.07 + Math.random() * 0.07,
                side: THREE.DoubleSide, depthWrite: false
            });
            const pl = new THREE.Mesh(geo, mat);
            pl.position.set(
                MX / 2 + (Math.random() - 0.5) * MX * 0.5,
                35 + i * 12,
                MZ / 2 + (Math.random() - 0.5) * MZ * 0.5
            );
            pl.rotation.set(
                (Math.random() - 0.5) * 0.5,
                Math.random() * Math.PI,
                (Math.random() - 0.5) * 0.5
            );
            scene.add(pl);
        });
    }

    // =============================================
    // BUILD SCENE — Space Maze
    // =============================================
    function buildScene() {
        // Floor — dark cosmic tiles
        const fg = new THREE.PlaneGeometry(MAZE_W * CELL + 2, MAZE_H * CELL + 2);
        const fm = new THREE.MeshStandardMaterial({ color: 0x02000d, roughness: 0.95 });
        const fl = new THREE.Mesh(fg, fm);
        fl.rotation.x = -Math.PI / 2;
        fl.position.set((MAZE_W - 1) * CELL / 2, -0.05, (MAZE_H - 1) * CELL / 2);
        scene.add(fl);

        // Grid lines on floor (subtle space grid)
        const gridHelper = new THREE.GridHelper(
            Math.max(MAZE_W, MAZE_H) * CELL, Math.max(MAZE_W, MAZE_H),
            0x1a0040, 0x0a0020
        );
        gridHelper.position.set((MAZE_W - 1) * CELL / 2, 0.01, (MAZE_H - 1) * CELL / 2);
        scene.add(gridHelper);

        // Walls — deep space crystal style
        let wallCount = 0;
        for (let r = 0; r < MAZE_H; r++) for (let c = 0; c < MAZE_W; c++) if (mazeData[r][c] === 1) wallCount++;

        const wg = new THREE.BoxGeometry(CELL, WALL_H, CELL);
        const wm = new THREE.MeshStandardMaterial({
            color: 0x0e0028,
            emissive: 0x2a0050,
            emissiveIntensity: 0.3,
            roughness: 0.15,
            metalness: 0.8
        });
        const iw = new THREE.InstancedMesh(wg, wm, wallCount);
        const dummy = new THREE.Object3D();
        let idx = 0;
        for (let r = 0; r < MAZE_H; r++) {
            for (let c = 0; c < MAZE_W; c++) {
                if (mazeData[r][c] === 1) {
                    dummy.position.set(c * CELL, WALL_H / 2, r * CELL);
                    dummy.updateMatrix();
                    iw.setMatrixAt(idx++, dummy.matrix);
                }
            }
        }
        iw.instanceMatrix.needsUpdate = true;
        scene.add(iw);

        // Wall top caps — glowing cosmic purple/blue edge
        const topG = new THREE.PlaneGeometry(CELL - 0.1, CELL - 0.1);
        const topM = new THREE.MeshBasicMaterial({
            color: 0x7722ff, transparent: true, opacity: 0.45
        });
        for (let r = 0; r < MAZE_H; r++) {
            for (let c = 0; c < MAZE_W; c++) {
                if (mazeData[r][c] === 1) {
                    const cap = new THREE.Mesh(topG, topM);
                    cap.rotation.x = -Math.PI / 2;
                    cap.position.set(c * CELL, WALL_H + 0.01, r * CELL);
                    scene.add(cap);
                }
            }
        }

        // --- Random Meeting Point Marker ---
        const heartG = new THREE.SphereGeometry(1.2, 24, 24);
        const heartM = new THREE.MeshStandardMaterial({
            color: 0xff4d6d,
            emissive: 0xff0044,
            emissiveIntensity: 1.8,
            roughness: 0.2,
            metalness: 0.5
        });
        meetingPoint.mesh = new THREE.Mesh(heartG, heartM);
        meetingPoint.mesh.position.set(meetingPoint.col * CELL, 3.2, meetingPoint.row * CELL);
        scene.add(meetingPoint.mesh);

        // Add a point light to the meeting point
        const hLight = new THREE.PointLight(0xff4d6d, 6, 18);
        hLight.position.set(meetingPoint.col * CELL, 5, meetingPoint.row * CELL);
        scene.add(hLight);

        // MeetRing base for meeting point
        const meetRingG = new THREE.TorusGeometry(2.0, 0.15, 16, 64);
        const meetRingM = new THREE.MeshStandardMaterial({ color: 0xffb3c1, emissive: 0xffb3c1, emissiveIntensity: 0.8 });
        const meetRing = new THREE.Mesh(meetRingG, meetRingM);
        meetRing.rotation.x = -Math.PI / 2;
        meetRing.position.set(meetingPoint.col * CELL, 0.15, meetingPoint.row * CELL);
        scene.add(meetRing);

        // Floor corridor love dots (scattered tiny hearts)
        const dotG = new THREE.PlaneGeometry(0.55, 0.55);
        for (let r = 0; r < MAZE_H; r++) {
            for (let c = 0; c < MAZE_W; c++) {
                if (mazeData[r][c] === 0 && Math.random() < 0.065) {
                    const col = Math.random() < 0.5 ? 0xff69b4 : 0x8888ff;
                    const dotM = new THREE.MeshBasicMaterial({
                        color: col, transparent: true, opacity: 0.2
                    });
                    const dot = new THREE.Mesh(dotG, dotM);
                    dot.rotation.x = -Math.PI / 2;
                    dot.position.set(c * CELL, 0.02, r * CELL);
                    scene.add(dot);
                }
            }
        }

        // Meeting zone: pulsing ring at maze center
        const rg = new THREE.RingGeometry(CELL * 0.5, CELL * 0.85, 32);
        const rm = new THREE.MeshBasicMaterial({ color: 0xff69b4, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
        const ring = new THREE.Mesh(rg, rm);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set((MAZE_W - 1) * CELL / 2, 0.06, (MAZE_H - 1) * CELL / 2);
        ring.userData.isGoal = true;
        scene.add(ring);
    }

    // =============================================
    // 3D CHARACTERS — Space Theme
    // =============================================

    function lightenColor(hex, a) {
        const r = Math.min(255, ((hex >> 16) & 0xff) + Math.round(a * 255));
        const gv = Math.min(255, ((hex >> 8) & 0xff) + Math.round(a * 255));
        const b = Math.min(255, (hex & 0xff) + Math.round(a * 255));
        return (r << 16) | (gv << 8) | b;
    }

    function addLight(g, color, intensity, dist, px, py, pz) {
        const l = new THREE.PointLight(color, intensity, dist, 1.8);
        l.position.set(px, py, pz);
        g.add(l);
        return l;
    }

    // ── Arif: Space Explorer Astronaut ─────────────────────────
    function makeChibiBoy(color) {
        const g = new THREE.Group();

        const suitM = new THREE.MeshStandardMaterial({ color: 0x1a3a6e, emissive: 0x0a1a3e, roughness: 0.3, metalness: 0.7 });
        const accentM = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.7, roughness: 0.2, metalness: 0.8 });
        const helmetM = new THREE.MeshStandardMaterial({ color: 0xe8f0ff, roughness: 0.05, metalness: 0.9, transparent: true, opacity: 0.85 });
        const visorM = new THREE.MeshStandardMaterial({ color: 0x002255, emissive: color, emissiveIntensity: 0.4, roughness: 0.05, metalness: 1.0, transparent: true, opacity: 0.7 });
        const skinM = new THREE.MeshStandardMaterial({ color: 0xffd5b0, roughness: 0.6 });

        // --- Boots ---
        const bootG = new THREE.BoxGeometry(0.38, 0.22, 0.48);
        const bootM = new THREE.MeshStandardMaterial({ color: 0x0d1f3c, roughness: 0.4, metalness: 0.6 });
        [[-0.27], [0.27]].forEach(([x]) => { const m = new THREE.Mesh(bootG, bootM); m.position.set(x, 0.11, 0.05); g.add(m); });

        // --- Legs ---
        const legG = new THREE.CylinderGeometry(0.2, 0.22, 0.65, 10);
        [[-0.27], [0.27]].forEach(([x]) => { const m = new THREE.Mesh(legG, suitM); m.position.set(x, 0.55, 0); g.add(m); });
        // Leg stripe
        const stripeL = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.65, 0.25), accentM);
        [[-0.05], [0.05]].forEach(([z]) => {
            const cl = stripeL.clone(); cl.position.set(-0.27, 0.55, z); g.add(cl);
            const cr = stripeL.clone(); cr.position.set(0.27, 0.55, z); g.add(cr);
        });

        // --- Torso / Space Suit main body ---
        const torso = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.1, 0.7), suitM); torso.position.y = 1.05; g.add(torso);
        // Chest panel (glowing computer)
        const panel = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.4, 0.08),
            new THREE.MeshStandardMaterial({ color: color, emissive: color, emissiveIntensity: 0.9, roughness: 0.1, metalness: 0.5 }));
        panel.position.set(0, 1.12, 0.38); g.add(panel);
        // Chest circle indicator
        const ind = new THREE.Mesh(new THREE.CircleGeometry(0.1, 16),
            new THREE.MeshBasicMaterial({ color: 0x00ffcc, side: THREE.DoubleSide }));
        ind.position.set(0, 1.25, 0.395); g.add(ind);
        // Shoulder pads
        const padG = new THREE.SphereGeometry(0.3, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.6);
        const padM = new THREE.MeshStandardMaterial({ color: 0x2255aa, roughness: 0.3, metalness: 0.8 });
        [[-0.62], [0.62]].forEach(([x]) => { const p = new THREE.Mesh(padG, padM); p.position.set(x, 1.35, 0); g.add(p); });

        // --- Arms ---
        const armG = new THREE.CylinderGeometry(0.16, 0.19, 0.72, 10);
        [[-0.7], [0.7]].forEach(([x]) => { const m = new THREE.Mesh(armG, suitM); m.position.set(x, 0.95, -0.02); g.add(m); });
        // Gloves
        const gloveG = new THREE.SphereGeometry(0.22, 10, 8);
        const gloveM = new THREE.MeshStandardMaterial({ color: 0xddddff, roughness: 0.4, metalness: 0.5 });
        [[-0.7], [0.7]].forEach(([x]) => { const m = new THREE.Mesh(gloveG, gloveM); m.position.set(x, 0.56, 0); g.add(m); });

        // --- Helmet (big round astronaut helmet) ---
        const helm = new THREE.Mesh(new THREE.SphereGeometry(0.88, 22, 22), helmetM); helm.position.set(0, 2.35, 0); g.add(helm);
        // Helmet neck ring
        const neckRing = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.1, 10, 24),
            new THREE.MeshStandardMaterial({ color: 0xaabbdd, roughness: 0.2, metalness: 0.9 }));
        neckRing.rotation.x = Math.PI / 2; neckRing.position.set(0, 1.72, 0); g.add(neckRing);
        // Visor (front face of helmet)
        const visor = new THREE.Mesh(new THREE.SphereGeometry(0.75, 20, 20,
            -Math.PI * 0.38, Math.PI * 0.76, Math.PI * 0.28, Math.PI * 0.45), visorM);
        visor.position.set(0, 2.35, 0); g.add(visor);
        // Face inside visor
        const eyeM = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const pupM = new THREE.MeshBasicMaterial({ color: 0x002244 });
        [[-0.22], [0.22]].forEach(([x]) => {
            const eye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), eyeM); eye.position.set(x, 2.38, 0.72); g.add(eye);
            const pup = new THREE.Mesh(new THREE.SphereGeometry(0.055, 7, 7), pupM); pup.position.set(x, 2.38, 0.77); g.add(pup);
        });
        // Smile inside visor
        const smileArc = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.025, 6, 16, Math.PI),
            new THREE.MeshBasicMaterial({ color: 0xffbbbb }));
        smileArc.rotation.z = Math.PI; smileArc.position.set(0, 2.25, 0.74); g.add(smileArc);

        // --- Backpack / Jetpack ---
        const pack = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.3),
            new THREE.MeshStandardMaterial({ color: 0x112244, roughness: 0.3, metalness: 0.8 }));
        pack.position.set(0, 1.1, -0.5); g.add(pack);
        // Thruster nozzles
        [[-0.22], [0.22]].forEach(([x]) => {
            const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.07, 0.28, 12),
                new THREE.MeshStandardMaterial({ color: 0xaaaacc, metalness: 1.0, roughness: 0.1 }));
            nozzle.rotation.x = Math.PI / 2; nozzle.position.set(x, 0.75, -0.62); g.add(nozzle);
            // Thruster glow
            const glowM = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6 });
            const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.12, 0.3, 12), glowM);
            glow.rotation.x = Math.PI / 2; glow.position.set(x, 0.75, -0.78); g.add(glow);
        });

        // --- Flag antenna ---
        const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.55, 6),
            new THREE.MeshBasicMaterial({ color: 0xaaaaff }));
        ant.position.set(0.6, 2.95, 0); g.add(ant);
        const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.2),
            new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
        flag.position.set(0.76, 3.1, 0); g.add(flag);

        // --- Glow aura ---
        g.add(new THREE.Mesh(new THREE.SphereGeometry(1.8, 12, 12),
            new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.06, side: THREE.BackSide })));

        // Torchlight
        addLight(g, color, 4.5, LIGHT_RANGE, 0, 5, 0);
        return g;
    }

    // ── Ajeng: Cosmic Princess ──────────────────────────────────
    function makeChibiGirl(color) {
        const g = new THREE.Group();

        const dressM = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.45, roughness: 0.2, metalness: 0.5 });
        const dressM2 = new THREE.MeshStandardMaterial({
            color: lightenColor(color, 0.25), emissive: color, emissiveIntensity: 0.25,
            roughness: 0.15, metalness: 0.6, transparent: true, opacity: 0.9
        });
        const skinM = new THREE.MeshStandardMaterial({ color: 0xffd5b0, roughness: 0.6 });
        const hairM = new THREE.MeshStandardMaterial({ color: 0x0d0005, roughness: 0.5 });
        const crystalM = new THREE.MeshStandardMaterial({
            color: 0xffffff, emissive: color, emissiveIntensity: 0.8,
            roughness: 0.0, metalness: 1.0, transparent: true, opacity: 0.85
        });

        // --- Heels ---
        const heelM = new THREE.MeshStandardMaterial({ color: lightenColor(color, 0.1), roughness: 0.2, metalness: 0.8 });
        [[-0.23], [0.23]].forEach(([x]) => {
            const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.12, 0.38), heelM); shoe.position.set(x, 0.06, 0.03); g.add(shoe);
            const heel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.18, 8), heelM); heel.position.set(x, 0.09, -0.2); g.add(heel);
        });

        // --- Legs ---
        [[-0.23], [0.23]].forEach(([x]) => {
            const l = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.44, 10), skinM);
            l.position.set(x, 0.34, 0); g.add(l);
        });

        // --- Tiered dress (3 layers, widening downward) ---
        [[0.22, 1.1, 0.75, 0.55],
        [0.42, 0.82, 1.3, 0.9],
        [0.0, 0.5, 1.6, 1.1]].forEach(([y, h, sx, sz]) => {
            const tier = new THREE.Mesh(new THREE.CylinderGeometry(sx * 0.55, sz * 0.55, h, 18), dressM2);
            tier.position.set(0, y, 0); g.add(tier);
        });
        // Star sparkles on dress
        for (let i = 0; i < 8; i++) {
            const sp = new THREE.Mesh(new THREE.OctahedronGeometry(0.06, 0), crystalM);
            const angle = i * Math.PI * 0.25;
            sp.position.set(Math.cos(angle) * 0.5, 0.3 + Math.random() * 0.6, Math.sin(angle) * 0.35);
            g.add(sp);
        }

        // --- Bodice ---
        const bodice = new THREE.Mesh(new THREE.BoxGeometry(0.88, 1.0, 0.62), dressM); bodice.position.y = 0.95; g.add(bodice);
        // Star necklace
        const neck = new THREE.Mesh(new THREE.OctahedronGeometry(0.14, 0), crystalM);
        neck.position.set(0, 1.62, 0.35); g.add(neck);

        // --- Arms ---
        const armG = new THREE.CylinderGeometry(0.13, 0.16, 0.72, 10);
        [[-0.6], [0.6]].forEach(([x], i) => {
            const a = new THREE.Mesh(armG, dressM); a.position.set(x, 0.95, 0);
            a.rotation.z = i === 0 ? 0.15 : -0.15; g.add(a);
        });
        // Wrist bracelets
        const bracM = new THREE.MeshStandardMaterial({ color: 0xffeedd, emissive: color, emissiveIntensity: 0.5, roughness: 0.1, metalness: 1 });
        [[-0.62], [0.62]].forEach(([x]) => {
            const br = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.04, 8, 14), bracM);
            br.rotation.x = Math.PI / 2; br.position.set(x, 0.56, 0); g.add(br);
        });

        // --- Head ---
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.76, 22, 22), skinM); head.position.y = 2.1; g.add(head);

        // --- Long flowing hair ---
        const hairBase = new THREE.Mesh(new THREE.SphereGeometry(0.79, 18, 18), hairM);
        hairBase.scale.set(1.04, 1.05, 1.04); hairBase.position.y = 2.06; g.add(hairBase);
        // Hair flowing down back
        const hairFlow = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.25, 1.4, 14), hairM);
        hairFlow.position.set(0, 1.5, -0.15); g.add(hairFlow);
        // Hair side strands
        [[-0.55], [0.55]].forEach(([x]) => {
            const strand = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.06, 0.8, 8), hairM);
            strand.position.set(x, 1.65, 0); g.add(strand);
        });

        // --- Crown / Tiara ---
        const crownBase = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.06, 8, 24),
            new THREE.MeshStandardMaterial({ color: 0xffd700, emissive: 0xffaa00, emissiveIntensity: 0.5, roughness: 0.1, metalness: 1 }));
        crownBase.rotation.x = Math.PI / 2; crownBase.position.set(0, 2.72, 0); g.add(crownBase);
        // Crown spires
        [[0, 0.22], [Math.PI * 0.5, 0.18], [Math.PI, 0.22], [-Math.PI * 0.5, 0.18]].forEach(([angle, height]) => {
            const spire = new THREE.Mesh(new THREE.OctahedronGeometry(0.1, 0), crystalM);
            spire.position.set(Math.cos(angle) * 0.55, 2.72 + height, Math.sin(angle) * 0.55);
            g.add(spire);
        });
        // Center large crystal
        const centerCrystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.18, 0), crystalM);
        centerCrystal.position.set(0, 2.98, 0.42); g.add(centerCrystal);

        // --- Big sparkle eyes ---
        const iris = new THREE.MeshBasicMaterial({ color: lightenColor(color, 0.3) });
        const pupil = new THREE.MeshBasicMaterial({ color: 0x110022 });
        const shine = new THREE.MeshBasicMaterial({ color: 0xffffff });
        [[-0.27], [0.27]].forEach(([x], i) => {
            const eye = new THREE.Mesh(new THREE.SphereGeometry(0.185, 12, 12), iris); eye.position.set(x, 2.18, 0.65); g.add(eye);
            const pup = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), pupil); pup.position.set(x, 2.17, 0.71); g.add(pup);
            const sh = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), shine); sh.position.set(i ? x + 0.06 : x - 0.06, 2.23, 0.75); g.add(sh);
        });
        // Rosy blush
        const blM = new THREE.MeshBasicMaterial({ color: 0xff88cc, transparent: true, opacity: 0.65, side: THREE.DoubleSide });
        [[-0.48], [0.48]].forEach(([x], i) => {
            const b = new THREE.Mesh(new THREE.CircleGeometry(0.17, 12), blM);
            b.position.set(x, 2.05, 0.64); b.rotation.y = i ? -0.4 : 0.4; g.add(b);
        });
        // Little smile
        const smileM = new THREE.MeshBasicMaterial({ color: 0xffaaaa });
        const smile = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.025, 6, 14, Math.PI), smileM);
        smile.rotation.z = Math.PI; smile.position.set(0, 2.06, 0.73); g.add(smile);

        // --- Magic wand ---
        const wandM = new THREE.MeshStandardMaterial({ color: 0xffd700, emissive: 0xffaa00, emissiveIntensity: 0.6, roughness: 0.2, metalness: 0.9 });
        const wand = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.028, 1.2, 8), wandM);
        wand.position.set(0.72, 1.1, 0.1); wand.rotation.z = -0.3; g.add(wand);
        const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), crystalM);
        star.position.set(0.85, 1.76, 0.1); g.add(star);

        // --- Cosmic energy aura ---
        g.add(new THREE.Mesh(new THREE.SphereGeometry(2.0, 12, 12),
            new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.05, side: THREE.BackSide })));

        // Torch light
        addLight(g, color, 4.5, LIGHT_RANGE, 0, 5, 0);
        return g;
    }

    // =============================================
    // GRID MOVEMENT
    // =============================================
    function tryMove(char, dc, dr) {
        if (char.moving) return;
        const nc = char.col + dc, nr = char.row + dr;
        if (!isWallCell(nc, nr)) { char.targetCol = nc; char.targetRow = nr; char.moving = true; }
    }

    function updateCharPos(char, dt) {
        if (!char.moving) return;
        const tw = cellToWorld(char.targetCol, char.targetRow);
        const dir = new THREE.Vector3().subVectors(tw, char.group.position);
        const dist = dir.length();
        const step = MOVE_SPD * CELL * dt;
        if (dist <= step) {
            char.group.position.copy(tw);
            char.col = char.targetCol; char.row = char.targetRow; char.moving = false;
        } else {
            dir.normalize().multiplyScalar(step);
            char.group.position.add(dir);
        }
        if (dist > 0.01) {
            const angle = Math.atan2(tw.x - char.group.position.x, tw.z - char.group.position.z);
            char.group.rotation.y += (angle - char.group.rotation.y) * 0.2;
        }
    }

    // =============================================
    // MINIMAP
    // =============================================
    function initMinimap() {
        minimapCvs = document.getElementById('minimap');
        minimapCtx = minimapCvs.getContext('2d');
    }

    function drawMinimap() {
        const mc = minimapCtx, S = minimapCvs.width;
        const cp = S / Math.max(MAZE_W, MAZE_H);
        mc.clearRect(0, 0, S, S);
        // Background
        mc.fillStyle = '#02000d'; mc.fillRect(0, 0, S, S);
        // Cells
        for (let r = 0; r < MAZE_H; r++) {
            for (let c = 0; c < MAZE_W; c++) {
                mc.fillStyle = mazeData[r][c] === 1 ? '#1a0040' : '#0a0020';
                mc.fillRect(c * cp, r * cp, cp - 0.3, cp - 0.3);
            }
        }
        // Limited visibility fog (dark overlay, cleared around chars)
        mc.fillStyle = 'rgba(0,0,10,0.75)';
        mc.fillRect(0, 0, S, S);
        const vr = 3; // visible radius in cells
        const drawFog = (col, row, color) => {
            const gx = col * cp + cp / 2, gz = row * cp + cp / 2;
            const grad = mc.createRadialGradient(gx, gz, 0, gx, gz, vr * cp);
            grad.addColorStop(0, 'rgba(0,0,0,0)');
            grad.addColorStop(1, 'rgba(0,0,10,0.85)');
            // Clear in circle
            mc.save(); mc.globalCompositeOperation = 'destination-out';
            mc.beginPath(); mc.arc(gx, gz, vr * cp, 0, Math.PI * 2); mc.fill();
            mc.restore();
            // Re-draw cells in visible zone
            for (let dr = -vr; dr <= vr; dr++) {
                for (let dc = -vr; dc <= vr; dc++) {
                    const cc2 = col + dc, rr2 = row + dr;
                    if (cc2 < 0 || cc2 >= MAZE_W || rr2 < 0 || rr2 >= MAZE_H) continue;
                    const dist2 = Math.sqrt(dc * dc + dr * dr);
                    if (dist2 > vr) continue;
                    mc.fillStyle = mazeData[rr2][cc2] === 1 ? '#3a0070' : '#0f0030';
                    mc.fillRect(cc2 * cp, rr2 * cp, cp - 0.3, cp - 0.3);
                }
            }
        };
        // Two-pass: first layer visible areas
        mc.save(); mc.globalCompositeOperation = 'source-over';
        mc.fillStyle = 'rgba(0,0,10,0.78)'; mc.fillRect(0, 0, S, S);
        mc.restore();
        drawFog(arif.col, arif.row, '#00aaff');
        drawFog(ajeng.col, ajeng.row, '#ff4d6d');
        // Dots
        const dotR = cp * 0.75;
        mc.fillStyle = '#00aaff'; mc.beginPath(); mc.arc(arif.col * cp + cp / 2, arif.row * cp + cp / 2, dotR, 0, Math.PI * 2); mc.fill();
        mc.fillStyle = '#ff4d6d'; mc.beginPath(); mc.arc(ajeng.col * cp + cp / 2, ajeng.row * cp + cp / 2, dotR, 0, Math.PI * 2); mc.fill();
        // Line
        mc.strokeStyle = 'rgba(255,150,185,0.3)'; mc.lineWidth = 1; mc.setLineDash([2, 2]);
        mc.beginPath(); mc.moveTo(arif.col * cp + cp / 2, arif.row * cp + cp / 2); mc.lineTo(ajeng.col * cp + cp / 2, ajeng.row * cp + cp / 2); mc.stroke(); mc.setLineDash([]);
    }

    // =============================================
    // HUD
    // =============================================
    function updateHUD() {
        const wA = cellToWorld(arif.col, arif.row);
        const wJ = cellToWorld(ajeng.col, ajeng.row);
        const wM = cellToWorld(meetingPoint.col, meetingPoint.row);

        const distA = wA.distanceTo(wM) / CELL;
        const distJ = wJ.distanceTo(wM) / CELL;

        const totalDist = distA + distJ;
        const maxPossible = Math.sqrt(MAZE_W ** 2 + MAZE_H ** 2) * 1.5;
        const pct = Math.max(0, Math.min(100, (1 - totalDist / maxPossible) * 100));

        const bar = document.getElementById('love-bar-fill');
        const lbl = document.getElementById('dist-label');
        if (bar) bar.style.width = pct.toFixed(1) + '%';
        if (lbl) lbl.textContent = `Arif: ${Math.floor(distA)} sel | Ajeng: ${Math.floor(distJ)} sel`;
        return totalDist;
    }

    function formatTime(s) {
        return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
    }

    // =============================================
    // WIN + PARTICLES
    // =============================================
    function checkWin() {
        const wA = cellToWorld(arif.col, arif.row);
        const wJ = cellToWorld(ajeng.col, ajeng.row);
        const wM = cellToWorld(meetingPoint.col, meetingPoint.row);

        // Characters must BOTH be close to the meeting point
        const distA = wA.distanceTo(wM);
        const distJ = wJ.distanceTo(wM);

        if (distA < WIN_DIST && distJ < WIN_DIST && !gameWon) {
            gameWon = true;
            clearInterval(timerID);
            spawnParticles(wM.clone().add(new THREE.Vector3(0, 1.5, 0)));
            setTimeout(() => {
                document.getElementById('win-screen').classList.remove('hidden');
                const wt = document.getElementById('win-time');
                if (wt) wt.textContent = formatTime(elapsedSec);
            }, 900);
        }
    }

    function spawnParticles(mid) {
        mid.y = 2;
        for (let i = 0; i < 50; i++) {
            const geo = new THREE.SphereGeometry(Math.random() * 0.3 + 0.1, 6, 6);
            const mat = new THREE.MeshBasicMaterial({
                color: [0xff4d6d, 0xffb3c1, 0x8888ff, 0xffd700, 0xff69b4][Math.floor(Math.random() * 5)],
                transparent: true
            });
            const p = new THREE.Mesh(geo, mat);
            p.position.copy(mid);
            const vel = new THREE.Vector3((Math.random() - .5) * 7, Math.random() * 8 + 2, (Math.random() - .5) * 7);
            particles.push({ mesh: p, vel, life: 1.0 });
            scene.add(p);
        }
    }

    function updateParticles(dt) {
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.life -= dt * 0.85;
            p.vel.y -= 9 * dt;
            p.mesh.position.addScaledVector(p.vel, dt);
            p.mesh.material.opacity = Math.max(0, p.life);
            if (p.life <= 0) { scene.remove(p.mesh); particles.splice(i, 1); }
        }
    }

    // =============================================
    // CONTROLS
    // =============================================
    function setKeyState(key, val) {
        if (key === 'ArrowUp' || key === 'w' || key === 'W') heldKeys.up = val;
        if (key === 'ArrowDown' || key === 's' || key === 'S') heldKeys.down = val;
        if (key === 'ArrowLeft' || key === 'a' || key === 'A') heldKeys.left = val;
        if (key === 'ArrowRight' || key === 'd' || key === 'D') heldKeys.right = val;
    }
    function getHeldDir() {
        if (heldKeys.up) return { dc: 0, dr: -1 };
        if (heldKeys.down) return { dc: 0, dr: 1 };
        if (heldKeys.left) return { dc: -1, dr: 0 };
        if (heldKeys.right) return { dc: 1, dr: 0 };
        return null;
    }

    function setupControls() {
        window.addEventListener('keydown', e => {
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
            if (!e.repeat) { setKeyState(e.key, true); const d = getHeldDir(); if (d) { moveQueue = d; keyHoldTimer = 0; } }
            if (!gameStarted) startGame();
        });
        window.addEventListener('keyup', e => setKeyState(e.key, false));
        document.getElementById('start-button').onclick = startGame;
        document.getElementById('restart-button').onclick = () => location.reload();
        setupJoystick();
    }

    // =============================================
    // ANALOG JOYSTICK
    // =============================================
    function setupJoystick() {
        const base = document.getElementById('joystick-base');
        const knob = document.getElementById('joystick-knob');
        if (!base || !knob) return;

        const DEAD = 12;   // px deadzone
        const MAX_DISP = 38;   // max knob displacement
        let touching = false;
        let joyOriginX = 0, joyOriginY = 0;  // pointer start in client coords

        function getDir(dx, dy) {
            const mag = Math.sqrt(dx * dx + dy * dy);
            if (mag < DEAD) return null;
            const deg = ((Math.atan2(dy, dx) * 180 / Math.PI) + 360) % 360;
            if (deg >= 315 || deg < 45) return { dc: 1, dr: 0 };  // right
            if (deg >= 45 && deg < 135) return { dc: 0, dr: 1 };  // down
            if (deg >= 135 && deg < 225) return { dc: -1, dr: 0 };  // left
            return { dc: 0, dr: -1 };  // up
        }

        function moveKnob(dx, dy) {
            const mag = Math.sqrt(dx * dx + dy * dy);
            const ratio = mag > 0 ? Math.min(1, MAX_DISP / mag) : 0;
            knob.style.transform = `translate(calc(-50% + ${dx * ratio}px), calc(-50% + ${dy * ratio}px))`;
        }

        function resetKnob() {
            knob.style.transform = 'translate(-50%, -50%)';
            knob.classList.remove('active');
            Object.assign(heldKeys, { up: false, down: false, left: false, right: false });
            touching = false;
        }

        base.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            touching = true;
            joyOriginX = e.clientX;
            joyOriginY = e.clientY;
            base.setPointerCapture(e.pointerId);
            knob.classList.add('active');
            if (!gameStarted) startGame();
        });

        base.addEventListener('pointermove', (e) => {
            if (!touching) return;
            e.preventDefault();
            const dx = e.clientX - joyOriginX;
            const dy = e.clientY - joyOriginY;
            moveKnob(dx, dy);

            const dir = getDir(dx, dy);
            if (dir) {
                heldKeys.up = dir.dr < 0;
                heldKeys.down = dir.dr > 0;
                heldKeys.left = dir.dc < 0;
                heldKeys.right = dir.dc > 0;
                if (!arif.moving && !ajeng.moving) {
                    moveQueue = dir;
                    keyHoldTimer = 0;
                }
            } else {
                Object.assign(heldKeys, { up: false, down: false, left: false, right: false });
            }
        });

        base.addEventListener('pointerup', resetKnob);
        base.addEventListener('pointercancel', resetKnob);
        base.addEventListener('lostpointercapture', resetKnob);
    }

    function startGame() {
        if (gameStarted) return;
        gameStarted = true;
        document.getElementById('start-screen').classList.add('hidden');
        // Show dpad on any small screen OR touch device (not just touch-only)
        if (window.innerWidth < 1024 || 'ontouchstart' in window || navigator.maxTouchPoints > 0)
            document.getElementById('mobile-controls').classList.remove('hidden');

        // Move characters from floating menu positions to maze start positions
        arif.group.position.copy(cellToWorld(1, 1));
        arif.group.rotation.set(0, 0, 0);
        arif.group.scale.setScalar(1);  // restore normal scale
        ajeng.group.position.copy(cellToWorld(MAZE_W - 2, MAZE_H - 2));
        ajeng.group.rotation.set(0, 0, 0);
        ajeng.group.scale.setScalar(1);  // restore normal scale

        // Reset camera tracking to maze center so it starts smoothly
        const cx = (MAZE_W - 1) * CELL / 2;
        const cz = (MAZE_H - 1) * CELL / 2;
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
    }

    // =============================================
    // INIT
    // =============================================
    let starField;
    let goalRing = null;

    // =============================================
    // FOG OVERLAY — 2D canvas torchlight effect
    // =============================================
    function createFogOverlay() {
        fogOverlay = document.createElement('canvas');
        fogOverlay.id = 'fog-overlay';
        fogOverlay.style.cssText = [
            'position:absolute', 'inset:0',
            'width:100%', 'height:100%',
            'pointer-events:none', 'z-index:5'
        ].join(';');
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
        return {
            x: (v.x + 1) / 2 * fogOverlay.width,
            y: (-v.y + 1) / 2 * fogOverlay.height
        };
    }

    function drawFogOverlay() {
        const W = fogOverlay.width, H = fogOverlay.height;
        fogCtx.clearRect(0, 0, W, H);

        // Fill with dark space overlay — color follows current theme
        const fc = fogOverlay.dataset.fogColor || 'rgba(1,0,10,0.82)';
        fogCtx.fillStyle = fc;
        fogCtx.fillRect(0, 0, W, H);

        // Torchlight radius in pixels (based on viewport)
        const torchR = Math.min(W, H) * 0.22;

        // For each character, punch a transparent radial gradient hole
        const chars = [
            { pos: arif.group.position, color: '68, 187, 255' },
            { pos: ajeng.group.position, color: '255, 105, 180' }
        ];

        fogCtx.globalCompositeOperation = 'destination-out';
        chars.forEach(({ pos, color }) => {
            const sc = projectToScreen(
                new THREE.Vector3(pos.x, 0, pos.z)
            );
            // Bright centre, fade to transparent at edge
            const grad = fogCtx.createRadialGradient(sc.x, sc.y, 0, sc.x, sc.y, torchR);
            grad.addColorStop(0, 'rgba(255,255,255, 1)');
            grad.addColorStop(0.45, 'rgba(255,255,255, 0.9)');
            grad.addColorStop(0.75, 'rgba(255,255,255, 0.4)');
            grad.addColorStop(1, 'rgba(255,255,255, 0)');
            fogCtx.fillStyle = grad;
            fogCtx.beginPath();
            fogCtx.arc(sc.x, sc.y, torchR, 0, Math.PI * 2);
            fogCtx.fill();
        });
        fogCtx.globalCompositeOperation = 'source-over';

        // Subtle tinted inner glow to show character color
        chars.forEach(({ pos, color }) => {
            const sc = projectToScreen(
                new THREE.Vector3(pos.x, 0, pos.z)
            );
            const grad2 = fogCtx.createRadialGradient(sc.x, sc.y, 0, sc.x, sc.y, torchR * 0.55);
            grad2.addColorStop(0, `rgba(${color}, 0.12)`);
            grad2.addColorStop(1, `rgba(${color}, 0)`);
            fogCtx.fillStyle = grad2;
            fogCtx.beginPath();
            fogCtx.arc(sc.x, sc.y, torchR * 0.55, 0, Math.PI * 2);
            fogCtx.fill();
        });
    }

    // =============================================
    // INIT
    // =============================================
    function init() {
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x01000a);
        // Very subtle atmospheric haze only — NOT blinding fog
        scene.fog = new THREE.FogExp2(0x01000a, 0.006);

        setupCamera();

        renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.shadowMap.enabled = true;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.0;
        document.getElementById('game-container').appendChild(renderer.domElement);

        // Lights — maze must be VISIBLE; torchlight adds drama
        ambLight = new THREE.AmbientLight(0x2a1055, 1.8);
        scene.add(ambLight);
        // Directional from iso angle for dramatic wall shading
        const dl = new THREE.DirectionalLight(0xaaaaff, 1.1);
        dl.position.set(50, 80, 50);
        scene.add(dl);
        // Secondary fill light from opposite side
        const dl2 = new THREE.DirectionalLight(0x551188, 0.5);
        dl2.position.set(-30, 40, -30);
        scene.add(dl2);

        generateMaze();
        buildScene();
        starField = createLoveStarField();

        // Arif (boy, blue) — left side for menu
        const arifG = makeChibiBoy(0x0088ff);
        scene.add(arifG);
        arif = { group: arifG, col: 1, row: 1, targetCol: 1, targetRow: 1, moving: false };
        const MX0 = (MAZE_W - 1) * CELL / 2, MZ0 = (MAZE_H - 1) * CELL / 2;
        arifG.position.set(MX0 - 7, 0, MZ0);
        arifG.rotation.y = 0.4;
        arifG.scale.setScalar(2.2);  // bigger for menu showcase

        // Ajeng (girl, pink) — right side for menu
        const ajengG = makeChibiGirl(0xff4d6d);
        scene.add(ajengG);
        ajeng = { group: ajengG, col: MAZE_W - 2, row: MAZE_H - 2, targetCol: MAZE_W - 2, targetRow: MAZE_H - 2, moving: false };
        ajengG.position.set(MX0 + 7, 0, MZ0);
        ajengG.rotation.y = -0.4;
        ajengG.scale.setScalar(2.2);  // bigger for menu showcase

        // Perspective camera: closer, hero-angle looking at characters
        menuCam = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 800);
        menuCam.position.set(MX0, 4, MZ0 + 14);
        menuCam.lookAt(MX0, 3, MZ0);
        menuCam.updateProjectionMatrix();

        createFogOverlay();
        initMinimap();
        setupControls();

        window.addEventListener('resize', () => {
            const aspect = window.innerWidth / window.innerHeight;
            const vw = BASE_VIEW * currentZoom;
            camera.left = -vw * aspect; camera.right = vw * aspect;
            camera.top = vw; camera.bottom = -vw;
            camera.updateProjectionMatrix();
            if (menuCam) { menuCam.aspect = aspect; menuCam.updateProjectionMatrix(); }
            renderer.setSize(window.innerWidth, window.innerHeight);
        });

        animate();
    }

    // =============================================
    // ANIMATION LOOP
    // =============================================
    let prevT = performance.now();

    function animate() {
        requestAnimationFrame(animate);
        const now = performance.now(), dt = Math.min((now - prevT) / 1000, 0.05);
        prevT = now;
        const t = now / 1000;

        if (gameStarted && !gameWon) {
            // Key repeat
            if (!arif.moving && !ajeng.moving) {
                if (moveQueue) {
                    tryMove(arif, moveQueue.dc, moveQueue.dr);
                    tryMove(ajeng, moveQueue.dc, moveQueue.dr);
                    moveQueue = null; keyHoldTimer = 0;
                } else {
                    const held = getHeldDir();
                    if (held) {
                        keyHoldTimer += dt;
                        if (keyHoldTimer >= KEY_REPEAT) {
                            tryMove(arif, held.dc, held.dr);
                            tryMove(ajeng, held.dc, held.dr);
                            keyHoldTimer -= KEY_REPEAT * 0.65;
                        }
                    } else keyHoldTimer = 0;
                }
            }
            updateCharPos(arif, dt);
            updateCharPos(ajeng, dt);

            // Camera tracks both characters — no cropping
            updateCameraTracking(dt);

            checkWin();
            updateHUD();
            drawMinimap();
        }

        // Always draw fog overlay (when game is running)
        if (gameStarted) drawFogOverlay();

        // Character animation: float like astronauts in menu, gentle bob during gameplay
        if (!gameStarted) {
            // ── Menu float: astronaut sinusoidal drift ──
            const MXm = (MAZE_W - 1) * CELL / 2, MZm = (MAZE_H - 1) * CELL / 2;
            // Arif: left side
            arif.group.position.set(
                MXm - 7 + Math.sin(t * 0.28) * 0.4,
                2.5 + Math.sin(t * 0.65) * 1.6,
                MZm + Math.cos(t * 0.18) * 0.3
            );
            arif.group.rotation.set(
                Math.sin(t * 0.35) * 0.14,
                0.4 + Math.sin(t * 0.22) * 0.3,
                Math.sin(t * 0.5) * 0.18
            );
            // Ajeng: right side, opposite phase
            ajeng.group.position.set(
                MXm + 7 + Math.sin(t * 0.28 + Math.PI) * 0.4,
                2.5 + Math.sin(t * 0.65 + 1.3) * 1.6,
                MZm + Math.cos(t * 0.18 + Math.PI) * 0.3
            );
            ajeng.group.rotation.set(
                Math.sin(t * 0.35 + 0.8) * 0.14,
                -0.4 - Math.sin(t * 0.22) * 0.3,
                -Math.sin(t * 0.5) * 0.18
            );
        } else {
            // Gameplay bob
            arif.group.position.y = Math.sin(t * 2.2) * 0.12;
            ajeng.group.position.y = Math.sin(t * 2.2 + Math.PI) * 0.12;
        }

        // Torch pulse
        arif.group.traverse(o => { if (o.isPointLight) { o.intensity = 3.5 + Math.sin(t * 4) * 0.6; } });
        ajeng.group.traverse(o => { if (o.isPointLight) { o.intensity = 3.5 + Math.sin(t * 4 + Math.PI) * 0.6; } });

        // Rotate starfield slowly
        if (starField) starField.rotation.y = t * 0.012;

        // Meteors
        updateMeteors(dt);

        // Color theme cycling
        updateColorTheme(dt);

        // Pulse goal ring
        scene.traverse(o => { if (o.userData && o.userData.isGoal) { goalRing = o; } });
        if (goalRing) { goalRing.material.opacity = 0.3 + Math.sin(t * 3) * 0.22; goalRing.rotation.z = t * 0.5; }

        updateParticles(dt);
        // Use perspective menuCam for showcase, isometric camera during gameplay
        renderer.render(scene, gameStarted ? camera : (menuCam || camera));
    }

    // =============================================
    // METEORS
    // =============================================

    // =============================================
    // METEORS
    // =============================================
    function spawnMeteor() {
        const MX = (MAZE_W - 1) * CELL, MZ = (MAZE_H - 1) * CELL;
        // Start off-screen on a random edge, high up
        const angle = Math.random() * Math.PI * 2;
        const startDist = Math.max(MX, MZ) * 0.9;
        const sx = MX / 2 + Math.cos(angle) * startDist;
        const sy = 30 + Math.random() * 40;
        const sz = MZ / 2 + Math.sin(angle) * startDist;

        // Velocity toward center with downward drift
        const dir = new THREE.Vector3(
            MX / 2 - sx + (Math.random() - .5) * MX * 0.5,
            -10 - Math.random() * 10,
            MZ / 2 - sz + (Math.random() - .5) * MZ * 0.5
        ).normalize();
        const speed = 40 + Math.random() * 60;

        // Colors that cycle with theme tints
        const colors = [0xffffff, 0xaaddff, 0xffaacc, 0xeeeeff, 0xffffaa];
        const col = colors[Math.floor(Math.random() * colors.length)];

        // Head
        const hg = new THREE.SphereGeometry(0.4 + Math.random() * 0.5, 8, 8);
        const hm = new THREE.MeshBasicMaterial({ color: col });
        const head = new THREE.Mesh(hg, hm);
        head.position.set(sx, sy, sz);
        scene.add(head);

        // Trail (series of shrinking spheres)
        const trail = [];
        const trailLen = 8 + Math.floor(Math.random() * 6);
        for (let i = 0; i < trailLen; i++) {
            const tg = new THREE.SphereGeometry(Math.max(0.05, (0.4 - i * 0.04)), 6, 6);
            const opacity = 1 - (i / trailLen);
            const tm = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: opacity * 0.8 });
            const tp = new THREE.Mesh(tg, tm);
            tp.position.copy(head.position);
            scene.add(tp);
            trail.push(tp);
        }

        const maxLife = 2.5 + Math.random() * 1.5;
        meteors.push({ head, trail, vel: dir.multiplyScalar(speed), life: maxLife, maxLife });
    }

    function updateMeteors(dt) {
        meteorTimer += dt;
        if (meteorTimer > 2.5 + Math.random() * 4) {
            spawnMeteor();
            meteorTimer = 0;
        }
        for (let i = meteors.length - 1; i >= 0; i--) {
            const m = meteors[i];
            m.life -= dt;
            const alpha = Math.max(0, m.life / m.maxLife);
            // Move head
            m.head.position.addScaledVector(m.vel, dt);
            m.head.material.opacity = alpha;
            // Drag trail
            const gap = m.vel.clone().multiplyScalar(dt * 0.35);
            m.trail.forEach((tp, idx) => {
                if (idx === 0) { tp.position.lerp(m.head.position, 0.6); }
                else { tp.position.lerp(m.trail[idx - 1].position, 0.55); }
                tp.material.opacity = alpha * (1 - (idx / m.trail.length)) * 0.7;
            });
            if (m.life <= 0) {
                scene.remove(m.head);
                m.trail.forEach(tp => scene.remove(tp));
                meteors.splice(i, 1);
            }
        }
    }

    // =============================================
    // COLOR THEME CYCLING
    // =============================================
    function lerpArr(a, b, t) { return a.map((v, i) => v + (b[i] - v) * t); }
    function arrToHex(a) { return (Math.round(a[0]) << 16) | (Math.round(a[1]) << 8) | Math.round(a[2]); }
    function arrToCSS(a) { return `rgb(${Math.round(a[0])},${Math.round(a[1])},${Math.round(a[2])})`; }

    function updateColorTheme(dt) {
        themeTimer += dt;
        if (themeTimer >= THEME_DUR) {
            themeTimer = 0; themeT = 0;
            themeIdx = themeNext;
            themeNext = (themeIdx + 1) % THEMES.length;
        }
        // Smooth S-curve lerp
        themeT = Math.min(1, themeTimer / Math.max(1, THEME_DUR * 0.35));
        const easedT = themeT * themeT * (3 - 2 * themeT);

        const A = THEMES[themeIdx], B = THEMES[themeNext];
        curFog = lerpArr(A.fog, B.fog, easedT);
        curAmb = lerpArr(A.amb, B.amb, easedT);
        curPink = lerpArr(A.pink, B.pink, easedT);
        curBlue = lerpArr(A.blue, B.blue, easedT);

        // Apply to Three.js
        const fogCol = arrToHex(curFog);
        const ambCol = arrToHex(curAmb);
        if (scene.fog) scene.fog.color.setHex(fogCol);
        if (scene.background) scene.background.setHex(fogCol);
        if (ambLight) ambLight.color.setHex(ambCol);

        // Apply to CSS variables (affects UI elements)
        const root = document.documentElement.style;
        root.setProperty('--pink', arrToCSS(curPink));
        root.setProperty('--blue', arrToCSS(curBlue));

        // Tint fog overlay color
        if (fogCtx && fogOverlay) {
            const [fr, fg2, fb] = curFog;
            // Used in drawFogOverlay fill — update dynamically
            fogOverlay.dataset.fogColor = `rgba(${Math.round(fr)},${Math.round(fg2)},${Math.round(fb)},0.82)`;
        }
    }

    // =============================================
    // BOOTSTRAP
    // =============================================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
