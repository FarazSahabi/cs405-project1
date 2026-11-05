import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sphere } from '../src/scene/geometry.js';

test('sphere: radius 0.5, normals outward, triangles counter-clockwise from outside', () => {
  const v = sphere();
  assert.equal(v.length % 18, 0);
  let bad = 0;
  for (let i = 0; i < v.length; i += 18) {
    const P = [0, 1, 2].map((k) => [v[i + 6 * k], v[i + 6 * k + 1], v[i + 6 * k + 2]]);
    for (const p of P) assert.ok(Math.abs(Math.hypot(...p) - 0.5) < 1e-5);
    const e1 = P[1].map((x, k) => x - P[0][k]), e2 = P[2].map((x, k) => x - P[0][k]);
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const c = P[0].map((x, k) => x + P[1][k] + P[2][k]);
    const area = Math.hypot(...n);
    if (area < 1e-9) continue; // degenerate triangle at a pole
    if (n[0] * c[0] + n[1] * c[1] + n[2] * c[2] <= 0) bad++;
  }
  assert.equal(bad, 0, 'triangles facing inward');
});
