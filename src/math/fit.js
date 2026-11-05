/**
 * Bonus — least-squares fit of ONE cubic Bézier to a hand-drawn stroke.
 *
 * Data points d_i (i = 0 … n−1) are given in order along the stroke. The
 * curve B(t) = Σ Bₖ(t) Pₖ has its end points fixed on the stroke,
 * P₀ = d₀ and P₃ = d_{n−1}; the two inner control points P₁, P₂ are the
 * unknowns.
 *
 * 1. Parameters. Each data point needs a parameter tᵢ. First guess: the
 *    chord length, tᵢ = (length of the stroke up to dᵢ) / (total length).
 * 2. Least squares. For fixed tᵢ the error E = Σ |B(tᵢ) − dᵢ|² is quadratic
 *    in P₁ and P₂. With bₖ = Bₖ(tᵢ) and rᵢ = dᵢ − b₀P₀ − b₃P₃, setting the
 *    derivatives of E to zero gives the normal equations (per coordinate)
 *        [ Σb₁²   Σb₁b₂ ] [P₁]   [ Σ b₁ rᵢ ]
 *        [ Σb₁b₂  Σb₂²  ] [P₂] = [ Σ b₂ rᵢ ]
 *    a 2 × 2 system, solved with Cramer's rule.
 * 3. Reparametrisation. The chord-length tᵢ are only a guess, so each tᵢ is
 *    moved to the nearest point of the curve with Newton's method on
 *    f(t) = (B(t) − d)·B′(t), and steps 2–3 are repeated.
 *
 * Points are arrays of any dimension.
 */
import { bernstein3, cubicBezier, cubicBezierTangent } from './curves.js';

const dist = (a, b) => Math.hypot(...a.map((x, i) => x - b[i]));

/** Parameters 0 … 1 proportional to the distance travelled along the polyline. */
export function chordParams(points) {
  const t = [0];
  for (let i = 1; i < points.length; i++) t.push(t[i - 1] + dist(points[i], points[i - 1]));
  const total = t[t.length - 1];
  return total > 0 ? t.map((x) => x / total) : t.map((_, i) => i / Math.max(1, points.length - 1));
}

/**
 * Replace the stroke by n points spaced equally along its length, so that
 * the fit is not dominated by places where the mouse was slow.
 */
export function resample(points, n) {
  if (points.length < 2) return points.map((p) => [...p]);
  const t = chordParams(points);
  const out = [];
  let k = 0;
  for (let i = 0; i < n; i++) {
    const s = i / (n - 1);
    while (k < points.length - 2 && t[k + 1] < s) k++;
    const span = t[k + 1] - t[k];
    const f = span > 0 ? (s - t[k]) / span : 0;
    out.push(points[k].map((x, d) => x + (points[k + 1][d] - x) * f));
  }
  return out;
}

/** Second derivative of the cubic Bézier: 6[(1−t)(P₂ − 2P₁ + P₀) + t(P₃ − 2P₂ + P₁)]. */
function secondDerivative(p0, p1, p2, p3, t) {
  return p0.map((_, i) => 6 * ((1 - t) * (p2[i] - 2 * p1[i] + p0[i]) + t * (p3[i] - 2 * p2[i] + p1[i])));
}

/** Solve the normal equations for P₁, P₂ with the parameters t fixed. */
function solveInner(data, t) {
  const p0 = data[0], p3 = data[data.length - 1];
  let a11 = 0, a12 = 0, a22 = 0;
  const c1 = p0.map(() => 0), c2 = p0.map(() => 0);
  for (let i = 0; i < data.length; i++) {
    const [b0, b1, b2, b3] = bernstein3(t[i]);
    a11 += b1 * b1; a12 += b1 * b2; a22 += b2 * b2;
    for (let d = 0; d < p0.length; d++) {
      const r = data[i][d] - b0 * p0[d] - b3 * p3[d];
      c1[d] += b1 * r; c2[d] += b2 * r;
    }
  }
  const det = a11 * a22 - a12 * a12;
  if (Math.abs(det) < 1e-12) { // all parameters equal or collinear columns: a straight line
    return [p0.map((x, d) => x + (p3[d] - x) / 3), p0.map((x, d) => x + (2 * (p3[d] - x)) / 3)];
  }
  const p1 = c1.map((_, d) => (c1[d] * a22 - a12 * c2[d]) / det);
  const p2 = c1.map((_, d) => (a11 * c2[d] - a12 * c1[d]) / det);
  return [p1, p2];
}

/** One Newton step per data point towards the nearest point of the curve. */
function reparametrise(data, bez, t) {
  return t.map((ti, i) => {
    const b = cubicBezier(...bez, ti);
    const d1 = cubicBezierTangent(...bez, ti);
    const d2 = secondDerivative(...bez, ti);
    const diff = b.map((x, k) => x - data[i][k]);
    const num = diff.reduce((s, x, k) => s + x * d1[k], 0);
    const den = d1.reduce((s, x, k) => s + x * x + diff[k] * d2[k], 0);
    if (Math.abs(den) < 1e-12) return ti;
    return Math.min(1, Math.max(0, ti - num / den));
  });
}

/**
 * Distance from p to the curve: coarse sampling to find the neighbourhood of
 * the nearest point, then a ternary search inside it.
 */
function distanceToCurve(bez, p, samples = 64) {
  let bestK = 0, best = Infinity;
  for (let k = 0; k <= samples; k++) {
    const d = dist(cubicBezier(...bez, k / samples), p);
    if (d < best) { best = d; bestK = k; }
  }
  let lo = Math.max(0, (bestK - 1) / samples), hi = Math.min(1, (bestK + 1) / samples);
  for (let i = 0; i < 40; i++) {
    const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
    if (dist(cubicBezier(...bez, m1), p) < dist(cubicBezier(...bez, m2), p)) hi = m2; else lo = m1;
  }
  return Math.min(best, dist(cubicBezier(...bez, (lo + hi) / 2), p));
}

/**
 * Fit a cubic Bézier to the data points.
 * @returns {{ points: number[][], rms: number, max: number } | null}
 *   points = [P0, P1, P2, P3]; rms / max = root-mean-square and largest distance
 *   from a data point to the curve. null if there are fewer than 4 points.
 */
export function fitCubicBezier(data, iterations = 20) {
  if (data.length < 4) return null;
  let t = chordParams(data);
  let bez = [data[0], ...solveInner(data, t), data[data.length - 1]];
  for (let it = 0; it < iterations; it++) {
    t = reparametrise(data, bez, t);
    bez = [data[0], ...solveInner(data, t), data[data.length - 1]];
  }
  const d = data.map((p) => distanceToCurve(bez, p));
  return {
    points: bez.map((p) => [...p]),
    rms: Math.sqrt(d.reduce((s, x) => s + x * x, 0) / d.length),
    max: Math.max(...d),
  };
}
