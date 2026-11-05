import { test } from 'node:test';
import assert from 'node:assert/strict';
import { revolveMesh, profileFromCurve } from '../src/scene/revolve.js';

const profile = [[0.2, 0], [0.4, 0.3], [0.3, 0.6], [0.1, 0.9]];
const steps = 12;
const m = revolveMesh(profile, steps);

test('triangle count = (n−1)·steps·2', () => {
  assert.equal(m.length / 6, (profile.length - 1) * steps * 2 * 3);
});
test('every vertex lies at the profile radius from the y axis', () => {
  const radii = profile.map((p) => p[0]);
  for (let i = 0; i < m.length; i += 6) {
    const r = Math.hypot(m[i], m[i + 2]);
    assert.ok(radii.some((q) => Math.abs(q - r) < 1e-6));
  }
});
test('normals are unit length', () => {
  for (let i = 0; i < m.length; i += 6) assert.ok(Math.abs(Math.hypot(m[i + 3], m[i + 4], m[i + 5]) - 1) < 1e-5);
});
test('winding agrees with the normals (all faces front-facing outward)', () => {
  for (let t = 0; t < m.length; t += 18) {
    const P = (k) => [m[t + 6 * k], m[t + 6 * k + 1], m[t + 6 * k + 2]];
    const [a, b, c] = [P(0), P(1), P(2)];
    const e1 = b.map((x, i) => x - a[i]), e2 = c.map((x, i) => x - a[i]);
    const f = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const n = [0, 1, 2].map((k) => m[t + 3 + k] + m[t + 9 + k] + m[t + 15 + k]);
    assert.ok(f[0] * n[0] + f[1] * n[1] + f[2] * n[2] > 0);
  }
});
test('normals point away from the axis on average', () => {
  let s = 0;
  for (let i = 0; i < m.length; i += 6) s += m[i] * m[i + 3] + m[i + 2] * m[i + 5];
  assert.ok(s > 0);
});
test('profileFromCurve scales to radius and height', () => {
  const p = profileFromCurve([[-1, 0.1], [0, 0.2], [1, 0.3]], 0.5, 0.8);
  assert.equal(p[0][0], 0);
  assert.ok(Math.abs(p[2][0] - 0.5) < 1e-12);
  assert.ok(Math.abs(p[2][1] - 0.8) < 1e-12);
});
