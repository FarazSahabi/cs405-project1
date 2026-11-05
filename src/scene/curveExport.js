/**
 * Curve export — Part D.
 *
 * Required JSON format (control points in NORMALISED painting coordinates:
 * u, v ∈ [0, 1], origin at the TOP-LEFT corner of the painting, v downwards,
 * the same as texture coordinates):
 *
 * {
 *   "painting": "kavunlu",
 *   "kind": "bezier-c1",                 // or "catmull-rom" / "bspline"
 *   "segments": [                          // for "bezier-c1": 4 points each
 *     [[0.12, 0.40], [0.18, 0.31], [0.27, 0.30], [0.33, 0.38]],
 *     ...
 *   ],
 *   "points": [[u, v], ...]                // for "catmull-rom" / "bspline"
 * }
 *
 * The painting quad spans x ∈ [−a, a], y ∈ [−1, 1] at z = 0 (a = image
 * width / height), so  u = (x + a) / (2a)  and  v = (1 − y) / 2.
 */

const round = (x) => Math.round(x * 1e4) / 1e4;

/**
 * World [x, y] in the painting plane → normalised painting coordinates
 * [u, v]: u = (x + a) / (2a), v = (1 − y) / 2, with a = image width / height.
 */
export function worldToNormalised(p, aspect) {
  return [round((p[0] + aspect) / (2 * aspect)), round((1 - p[1]) / 2)];
}

/** Inverse of worldToNormalised(). */
export function normalisedToWorld(q, aspect) {
  return [q[0] * 2 * aspect - aspect, 1 - 2 * q[1]];
}

/**
 * Build the JSON object described above.
 *
 * @param curve {
 *   painting: string,                 id of the painting ("kabatas")
 *   aspect:   number,                 image width / height
 *   kind:     'bezier-c1' | 'catmull-rom',
 *   segments: [[P0,P1,P2,P3], …],     world [x, y] points (kind 'bezier-c1')
 *   points:   [[x, y], …],            world [x, y] points (kind 'catmull-rom')
 * }
 */
export function curveToJSON(curve) {
  const norm = (p) => worldToNormalised(p, curve.aspect);
  const out = { painting: curve.painting, kind: curve.kind };
  if (curve.kind === 'bezier-c1') out.segments = curve.segments.map((seg) => seg.map(norm));
  else out.points = curve.points.map(norm);
  return out;
}

/** Provided: save any object as a .json download in the browser. */
export function downloadJSON(obj, filename = 'curve.json') {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
