// Black & white "photobooth" look: grayscale + contrast + film grain.
// The grain comes from a pre-computed Gaussian table instead of calling
// Math.log/Math.cos for every pixel on every frame (the live preview applies
// this effect continuously, so that was the main CPU cost).

import { CONFIG } from "./config.js";

const TABLE_SIZE = 1 << 16; // must be a power of two
const MASK = TABLE_SIZE - 1;

export function gaussianNoise(std, rng = Math.random) {
  const u1 = rng() || 1e-6;
  const u2 = rng();
  return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2) * std;
}

export function createNoiseTable(rng = Math.random, size = TABLE_SIZE) {
  const table = new Float32Array(size);
  for (let i = 0; i < size; i++) table[i] = gaussianNoise(1, rng);
  return table;
}

const defaultTable = createNoiseTable();

export function applyPhotoboothEffect(
  imageData,
  { contrast, brightness, noiseStd } = CONFIG.PHOTOBOOTH,
  { table = defaultTable, offset = Math.floor(Math.random() * TABLE_SIZE) } = {}
) {
  const d = imageData.data;
  const mask = table.length - 1;
  let n = offset;
  for (let i = 0; i < d.length; i += 4) {
    const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    let v = gray * contrast + brightness + table[n & mask] * noiseStd;
    n++;
    v = v < 0 ? 0 : v > 255 ? 255 : v;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  return imageData;
}
