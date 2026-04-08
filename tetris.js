(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const scoreEl = document.getElementById("score");
  const restartBtn = document.getElementById("restartBtn");

  const COLS = 10;
  const ROWS = 20;
  const CELL = 24;

  // Keep gravity constant for MVP simplicity.
  const DROP_INTERVAL_MS = 650;

  const COLORS = {
    I: "#4dd7ff",
    O: "#ffd84d",
    T: "#b28bff",
    S: "#5CFF8A",
    Z: "#ff5c7a",
    J: "#4d7dff",
    L: "#ff9d4d",
  };

  const PIECE_TYPES = ["I", "O", "T", "S", "Z", "J", "L"];

  function createEmptyBoard() {
    return Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => null));
  }

  function rotateCoordClockwise(coord) {
    // Rotate within a 4x4 grid: (x,y) -> (3-y, x)
    return { x: 3 - coord.y, y: coord.x };
  }

  function getBaseCoords(type) {
    // 4x4 rotation=0 occupancy coordinates (x:0..3, y:0..3).
    switch (type) {
      case "I":
        return [
          { x: 0, y: 1 },
          { x: 1, y: 1 },
          { x: 2, y: 1 },
          { x: 3, y: 1 },
        ];
      case "O":
        return [
          { x: 1, y: 0 },
          { x: 2, y: 0 },
          { x: 1, y: 1 },
          { x: 2, y: 1 },
        ];
      case "T":
        return [
          { x: 1, y: 0 },
          { x: 0, y: 1 },
          { x: 1, y: 1 },
          { x: 2, y: 1 },
        ];
      case "S":
        return [
          { x: 1, y: 0 },
          { x: 2, y: 0 },
          { x: 0, y: 1 },
          { x: 1, y: 1 },
        ];
      case "Z":
        return [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 1, y: 1 },
          { x: 2, y: 1 },
        ];
      case "J":
        return [
          { x: 0, y: 0 },
          { x: 0, y: 1 },
          { x: 1, y: 1 },
          { x: 2, y: 1 },
        ];
      case "L":
        return [
          { x: 3, y: 0 },
          { x: 0, y: 1 },
          { x: 1, y: 1 },
          { x: 2, y: 1 },
        ];
      default:
        return [];
    }
  }

  const ROTATIONS = Object.fromEntries(
    PIECE_TYPES.map((type) => {
      const rotations = [getBaseCoords(type)];
      for (let i = 1; i < 4; i++) {
        rotations.push(rotations[i - 1].map(rotateCoordClockwise));
      }
      return [type, rotations];
    })
  );

  function getBlocks(piece) {
    // piece.x / piece.y are offsets into the board coordinate system.
    const coords = ROTATIONS[piece.type][piece.rotation];
    return coords.map((c) => ({ x: piece.x + c.x, y: piece.y + c.y }));
  }

  let board = createEmptyBoard();
  let current = null; // { type, rotation, x, y }
  let score = 0;
  let isGameOver = false;

  let dropAccumulator = 0;
  let lastTime = 0;
  let rafId = 0;

  const scoreForLines = {
    1: 100,
    2: 300,
    3: 500,
    4: 800,
  };

  function setScore(value) {
    score = value;
    scoreEl.textContent = String(score);
  }

  const spawnX = Math.floor(COLS / 2) - 2; // centers the 4x4 box
  // Spawn high enough for gameplay, but keep at least part visible immediately.
  const spawnY = -1;

  function collides(piece, dx = 0, dy = 0, drot = 0) {
    const rotation = (piece.rotation + drot + 4) % 4;
    const coords = ROTATIONS[piece.type][rotation];

    for (const c of coords) {
      const x = piece.x + dx + c.x;
      const y = piece.y + dy + c.y;

      if (x < 0 || x >= COLS) return true;
      if (y >= ROWS) return true;

      // Allow pieces to exist above the visible board.
      if (y < 0) continue;
      if (board[y][x]) return true;
    }
    return false;
  }

  function lockPiece() {
    const blocks = getBlocks(current);
    for (const b of blocks) {
      if (b.y < 0) continue; // ignore blocks that land above the board
      if (b.y >= 0 && b.y < ROWS && b.x >= 0 && b.x < COLS) {
        board[b.y][b.x] = COLORS[current.type];
      }
    }
  }

  function clearLines() {
    let linesCleared = 0;

    for (let y = ROWS - 1; y >= 0; y--) {
      const full = board[y].every((cell) => cell !== null);
      if (!full) continue;

      board.splice(y, 1);
      board.unshift(Array.from({ length: COLS }, () => null));
      linesCleared++;
      y++; // re-check the row that shifted down
    }

    if (linesCleared > 0) {
      setScore(score + (scoreForLines[linesCleared] ?? 0));
    }
  }

  function spawnPiece() {
    const type = PIECE_TYPES[Math.floor(Math.random() * PIECE_TYPES.length)];
    current = { type, rotation: 0, x: spawnX, y: spawnY };

    if (collides(current, 0, 0, 0)) {
      isGameOver = true;
    }
  }

  function tryMove(dx, dy) {
    if (!collides(current, dx, dy, 0)) {
      current.x += dx;
      current.y += dy;
      return true;
    }
    return false;
  }

  function tryRotate() {
    const nextRotation = (current.rotation + 1) % 4;
    const basePiece = { ...current, rotation: nextRotation };

    // Simple wall kick for MVP.
    const kicks = [0, -1, 1, -2, 2];
    for (const kickX of kicks) {
      if (!collides(current, kickX, 0, 1)) {
        current.x += kickX;
        current.rotation = nextRotation;
        return true;
      }
    }

    // Optional kick upwards if rotation collides due to stacking.
    const kickYs = [-1, -2];
    for (const kickY of kickYs) {
      if (!collides(current, 0, kickY, 1)) {
        current.y += kickY;
        current.rotation = nextRotation;
        return true;
      }
    }

    // Rotation blocked.
    void basePiece;
    return false;
  }

  function hardDrop() {
    let dropped = 0;
    while (tryMove(0, 1)) {
      dropped++;
    }
    // Small reward for hard dropping.
    setScore(score + dropped * 2);
    lockPiece();
    clearLines();
    spawnPiece();
  }

  function softDropOnce() {
    if (tryMove(0, 1)) return;

    // If we can't move down, lock immediately for MVP responsiveness.
    lockPiece();
    clearLines();
    spawnPiece();
  }

  function attemptDownInTick() {
    if (!tryMove(0, 1)) {
      lockPiece();
      clearLines();
      spawnPiece();
      return false;
    }
    return true;
  }

  function drawCell(x, y, color) {
    if (y < 0) return;
    ctx.fillStyle = color;
    ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.strokeRect(x * CELL, y * CELL, CELL, CELL);
  }

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Board background.
    ctx.fillStyle = "#070a14";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw locked blocks.
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const color = board[y][x];
        if (color) drawCell(x, y, color);
      }
    }

    // Draw current piece.
    if (current && !isGameOver) {
      const blocks = getBlocks(current);
      for (const b of blocks) {
        if (b.y < 0) continue;
        drawCell(b.x, b.y, COLORS[current.type]);
      }
    }

    // Grid lines (lightweight, simple).
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    for (let x = 0; x <= COLS; x++) {
      ctx.beginPath();
      ctx.moveTo(x * CELL, 0);
      ctx.lineTo(x * CELL, ROWS * CELL);
      ctx.stroke();
    }
    for (let y = 0; y <= ROWS; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * CELL);
      ctx.lineTo(COLS * CELL, y * CELL);
      ctx.stroke();
    }

    if (isGameOver) {
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.font = "700 22px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
      ctx.fillText("Game Over", canvas.width / 2, canvas.height / 2 - 10);
      ctx.font = "500 14px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
      ctx.fillText("Press R to restart", canvas.width / 2, canvas.height / 2 + 18);
      ctx.textAlign = "start";
    }
  }

  function resetGame() {
    board = createEmptyBoard();
    setScore(0);
    isGameOver = false;
    dropAccumulator = 0;
    lastTime = 0;
    spawnPiece();
    render();
  }

  function frame(t) {
    rafId = requestAnimationFrame(frame);
    if (!lastTime) lastTime = t;
    const delta = t - lastTime;
    lastTime = t;

    if (!isGameOver) {
      dropAccumulator += delta;
      while (dropAccumulator >= DROP_INTERVAL_MS) {
        dropAccumulator -= DROP_INTERVAL_MS;
        attemptDownInTick();
        if (isGameOver) break;
      }
    }

    render();
  }

  function handleKeyDown(e) {
    const code = e.code;

    // Prevent page scrolling / button clicks while playing.
    const shouldPrevent = code.startsWith("Arrow") || code === "Space" || code === "KeyR" || code === "ArrowUp";
    if (shouldPrevent) e.preventDefault();

    if (isGameOver && code !== "KeyR") return;

    switch (code) {
      case "ArrowLeft":
        tryMove(-1, 0);
        break;
      case "ArrowRight":
        tryMove(1, 0);
        break;
      case "ArrowDown":
        softDropOnce();
        break;
      case "ArrowUp":
        tryRotate();
        break;
      case "Space":
        hardDrop();
        break;
      case "KeyR":
        resetGame();
        break;
    }
  }

  // Hook up controls.
  window.addEventListener("keydown", handleKeyDown, { passive: false });
  restartBtn.addEventListener("click", resetGame);

  // Start.
  resetGame();
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(frame);
})();

