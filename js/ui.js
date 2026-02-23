// =============================================
// UI: Minimap, HUD, Controls, and Game States
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
    // Dots for Arif and Ajeng
    const dotR = cp * 0.75;
    mc.fillStyle = '#00aaff'; mc.beginPath(); mc.arc(arif.col * cp + cp / 2, arif.row * cp + cp / 2, dotR, 0, Math.PI * 2); mc.fill();
    if (!fusionComplete) {
        mc.fillStyle = '#ff4d6d'; mc.beginPath(); mc.arc(ajeng.col * cp + cp / 2, ajeng.row * cp + cp / 2, dotR, 0, Math.PI * 2); mc.fill();
        // Connection line
        mc.strokeStyle = 'rgba(255,150,185,0.3)'; mc.lineWidth = 1; mc.setLineDash([2, 2]);
        mc.beginPath(); mc.moveTo(arif.col * cp + cp / 2, arif.row * cp + cp / 2); mc.lineTo(ajeng.col * cp + cp / 2, ajeng.row * cp + cp / 2); mc.stroke(); mc.setLineDash([]);
    }

    // Quest node dots on minimap
    questNodes.forEach(node => {
        if (node.answered) return;
        const nx = node.col * cp + cp / 2, ny = node.row * cp + cp / 2;
        mc.fillStyle = node.owner === 'arif' ? '#44bbff' : '#ff69b4';
        mc.beginPath();
        // Draw diamond shape for quests
        mc.moveTo(nx, ny - cp * 0.8);
        mc.lineTo(nx + cp * 0.8, ny);
        mc.lineTo(nx, ny + cp * 0.8);
        mc.lineTo(nx - cp * 0.8, ny);
        mc.closePath();
        mc.fill();
    });

    // End goal star on minimap (post-fusion)
    if (fusionComplete && endGoalCell.col) {
        const ex = endGoalCell.col * cp + cp / 2, ey = endGoalCell.row * cp + cp / 2;
        mc.fillStyle = '#ffd700';
        mc.font = `${cp * 1.8}px sans-serif`;
        mc.textAlign = 'center';
        mc.textBaseline = 'middle';
        mc.fillText('★', ex, ey);
    }
}

// =============================================
// HUD updates
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
    if (bar) bar.style.width = pct.toFixed(1) + '%';
    return totalDist;
}

// =============================================
// WIN / FUSION TRIGGERS
// =============================================
function checkWin() {
    if (questPaused) return;

    if (!fusionComplete) {
        // Phase 1: check if both near meetingPoint AND all quests done
        const wA = cellToWorld(arif.col, arif.row);
        const wJ = cellToWorld(ajeng.col, ajeng.row);
        const wM = cellToWorld(meetingPoint.col, meetingPoint.row);
        const distA = wA.distanceTo(wM);
        const distJ = wJ.distanceTo(wM);

        if (distA < WIN_DIST && distJ < WIN_DIST && !gameWon) {
            if (questsAnswered < 4) {
                // Game Over if trying to fuse before all quests are complete
                triggerGameOver('Kalian mencoba bersatu sebelum menyelesaikan semua quest!');
                return;
            }
            // All quests done → trigger fusion
            triggerFusion(wM);
        }
    } else {
        // Phase 2 (post-fusion): reach the random end goal
        const wA = cellToWorld(arif.col, arif.row);
        const wE = cellToWorld(endGoalCell.col, endGoalCell.row);
        if (wA.distanceTo(wE) < WIN_DIST && !gameWon) {
            gameWon = true;
            clearInterval(timerID);
            spawnParticles(wE.clone().add(new THREE.Vector3(0, 1.5, 0)));

            // Score calculation
            const timeBonus = Math.max(0, (600 - elapsedSec) * 10);
            const livesBonus = lives * 500;
            const score = timeBonus + livesBonus + (questsAnswered * 200);

            let rank = 'C';
            if (score > 6000) rank = 'S';
            else if (score > 4500) rank = 'A';
            else if (score > 3000) rank = 'B';

            setTimeout(() => {
                document.getElementById('win-screen').classList.remove('hidden');
                const wt = document.getElementById('win-time');
                if (wt) wt.textContent = formatTime(elapsedSec);

                // Add Score & Rank to Win Screen
                const stats = document.querySelector('.win-stats');
                if (stats) {
                    stats.innerHTML += `
                        <div class="stat-item"><i data-lucide="award"></i> <strong>Rank: ${rank}</strong></div>
                        <div class="stat-item"><i data-lucide="star"></i> <strong>Score: ${score}</strong></div>
                    `;
                    if (window.lucide) lucide.createIcons();
                }
            }, 900);
        }
    }
}

// =============================================
// CONTROLS (Keyboard & Joystick)
// =============================================
function setKeyState(key, val) {
    if (key === 'ArrowUp' || key === 'w' || key === 'W') heldKeys.up = val;
    if (key === 'ArrowDown' || key === 's' || key === 'S') heldKeys.down = val;
    if (key === 'ArrowLeft' || key === 'a' || key === 'A') heldKeys.left = val;
    if (key === 'ArrowRight' || key === 'd' || key === 'D') heldKeys.right = val;
}

function getHeldDir() {
    let candidates = [];
    if (heldKeys.up) candidates.push({ dc: 0, dr: -1 });
    if (heldKeys.down) candidates.push({ dc: 0, dr: 1 });
    if (heldKeys.left) candidates.push({ dc: -1, dr: 0 });
    if (heldKeys.right) candidates.push({ dc: 1, dr: 0 });

    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];

    // Alternating logic for smooth isometric diagonal movement (zig-zag)
    if (lastMoveDir) {
        const alt = candidates.find(d => d.dc !== lastMoveDir.dc || d.dr !== lastMoveDir.dr);
        if (alt) return alt;
    }
    return candidates[0];
}

function setupControls() {
    window.addEventListener('keydown', e => {
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
        if (!e.repeat) { setKeyState(e.key, true); const d = getHeldDir(); if (d) { moveQueue = d; } }
    });
    window.addEventListener('keyup', e => setKeyState(e.key, false));
    document.getElementById('start-button').onclick = startGame;
    document.getElementById('restart-button').onclick = () => location.reload();
    setupJoystick();
}

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
        const rect = base.getBoundingClientRect();
        joyOriginX = rect.left + rect.width / 2;
        joyOriginY = rect.top + rect.height / 2;
        base.setPointerCapture(e.pointerId);
        knob.classList.add('active');

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
            }
        }

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
            }
        } else {
            Object.assign(heldKeys, { up: false, down: false, left: false, right: false });
        }
    });

    base.addEventListener('pointerup', resetKnob);
    base.addEventListener('pointercancel', resetKnob);
    base.addEventListener('lostpointercapture', resetKnob);
}

function updateMobileUIToggle() {
    const isMobile = window.innerWidth < 1024 || 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const mobileEl = document.getElementById('mobile-controls');
    if (mobileEl) {
        if (isMobile && gameStarted) mobileEl.classList.remove('hidden');
        else mobileEl.classList.add('hidden');
    }
}
