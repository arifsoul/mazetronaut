// =============================================
// VISUAL EFFECTS (STARS, ASTEROIDS, PARTICLES)
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

    const pts = new THREE.Points(geo, mat);
    scene.add(pts);

    // Add downward movement to simulate flying UP
    pts.userData = { isRainingStars: true, sizes, positions, count: starCount };

    // Also add distant nebula planes (colored glow sheets)
    addNebulaPlanes();

    return pts;
}

function addNebulaPlanes() {
    const nebulaColors = [0x3a0060, 0x001a50, 0x500020, 0x002040];
    const MX = MAZE_W * CELL;
    const MZ = MAZE_H * CELL;
    nebulaColors.forEach((c, i) => {
        const geo = new THREE.PlaneGeometry(MX * 2.5, MZ * 2.5);
        const mat = new THREE.MeshBasicMaterial({
            color: c, transparent: true, opacity: 0.12,
            side: THREE.DoubleSide, depthWrite: false
        });
        const pl = new THREE.Mesh(geo, mat);
        // Positioned as distant "walls" or backdrop sheets
        pl.position.set(MX / 2, 20 + i * 15, MZ / 2);
        pl.rotation.x = Math.PI / 2; // Lay flat above
        scene.add(pl);
    });
}

function createAsteroids() {
    const MX = (MAZE_W * CELL) / 2;
    const MZ = (MAZE_H * CELL) / 2;
    const beltRadius = Math.max(MX, MZ) + 30;

    for (let i = 0; i < 40; i++) {
        const size = 1.2 + Math.random() * 4;
        const geo = new THREE.DodecahedronGeometry(size, 0);
        const posAttr = geo.attributes.position;
        for (let j = 0; j < posAttr.count; j++) {
            posAttr.setX(j, posAttr.getX(j) * (0.8 + Math.random() * 0.4));
            posAttr.setY(j, posAttr.getY(j) * (0.8 + Math.random() * 0.4));
            posAttr.setZ(j, posAttr.getZ(j) * (0.8 + Math.random() * 0.4));
        }
        geo.computeVertexNormals();

        const mat = new THREE.MeshStandardMaterial({
            color: 0x222233,
            roughness: 0.9,
            metalness: 0.2,
            flatShading: true
        });

        const mesh = new THREE.Mesh(geo, mat);
        scene.add(mesh);

        // Circular Belt distribution
        const angle = (i / 40) * Math.PI * 2;
        const dist = beltRadius + (Math.random() - 0.5) * 20;
        const yPos = 5 + (Math.random() - 0.5) * 30;

        asteroids.push({
            mesh,
            radius: dist,
            angle: angle,
            speed: (0.02 + Math.random() * 0.08),
            rotSpeed: new THREE.Vector3(Math.random() * 0.015, Math.random() * 0.015, Math.random() * 0.015),
            centerX: MX,
            centerZ: MZ,
            yPos
        });
    }
}

function updateAsteroids(dt) {
    asteroids.forEach(ast => {
        ast.angle += ast.speed * dt;
        ast.mesh.position.x = ast.centerX + Math.cos(ast.angle) * ast.radius;
        ast.mesh.position.z = ast.centerZ + Math.sin(ast.angle) * ast.radius;
        ast.mesh.position.y = ast.yPos + Math.sin(ast.angle * 2) * 5; // slight bobbing

        ast.mesh.rotation.x += ast.rotSpeed.x;
        ast.mesh.rotation.y += ast.rotSpeed.y;
        ast.mesh.rotation.z += ast.rotSpeed.z;
    });
}

function spawnThrustParticles(char, dt) {
    if (!char || !char.moving) {
        if (char && char.group && char.group.userData.thrustLight) {
            // Dim light when not moving
            char.group.userData.thrustLight.intensity = Math.max(0, char.group.userData.thrustLight.intensity - dt * 5);
        }
        return;
    }

    // Ignite engine light
    if (char.group.userData.thrustLight) {
        char.group.userData.thrustLight.intensity = 2.0 + Math.random();
    }

    // Spawn fire/smoke particles downwards relative to the maze
    if (Math.random() > 0.3) {
        const size = 0.3 + Math.random() * 0.5;
        const geo = new THREE.PlaneGeometry(size, size);

        // Bright orange/yellow core, fading to red/gray smoke
        const isFire = Math.random() > 0.4;
        const color = isFire ? (Math.random() > 0.5 ? 0xffaa00 : 0xffff00) : 0x444444;
        const opacity = isFire ? 0.9 : 0.5;

        const mat = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: opacity,
            depthWrite: false,
            blending: isFire ? THREE.AdditiveBlending : THREE.NormalBlending
        });

        const p = new THREE.Mesh(geo, mat);
        // Spawn at nozzle position
        p.position.copy(char.group.position);
        p.position.y -= 0.8;
        p.position.x += (Math.random() - 0.5) * 0.8;
        p.position.z += (Math.random() - 0.5) * 0.8;

        // Thrust points strictly DOWN in world space to simulate lifting
        const vel = new THREE.Vector3(
            (Math.random() - 0.5) * 2,
            -10 - Math.random() * 10,
            (Math.random() - 0.5) * 2
        );

        p.lookAt(camera.position); // billboard

        scene.add(p);
        particles.push({
            mesh: p,
            vel: vel,
            life: 0.2 + Math.random() * 0.2,
            maxLife: 0.4,
            isThrust: true
        });
    }
}

function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];

        if (p.isThrust) {
            // Rocket thrust physics (goes down fast, fades out)
            p.life -= dt;
            p.mesh.position.addScaledVector(p.vel, dt);

            // Scale up and rotate as it dies
            const s = 1.0 + (p.maxLife - p.life) * 3;
            p.mesh.scale.set(s, s, s);
            p.mesh.rotation.z += dt * 2;

            if (p.mesh.material.opacity !== undefined) {
                p.mesh.material.opacity = Math.max(0, p.life * 2.5);
            }
        } else {
            // Regular physics for sparks
            p.life -= dt * 0.85;
            p.vel.y -= 9 * dt;
            p.mesh.position.addScaledVector(p.vel, dt);
            if (p.mesh.material.opacity !== undefined) p.mesh.material.opacity = Math.max(0, p.life);
        }

        if (p.life <= 0) { scene.remove(p.mesh); particles.splice(i, 1); }
    }
}

function spawnParticles(mid) {
    const spG = new THREE.SphereGeometry(0.25, 4, 4);
    const m1 = new THREE.MeshBasicMaterial({ color: 0xff69b4 });
    const m2 = new THREE.MeshBasicMaterial({ color: 0x44bbff });

    for (let i = 0; i < 40; i++) {
        const p = new THREE.Mesh(spG, Math.random() > 0.5 ? m1 : m2);
        p.position.copy(mid).add(new THREE.Vector3(
            (Math.random() - 0.5) * 2,
            (Math.random() - 0.5) * 2 + 1,
            (Math.random() - 0.5) * 2
        ));
        const vel = new THREE.Vector3(
            (Math.random() - 0.5) * 15,
            Math.random() * 15 + 5,
            (Math.random() - 0.5) * 15
        );
        particles.push({ mesh: p, vel: vel, life: 2.0 });
        scene.add(p);
    }
}

class FusionEffect {
    constructor() {
        this.active = false;
        this.group = new THREE.Group();
        scene.add(this.group);

        // Core fire globe
        const hg = new THREE.SphereGeometry(1.2, 16, 16);
        const hm = new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0.6 });
        this.core = new THREE.Mesh(hg, hm);
        this.group.add(this.core);

        // Inner intense core
        const hg2 = new THREE.SphereGeometry(0.6, 16, 16);
        const hm2 = new THREE.MeshBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.9 });
        this.innerCore = new THREE.Mesh(hg2, hm2);
        this.group.add(this.innerCore);

        // Electricity arcs (set of lines)
        this.arcs = [];
        const arcMat = new THREE.LineBasicMaterial({ color: 0x00ffff });
        for (let i = 0; i < 5; i++) {
            const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
            const line = new THREE.Line(geo, arcMat);
            line.visible = false;
            this.arcs.push(line);
            this.group.add(line);
        }

        this.pulseTimer = 0;
    }

    update(pos, dt) {
        if (!this.active) {
            this.group.visible = false;
            return;
        }
        this.group.visible = true;
        this.group.position.copy(pos);
        this.group.position.y += 1.5;

        this.pulseTimer += dt;
        const s = 1.0 + Math.sin(this.pulseTimer * 12) * 0.2;
        this.core.scale.setScalar(s);
        this.innerCore.scale.setScalar(s * 0.7);

        // Update electricity arcs
        this.arcs.forEach((arc, i) => {
            if (Math.random() < 0.2) {
                arc.visible = true;
                const pts = [];
                const len = 2.0 + Math.random() * 2.5;
                for (let j = 0; j < 5; j++) {
                    pts.push(new THREE.Vector3(
                        (Math.random() - 0.5) * len,
                        (Math.random() - 0.5) * len,
                        (Math.random() - 0.5) * len
                    ));
                }
                arc.geometry.setFromPoints(pts);
            } else if (Math.random() < 0.3) {
                arc.visible = false;
            }
        });

        // Occasional fusion sparks
        if (Math.random() < 0.15) {
            const spG = new THREE.SphereGeometry(0.12, 4, 4);
            const spM = new THREE.MeshBasicMaterial({ color: Math.random() > 0.5 ? 0xffaa00 : 0x00ffff });
            const sp = new THREE.Mesh(spG, spM);
            sp.position.copy(this.group.position).add(new THREE.Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2));
            const vel = new THREE.Vector3((Math.random() - 0.5) * 5, Math.random() * 5, (Math.random() - 0.5) * 5);
            particles.push({ mesh: sp, vel, life: 0.6 });
            scene.add(sp);
        }
    }
}

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


// ── Character Trail System ──────────────────────────────
let trails = [];

class CharacterTrail {
    constructor(char, color, isPink = false) {
        this.char = char;
        this.color = color;
        this.isPink = isPink;
        this.segments = [];
        this.maxSegments = 40;
        this.lastPos = new THREE.Vector3();
    }

    update(dt) {
        if (!this.char || !this.char.group) return;

        const pos = this.char.group.position.clone();
        pos.y += 1.2; // Spawn from body center

        if (this.char.moving) {
            if (this.lastPos.distanceTo(pos) > 0.4) {
                this.spawnSegment(pos);
                this.lastPos.copy(pos);
            }
        }

        for (let i = this.segments.length - 1; i >= 0; i--) {
            const s = this.segments[i];
            s.life -= dt;
            s.mesh.material.opacity = (s.life / s.maxLife) * 0.6;
            s.mesh.scale.multiplyScalar(0.98);
            if (s.life <= 0) {
                scene.remove(s.mesh);
                this.segments.splice(i, 1);
            }
        }
    }

    spawnSegment(pos) {
        const geo = this.isPink ? new THREE.SphereGeometry(0.3, 8, 8) : new THREE.BoxGeometry(0.2, 0.2, 0.2);
        const mat = new THREE.MeshBasicMaterial({
            color: this.color,
            transparent: true,
            opacity: 0.6,
            blending: THREE.AdditiveBlending
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(pos);
        scene.add(mesh);

        this.segments.push({ mesh, life: 0.8, maxLife: 0.8 });

        // Extra "ove" spark for Ajeng
        if (this.isPink && Math.random() > 0.6) {
            spawnHeartSpark(pos);
        }
    }
}

function spawnHeartSpark(pos) {
    const geo = new THREE.PlaneGeometry(0.4, 0.4);
    const mat = new THREE.MeshBasicMaterial({
        color: 0xffb6c1,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending
    });
    const p = new THREE.Mesh(geo, mat);
    p.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)));
    p.lookAt(camera.position);
    scene.add(p);
    particles.push({ mesh: p, vel: new THREE.Vector3(0, 2, 0), life: 1.0, isThrust: false });
}

function initTrails() {
    if (arif) trails.push(new CharacterTrail(arif, 0x87CEFA, false));
    if (ajeng) trails.push(new CharacterTrail(ajeng, 0xFFB6C1, true));
}

function updateCharTrails(dt) {
    trails.forEach(t => t.update(dt));
}
