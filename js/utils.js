// =============================================
// UTILITY FUNCTIONS
// =============================================

function isWallCell(c, r) {
    if (c < 0 || c >= MAZE_W || r < 0 || r >= MAZE_H) return true;
    return mazeData[r][c] === 1;
}

function cellToWorld(c, r) {
    return new THREE.Vector3(c * CELL, 0, r * CELL);
}

function formatTime(s) {
    const m = Math.floor(s / 60);
    const rs = s % 60;
    return `${m.toString().padStart(2, '0')}:${rs.toString().padStart(2, '0')}`;
}

// Randomly darken/lighten procedural character colors
function lightenColor(hex, a) {
    const c = new THREE.Color(hex);
    c.r = Math.max(0, Math.min(1, c.r + a));
    c.g = Math.max(0, Math.min(1, c.g + a));
    c.b = Math.max(0, Math.min(1, c.b + a));
    return c;
}
