import test from "node:test";
import assert from "node:assert/strict";
import { LM } from "../js/config.js";
import { pinchRatio, PinchDetector, isFist, HandTracker } from "../js/gestures.js";

// Build a synthetic 21-landmark hand. `scale` simulates distance from the camera.
function makeHand({ cx = 0.5, cy = 0.8, scale = 1, open = true, pinchGap = 0.2 } = {}) {
  const lm = Array.from({ length: 21 }, () => ({ x: cx, y: cy }));
  const P = (dx, dy) => ({ x: cx + dx * scale, y: cy + dy * scale });
  lm[LM.WRIST] = P(0, 0);
  lm[LM.MIDDLE_MCP] = P(0, -0.2);
  lm[LM.INDEX_MCP] = P(-0.04, -0.19);
  lm[LM.RING_MCP] = P(0.04, -0.19);
  lm[LM.PINKY_MCP] = P(0.08, -0.17);
  const tipY = open ? -0.45 : -0.1; // curled tips sit closer to the wrist than the knuckles
  lm[LM.INDEX_TIP] = P(-0.04, tipY);
  lm[LM.MIDDLE_TIP] = P(0, tipY);
  lm[LM.RING_TIP] = P(0.04, tipY);
  lm[LM.PINKY_TIP] = P(0.08, tipY);
  lm[LM.THUMB_TIP] = P(-0.04 + pinchGap, tipY);
  return lm;
}

test("pinch ratio does not depend on distance from the camera", () => {
  const near = pinchRatio(makeHand({ scale: 1.5 }));
  const far = pinchRatio(makeHand({ scale: 0.5 }));
  assert.ok(Math.abs(near - far) < 1e-9);
});

test("pinch detector turns on below the ON ratio and off above the OFF ratio (hysteresis)", () => {
  const det = new PinchDetector(0.32, 0.48);
  // ratio = gap / 0.2 -> gap 0.2 = 1.0 (open)
  assert.equal(det.update(makeHand({ pinchGap: 0.2 })), false);
  assert.equal(det.update(makeHand({ pinchGap: 0.05 })), true); // 0.25 < 0.32 -> on
  assert.equal(det.update(makeHand({ pinchGap: 0.08 })), true); // 0.40 between thresholds -> stays on
  assert.equal(det.update(makeHand({ pinchGap: 0.12 })), false); // 0.60 > 0.48 -> off
  assert.equal(det.update(makeHand({ pinchGap: 0.08 })), false); // 0.40 between thresholds -> stays off
});

test("fist is detected only when all fingertips are curled", () => {
  assert.equal(isFist(makeHand({ open: false })), true);
  assert.equal(isFist(makeHand({ open: true })), false);
});

test("hand tracker keeps the same slot when MediaPipe swaps the hand order", () => {
  const tracker = new HandTracker();
  const left = makeHand({ cx: 0.25 });
  const right = makeHand({ cx: 0.75 });

  const first = tracker.assign([left, right]);
  const slotLeft = first[0].slot;
  const slotRight = first[1].slot;
  assert.notEqual(slotLeft, slotRight);

  const second = tracker.assign([makeHand({ cx: 0.76 }), makeHand({ cx: 0.26 })]); // swapped order
  assert.equal(second[0].slot, slotRight);
  assert.equal(second[1].slot, slotLeft);
});

test("hand tracker handles a single hand and an empty frame", () => {
  const tracker = new HandTracker();
  assert.deepEqual(tracker.assign([]), []);
  const one = tracker.assign([makeHand()]);
  assert.equal(one.length, 1);
  assert.ok(one[0].slot === 0 || one[0].slot === 1);
});
