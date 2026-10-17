import test from "node:test";
import assert from "node:assert/strict";
import { OneEuroFilter, PointFilter } from "../js/filters.js";

test("first sample passes through unchanged", () => {
  const f = new OneEuroFilter({ minCutoff: 1, beta: 0.007, dCutoff: 1 });
  assert.equal(f.filter(42, 0), 42);
});

test("constant input stays constant", () => {
  const f = new OneEuroFilter({ minCutoff: 1, beta: 0.007, dCutoff: 1 });
  let y;
  for (let i = 0; i < 60; i++) y = f.filter(100, i * 16);
  assert.ok(Math.abs(y - 100) < 1e-9);
});

test("jitter is reduced around a still point", () => {
  const f = new OneEuroFilter({ minCutoff: 1, beta: 0.007, dCutoff: 1 });
  let seed = 1;
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5; // deterministic noise
  const raw = [];
  const out = [];
  for (let i = 0; i < 200; i++) {
    const x = 300 + rng() * 6; // +-3 px jitter
    raw.push(x);
    out.push(f.filter(x, i * 16));
  }
  const spread = (a) => Math.max(...a.slice(50)) - Math.min(...a.slice(50));
  assert.ok(spread(out) < spread(raw) * 0.6);
});

test("a fast movement is followed (little lag at high speed)", () => {
  const f = new OneEuroFilter({ minCutoff: 1, beta: 0.007, dCutoff: 1 });
  let y = 0;
  for (let i = 0; i < 40; i++) y = f.filter(i * 25, i * 16); // 25 px per frame ~ 1560 px/s
  assert.ok(39 * 25 - y < 120);
});

test("reset forgets the previous state", () => {
  const f = new OneEuroFilter({ minCutoff: 1, beta: 0.007, dCutoff: 1 });
  f.filter(0, 0);
  f.filter(10, 16);
  f.reset();
  assert.equal(f.filter(500, 32), 500);
});

test("PointFilter filters x and y independently", () => {
  const pf = new PointFilter({ minCutoff: 1, beta: 0.007, dCutoff: 1 });
  assert.deepEqual(pf.filter({ x: 10, y: 20 }, 0), { x: 10, y: 20 });
});
