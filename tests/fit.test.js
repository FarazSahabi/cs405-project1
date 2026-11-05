import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { closeArr } from './helpers.js';
import { cubicBezier } from '../src/math/curves.js';
import { chordParams, resample, fitCubicBezier } from '../src/math/fit.js';

const P = [[0, 0], [1, 2.5], [3, 3], [4, 0]];
const sample = (bez, n) => Array.from({ length: n }, (_, i) => cubicBezier(...bez, i / (n - 1)));

describe('Bonus · least-squares Bézier fit', () => {
  test('chord-length parameters run from 0 to 1 and increase', () => {
    const t = chordParams([[0, 0], [1, 0], [1, 3], [5, 3]]);
    closeArr(t, [0, 1 / 8, 4 / 8, 1]);
  });

  test('resample gives equally spaced points that keep the ends', () => {
    const r = resample([[0, 0], [10, 0], [10, 10]], 5);
    assert.equal(r.length, 5);
    closeArr(r[0], [0, 0]);
    closeArr(r[4], [10, 10]);
    closeArr(r[1], [5, 0]);
    closeArr(r[3], [10, 5]);
  });

  test('a stroke sampled from a Bézier curve is fitted almost exactly', () => {
    const fit = fitCubicBezier(sample(P, 40), 30);
    assert.ok(fit.rms < 2e-3, `rms ${fit.rms}`);
    for (let i = 0; i < 4; i++) closeArr(fit.points[i], P[i], 0.15, `P${i}:`);
  });

  test('end points stay on the first and last data point', () => {
    const data = sample(P, 25);
    const fit = fitCubicBezier(data);
    closeArr(fit.points[0], data[0]);
    closeArr(fit.points[3], data[24]);
  });

  test('works in 3D and for a straight stroke', () => {
    const line = Array.from({ length: 10 }, (_, i) => [i, 2 * i, -i]);
    const fit = fitCubicBezier(line);
    assert.ok(fit.rms < 1e-6);
    const fit3 = fitCubicBezier(sample([[0, 0, 0], [1, 2, 1], [2, 2, 3], [3, 0, 4]], 30), 60);
    assert.ok(fit3.rms < 1e-3);
  });

  test('noisy data: the error is small and the fit does not modify its input', () => {
    const data = sample(P, 40).map((p, i) => [p[0] + 0.02 * Math.sin(7 * i), p[1] + 0.02 * Math.cos(5 * i)]);
    const copy = data.map((p) => [...p]);
    const fit = fitCubicBezier(data);
    assert.ok(fit.rms < 0.05 && fit.max < 0.1);
    assert.deepEqual(data, copy);
  });

  test('fewer than four points: nothing to fit', () => {
    assert.equal(fitCubicBezier([[0, 0], [1, 1], [2, 0]]), null);
  });

  test('more Newton steps never make the fit worse by much', () => {
    const data = sample(P, 40).map((p, i) => [p[0] + 0.03 * Math.sin(3 * i), p[1]]);
    const a = fitCubicBezier(data, 0), b = fitCubicBezier(data, 8);
    assert.ok(b.rms <= a.rms + 1e-9, `${b.rms} vs ${a.rms}`);
  });
});
