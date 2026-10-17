// Central place for every tunable value used by the app.

export const LM = Object.freeze({
  WRIST: 0,
  THUMB_TIP: 4,
  INDEX_MCP: 5,
  INDEX_TIP: 8,
  MIDDLE_MCP: 9,
  MIDDLE_TIP: 12,
  RING_MCP: 13,
  RING_TIP: 16,
  PINKY_MCP: 17,
  PINKY_TIP: 20,
});

export const HAND_CONNECTIONS = Object.freeze([
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
]);

export const CONFIG = Object.freeze({
  // MediaPipe
  WASM_URL: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm",
  MODEL_URL:
    "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
  LOAD_TIMEOUT_MS: 20000,

  // Pinch = thumb-index distance divided by hand size (wrist -> middle knuckle).
  // Two thresholds give hysteresis, so the pinch does not flicker near the limit.
  PINCH_ON_RATIO: 0.32,
  PINCH_OFF_RATIO: 0.48,

  // Capture
  FRAME_PADDING: 28,
  FREEZE_HOLD_MS: 250,
  FRAME_GRACE_MS: 450,
  COUNTDOWN_SECONDS: 3,

  // Fist (save / reset) must be held this long
  FIST_HOLD_MS: 350,

  // Puzzle
  GRID_OPTIONS: Object.freeze([3, 4, 5]),
  DEFAULT_GRID: 3,
  SNAP_DISTANCE_RATIO: 0.45,
  DISPLACE_ANIM_MS: 220,

  // "Shatter" animation when a puzzle is saved
  SHATTER_COLS: 6,
  SHATTER_ROWS: 6,
  SHATTER_DURATION_MS: 850,

  // Photo strip
  STRIP_MAX_PHOTOS: 3,
  STRIP_BORDER: 24,
  STRIP_GAP: 16,
  STRIP_BG: "#ffffff",
  THUMB_W: 220,

  // Black & white photobooth look
  PHOTOBOOTH: Object.freeze({ contrast: 1.3, brightness: 10, noiseStd: 15 }),

  // One Euro filter (pointer smoothing, pixel units)
  SMOOTHING: Object.freeze({ minCutoff: 1.0, beta: 0.007, dCutoff: 1.0 }),
});
