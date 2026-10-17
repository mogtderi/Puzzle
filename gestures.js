// Pure gesture logic (no DOM), so it can be unit-tested in Node.
// Landmarks are MediaPipe-normalized points {x, y} in the 0..1 range.
// `aspect` = video width / height; x is scaled by it so distances are not
// distorted on non-square frames.

import { LM, CONFIG } from "./config.js";

export function dist2D(a, b, aspect = 1) {
  return Math.hypot((a.x - b.x) * aspect, a.y - b.y);
}

export function handSize(landmarks, aspect = 1) {
  return dist2D(landmarks[LM.WRIST], landmarks[LM.MIDDLE_MCP], aspect);
}

// Thumb-index distance relative to hand size: independent of how far the
// hand is from the camera.
export function pinchRatio(landmarks, aspect = 1) {
  const size = handSize(landmarks, aspect);
  if (size < 1e-6) return Infinity;
  return dist2D(landmarks[LM.THUMB_TIP], landmarks[LM.INDEX_TIP], aspect) / size;
}

export class PinchDetector {
  constructor(onRatio = CONFIG.PINCH_ON_RATIO, offRatio = CONFIG.PINCH_OFF_RATIO) {
    this.onRatio = onRatio;
    this.offRatio = offRatio;
    this.pinching = false;
  }

  update(landmarks, aspect = 1) {
    const ratio = pinchRatio(landmarks, aspect);
    if (this.pinching) {
      if (ratio > this.offRatio) this.pinching = false;
    } else if (ratio < this.onRatio) {
      this.pinching = true;
    }
    return this.pinching;
  }

  reset() {
    this.pinching = false;
  }
}

// A fist = all four fingertips closer to the wrist than their knuckles.
export function isFist(landmarks, aspect = 1) {
  const wrist = landmarks[LM.WRIST];
  const pairs = [
    [LM.INDEX_TIP, LM.INDEX_MCP],
    [LM.MIDDLE_TIP, LM.MIDDLE_MCP],
    [LM.RING_TIP, LM.RING_MCP],
    [LM.PINKY_TIP, LM.PINKY_MCP],
  ];
  return pairs.every(
    ([tip, mcp]) => dist2D(landmarks[tip], wrist, aspect) < dist2D(landmarks[mcp], wrist, aspect)
  );
}

// MediaPipe does not guarantee the order of detected hands between frames.
// This keeps a stable slot (0 or 1) per hand by matching wrists to the
// previous frame's positions (nearest first).
export class HandTracker {
  constructor() {
    this.prev = [null, null];
  }

  reset() {
    this.prev = [null, null];
  }

  assign(hands) {
    const candidates = [];
    hands.forEach((lm, i) => {
      this.prev.forEach((p, slot) => {
        if (p) {
          candidates.push({ i, slot, d: Math.hypot(lm[LM.WRIST].x - p.x, lm[LM.WRIST].y - p.y) });
        }
      });
    });
    candidates.sort((a, b) => a.d - b.d);

    const slotOfHand = new Map();
    const usedSlots = new Set();
    for (const c of candidates) {
      if (slotOfHand.has(c.i) || usedSlots.has(c.slot)) continue;
      slotOfHand.set(c.i, c.slot);
      usedSlots.add(c.slot);
    }
    hands.forEach((_, i) => {
      if (slotOfHand.has(i)) return;
      const free = [0, 1].find((s) => !usedSlots.has(s));
      const slot = free === undefined ? i : free;
      slotOfHand.set(i, slot);
      usedSlots.add(slot);
    });

    const next = [null, null];
    const out = hands.map((landmarks, i) => {
      const slot = slotOfHand.get(i);
      if (slot < 2) next[slot] = { x: landmarks[LM.WRIST].x, y: landmarks[LM.WRIST].y };
      return { slot, landmarks };
    });
    this.prev = next;
    return out;
  }
}
