// =============================================
// MAZE GENERATION & SCENE CONSTRUCTION
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

    // True world positions
    const pA = arif.group.position.clone();
    const pJ = ajeng.group.position.clone();

    // Midpoint of both characters
    const mid = new THREE.Vector3().addVectors(pA, pJ).multiplyScalar(0.5);

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
