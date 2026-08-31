/**
 * Adaptive threshold between two groups (intra-word gap vs. inter-word gap).
 * Implements Otsu's method over a histogram of the values; falls back to 1D
 * k-means (k=2) when the sample is too small for a stable histogram. Never
 * uses a fixed threshold — that's the whole point of this requirement.
 */

export interface ThresholdResult {
  threshold: number;
  method: 'otsu' | 'kmeans' | 'fallback';
  sampleSize: number;
}

const MIN_SAMPLES_FOR_OTSU = 20;
const OTSU_BINS = 64;

export function adaptiveThreshold(values: number[]): ThresholdResult {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) {
    return { threshold: Infinity, method: 'fallback', sampleSize: 0 };
  }
  if (finite.length < MIN_SAMPLES_FOR_OTSU) {
    return { ...kmeans1d(finite), sampleSize: finite.length };
  }
  return { ...otsuThreshold(finite, OTSU_BINS), sampleSize: finite.length };
}

function otsuThreshold(values: number[], bins: number): { threshold: number; method: 'otsu' } {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max - min < 1e-9) {
    return { threshold: max, method: 'otsu' };
  }
  const width = (max - min) / bins;
  const hist = new Array<number>(bins).fill(0);
  for (const v of values) {
    const idx = Math.min(bins - 1, Math.floor((v - min) / width));
    hist[idx]++;
  }
  const total = values.length;
  let sumAll = 0;
  for (let i = 0; i < bins; i++) sumAll += i * hist[i];

  let sumBackground = 0;
  let weightBackground = 0;
  let bestVariance = -Infinity;
  let bestBin = 0;

  for (let i = 0; i < bins; i++) {
    weightBackground += hist[i];
    if (weightBackground === 0) continue;
    const weightForeground = total - weightBackground;
    if (weightForeground === 0) break;

    sumBackground += i * hist[i];
    const meanBackground = sumBackground / weightBackground;
    const meanForeground = (sumAll - sumBackground) / weightForeground;
    const between =
      weightBackground * weightForeground * (meanBackground - meanForeground) ** 2;

    if (between > bestVariance) {
      bestVariance = between;
      bestBin = i;
    }
  }

  const threshold = min + (bestBin + 1) * width;
  return { threshold, method: 'otsu' };
}

function kmeans1d(values: number[]): { threshold: number; method: 'kmeans' | 'fallback' } {
  if (values.length < 2) {
    return { threshold: values[0] ?? Infinity, method: 'fallback' };
  }
  const sorted = [...values].sort((a, b) => a - b);
  let c1 = sorted[0];
  let c2 = sorted[sorted.length - 1];
  if (c1 === c2) {
    return { threshold: c1, method: 'fallback' };
  }

  for (let iter = 0; iter < 25; iter++) {
    const g1: number[] = [];
    const g2: number[] = [];
    for (const v of sorted) {
      (Math.abs(v - c1) <= Math.abs(v - c2) ? g1 : g2).push(v);
    }
    if (g1.length === 0 || g2.length === 0) break;
    const nc1 = mean(g1);
    const nc2 = mean(g2);
    if (nc1 === c1 && nc2 === c2) break;
    c1 = nc1;
    c2 = nc2;
  }

  const lo = Math.min(c1, c2);
  const hi = Math.max(c1, c2);
  return { threshold: (lo + hi) / 2, method: 'kmeans' };
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
