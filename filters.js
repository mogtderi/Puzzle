// One Euro Filter: low-pass filter whose cutoff rises with speed, so slow
// movements are smooth (little jitter) and fast movements stay responsive.
// Reference: Casiez, Roussel, Vogel - "1 Euro Filter" (CHI 2012).

import { CONFIG } from "./config.js";

function smoothingFactor(rateHz, cutoffHz) {
  const tau = 1 / (2 * Math.PI * cutoffHz);
  return 1 / (1 + tau * rateHz);
}

export class OneEuroFilter {
  constructor({ minCutoff, beta, dCutoff } = CONFIG.SMOOTHING) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.reset();
  }

  reset() {
    this.xPrev = null;
    this.dxPrev = 0;
    this.tPrev = null;
  }

  filter(x, tMs) {
    if (this.xPrev === null) {
      this.xPrev = x;
      this.tPrev = tMs;
      this.dxPrev = 0;
      return x;
    }

    const dt = Math.max((tMs - this.tPrev) / 1000, 1e-3);
    const rate = 1 / dt;

    const dx = (x - this.xPrev) / dt;
    const aD = smoothingFactor(rate, this.dCutoff);
    const dxHat = aD * dx + (1 - aD) * this.dxPrev;

    const cutoff = this.minCutoff + this.beta * Math.abs(dxHat);
    const a = smoothingFactor(rate, cutoff);
    const xHat = a * x + (1 - a) * this.xPrev;

    this.xPrev = xHat;
    this.dxPrev = dxHat;
    this.tPrev = tMs;
    return xHat;
  }
}

export class PointFilter {
  constructor(params = CONFIG.SMOOTHING) {
    this.fx = new OneEuroFilter(params);
    this.fy = new OneEuroFilter(params);
  }

  reset() {
    this.fx.reset();
    this.fy.reset();
  }

  filter(point, tMs) {
    return { x: this.fx.filter(point.x, tMs), y: this.fy.filter(point.y, tMs) };
  }
}
