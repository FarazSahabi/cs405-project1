import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sphere, cylinder } from '../src/scene/geometry.js';

/** Every triangle must face the way its vertex normals point (counter-clockwise from outside). */
function checkWinding(v, radiusOf) {
  assert.equal(v.length % 18, 0);
  let bad = 0;
  for (let i = 0; i < v.length; i += 18) {
    const P = [0, 1, 2].map((k) => [v[i + 6 * k], v[i + 6 * k + 1], v[i + 6 * k + 2]]);
    const N = [0, 1, 2].map((k) => [v[i + 6 * k + 3], v[i + 6 * k + 4], v[i + 6 * k + 5]]);
    const e1 = P[1].map((x, k) => x - P[0][k]), e2 = P[2].map((x, k) => x - P[0][k]);
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    if (Math.hypot(...n) < 1e-9) continue; // degenerate triangle at a pole
    const avg = [0, 1, 2].map((k) => N[0][k] + N[1][k] + N[2][k]);
    if (n[0] * avg[0] + n[1] * avg[1] + n[2] * avg[2] <= 0) bad++;
    for (const p of P) assert.ok(radiusOf(p) <= 0.5 + 1e-5, 'inside the unit shape');
  }
  assert.equal(bad, 0, 'triangles facing inward');
}

test('sphere: radius 0.5, triangles counter-clockwise from outside', () => {
  const v = sphere();
  checkWinding(v, (p) => Math.hypot(...p));
  for (let i = 0; i < v.length; i += 6) assert.ok(Math.abs(Math.hypot(v[i], v[i + 1], v[i + 2]) - 0.5) < 1e-5);
});

test('cylinder: radius 0.5, height 1, triangles counter-clockwise from outside', () => {
  const v = cylinder();
  checkWinding(v, (p) => Math.max(Math.hypot(p[0], p[2]), Math.abs(p[1])));
  let ymin = 1, ymax = -1;
  for (let i = 1; i < v.length; i += 6) { ymin = Math.min(ymin, v[i]); ymax = Math.max(ymax, v[i]); }
  assert.ok(Math.abs(ymin + 0.5) < 1e-6 && Math.abs(ymax - 0.5) < 1e-6);
});
