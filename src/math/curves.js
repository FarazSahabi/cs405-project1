/**
 * curves — Part D.
 *
 * Points are plain arrays of any dimension: [x, y] in the plane of the
 * painting, or [x, y, z] in world space. Every function works for both.
 * Functions return new arrays and never modify their inputs.
 *
 * A piecewise cubic Bézier curve is an array of segments, each segment being
 * four control points [P0, P1, P2, P3]. Consecutive segments share a joint:
 * segments[i][3] equals segments[i + 1][0].
 *
 * Tests: tests/curves.test.js
 */

/* ---------------------------------------------------------- Bézier ------ */

/**
 * The four cubic Bernstein basis values [B0(t), B1(t), B2(t), B3(t)]:
 *   B_i(t) = C(3,i) · t^i · (1−t)^(3−i)
 */
export function bernstein3(t) {
  const s = 1 - t;
  return [s * s * s, 3 * s * s * t, 3 * s * t * t, t * t * t];
}

/** Point on the cubic Bézier curve with control points p0..p3 at t ∈ [0, 1]. */
export function cubicBezier(p0, p1, p2, p3, t) {
  const [b0, b1, b2, b3] = bernstein3(t);
  return p0.map((_, i) => b0 * p0[i] + b1 * p1[i] + b2 * p2[i] + b3 * p3[i]);
}

/**
 * First derivative dB/dt of the cubic Bézier at t (not normalised):
 *   B'(t) = 3 [ (1−t)² (P1−P0) + 2(1−t)t (P2−P1) + t² (P3−P2) ]
 */
export function cubicBezierTangent(p0, p1, p2, p3, t) {
  const s = 1 - t;
  const a = 3 * s * s, b = 6 * s * t, c = 3 * t * t;
  return p0.map((_, i) => a * (p1[i] - p0[i]) + b * (p2[i] - p1[i]) + c * (p3[i] - p2[i]));
}

/**
 * de Casteljau's construction for any number of control points.
 * Returns every level, for drawing the construction:
 *   levels[0] = the input points (n points)
 *   levels[1] = n − 1 interpolated points
 *   …
 *   levels[n − 1] = [the point on the curve]
 * Each new point is (1−t)·A + t·B for neighbours A, B of the level below.
 */
export function deCasteljau(points, t) {
  const levels = [points.map((p) => [...p])];
  while (levels[levels.length - 1].length > 1) {
    const prev = levels[levels.length - 1];
    const next = [];
    for (let i = 0; i < prev.length - 1; i++) {
      next.push(prev[i].map((x, k) => (1 - t) * x + t * prev[i + 1][k]));
    }
    levels.push(next);
  }
  return levels;
}

/* ----------------------------------------------- piecewise, C¹ joints --- */

/**
 * Given the last two control points P2, P3 of one segment, return the P1 of
 * the NEXT segment that makes the joint at P3 C¹-continuous.
 * C¹ means B'(1) of the left segment = B'(0) of the right one:
 *   3(P3 − P2) = 3(P1' − P3)   ⇒   P1' = 2·P3 − P2   (P2 mirrored through P3)
 */
export function c1NextControl(p2, p3) {
  return p3.map((x, i) => 2 * x - p2[i]);
}

/**
 * Evaluate a piecewise cubic Bézier at a global parameter u ∈ [0, 1] that
 * runs over the whole curve: with n segments, segment i covers
 * u ∈ [i/n, (i+1)/n]. u = 0 is the first P0, u = 1 the last P3.
 */
export function evalPiecewise(segments, u) {
  const { index, t } = locate(segments.length, u);
  return cubicBezier(...segments[index], t);
}

/**
 * Split a global parameter u ∈ [0, 1] over n equal segments into
 * { index, t } with t ∈ [0, 1] the local parameter (u = 1 → last segment, t = 1).
 */
export function locate(n, u) {
  const x = Math.min(1, Math.max(0, u)) * n;
  const index = Math.min(n - 1, Math.floor(x));
  return { index, t: x - index };
}

/* ---------------------------- second curve family: implement ONE -------- */
/* Both are implemented here; the application uses Catmull–Rom.            */

/**
 * Uniform Catmull–Rom: the segment between p1 and p2 (passes through both),
 * t ∈ [0, 1], with tangents (p2 − p0)/2 at p1 and (p3 − p1)/2 at p2.
 *   q(t) = ½ [ 2P1 + (−P0 + P2) t + (2P0 − 5P1 + 4P2 − P3) t² + (−P0 + 3P1 − 3P2 + P3) t³ ]
 */
export function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return p0.map((_, i) => 0.5 * (
    2 * p1[i] +
    (-p0[i] + p2[i]) * t +
    (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * t2 +
    (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * t3));
}

/** dq/dt of catmullRom() (not normalised). */
export function catmullRomTangent(p0, p1, p2, p3, t) {
  const t2 = t * t;
  return p0.map((_, i) => 0.5 * (
    (-p0[i] + p2[i]) +
    2 * (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * t +
    3 * (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * t2));
}

/** Uniform cubic B-spline basis values [N0(t), N1(t), N2(t), N3(t)]. */
export function bsplineBasis(t) {
  const t2 = t * t, t3 = t2 * t;
  return [
    (1 - t) * (1 - t) * (1 - t) / 6,
    (3 * t3 - 6 * t2 + 4) / 6,
    (-3 * t3 + 3 * t2 + 3 * t + 1) / 6,
    t3 / 6,
  ];
}

/** Point on the uniform cubic B-spline segment controlled by p0..p3. */
export function bspline(p0, p1, p2, p3, t) {
  const [n0, n1, n2, n3] = bsplineBasis(t);
  return p0.map((_, i) => n0 * p0[i] + n1 * p1[i] + n2 * p2[i] + n3 * p3[i]);
}
