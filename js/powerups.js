// =============================================
// POWER-UPS SYSTEM
// =============================================

let powerups = [];
const POWERUP_TYPES = {
    SPEED: { icon: 'zap', color: 0xffff00, label: 'Speed Boost' },
    LUMEN: { icon: 'sun', color: 0x00ffff, label: 'Super Torch' },
    SHIELD: { icon: 'shield', color: 0x00ff00, label: 'Space Shield' }
};

function spawnPowerUps() {
    powerups.forEach(p => scene.remove(p.mesh));
    powerups = [];

    const types = Object.keys(POWERUP_TYPES);
    for (let i = 0; i < 4; i++) {
        let spawned = false;
        while (!spawned) {
            const c = 1 + Math.floor(Math.random() * (MAZE_W - 2));
            const r = 1 + Math.floor(Math.random() * (MAZE_H - 2));
            if (mazeData[r][c] === 0 && !isOccupied(c, r)) {
                const typeKey = types[Math.floor(Math.random() * types.length)];
                const config = POWERUP_TYPES[typeKey];

                const mesh = createPowerUpMesh(config.color);
                const world = cellToWorld(c, r);
                mesh.position.set(world.x, 1.2, world.z);
                scene.add(mesh);

                powerups.push({ col: c, row: r, type: typeKey, mesh, config });
                spawned = true;
            }
        }
    }
}

function createPowerUpMesh(color) {
    const g = new THREE.Group();
    const core = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.5, 0),
        new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.5, transparent: true, opacity: 0.8 })
    );

    const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.7, 0.05, 8, 24),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4 })
    );
    ring.rotation.x = Math.PI / 2;

    const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.3, 18, 12),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.12 })
    );
    beam.position.y = 9;

    g.add(core, ring, beam);

    const light = new THREE.PointLight(color, 3.5, 10);
    g.add(light);
    return g;
}

function isOccupied(c, r) {
    if (c === 1 && r === 1) return true;
    if (c === MAZE_W - 2 && r === MAZE_H - 2) return true;
    return questNodes.some(n => n.col === c && n.row === r);
}

function updatePowerUps(dt, t) {
    powerups.forEach((p, idx) => {
        p.mesh.rotation.y += dt * 2;
        p.mesh.position.y = 1.2 + Math.sin(t * 3) * 0.2;

        // Check collision with Arif/Ajeng
        [arif, ajeng].forEach(char => {
            if (char.col === p.col && char.row === p.row) {
                applyPowerUp(char, p);
                scene.remove(p.mesh);
                powerups.splice(idx, 1);
                menuSynth.playSFX('fusion');
                showPowerUpMessage(p.config.label, p.config.color);
            }
        });
    });
}

function applyPowerUp(char, p) {
    if (p.type === 'SPEED') {
        const originalSpd = MOVE_SPD;
        window.MOVE_SPD = 14;
        setTimeout(() => window.MOVE_SPD = 8.5, 8000);
    } else if (p.type === 'LUMEN') {
        window.isSuperTorch = true;
        setTimeout(() => window.isSuperTorch = false, 12000);
    } else if (p.type === 'SHIELD') {
        char.hasShield = true;
    }
}

function showPowerUpMessage(text, color) {
    const msg = document.createElement('div');
    msg.style.cssText = `
        position:absolute; bottom:20%; left:50%; transform:translateX(-50%);
        background:rgba(0,0,0,0.8); color:#${color.toString(16).padStart(6, '0')};
        padding:10px 20px; border-radius:20px; border:2px solid;
        font-family:Rajdhani,sans-serif; font-weight:bold; font-size:1.2rem;
        z-index:100; animation: fadeUp 1s ease-out forwards;
    `;
    msg.textContent = `🚀 ${text}!`;
    document.getElementById('game-container').appendChild(msg);
    setTimeout(() => msg.remove(), 1500);
}
