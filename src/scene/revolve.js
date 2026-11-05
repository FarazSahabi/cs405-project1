/**
 * Bonus — surface of revolution.
 *
 * A profile curve (r, y) is spun around the y axis:
 *   position (r·cos φ, y, r·sin φ),   φ = 0 … 2π in `steps` steps.
 * Normals come from the profile's tangent (dr, dy): n = (dy, −dr) in the
 * profile plane, turned by φ like the position. Output: triangle list,
 * [x, y, z, nx, ny, nz] per vertex (same layout as geometry.js).
 */

/** Profile [[r, y], …] → triangle list of the surface of revolution. */
export function revolveMesh(profile, steps = 48) {
  const n = profile.length;
  if (n < 2) return new Float32Array(0);

  // unit normals of the profile (central differences), outward = away from the axis
  const nrm = profile.map((_, i) => {
    const a = profile[Math.max(0, i - 1)], b = profile[Math.min(n - 1, i + 1)];
    const dr = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dr, dy) || 1;
    return [dy / len, -dr / len];
  });
  if (nrm.reduce((s, v) => s + v[0], 0) < 0) for (const v of nrm) { v[0] = -v[0]; v[1] = -v[1]; }

  const vert = (i, j) => {
    const phi = (2 * Math.PI * j) / steps, c = Math.cos(phi), s = Math.sin(phi);
    const [r, y] = profile[i], [nr, ny] = nrm[i];
    return { p: [r * c, y, r * s], n: [nr * c, ny, nr * s] };
  };

  const out = [];
  const tri = (a, b, c) => {
    // keep the front face (counter-clockwise) on the side the normals point to
    const e1 = [b.p[0] - a.p[0], b.p[1] - a.p[1], b.p[2] - a.p[2]];
    const e2 = [c.p[0] - a.p[0], c.p[1] - a.p[1], c.p[2] - a.p[2]];
    const f = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const avg = [a.n[0] + b.n[0] + c.n[0], a.n[1] + b.n[1] + c.n[1], a.n[2] + b.n[2] + c.n[2]];
    const flip = f[0] * avg[0] + f[1] * avg[1] + f[2] * avg[2] < 0;
    for (const v of flip ? [a, c, b] : [a, b, c]) out.push(...v.p, ...v.n);
  };
  for (let i = 0; i + 1 < n; i++) {
    for (let j = 0; j < steps; j++) {
      const a = vert(i, j), b = vert(i, j + 1), c = vert(i + 1, j), d = vert(i + 1, j + 1);
      tri(a, c, b);
      tri(b, c, d);
    }
  }
  return new Float32Array(out);
}

/**
 * Turn sampled curve points [[x, y], …] into a profile: the axis is the curve's
 * left-most x, the bottom is its lowest y; r and y are then scaled to the given
 * radius (largest r) and height.
 */
export function profileFromCurve(points, radius, height) {
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
  const x0 = Math.min(...xs), y0 = Math.min(...ys);
  const rs = Math.max(...xs) - x0 || 1, hs = Math.max(...ys) - y0 || 1;
  return points.map((p) => [((p[0] - x0) / rs) * radius, ((p[1] - y0) / hs) * height]);
}
