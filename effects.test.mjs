import test from "node:test";
import assert from "node:assert/strict";
import { applyPhotoboothEffect, createNoiseTable, gaussianNoise } from "../js/effects.js";

function fakeImage(pixels) {
  return { data: new Uint8ClampedArray(pixels.flatMap(([r, g, b]) => [r, g, b, 255])) };
}

test("output is grayscale (R = G = B) and alpha is untouched", () => {
  const img = applyPhotoboothEffect(fakeImage([[200, 30, 10], [5, 250, 90]]), { contrast: 1.3, brightness: 10, noiseStd: 15 });
  for (let i = 0; i < img.data.length; i += 4) {
    assert.equal(img.data[i], img.data[i + 1]);
    assert.equal(img.data[i + 1], img.data[i + 2]);
    assert.equal(img.data[i + 3], 255);
  }
});

test("without noise the result is deterministic: gray*contrast+brightness", () => {
  const img = applyPhotoboothEffect(fakeImage([[100, 100, 100]]), { contrast: 1.0, brightness: 20, noiseStd: 0 });
  assert.equal(img.data[0], 120);
});

test("values are clamped to 0..255", () => {
  const img = applyPhotoboothEffect(fakeImage([[250, 250, 250], [0, 0, 0]]), { contrast: 2, brightness: 50, noiseStd: 0 });
  assert.equal(img.data[0], 255);
  assert.equal(img.data[4], 50);
});

test("same table + offset gives the same grain", () => {
  const table = createNoiseTable(() => 0.37, 1024);
  const opts = { contrast: 1, brightness: 0, noiseStd: 10 };
  const a = applyPhotoboothEffect(fakeImage([[100, 100, 100], [100, 100, 100]]), opts, { table, offset: 5 });
  const b = applyPhotoboothEffect(fakeImage([[100, 100, 100], [100, 100, 100]]), opts, { table, offset: 5 });
  assert.deepEqual([...a.data], [...b.data]);
});

test("gaussian noise has roughly zero mean and unit deviation", () => {
  let seed = 7;
  const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const n = 20000;
  const xs = Array.from({ length: n }, () => gaussianNoise(1, rng));
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const variance = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  assert.ok(Math.abs(mean) < 0.05);
  assert.ok(Math.abs(Math.sqrt(variance) - 1) < 0.05);
});
