import { FilesetResolver, HandLandmarker } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

import { CONFIG, LM, HAND_CONNECTIONS } from "./config.js";
import { initLanguage, setLanguage, getLanguage, t, translatePage } from "./i18n.js";
import { HandTracker, PinchDetector, isFist } from "./gestures.js";
import { PointFilter } from "./filters.js";
import { applyPhotoboothEffect } from "./effects.js";
import { createGallery } from "./gallery.js";

/* ------------------------------------------------------------------ DOM */

const $ = (id) => document.getElementById(id);

const videoEl = $("webcam");
const canvas = $("sceneCanvas");
const ctx = canvas.getContext("2d", { willReadFrequently: true });
const stageEl = $("stage");

const statusDot = $("statusDot");
const statusText = $("statusText");
const loadingOverlay = $("loadingOverlay");
const loaderText = $("loaderText");
const loaderRetry = $("loaderRetry");
const errorBanner = $("errorBanner");
const progressBadge = $("progressBadge");
const progressText = $("progressText");
const gridSelect = $("gridSelect");
const langBtn = $("langBtn");
const resetAllBtn = $("resetAllBtn");
const downloadStripBtn = $("downloadStripBtn");

const gallery = createGallery({
  stripEl: $("galleryStrip"),
  emptyEl: $("galleryEmpty"),
  countEl: $("galleryCount"),
  downloadBtn: downloadStripBtn,
  completeMsgEl: $("stripCompleteMsg"),
});

/* ---------------------------------------------------------------- state */

// "tracking" -> "countdown" -> "puzzle" -> "shattering" -> "tracking"
let appState = "tracking";
let handLandmarker = null;
let selectedGrid = CONFIG.DEFAULT_GRID;

const puzzle = {
  boardBox: null,
  pieces: [],
  solved: false,
  tileW: 0,
  tileH: 0,
  grid: CONFIG.DEFAULT_GRID,
  fullPhotoboothCanvas: null,
};

const countdown = { startedAt: 0 };
const freezeGate = { holding: false, since: 0 };
const lastSeenFrame = { box: null, at: 0 };
const drag = { slot: null, piece: null, offsetX: 0, offsetY: 0 };
const shatter = { fragments: [], startedAt: 0, lastTick: 0, pendingCanvas: null };

const tracker = new HandTracker();
const pinchDetectors = [new PinchDetector(), new PinchDetector()];
const frameFilters = [new PointFilter(), new PointFilter()];
const dragFilter = new PointFilter();

let fistHoldStart = null;
let lastVideoTime = -1;
let lastResult = { landmarks: [] };
let detectErrorShown = false;

/* ---------------------------------------------------------------- status */

let statusSig = "";
let statusKey = "status.starting";
let statusParams = {};

function setStatus(key, params = {}) {
  const sig = key + JSON.stringify(params);
  if (sig === statusSig) return;
  statusSig = sig;
  statusKey = key;
  statusParams = params;
  statusText.textContent = t(key, params);
}

function renderStatus() {
  statusText.textContent = t(statusKey, statusParams);
}

/* --------------------------------------------------------------- helpers */

function aspect() {
  return canvas.width / canvas.height;
}

function toPixel(landmark) {
  return { x: landmark.x * canvas.width, y: landmark.y * canvas.height };
}

function mirrorX(landmark) {
  return { x: 1 - landmark.x, y: landmark.y };
}

function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function fitCanvasToWindow() {
  const vw = stageEl.clientWidth;
  const vh = stageEl.clientHeight;
  const videoAspect = canvas.width / canvas.height;

  let cssW, cssH;
  if (vw / vh > videoAspect) {
    cssW = vw;
    cssH = vw / videoAspect;
  } else {
    cssH = vh;
    cssW = vh * videoAspect;
  }
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
}

/* ---------------------------------------------------------------- camera */

async function initWebcam() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error(t("error.noCameraApi"));
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
    audio: false,
  });

  // Register the handler BEFORE assigning the stream (avoids missing the event).
  const metadataReady = new Promise((resolve) => {
    videoEl.onloadedmetadata = () => {
      videoEl.play();
      resolve();
    };
  });
  videoEl.srcObject = stream;
  await metadataReady;

  canvas.width = videoEl.videoWidth;
  canvas.height = videoEl.videoHeight;
  fitCanvasToWindow();
}

async function createLandmarker(vision, delegate, timeoutMessage) {
  return withTimeout(
    HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: CONFIG.MODEL_URL, delegate },
      runningMode: "VIDEO",
      numHands: 2,
      minHandDetectionConfidence: 0.6,
      minHandPresenceConfidence: 0.6,
      minTrackingConfidence: 0.6,
    }),
    CONFIG.LOAD_TIMEOUT_MS,
    timeoutMessage
  );
}

async function initHandLandmarker() {
  const vision = await withTimeout(
    FilesetResolver.forVisionTasks(CONFIG.WASM_URL),
    CONFIG.LOAD_TIMEOUT_MS,
    t("error.wasmTimeout")
  );

  try {
    return await createLandmarker(vision, "GPU", t("error.modelTimeoutGpu"));
  } catch (gpuErr) {
    console.warn("[PuzzleCam] GPU delegate failed, retrying with CPU…", gpuErr);
  }
  return createLandmarker(vision, "CPU", t("error.modelTimeoutCpu"));
}

/* -------------------------------------------------------------- capture */

function computeHandFrame(a, b) {
  const minX = Math.min(a.x, b.x) - CONFIG.FRAME_PADDING;
  const maxX = Math.max(a.x, b.x) + CONFIG.FRAME_PADDING;
  const minY = Math.min(a.y, b.y) - CONFIG.FRAME_PADDING;
  const maxY = Math.max(a.y, b.y) + CONFIG.FRAME_PADDING;

  const x = Math.max(0, minX);
  const y = Math.max(0, minY);
  return {
    x,
    y,
    width: Math.min(canvas.width, maxX) - x,
    height: Math.min(canvas.height, maxY) - y,
  };
}

function startCountdown(frameBox) {
  puzzle.boardBox = { ...frameBox };
  appState = "countdown";
  countdown.startedAt = performance.now();
}

function applyBWInsideBox(box) {
  const x = Math.max(0, Math.round(box.x));
  const y = Math.max(0, Math.round(box.y));
  const w = Math.min(canvas.width - x, Math.round(box.width));
  const h = Math.min(canvas.height - y, Math.round(box.height));
  if (w <= 0 || h <= 0) return;

  const region = ctx.getImageData(x, y, w, h);
  applyPhotoboothEffect(region);
  ctx.putImageData(region, x, y);
}

function drawCountdownOverlay(box, now) {
  const remaining = CONFIG.COUNTDOWN_SECONDS - (now - countdown.startedAt) / 1000;
  if (remaining <= 0) {
    finishCountdownAndCapture(box);
    return;
  }

  applyBWInsideBox(box);

  const n = Math.ceil(remaining);
  ctx.save();
  ctx.strokeStyle = "#f5c518";
  ctx.lineWidth = 3;
  ctx.strokeRect(box.x, box.y, box.width, box.height);

  ctx.fillStyle = "rgba(10,10,8,0.45)";
  ctx.fillRect(box.x, box.y, box.width, box.height);

  ctx.font = `${Math.max(48, Math.min(box.width, box.height) * 0.4)}px 'IBM Plex Mono', monospace`;
  ctx.fillStyle = "#f5c518";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(n), box.x + box.width / 2, box.y + box.height / 2);
  ctx.restore();

  setStatus("status.countdown", { n });
}

function finishCountdownAndCapture(box) {
  // Mirrored snapshot of the current video frame, cropped to the hand frame.
  const mirrored = makeCanvas(canvas.width, canvas.height);
  const mctx = mirrored.getContext("2d");
  mctx.save();
  mctx.translate(mirrored.width, 0);
  mctx.scale(-1, 1);
  mctx.drawImage(videoEl, 0, 0, mirrored.width, mirrored.height);
  mctx.restore();

  const crop = makeCanvas(Math.max(1, Math.round(box.width)), Math.max(1, Math.round(box.height)));
  const cropCtx = crop.getContext("2d");
  cropCtx.drawImage(mirrored, box.x, box.y, box.width, box.height, 0, 0, crop.width, crop.height);

  const imageData = cropCtx.getImageData(0, 0, crop.width, crop.height);
  applyPhotoboothEffect(imageData);
  cropCtx.putImageData(imageData, 0, 0);

  puzzle.grid = selectedGrid;
  puzzle.fullPhotoboothCanvas = crop;

  const grid = puzzle.grid;
  const tileW = Math.floor(crop.width / grid);
  const tileH = Math.floor(crop.height / grid);
  const pieces = [];

  for (let row = 0; row < grid; row++) {
    for (let col = 0; col < grid; col++) {
      const sx = col * tileW;
      const sy = row * tileH;
      const w = col === grid - 1 ? crop.width - sx : tileW;
      const h = row === grid - 1 ? crop.height - sy : tileH;

      const pieceCanvas = makeCanvas(w, h);
      pieceCanvas.getContext("2d").drawImage(crop, sx, sy, w, h, 0, 0, w, h);

      pieces.push({ row, col, canvas: pieceCanvas, w, h, x: 0, y: 0, placed: false, dragging: false, displacing: false });
    }
  }

  const slots = [];
  for (let row = 0; row < grid; row++) {
    for (let col = 0; col < grid; col++) {
      slots.push({ x: box.x + col * tileW, y: box.y + row * tileH });
    }
  }
  shuffle(slots);

  puzzle.boardBox = box;
  puzzle.pieces = pieces;
  puzzle.tileW = tileW;
  puzzle.tileH = tileH;

  pieces.forEach((piece, i) => {
    piece.x = slots[i].x;
    piece.y = slots[i].y;
    if (isNearOwnCell(piece)) snapPieceToCell(piece);
  });

  puzzle.solved = pieces.every((p) => p.placed);
  appState = "puzzle";
  fistHoldStart = null;
  updateProgressBadge();
}

/* --------------------------------------------------------------- puzzle */

function cellOrigin(row, col) {
  return { x: puzzle.boardBox.x + col * puzzle.tileW, y: puzzle.boardBox.y + row * puzzle.tileH };
}

function isNearOwnCell(piece) {
  const target = cellOrigin(piece.row, piece.col);
  const tolerance = Math.min(puzzle.tileW, puzzle.tileH) * CONFIG.SNAP_DISTANCE_RATIO;
  return Math.hypot(piece.x - target.x, piece.y - target.y) < tolerance;
}

function reconcilePlacedState() {
  if (!puzzle.boardBox || !puzzle.pieces.length) return false;
  for (const piece of puzzle.pieces) {
    if (piece.displacing || piece.dragging) continue;
    piece.placed = isNearOwnCell(piece);
  }
  return puzzle.pieces.every((p) => p.placed);
}

function pieceCenterInCell(p, cellX, cellY) {
  const cx = p.x + p.w / 2;
  const cy = p.y + p.h / 2;
  return cx >= cellX && cx < cellX + puzzle.tileW && cy >= cellY && cy < cellY + puzzle.tileH;
}

function snapPieceToCell(piece) {
  displaceCellOccupant(piece, piece.row, piece.col);
  const target = cellOrigin(piece.row, piece.col);
  piece.x = target.x;
  piece.y = target.y;
  piece.placed = true;
}

function displaceCellOccupant(piece, targetRow, targetCol) {
  const cell = cellOrigin(targetRow, targetCol);

  const occupant = puzzle.pieces.find(
    (p) => p !== piece && !p.displacing && pieceCenterInCell(p, cell.x, cell.y)
  );
  if (!occupant) return;
  if (occupant.row === targetRow && occupant.col === targetCol && occupant.placed) return;

  occupant.placed = false;

  const freeCells = [];
  for (let row = 0; row < puzzle.grid; row++) {
    for (let col = 0; col < puzzle.grid; col++) {
      if (row === targetRow && col === targetCol) continue;
      const o = cellOrigin(row, col);
      const taken = puzzle.pieces.some(
        (p) => p !== occupant && p !== piece && !p.displacing && pieceCenterInCell(p, o.x, o.y)
      );
      if (!taken) freeCells.push({ row, col });
    }
  }

  const slot = freeCells.length
    ? freeCells[Math.floor(Math.random() * freeCells.length)]
    : { row: occupant.row, col: occupant.col };

  const o = cellOrigin(slot.row, slot.col);
  const jitterX = (Math.random() - 0.5) * puzzle.tileW * 0.5;
  const jitterY = (Math.random() - 0.5) * puzzle.tileH * 0.5;
  animateDisplacement(occupant, o.x + jitterX, o.y + jitterY);
}

function animateDisplacement(piece, targetX, targetY) {
  const startX = piece.x;
  const startY = piece.y;
  const startedAt = performance.now();
  piece.displacing = true;

  function step() {
    const tt = Math.min(1, (performance.now() - startedAt) / CONFIG.DISPLACE_ANIM_MS);
    const eased = 1 - Math.pow(1 - tt, 3);
    piece.x = startX + (targetX - startX) * eased;
    piece.y = startY + (targetY - startY) * eased;

    if (tt < 1) {
      requestAnimationFrame(step);
    } else {
      piece.displacing = false;
      if (puzzle.boardBox) clampPieceToBoard(piece);
    }
  }
  requestAnimationFrame(step);
}

function clampPieceToBoard(piece) {
  const box = puzzle.boardBox;
  piece.x = Math.min(Math.max(piece.x, box.x), box.x + box.width - piece.w);
  piece.y = Math.min(Math.max(piece.y, box.y), box.y + box.height - piece.h);
}

function findNearestPiece(px, py) {
  let best = null;
  let bestDist = Infinity;
  for (const piece of puzzle.pieces) {
    if (piece.displacing) continue;
    const d = Math.hypot(px - (piece.x + piece.w / 2), py - (piece.y + piece.h / 2));
    if (d < Math.max(piece.w, piece.h) * 0.75 && d < bestDist) {
      best = piece;
      bestDist = d;
    }
  }
  return best;
}

function handleDragForHand(slot, pinching, rawPx, now) {
  if (pinching) {
    if (drag.slot === null) {
      const candidate = findNearestPiece(rawPx.x, rawPx.y);
      if (candidate) {
        dragFilter.reset();
        dragFilter.filter(rawPx, now);
        drag.slot = slot;
        drag.piece = candidate;
        drag.offsetX = rawPx.x - candidate.x;
        drag.offsetY = rawPx.y - candidate.y;
        candidate.dragging = true;
        candidate.placed = false;
      }
    } else if (drag.slot === slot && drag.piece) {
      const p = dragFilter.filter(rawPx, now);
      drag.piece.x = p.x - drag.offsetX;
      drag.piece.y = p.y - drag.offsetY;
    }
    return;
  }

  if (drag.slot === slot && drag.piece) {
    const piece = drag.piece;
    piece.dragging = false;

    if (isNearOwnCell(piece)) {
      snapPieceToCell(piece);
    } else {
      clampPieceToBoard(piece);
      const box = puzzle.boardBox;
      const last = puzzle.grid - 1;
      const dropCol = Math.min(last, Math.max(0, Math.floor((piece.x + piece.w / 2 - box.x) / puzzle.tileW)));
      const dropRow = Math.min(last, Math.max(0, Math.floor((piece.y + piece.h / 2 - box.y) / puzzle.tileH)));
      displaceCellOccupant(piece, dropRow, dropCol);
    }

    drag.slot = null;
    drag.piece = null;
    puzzle.solved = reconcilePlacedState();
    updateProgressBadge();
  }
}

function resetPuzzleOnly() {
  puzzle.boardBox = null;
  puzzle.pieces = [];
  puzzle.solved = false;
  puzzle.fullPhotoboothCanvas = null;
  appState = "tracking";
  drag.slot = null;
  drag.piece = null;
  shatter.fragments = [];
  shatter.pendingCanvas = null;
  fistHoldStart = null;
  lastSeenFrame.box = null;
  lastSeenFrame.at = 0;
  freezeGate.holding = false;
  pinchDetectors.forEach((d) => d.reset());
  frameFilters.forEach((f) => f.reset());
  updateProgressBadge();
}

function resetEverything() {
  gallery.reset();
  resetPuzzleOnly();
  setStatus("status.resetAll");
}

/* -------------------------------------------------------------- drawing */

function drawVideoFrame() {
  ctx.save();
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
  ctx.restore();
}

function drawLiveFrameOverlay(box) {
  ctx.save();
  ctx.strokeStyle = "#f5c518";
  ctx.lineWidth = 3;
  ctx.strokeRect(box.x, box.y, box.width, box.height);

  const len = 18;
  ctx.lineWidth = 4;
  const corners = [
    [box.x, box.y, 1, 1],
    [box.x + box.width, box.y, -1, 1],
    [box.x, box.y + box.height, 1, -1],
    [box.x + box.width, box.y + box.height, -1, -1],
  ];
  for (const [cx, cy, dx, dy] of corners) {
    ctx.beginPath();
    ctx.moveTo(cx, cy + len * dy);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx + len * dx, cy);
    ctx.stroke();
  }
  ctx.restore();
}

function drawBoardAndPieces() {
  const box = puzzle.boardBox;

  ctx.save();
  ctx.fillStyle = "#000";
  ctx.fillRect(box.x, box.y, box.width, box.height);
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = "rgba(245,197,24,0.18)";
  ctx.lineWidth = 1;
  for (let i = 1; i < puzzle.grid; i++) {
    ctx.beginPath();
    ctx.moveTo(box.x + i * puzzle.tileW, box.y);
    ctx.lineTo(box.x + i * puzzle.tileW, box.y + box.height);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(box.x, box.y + i * puzzle.tileH);
    ctx.lineTo(box.x + box.width, box.y + i * puzzle.tileH);
    ctx.stroke();
  }
  ctx.restore();

  // Dragged piece is drawn last (on top).
  const ordered = [...puzzle.pieces].sort((a, b) => Number(a.dragging) - Number(b.dragging));
  for (const piece of ordered) {
    ctx.save();
    if (piece.dragging) {
      ctx.shadowColor = "rgba(245,197,24,0.9)";
      ctx.shadowBlur = 14;
    }
    ctx.drawImage(piece.canvas, piece.x, piece.y, piece.w, piece.h);
    ctx.strokeStyle = piece.placed ? "#5fae6e" : "rgba(234,229,214,0.5)";
    ctx.lineWidth = piece.dragging ? 3 : 1.5;
    ctx.strokeRect(piece.x, piece.y, piece.w, piece.h);
    ctx.restore();
  }

  ctx.save();
  ctx.strokeStyle = puzzle.solved ? "#5fae6e" : "#f5c518";
  ctx.lineWidth = 3;
  ctx.strokeRect(box.x, box.y, box.width, box.height);
  ctx.restore();

  if (puzzle.solved) {
    ctx.save();
    ctx.fillStyle = "rgba(95,174,110,0.15)";
    ctx.fillRect(box.x, box.y, box.width, box.height);
    ctx.font = `${Math.max(20, box.width * 0.07)}px 'IBM Plex Mono', monospace`;
    ctx.fillStyle = "#5fae6e";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(t("canvas.solved"), box.x + box.width / 2, box.y + box.height / 2, box.width * 0.95);
    ctx.restore();
  }
}

function drawHandSkeleton(pts) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowColor = "rgba(255,255,255,0.85)";
  ctx.shadowBlur = 10;
  ctx.strokeStyle = "white";
  ctx.lineWidth = 3;

  for (const [iA, iB] of HAND_CONNECTIONS) {
    ctx.beginPath();
    ctx.moveTo(pts[iA].x, pts[iA].y);
    ctx.lineTo(pts[iB].x, pts[iB].y);
    ctx.stroke();
  }

  ctx.shadowBlur = 6;
  ctx.fillStyle = "white";
  for (const p of pts) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function isPointInBox(px, py, box) {
  return px >= box.x && px <= box.x + box.width && py >= box.y && py <= box.y + box.height;
}

function drawHandSkeletonsOverBoard(hands, box) {
  if (!box) return;
  for (const { landmarks } of hands) {
    const pts = landmarks.map((pt) => toPixel(mirrorX(pt)));
    if (pts.some((p) => isPointInBox(p.x, p.y, box))) drawHandSkeleton(pts);
  }
}

function updateProgressBadge() {
  if (appState !== "puzzle") {
    progressBadge.classList.remove("visible", "solved");
    return;
  }
  const placed = puzzle.pieces.filter((p) => p.placed).length;
  progressText.textContent = t("progress", { placed, total: puzzle.pieces.length });
  progressBadge.classList.add("visible");
  progressBadge.classList.toggle("solved", puzzle.solved);
}

/* -------------------------------------------------------------- shatter */

function startShatter(sourceCanvas, box, now) {
  const cols = CONFIG.SHATTER_COLS;
  const rows = CONFIG.SHATTER_ROWS;
  const fragW = sourceCanvas.width / cols;
  const fragH = sourceCanvas.height / rows;
  const boardCx = box.x + box.width / 2;
  const boardCy = box.y + box.height / 2;
  const fragments = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const sx = col * fragW;
      const sy = row * fragH;

      const fragCanvas = makeCanvas(Math.ceil(fragW), Math.ceil(fragH));
      fragCanvas.getContext("2d").drawImage(sourceCanvas, sx, sy, fragW, fragH, 0, 0, fragCanvas.width, fragCanvas.height);

      const cx = box.x + sx + fragW / 2;
      const cy = box.y + sy + fragH / 2;
      const dirX = cx - boardCx;
      const dirY = cy - boardCy;
      const dirLen = Math.max(1, Math.hypot(dirX, dirY));
      const speed = 90 + Math.random() * 160;

      fragments.push({
        canvas: fragCanvas,
        x: cx,
        y: cy,
        w: fragW,
        h: fragH,
        vx: (dirX / dirLen) * speed + (Math.random() - 0.5) * 40,
        vy: (dirY / dirLen) * speed + (Math.random() - 0.5) * 40 - 60,
        rotation: 0,
        rotationSpeed: (Math.random() - 0.5) * 6,
        gravity: 220 + Math.random() * 80,
      });
    }
  }

  shatter.fragments = fragments;
  shatter.startedAt = now;
  shatter.lastTick = now;
  appState = "shattering";
}

function updateAndDrawShatter(now) {
  const t01 = Math.min(1, (now - shatter.startedAt) / CONFIG.SHATTER_DURATION_MS);
  if (t01 >= 1) {
    finishShatter();
    return;
  }

  // Real elapsed time (not a fixed 1/60 s), so the animation speed is the same at any FPS.
  const dt = Math.min(0.05, Math.max(0, (now - shatter.lastTick) / 1000));
  shatter.lastTick = now;

  const fadeStart = 0.45;
  const alpha = t01 < fadeStart ? 1 : Math.max(0, 1 - (t01 - fadeStart) / (1 - fadeStart));
  const scale = 1 - t01 * 0.25;

  for (const frag of shatter.fragments) {
    frag.x += frag.vx * dt;
    frag.y += frag.vy * dt;
    frag.vy += frag.gravity * dt;
    frag.rotation += frag.rotationSpeed * dt;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(frag.x, frag.y);
    ctx.rotate(frag.rotation);
    ctx.scale(scale, scale);
    ctx.drawImage(frag.canvas, -frag.w / 2, -frag.h / 2, frag.w, frag.h);
    ctx.restore();
  }
}

function finishShatter() {
  shatter.fragments = [];
  if (shatter.pendingCanvas) {
    gallery.add(shatter.pendingCanvas);
    setStatus("status.saved");
    shatter.pendingCanvas = null;
  }
  resetPuzzleOnly();
}

function handleFistReset(now) {
  if (appState !== "puzzle") {
    setStatus("status.resetFist");
    resetPuzzleOnly();
    return;
  }

  puzzle.solved = reconcilePlacedState();
  if (puzzle.solved && puzzle.fullPhotoboothCanvas) {
    shatter.pendingCanvas = puzzle.fullPhotoboothCanvas;
    startShatter(puzzle.fullPhotoboothCanvas, puzzle.boardBox, now);
  } else {
    setStatus("status.resetFist");
    resetPuzzleOnly();
  }
}

/* --------------------------------------------------------- frame logic */

function drawGraceFrame(now) {
  if (lastSeenFrame.box && now - lastSeenFrame.at < CONFIG.FRAME_GRACE_MS) {
    applyBWInsideBox(lastSeenFrame.box);
    drawLiveFrameOverlay(lastSeenFrame.box);
  }
}

function processNoHands(now) {
  tracker.reset();
  pinchDetectors.forEach((d) => d.reset());
  frameFilters.forEach((f) => f.reset());
  fistHoldStart = null;
  freezeGate.holding = false;
  statusDot.className = puzzle.solved ? "status-dot solved" : "status-dot";

  if (drag.slot !== null && drag.piece) {
    handleDragForHand(drag.slot, false, { x: drag.piece.x, y: drag.piece.y }, now);
  }

  if (appState === "tracking") {
    drawGraceFrame(now);
    setStatus(gallery.isFull() ? "status.stripFull" : "status.searching");
  } else if (appState === "countdown") {
    drawCountdownOverlay(puzzle.boardBox, now);
  } else if (appState === "puzzle") {
    puzzle.solved = reconcilePlacedState();
    updateProgressBadge();
    drawBoardAndPieces();
    setStatus(puzzle.solved ? "status.solved" : "status.assemble");
  }
}

function processTracking(hands, now) {
  if (gallery.isFull()) {
    setStatus("status.stripFull");
    return;
  }

  if (hands.length !== 2) {
    freezeGate.holding = false;
    frameFilters.forEach((f) => f.reset());
    drawGraceFrame(now);
    setStatus("status.tracking");
    return;
  }

  const points = hands.map((h) => frameFilters[h.slot].filter(toPixel(mirrorX(h.landmarks[LM.INDEX_TIP])), now));
  const frameBox = computeHandFrame(points[0], points[1]);

  if (frameBox.width > 4 && frameBox.height > 4) {
    applyBWInsideBox(frameBox);
    drawLiveFrameOverlay(frameBox);
    lastSeenFrame.box = frameBox;
    lastSeenFrame.at = now;
  }

  const asp = aspect();
  const bothPinching = hands.map((h) => pinchDetectors[h.slot].update(h.landmarks, asp)).every(Boolean);

  if (bothPinching && frameBox.width > 40 && frameBox.height > 40) {
    if (!freezeGate.holding) {
      freezeGate.holding = true;
      freezeGate.since = now;
    }
    statusDot.className = "status-dot armed";
    setStatus("status.hold");

    if (now - freezeGate.since > CONFIG.FREEZE_HOLD_MS) {
      freezeGate.holding = false;
      startCountdown(frameBox);
    }
  } else {
    freezeGate.holding = false;
    setStatus("status.tracking");
  }
}

function processPuzzle(hands, now) {
  const asp = aspect();
  const present = new Set();

  for (const { slot, landmarks } of hands) {
    present.add(slot);
    const pinching = pinchDetectors[slot].update(landmarks, asp);
    const rawPx = toPixel(mirrorX(landmarks[LM.INDEX_TIP]));
    handleDragForHand(slot, pinching, rawPx, now);
  }

  // The dragging hand disappeared: drop the piece where it is.
  if (drag.slot !== null && !present.has(drag.slot) && drag.piece) {
    handleDragForHand(drag.slot, false, { x: drag.piece.x, y: drag.piece.y }, now);
  }

  if (!drag.piece) {
    puzzle.solved = reconcilePlacedState();
    updateProgressBadge();
  }

  drawBoardAndPieces();
  drawHandSkeletonsOverBoard(hands, puzzle.boardBox);

  if (!puzzle.solved) {
    setStatus("status.assemble");
  } else if (fistHoldStart !== null) {
    const pct = Math.min(99, Math.round(((now - fistHoldStart) / CONFIG.FIST_HOLD_MS) * 100));
    setStatus("status.savingFist", { pct });
  } else {
    setStatus("status.solved");
  }
}

function processResults(result, now) {
  if (appState === "shattering") {
    updateAndDrawShatter(now);
    setStatus("status.saving");
    return;
  }

  const hands = tracker.assign(result.landmarks || []);
  if (hands.length === 0) {
    processNoHands(now);
    return;
  }

  statusDot.className = puzzle.solved ? "status-dot solved" : "status-dot live";

  // Fist held long enough -> save (if solved) or reset.
  const asp = aspect();
  const anyFist = hands.some((h) => isFist(h.landmarks, asp));
  const draggingNow = drag.slot !== null && drag.piece !== null;
  if (anyFist && !draggingNow && appState !== "tracking") {
    if (fistHoldStart === null) fistHoldStart = now;
    if (now - fistHoldStart >= CONFIG.FIST_HOLD_MS) {
      fistHoldStart = null;
      handleFistReset(now);
      return;
    }
  } else {
    fistHoldStart = null;
  }

  if (appState === "tracking") processTracking(hands, now);
  else if (appState === "countdown") drawCountdownOverlay(puzzle.boardBox, now);
  else if (appState === "puzzle") processPuzzle(hands, now);
}

function renderLoop() {
  if (videoEl.readyState >= 2 && handLandmarker) {
    const now = performance.now();
    drawVideoFrame();

    // Only run the (expensive) detector when the camera delivered a new frame.
    if (videoEl.currentTime !== lastVideoTime) {
      lastVideoTime = videoEl.currentTime;
      try {
        lastResult = handLandmarker.detectForVideo(videoEl, now);
      } catch (err) {
        console.error("[PuzzleCam] detection error", err);
        lastResult = { landmarks: [] };
        if (!detectErrorShown) {
          detectErrorShown = true;
          showError(t("error.detect"));
        }
      }
    }
    processResults(lastResult, now);
  }
  requestAnimationFrame(renderLoop);
}

/* ------------------------------------------------------- boot / errors */

function showError(message) {
  errorBanner.textContent = message;
  errorBanner.style.display = "block";
}

function showLoaderError(message) {
  loaderText.textContent = message;
  loaderText.style.color = "#e0533d";
  loaderRetry.classList.remove("hidden");
}

function resetLoaderUI() {
  loadingOverlay.classList.remove("hidden");
  loaderText.style.color = "";
  loaderText.textContent = t("loader.loading");
  loaderRetry.classList.add("hidden");
  errorBanner.style.display = "none";
}

async function boot() {
  resetLoaderUI();

  let settled = false;
  const watchdog = setTimeout(() => {
    if (!settled) showLoaderError(t("error.tooSlow"));
  }, CONFIG.LOAD_TIMEOUT_MS * 2 + 5000);

  try {
    if (!videoEl.srcObject) await initWebcam();
    handLandmarker = await initHandLandmarker();

    settled = true;
    clearTimeout(watchdog);
    loadingOverlay.classList.add("hidden");
    setStatus("status.ready");
    requestAnimationFrame(renderLoop);
  } catch (err) {
    settled = true;
    clearTimeout(watchdog);
    if (err?.name === "NotAllowedError") showLoaderError(t("error.cameraDenied"));
    else if (err?.name === "NotFoundError") showLoaderError(t("error.cameraNotFound"));
    else showLoaderError(err?.message || t("error.generic"));
  }
}

/* ------------------------------------------------------------- wiring */

function setupGridSelect() {
  gridSelect.innerHTML = "";
  for (const n of CONFIG.GRID_OPTIONS) {
    const opt = document.createElement("option");
    opt.value = String(n);
    opt.textContent = `${n}×${n}`;
    if (n === selectedGrid) opt.selected = true;
    gridSelect.appendChild(opt);
  }
  gridSelect.addEventListener("change", () => {
    selectedGrid = Number(gridSelect.value);
    gridSelect.blur(); // keep keyboard shortcuts working
  });
}

function refreshLanguageUi() {
  translatePage();
  langBtn.textContent = getLanguage() === "en" ? "ES" : "EN";
  renderStatus();
  updateProgressBadge();
  if (!loaderRetry.classList.contains("hidden")) return; // keep the error message as shown
  if (!loadingOverlay.classList.contains("hidden")) loaderText.textContent = t("loader.loading");
}

langBtn.addEventListener("click", () => {
  setLanguage(getLanguage() === "en" ? "es" : "en");
  refreshLanguageUi();
});

loaderRetry.addEventListener("click", boot);
downloadStripBtn.addEventListener("click", () => gallery.download());
resetAllBtn.addEventListener("click", () => {
  if (window.confirm(t("gallery.confirmReset"))) resetEverything();
});

window.addEventListener("resize", fitCanvasToWindow);

window.addEventListener("keydown", (e) => {
  if (e.target instanceof HTMLSelectElement || e.ctrlKey || e.metaKey || e.altKey) return;
  const key = e.key.toLowerCase();
  if (key === "r" && (appState === "puzzle" || appState === "countdown")) {
    resetPuzzleOnly();
    setStatus("status.resetKey");
  } else if (key === "d") {
    gallery.download();
  }
});

window.addEventListener("pagehide", () => {
  videoEl.srcObject?.getTracks().forEach((track) => track.stop());
  handLandmarker?.close();
});

initLanguage();
setupGridSelect();
refreshLanguageUi();
boot();
