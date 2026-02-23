// =============================================
// HAZARDS SYSTEM (LASER GATES)
// =============================================

let hazards = [];
let hazardTimer = 0;

function spawnHazards() {
    hazards.forEach(h => scene.remove(h.group));
    hazards = [];

    // Find vertical walls that can host a laser
    for (let r = 1; r < MAZE_H - 1; r++) {
        for (let c = 1; c < MAZE_W - 1; c++) {
            if (mazeData[r][c] === 1 && Math.random() < 0.08) {
                // Check if it's a good spot (between two corridors)
                if (mazeData[r][c - 1] === 0 && mazeData[r][c + 1] === 0) {
                    createLaserGate(c, r, 'horizontal');
                } else if (mazeData[r - 1][c] === 0 && mazeData[r + 1][c] === 0) {
                    createLaserGate(c, r, 'vertical');
                }
            }
        }
    }
}

function createLaserGate(c, r, orient) {
    const g = new THREE.Group();
    const world = cellToWorld(c, r);

    // Laser emitters (two small cylinders)
    const emitGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.5, 8);
    const emitMat = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.9 });

    const e1 = new THREE.Mesh(emitGeo, emitMat);
    const e2 = new THREE.Mesh(emitGeo, emitMat);

    const beamGeo = new THREE.CylinderGeometry(0.06, 0.06, CELL, 8);
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.9 });
    const beam = new THREE.Mesh(beamGeo, beamMat);

    // Glow layer for the beam
    const glowGeo = new THREE.CylinderGeometry(0.15, 0.15, CELL, 8);
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.25 });
    const glow = new THREE.Mesh(glowGeo, glowMat);

    if (orient === 'horizontal') {
        e1.position.set(-CELL / 2, 1.5, 0); e2.position.set(CELL / 2, 1.5, 0);
        beam.rotation.z = Math.PI / 2;
        beam.position.set(0, 1.5, 0);
        glow.rotation.z = Math.PI / 2;
        glow.position.set(0, 1.5, 0);
    } else {
        e1.position.set(0, 1.5, -CELL / 2); e2.position.set(0, 1.5, CELL / 2);
        beam.rotation.x = Math.PI / 2;
        beam.position.set(0, 1.5, 0);
        glow.rotation.x = Math.PI / 2;
        glow.position.set(0, 1.5, 0);
    }

    const beacon = new THREE.PointLight(0xff0000, 3.5, 12);
    beacon.position.set(0, 3, 0);
    g.add(beacon);

    g.add(e1, e2, beam, glow);
    g.position.set(world.x, 0, world.z);
    scene.add(g);

    hazards.push({ group: g, beam, glow, beacon, col: c, row: r, active: true, timer: Math.random() * 2 });
}

function updateHazards(dt) {
    hazardTimer += dt;
    hazards.forEach(h => {
        h.timer += dt;
        h.beacon.intensity = 1.5 + Math.sin(hazardTimer * 6) * 1.0;

        if (h.timer >= 2) {
            h.timer = 0;
            h.active = !h.active;
            h.beam.visible = h.active;
            if (h.glow) h.glow.visible = h.active;
        }

        if (h.active) {
            // Check collision with characters
            [arif, ajeng].forEach(char => {
                if (char.col === h.col && char.row === h.row && !char.invul) {
                    takeDamage(char);
                }
            });
        }
    });
}

function takeDamage(char) {
    if (char.hasShield) {
        char.hasShield = false;
        char.invul = true;
        setTimeout(() => char.invul = false, 2000);
        showPowerUpMessage('SHIELD DEPLETED', 0xffffff);
        return;
    }

    lives--;
    updateLives();
    menuSynth.playSFX('wrong');
    triggerScreenShake();
    triggerGlitch();

    char.invul = true;
    setTimeout(() => char.invul = false, 2000);

    if (lives <= 0) {
        triggerGameOver('Kehabisan energi di labirin laser!');
    }
}

function triggerScreenShake() {
    window.isShaking = true;
    setTimeout(() => window.isShaking = false, 500);
}

function triggerGlitch() {
    const g = document.getElementById('glitch-overlay');
    if (g) {
        g.style.display = 'block';
        setTimeout(() => g.style.display = 'none', 400);
    }
}
