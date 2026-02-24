// =============================================
// CHARACTERS: LOADING, PROCEDURAL GEN, & MOVEMENT
// =============================================

function addLight(g, color, intensity, dist, px, py, pz) {
    const l = new THREE.PointLight(color, intensity, dist, 1.8);
    l.position.set(px, py, pz);
    l.targetIntensity = intensity; // Store intended intensity
    l.intensity = 0; // Start off for intro
    g.add(l);
    return l;
}

// ── Load GLB Characters ───────────────────────────────────
function loadCharacters(onReady) {
    const loader = new THREE.GLTFLoader();

    // --- DRACO Support ---
    const dracoLoader = new THREE.DRACOLoader();
    dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.4.1/');
    loader.setDRACOLoader(dracoLoader);

    // --- Meshopt Support ---
    if (window.MeshoptDecoder) {
        loader.setMeshoptDecoder(window.MeshoptDecoder);
    } else if (typeof MeshoptDecoder !== 'undefined') {
        loader.setMeshoptDecoder(MeshoptDecoder);
    }

    const MX0 = (MAZE_W - 1) * CELL / 2, MZ0 = (MAZE_H - 1) * CELL / 2;

    let arifLoaded = false, ajengLoaded = false;
    let arifFail = false, ajengFail = false;
    const tryReady = () => { if (arifLoaded && ajengLoaded) { initTrails(); onReady(); } };

    // --- Loading Timeout ---
    const loadTimeout = setTimeout(() => {
        if (!arifLoaded) {
            console.warn('arif.glb loading timed out or failed, forcing fallback.');
            useArifFallback();
        }
        if (!ajengLoaded) {
            console.warn('ajeng.glb loading timed out or failed, forcing fallback.');
            useAjengFallback();
        }
    }, 15000);

    function setupGLBChar(gltfScene, torchColor) {
        // Wrapper group – position/rotation/scale controlled by game
        const wrapper = new THREE.Group();

        // Scale GLB to desired gameplay height (3.2 world units)
        const box = new THREE.Box3().setFromObject(gltfScene);
        const size = new THREE.Vector3();
        box.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z);
        const targetHeight = 3.2;
        const baseScale = targetHeight / maxDim;

        // Recompute bounding box AFTER applying scale to get correct offset
        gltfScene.scale.setScalar(baseScale);
        gltfScene.updateMatrixWorld(true);
        const box2 = new THREE.Box3().setFromObject(gltfScene);
        // Shift GLB up so its bottom sits at y=0 inside wrapper
        gltfScene.position.y = -box2.min.y;

        wrapper.add(gltfScene);

        // Torchlight on wrapper
        addLight(wrapper, torchColor, 4.5, LIGHT_RANGE, 0, 2.3, 0);

        // --- Head Glint ---
        const glint = new THREE.PointLight(torchColor, 1.5, 4);
        glint.position.set(0, 2.3, 0.5);
        wrapper.add(glint);

        // Enable shadows
        gltfScene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });

        return { wrapper, baseScale };
    }

    const useArifFallback = () => {
        if (arifLoaded) return;
        const wrapper = new THREE.Group();
        const arifG = makeChibiBoy(0x87CEFA);
        wrapper.add(arifG);
        scene.add(wrapper);
        arif = { group: wrapper, model: arifG, col: 1, row: 1, targetCol: 1, targetRow: 1, moving: false, baseScale: 1 };
        wrapper.position.set(MX0 - 7, 0, MZ0);
        wrapper.rotation.y = 0.4;
        wrapper.scale.setScalar(2.2);
        arifLoaded = true;
        tryReady();
    };

    const useAjengFallback = () => {
        if (ajengLoaded) return;
        const wrapper = new THREE.Group();
        const ajengG = makeChibiGirl(0xFFB6C1);
        wrapper.add(ajengG);
        scene.add(wrapper);
        ajeng = { group: wrapper, model: ajengG, col: MAZE_W - 2, row: MAZE_H - 2, targetCol: MAZE_W - 2, targetRow: MAZE_H - 2, moving: false, baseScale: 1 };
        wrapper.position.set(MX0 + 7, 0, MZ0);
        wrapper.rotation.y = -0.4;
        wrapper.scale.setScalar(2.2);
        ajengLoaded = true;
        tryReady();
    };

    // ── Load Arif (blue torchlight) ──
    loader.load(
        'arif.glb',
        (gltf) => {
            if (arifLoaded) return; // Already loaded fallback
            const { wrapper, baseScale } = setupGLBChar(gltf.scene, 0x87CEFA);

            // Failsafe: remove existing if any
            if (arif && arif.group) { scene.remove(arif.group); }

            scene.add(wrapper);
            arif = {
                group: wrapper,
                model: gltf.scene,
                col: 1, row: 1,
                targetCol: 1, targetRow: 1,
                moving: false, baseScale: 1,
                introAnimating: false,
                flashlightOn: false
            };
            // Initial menu position: floating high
            wrapper.position.set(MX0 - 7, 7, MZ0 + 12);
            wrapper.rotation.y = 0.4;
            wrapper.scale.setScalar(2.2);
            arifLoaded = true;
            tryReady();
        },
        undefined,
        (err) => {
            arifFail = true;
            console.error('Arif GLB Error:', err);
            // Don't fallback immediately, let the timeout handle it 
            // unless we want to be aggressive. Let's wait 3s on error before fallback.
            setTimeout(() => { if (!arifLoaded) useArifFallback(); }, 3000);
        }
    );

    // ── Load Ajeng (pink torchlight) ──
    loader.load(
        'ajeng.glb',
        (gltf) => {
            if (ajengLoaded) return;
            const { wrapper, baseScale } = setupGLBChar(gltf.scene, 0xFFB6C1);

            // Failsafe: remove existing if any
            if (ajeng && ajeng.group) { scene.remove(ajeng.group); }

            scene.add(wrapper);
            ajeng = {
                group: wrapper,
                model: gltf.scene,
                col: MAZE_W - 2, row: MAZE_H - 2,
                targetCol: MAZE_W - 2, targetRow: MAZE_H - 2,
                moving: false, baseScale: 1,
                introAnimating: false,
                flashlightOn: false
            };
            // Initial menu position: floating high
            wrapper.position.set(MX0 + 7, 7.5, MZ0 + 12);
            wrapper.rotation.y = -0.4;
            wrapper.scale.setScalar(2.2);
            ajengLoaded = true;
            tryReady();
        },
        undefined,
        (err) => {
            ajengFail = true;
            console.error('Ajeng GLB Error:', err);
            setTimeout(() => { if (!ajengLoaded) useAjengFallback(); }, 3000);
        }
    );
}

// ── Fallback Arif: Space Explorer Astronaut ────────────────
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


    // Torchlight
    addLight(g, color, 4.5, LIGHT_RANGE, 0, 2.3, 0);

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


    // Torch light
    addLight(g, color, 4.5, LIGHT_RANGE, 0, 2.3, 0);

    // --- Rocket Nozzle & Thrust ---
    const nozzle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 0.8, 0.6, 12),
        new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.9, metalness: 0.8 })
    );
    nozzle.position.set(0, -0.3, 0);
    g.add(nozzle);

    // Thrust particle system placeholder in group
    g.userData.thrustLight = new THREE.PointLight(0xff8800, 0, 10);
    g.userData.thrustLight.position.set(0, -1.0, 0);
    g.add(g.userData.thrustLight);

    return g;
}

// =============================================
// GRID MOVEMENT
// =============================================
function tryMove(char, dc, dr) {
    if (char.moving) return;
    const nc = char.col + dc, nr = char.row + dr;
    if (!isWallCell(nc, nr)) {
        char.targetCol = nc; char.targetRow = nr; char.moving = true; lastMoveDir = { dc, dr };
        menuSynth.playSFX('step');
    } else {
        // bump wall
        // menuSynth.playSFX('bump'); // Removed per request
    }
}

function updateCharPos(char, dt) {
    if (!char.moving) return;
    const tw = cellToWorld(char.targetCol, char.targetRow);
    const curPos = char.group.position;
    const dx = tw.x - curPos.x;
    const dz = tw.z - curPos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const step = MOVE_SPD * CELL * dt;

    if (dist <= step) {
        char.group.position.x = tw.x;
        char.group.position.z = tw.z;
        char.col = char.targetCol; char.row = char.targetRow; char.moving = false;
    } else {
        const ratio = step / dist;
        char.group.position.x += dx * ratio;
        char.group.position.z += dz * ratio;
    }

}

function updateCharVisuals(char, dt) {
    if (!char || !char.group || !char.model) return;

    // --- LEANING LOGIC (Forward tilt) ---
    const leanTarget = char.moving ? 0.87 : 0; // 0.87 rad = ~50 degrees
    char.model.rotation.x += (leanTarget - char.model.rotation.x) * 0.15;

    // Ensure parent group doesn't have stray rotations
    char.group.rotation.x = 0;
    char.group.rotation.z = 0;

    // --- SMOOTH ROTATION (Y-Axis & Z-Axis Banking) ---
    const prevRotY = char.group.rotation.y;

    if (char.moving) {
        const tw = cellToWorld(char.targetCol, char.targetRow);
        const dx = tw.x - char.group.position.x;
        const dz = tw.z - char.group.position.z;

        if (Math.sqrt(dx * dx + dz * dz) > 0.01) {
            const targetAngle = Math.atan2(dx, dz);
            let diff = targetAngle - char.group.rotation.y;
            while (diff < -Math.PI) diff += Math.PI * 2;
            while (diff > Math.PI) diff -= Math.PI * 2;
            char.group.rotation.y += diff * 0.28;
        }
    }

    // --- BANKING LOGIC (Side tilt when turning) ---
    // Positive diffY means turning left, negative means turning right (in radians)
    let turnDiff = char.group.rotation.y - prevRotY;
    if (turnDiff > Math.PI) turnDiff -= Math.PI * 2;
    if (turnDiff < -Math.PI) turnDiff += Math.PI * 2;

    // targetZ: tilt proportional to turn speed, max ~25 degrees (0.43 rad)
    const bankTarget = -turnDiff * 5.5;
    char.model.rotation.z += (bankTarget - char.model.rotation.z) * 0.1;
}
