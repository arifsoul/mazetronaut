// =============================================
// QUEST & CHAT SYSTEM ENGINE
// =============================================

let soloArifChats = [];
let soloAjengChats = [];
let duoChats = [];

async function loadChats() {
    try {
        const resp = await fetch('chat.md');
        const text = await resp.text();

        let currentCategory = null;
        const lines = text.split(/\r?\n/);

        lines.forEach(line => {
            const t = line.trim();
            if (!t) return;

            if (t.startsWith('# Solo Arif')) {
                currentCategory = 'solo-arif';
            } else if (t.startsWith('# Solo Ajeng')) {
                currentCategory = 'solo-ajeng';
            } else if (t.startsWith('# Duo')) {
                currentCategory = 'duo';
            } else if (!t.startsWith('#')) {
                if (currentCategory === 'solo-arif' && t.startsWith('Arif:')) {
                    soloArifChats.push(t.replace('Arif:', '').trim());
                } else if (currentCategory === 'solo-ajeng' && t.startsWith('Ajeng:')) {
                    soloAjengChats.push(t.replace('Ajeng:', '').trim());
                } else if (currentCategory === 'duo') {
                    const parts = t.split('|').map(p => p.trim());
                    if (parts.length >= 2) {
                        const chatSequence = [];
                        parts.forEach(p => {
                            if (p.startsWith('Arif:')) chatSequence.push({ char: 'arif', text: p.replace('Arif:', '').trim() });
                            else if (p.startsWith('Ajeng:')) chatSequence.push({ char: 'ajeng', text: p.replace('Ajeng:', '').trim() });
                        });
                        duoChats.push(chatSequence);
                    }
                }
            }
        });
        console.log(`Chats loaded: Arif(${soloArifChats.length}), Ajeng(${soloAjengChats.length}), Duo(${duoChats.length})`);
    } catch (e) {
        console.warn('Failed to load chat.md', e);
    }
}

// Parse question.md → questionsPool[]
async function loadQuestions() {
    try {
        const resp = await fetch('question.md');
        const text = await resp.text();
        // Split by dashes, allowing for CRLF or LF line endings
        const blocks = text.split(/\r?\n---\r?\n/).filter(b => b.trim().includes('**'));

        blocks.forEach(block => {
            // More lenient question check: handles potential \r, extra spaces, etc.
            const qMatch = block.match(/\*\*\d+\.\s*(.+?)\*\*/s);
            if (!qMatch) return;
            const qText = qMatch[1].trim();

            // Find all options (A/B/C/D)
            const optMatches = [...block.matchAll(/- [A-D]\.\s+(.*)/g)];
            if (optMatches.length < 4) return;

            const options = optMatches.map(m => m[1].replace(/\*\*✅\s*/g, '').replace(/\*\*/g, '').trim());
            // Find correct index (has ✅)
            const correctIdx = optMatches.findIndex(m => m[0].includes('✅'));
            if (correctIdx < 0) return;

            questionsPool.push({ text: qText, options, correctIdx });
        });
        console.log(`Quest: loaded ${questionsPool.length} questions from question.md`);
    } catch (e) {
        console.warn('Quest: could not load question.md', e);
    }
}

// Pick N unique random questions from pool
function pickRandomQuestions(n) {
    const pool = [...questionsPool];
    const picked = [];
    while (picked.length < n && pool.length > 0) {
        const i = Math.floor(Math.random() * pool.length);
        picked.push(pool.splice(i, 1)[0]);
    }
    return picked;
}

// Find random open (non-wall) cell satisfying minDist from all occupied
function randomOpenCell(occupied, minDist = 4) {
    const tries = 200;
    for (let t = 0; t < tries; t++) {
        const c = 1 + Math.floor(Math.random() * (MAZE_W - 2));
        const r = 1 + Math.floor(Math.random() * (MAZE_H - 2));
        if (mazeData[r][c] !== 0) continue;
        const far = occupied.every(o => Math.abs(o.col - c) + Math.abs(o.row - r) >= minDist);
        if (far) return { col: c, row: r };
    }
    return { col: 3, row: 3 };
}

// Place 4 quest nodes in the maze
function placeQuestNodes() {
    const occupied = [
        { col: 1, row: 1 },                          // arif start
        { col: MAZE_W - 2, row: MAZE_H - 2 }        // ajeng start
    ];
    const questions = questionsPool.length >= 4 ? pickRandomQuestions(4) : pickRandomQuestions(Math.min(questionsPool.length, 4));
    const owners = ['arif', 'arif', 'ajeng', 'ajeng'];
    const colors = [0x44bbff, 0x44bbff, 0xff69b4, 0xff69b4];

    questNodes = [];
    for (let i = 0; i < 4; i++) {
        const cell = randomOpenCell(occupied, 4);
        occupied.push(cell);

        const color = colors[i];
        const owner = owners[i];

        // 3D orb mesh
        const geo = new THREE.SphereGeometry(0.55, 14, 14);
        const mat = new THREE.MeshStandardMaterial({
            color, emissive: color, emissiveIntensity: 1.2,
            transparent: true, opacity: 0.9, roughness: 0.2, metalness: 0.5
        });
        const orb = new THREE.Mesh(geo, mat);
        const world = cellToWorld(cell.col, cell.row);
        orb.position.set(world.x, 2.0, world.z);

        // Glow ring
        const ringGeo = new THREE.TorusGeometry(0.8, 0.07, 8, 28);
        const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6 });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = Math.PI / 2;
        orb.add(ring);

        // Point light
        const light = new THREE.PointLight(color, 2.5, 10);
        light.position.set(0, 0, 0);
        orb.add(light);

        scene.add(orb);
        questNodes.push({ col: cell.col, row: cell.row, mesh: orb, owner, answered: false, question: questions[i] || null });
    }
}

// Animate quest orbs each frame
function animateQuestNodes(t) {
    questNodes.forEach((node, i) => {
        if (node.answered || !node.mesh) return;
        node.mesh.position.y = 2.0 + Math.sin(t * 2.2 + i * 1.5) * 0.35;
        node.mesh.rotation.y = t * 1.2 + i * 0.8;
    });
}

// Check if a character stepped on their quest node
function checkQuestCollision() {
    if (questPaused || fusionComplete) return;
    questNodes.forEach((node, idx) => {
        if (node.answered || node.triggering) return;
        // Arif visits blue (owner=arif), Ajeng visits pink (owner=ajeng)
        const char = node.owner === 'arif' ? arif : ajeng;
        if (char.col === node.col && char.row === node.row && !char.moving) {
            // Ensure all quest nodes have unique questions if possible
            if (!node.question && questionsPool.length > 0) {
                const remaining = questionsPool.filter(q =>
                    !questNodes.some(n => n.question === q));
                if (remaining.length > 0) {
                    const qIdx = Math.floor(Math.random() * remaining.length);
                    node.question = remaining[qIdx];
                    // Remove from pool to ensure no other node (including future resets) gets it
                    const poolIdx = questionsPool.indexOf(node.question);
                    if (poolIdx > -1) questionsPool.splice(poolIdx, 1);
                } else {
                    // Fallback if pool is empty (should not happen with 100+ questions)
                    node.question = questionsPool[Math.floor(Math.random() * questionsPool.length)];
                }
            }
            node.triggering = true; // debounce flag
            menuSynth.playSFX('quest');
            showQuestModal(idx);
        }
    });
}

// Show the question modal for a quest node
function showQuestModal(idx) {
    const node = questNodes[idx];
    if (!node || node.answered) return;
    activeQuestIdx = idx;
    questPaused = true;

    const modal = document.getElementById('quest-modal');
    const portrait = document.getElementById('quest-portrait');
    const who = document.getElementById('quest-who');
    const qText = document.getElementById('quest-question');
    const fb = document.getElementById('quest-feedback');
    fb.textContent = '';
    fb.className = '';

    // Set portrait image and label
    if (node.owner === 'arif') {
        portrait.src = 'arif.png';
        portrait.className = 'arif-portrait';
        who.textContent = '🔵 ARIF — Pertanyaan Biru';
        who.className = 'arif-who';
    } else {
        portrait.src = 'ajeng.png';
        portrait.className = 'ajeng-portrait';
        who.textContent = '🩷 AJENG — Pertanyaan Pink';
        who.className = 'ajeng-who';
    }

    const q = node.question;
    qText.textContent = q ? q.text : 'Pertanyaan tidak dapat dimuat.';

    const labels = ['A', 'B', 'C', 'D'];
    for (let i = 0; i < 4; i++) {
        const btn = document.getElementById('qa-' + i);
        btn.textContent = q ? `${labels[i]}. ${q.options[i]}` : `Pilihan ${labels[i]}`;
        btn.className = 'quest-btn';
        btn.disabled = false;
    }

    modal.classList.remove('hidden');
}

// Handle answering a quest question
window._answerQuest = function (optIdx) {
    if (activeQuestIdx < 0) return;
    const node = questNodes[activeQuestIdx];
    const q = node.question;
    const isCorrect = q && (optIdx === q.correctIdx);
    const fb = document.getElementById('quest-feedback');

    // Highlight correct/wrong
    for (let i = 0; i < 4; i++) {
        const btn = document.getElementById('qa-' + i);
        btn.disabled = true;
        if (q && i === q.correctIdx) btn.classList.add('correct');
        else if (i === optIdx && !isCorrect) btn.classList.add('wrong');
    }

    if (isCorrect) {
        menuSynth.playSFX('correct');
        fb.textContent = '✅ Benar! Quest selesai!';
        fb.className = 'correct';
        setTimeout(() => {
            closeQuestModal();
            // Mark answered
            node.answered = true;
            questsAnswered++;
            scene.remove(node.mesh);
            node.mesh = null;
            updateQuestStatus();
        }, 1200);
    } else {
        menuSynth.playSFX('wrong');
        fb.textContent = '❌ Salah! Nyawa berkurang.';
        fb.className = 'wrong';
        lives = Math.max(0, lives - 1);
        updateLives();
        // Flash screen red
        const gc = document.getElementById('game-container');
        gc.classList.add('red-flash');
        setTimeout(() => gc.classList.remove('red-flash'), 600);

        if (lives <= 0) {
            setTimeout(() => {
                closeQuestModal();
                triggerGameOver();
            }, 1300);
        } else {
            setTimeout(() => {
                closeQuestModal();
                // Reset question so a new one is picked from the pool when re-entered
                node.question = null;
            }, 1300);
        }
    }
};

function closeQuestModal() {
    if (activeQuestIdx >= 0) {
        questNodes[activeQuestIdx].triggering = false;
    }
    document.getElementById('quest-modal').classList.add('hidden');
    questPaused = false;
    activeQuestIdx = -1;
}

function updateLives() {
    const el = document.getElementById('lives-display');
    if (!el) return;
    let html = '';
    for (let i = 0; i < 3; i++) {
        const icon = i < lives ? 'heart' : 'heart-off';
        const color = i < lives ? '#ff4d6d' : '#444';
        html += `<i data-lucide="${icon}" style="color:${color}; width:20px; height:20px; margin-right:2px;"></i>`;
    }
    el.innerHTML = html;
    if (window.lucide) lucide.createIcons({ props: { "stroke-width": 2.5 } });
}

function updateQuestStatus() {
    const el = document.getElementById('quest-status');
    if (el) {
        el.innerHTML = `<i data-lucide="scroll-text" style="width:18px; height:18px; vertical-align:middle; margin-right:4px;"></i> ${questsAnswered}/4`;
        if (window.lucide) lucide.createIcons();
    }
}

let questWarnCooldown = 0;
function showQuestWarning() {
    const now = performance.now();
    if (now - questWarnCooldown < 3000) return;
    questWarnCooldown = now;
    const fb = document.createElement('div');
    fb.style.cssText = [
        'position:absolute', 'top:50%', 'left:50%',
        'transform:translate(-50%,-50%)',
        'background:rgba(20,5,50,0.92)',
        'border:2px solid #ff69b4',
        'border-radius:1rem',
        'padding:1.2rem 2rem',
        'color:#ff69b4',
        'font-family:Rajdhani,sans-serif',
        'font-size:1.1rem',
        'font-weight:700',
        'letter-spacing:0.1em',
        'text-align:center',
        'z-index:80',
        'pointer-events:none',
        'animation:questCardIn 0.3s ease'
    ].join(';');
    fb.textContent = `⚠️ Selesaikan semua quest dulu! (${questsAnswered}/4)`;
    document.getElementById('game-container').appendChild(fb);
    setTimeout(() => fb.remove(), 2500);
}

function triggerGameOver(customReason) {
    menuSynth.playSFX('wrong');
    gameWon = true; // prevent further win checks
    clearInterval(timerID);
    const go = document.getElementById('game-over-screen');
    const gt = document.getElementById('gameover-time');
    const gr = document.createElement('div');
    gr.style.cssText = 'color:#ff4444; font-size:1.1rem; margin-top:10px; font-weight:700;';
    gr.textContent = customReason || '';

    if (gt) gt.textContent = `Waktu: ${formatTime(elapsedSec)}`;
    if (go) {
        // Remove any previous reason
        const oldReason = go.querySelector('.go-reason');
        if (oldReason) oldReason.remove();
        if (customReason) {
            gr.className = 'go-reason';
            const container = go.querySelector('.menu-card') || go;
            container.appendChild(gr);
        }
        go.classList.remove('hidden');
    }
}

function triggerFusion(fusionPos) {
    if (gameWon) return;
    gameWon = false; // don't end game yet - continue to phase 2

    menuSynth.playSFX('fusion');
    spawnParticles(fusionPos.clone().add(new THREE.Vector3(0, 1.5, 0)));

    // Hide Ajeng, keep Arif
    if (ajeng.group) ajeng.group.visible = false;
    fusionComplete = true;
    // Keep fusionEffect active!
    fusionEffect.active = true;

    // Switch to single-camera mode (follow Arif only)
    // Place end goal far from center
    placeEndGoal();

    // Queue emotional dialogue post-fusion
    chatQueue.push({ char: 'ajeng', text: 'Kita berhasil bersatu, Arif!', delay: Math.ceil(elapsedSec) + 1 });
    chatQueue.push({ char: 'arif', text: 'Kekuatan kita kini menyatu! Ayo terus melesat!', delay: Math.ceil(elapsedSec) + 4 });
    chatQueue.push({ char: 'ajeng', text: 'Fokus ke titik hijau untuk kembali pulang!', delay: Math.ceil(elapsedSec) + 7 });

    // Show message
    const msg = document.createElement('div');
    msg.style.cssText = [
        'position:absolute', 'top:50%', 'left:50%',
        'transform:translate(-50%,-50%)',
        'background:rgba(20,5,50,0.92)',
        'border:2px solid #44bbff',
        'border-radius:1rem',
        'padding:1.5rem 2.5rem',
        'color:#44bbff',
        'font-family:Rajdhani,sans-serif',
        'font-size:1.3rem',
        'font-weight:900',
        'letter-spacing:0.15em',
        'text-align:center',
        'z-index:80',
        'pointer-events:none',
        'animation:questCardIn 0.4s ease'
    ].join(';');
    msg.innerHTML = '⚡ FUSION COMPLETE!<br><span style="font-size:0.8rem;color:rgba(255,255,255,0.6)">Temukan titik akhir di minimap 🗺️</span>';
    document.getElementById('game-container').appendChild(msg);
    setTimeout(() => msg.remove(), 4000);
}

function placeEndGoal() {
    // Place end goal far from current fusion position (arif.col/row)
    const fx = arif.col, fy = arif.row;
    const occupied = [{ col: fx, row: fy }];
    questNodes.forEach(n => occupied.push({ col: n.col, row: n.row }));

    // Find a random open cell with high Manhattan distance from fusion point
    let bestCells = [];
    let maxD = 0;

    for (let t = 0; t < 250; t++) {
        const c = 1 + Math.floor(Math.random() * (MAZE_W - 2));
        const r = 1 + Math.floor(Math.random() * (MAZE_H - 2));
        if (mazeData[r][c] !== 0) continue;

        const d = Math.abs(c - fx) + Math.abs(r - fy);
        if (d > maxD) {
            maxD = d;
            bestCells = [{ col: c, row: r }];
        } else if (d === maxD && d > 12) {
            bestCells.push({ col: c, row: r });
        }
    }

    // Pick one of the far cells randomly to avoid predictability
    const finalCell = bestCells.length > 0
        ? bestCells[Math.floor(Math.random() * bestCells.length)]
        : { col: MAZE_W - 2, row: 1 };

    endGoalCell = finalCell;

    // Create goal portal mesh
    const world = cellToWorld(endGoalCell.col, endGoalCell.row);
    const ringGeo = new THREE.TorusGeometry(1.2, 0.18, 12, 36);
    const ringMat = new THREE.MeshStandardMaterial({ color: 0xffd700, emissive: 0xffaa00, emissiveIntensity: 2.0, roughness: 0.1 });
    const goalMesh = new THREE.Mesh(ringGeo, ringMat);
    goalMesh.rotation.x = Math.PI / 2;
    goalMesh.position.set(world.x, 1.5, world.z);

    const pillar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.1, 3, 8),
        new THREE.MeshBasicMaterial({ color: 0xffd700 })
    );
    pillar.position.set(world.x, 1.5, world.z);

    const light2 = new THREE.PointLight(0xffd700, 3, 14);
    light2.position.set(world.x, 2, world.z);

    scene.add(goalMesh, pillar, light2);
    endGoalCell.mesh = goalMesh;
    endGoalCell.pillar = pillar;
    endGoalCell.light = light2;
}
