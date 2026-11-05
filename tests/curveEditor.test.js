import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { closeArr } from './helpers.js';
import * as mat4 from '../src/math/mat4.js';
import { createCamera } from '../src/scene/camera.js';
import { viewProjection } from '../src/scene/camera.js';
import { pickPoint, createCurveEditor, CURVE_Z, CURVE_MAX_VERTICES } from '../src/scene/curveEditor.js';
import { curveToJSON, worldToNormalised, normalisedToWorld } from '../src/scene/curveExport.js';
import { cubicBezierTangent } from '../src/math/curves.js';

const painting = { aspect: 0.82 };

describe('Part D · picking on the painting plane', () => {
  test('screen centre hits the point straight ahead', () => {
    closeArr(pickPoint(createCamera(), 1.5, [0, 0]), [0, 0], 1e-6);
  });

  for (const projection of ['perspective', 'orthographic']) {
    test(`projecting a point and picking it back gives the same point (${projection})`, () => {
      const cam = createCamera();
      cam.projection = projection;
      cam.eye = [0.6, 0.3, 2.4]; // off-axis, so the test is not trivial
      const aspect = 1.6, p = [0.31, -0.42];
      const { matrix } = viewProjection(cam, aspect);
      const c = mat4.transformVec4(matrix, [p[0], p[1], CURVE_Z, 1]);
      closeArr(pickPoint(cam, aspect, [c[0] / c[3], c[1] / c[3]]), p, 1e-4);
    });
  }
});

describe('Part D · curve editor', () => {
  test('the Bézier curve stays C¹ at both joints, whatever is dragged', () => {
    const ed = createCurveEditor({ painting, paintingId: () => 'kabatas' });
    const check = () => {
      const S = ed.segments();
      for (let i = 0; i < 2; i++) {
        closeArr(S[i][3], S[i + 1][0], 1e-9);
        closeArr(cubicBezierTangent(...S[i], 1), cubicBezierTangent(...S[i + 1], 0), 1e-9);
      }
    };
    check();
    for (const [id, p] of [['b3', [0.1, 0.2]], ['b2', [-0.3, 0.1]], ['d1', [0.2, -0.5]], ['b5', [0.0, 0.0]], ['b4', [0.3, 0.3]], ['d2', [0.4, 0.1]], ['b0', [-0.2, -0.2]]]) {
      ed.active = id;
      ed.dragTo(p);
      check();
    }
  });

  test('dragging a joint moves its handle with it', () => {
    const ed = createCurveEditor({ painting });
    const before = ed.free.map((p) => [...p]);
    ed.active = 'b3';
    ed.dragTo([before[3][0] + 0.1, before[3][1] - 0.2]);
    closeArr(ed.free[3], [before[3][0] + 0.1, before[3][1] - 0.2]);
    closeArr(ed.free[2], [before[2][0] + 0.1, before[2][1] - 0.2]);
    closeArr(ed.free[5], before[5]);
  });

  test('evalAt: ends of the curve and tangent direction', () => {
    const ed = createCurveEditor({ painting });
    closeArr(ed.evalAt(0).pos, ed.free[0]);
    closeArr(ed.evalAt(1).pos, ed.free[7]);
    ed.kind = 'catmull-rom';
    closeArr(ed.evalAt(0).pos, ed.cr[0]);
    closeArr(ed.evalAt(1).pos, ed.cr[ed.cr.length - 1]);
  });

  test('line vertices fit the renderer capacity', () => {
    const ed = createCurveEditor({ painting });
    for (const kind of ['bezier-c1', 'catmull-rom']) {
      ed.kind = kind;
      const v = ed.lineVertices({ polygon: true, dc: { on: true, segment: 1, t: 0.4 } });
      assert.ok(v.length / 6 <= CURVE_MAX_VERTICES);
      assert.equal(v.length % 18, 0, 'whole triangles');
    }
  });

  test('default traces lie inside the painting', () => {
    const ed = createCurveEditor({ painting: { aspect: 1055 / 1280 }, paintingId: () => 'kabatas' });
    for (const p of [...ed.free, ...ed.cr]) {
      assert.ok(Math.abs(p[0]) <= 1055 / 1280 && Math.abs(p[1]) <= 1);
    }
  });
});

describe('Part D · JSON export', () => {
  test('world ↔ normalised painting coordinates', () => {
    closeArr(worldToNormalised([-0.82, 1], 0.82), [0, 0]);
    closeArr(worldToNormalised([0.82, -1], 0.82), [1, 1]);
    closeArr(worldToNormalised([0, 0], 0.82), [0.5, 0.5]);
    closeArr(normalisedToWorld([0.25, 0.75], 2), [-1, -0.5]);
  });

  test('bezier-c1 has "segments" of 4 points in [0, 1]', () => {
    const ed = createCurveEditor({ painting, paintingId: () => 'kabatas' });
    const j = JSON.parse(JSON.stringify(curveToJSON(ed.toExport())));
    assert.equal(j.painting, 'kabatas');
    assert.equal(j.kind, 'bezier-c1');
    assert.equal(j.segments.length, 3);
    assert.ok(j.segments.every((s) => s.length === 4 && s.every((p) => p.length === 2 && p.every((x) => x >= 0 && x <= 1))));
    assert.equal(j.points, undefined);
    assert.deepEqual(j.segments[0][3], j.segments[1][0]);
  });

  test('bezier-fit has one segment of 4 points', () => {
    const j = curveToJSON({ painting: 'kabatas', aspect: 0.82, kind: 'bezier-fit', segments: [[[0, 0], [0.1, 0.5], [0.3, 0.5], [0.5, 0]]], points: [] });
    assert.equal(j.kind, 'bezier-fit');
    assert.equal(j.segments.length, 1);
    assert.equal(j.segments[0].length, 4);
    assert.equal(j.points, undefined);
  });

  test('catmull-rom has "points"', () => {
    const ed = createCurveEditor({ painting });
    ed.kind = 'catmull-rom';
    const j = curveToJSON(ed.toExport());
    assert.equal(j.kind, 'catmull-rom');
    assert.equal(j.points.length, ed.cr.length);
    assert.equal(j.segments, undefined);
  });
});
