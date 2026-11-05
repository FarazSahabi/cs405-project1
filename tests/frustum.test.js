import test from 'node:test';
import assert from 'node:assert/strict';
import { frustumVertices } from '../src/scene/frustum.js';

const cam = (projection) => ({
  eye: [0, 0, 5], target: [0, 0, 0], up: [0, 1, 0],
  fovY: Math.PI / 2, near: 1, far: 3, projection, orthoHeight: 2,
});
const pts = (v) => { const o = []; for (let i = 0; i < v.length; i += 6) o.push([...v.slice(i, i + 3)].map((x) => Math.round(x * 1e4) / 1e4)); return o; };
const has = (p, q) => p.some((a) => a.every((x, i) => Math.abs(x - q[i]) < 1e-4));

test('perspective frustum corners', () => {
  const v = frustumVertices(cam('perspective'), 2);
  assert.equal(v.length / 6, 40);
  const p = pts(v);
  for (const [x, y] of [[-2, -1], [2, -1], [2, 1], [-2, 1]]) assert.ok(has(p, [x, y, 4]), `near ${x},${y}`);
  for (const [x, y] of [[-6, -3], [6, -3], [6, 3], [-6, 3]]) assert.ok(has(p, [x, y, 2]), `far ${x},${y}`);
});

test('orthographic frustum is a box without apex lines', () => {
  const v = frustumVertices(cam('orthographic'), 2);
  assert.equal(v.length / 6, 32);
  const p = pts(v);
  for (const [x, y] of [[-2, -1], [2, 1]]) {
    assert.ok(has(p, [x, y, 4]));
    assert.ok(has(p, [x, y, 2]));
  }
});
