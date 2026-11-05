/**
 * Bonus — draw a stroke over the painting with the mouse and fit one cubic
 * Bézier curve to it (least squares, see math/fit.js). No GPU code in here.
 *
 * Usage (main.js): begin() on mouse down, add(p) while dragging, end() on
 * release; vertices() returns the triangle list to draw.
 */
import { cubicBezier } from '../math/curves.js';
import { resample, fitCubicBezier } from '../math/fit.js';
import { CURVE_Z } from './curveEditor.js';

export const FIT_MAX_VERTICES = 6000;
const MAX_STROKE_POINTS = 500;
const MIN_SPACING = 0.004;   // world units between recorded mouse points
const FIT_POINTS = 40;       // the stroke is resampled to this many points before fitting
const SAMPLES = 48;

const COL = {
  stroke: [0.95, 0.95, 0.95], strokeEdge: [0.01, 0.01, 0.01],
  fit: [0.1, 0.9, 0.25], polygon: [0.4, 0.9, 0.5], end: [1, 0.85, 0.1], inner: [0.3, 1, 0.6],
};

export function createCurveFit() {
  const fit = {
    stroke: [],     // recorded mouse points [x, y]
    result: null,   // { points: [P0, P1, P2, P3], rms, max } or null
    drawing: false,

    begin() { fit.stroke = []; fit.result = null; fit.drawing = true; },

    add(p) {
      if (!fit.drawing || !p) return;
      const last = fit.stroke[fit.stroke.length - 1];
      if (last && Math.hypot(p[0] - last[0], p[1] - last[1]) < MIN_SPACING) return;
      if (fit.stroke.length < MAX_STROKE_POINTS) fit.stroke.push([...p]);
    },

    /** Mouse released: resample the stroke and fit the curve. */
    end() {
      fit.drawing = false;
      fit.result = fit.stroke.length >= 4 ? fitCubicBezier(resample(fit.stroke, FIT_POINTS)) : null;
    },

    clear() { fit.stroke = []; fit.result = null; fit.drawing = false; },

    hasContent() { return fit.stroke.length > 0; },

    /** Text for the panel. */
    describe() {
      if (fit.drawing) return `drawing … ${fit.stroke.length} points`;
      if (!fit.result) return 'Hold Alt (Option) and drag over the painting to draw a stroke.';
      const f = (p) => `(${p[0].toFixed(3)}, ${p[1].toFixed(3)})`;
      const [p0, p1, p2, p3] = fit.result.points;
      return `stroke: ${fit.stroke.length} points → resampled to ${FIT_POINTS}\n` +
        `P0 ${f(p0)}\nP1 ${f(p1)}\nP2 ${f(p2)}\nP3 ${f(p3)}\n` +
        `rms error ${fit.result.rms.toFixed(4)}   max ${fit.result.max.toFixed(4)}  (world units; painting height = 2)`;
    },

    /** Data for curveToJSON(), or null. */
    toExport(paintingId, aspect) {
      if (!fit.result) return null;
      return { painting: paintingId, aspect, kind: 'bezier-fit', segments: [fit.result.points], points: [] };
    },

    /** Triangle-list vertices [x, y, z, r, g, b]: the stroke, the fitted curve and its control points. */
    vertices() {
      const out = [];
      const V = (p, c) => out.push(p[0], p[1], CURVE_Z, c[0], c[1], c[2]);
      const tri = (a, b, c, col) => { V(a, col); V(b, col); V(c, col); };
      const strip = (a, b, col, w) => {
        const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
        if (len < 1e-9) return;
        const nx = (-dy / len) * w / 2, ny = (dx / len) * w / 2;
        const p = [a[0] + nx, a[1] + ny], q = [a[0] - nx, a[1] - ny], r = [b[0] + nx, b[1] + ny], s = [b[0] - nx, b[1] - ny];
        tri(p, q, r, col); tri(q, s, r, col);
      };
      const disc = (c, r, col, n = 14) => {
        for (let i = 0; i < n; i++) {
          const a0 = (2 * Math.PI * i) / n, a1 = (2 * Math.PI * (i + 1)) / n;
          tri(c, [c[0] + r * Math.cos(a0), c[1] + r * Math.sin(a0)], [c[0] + r * Math.cos(a1), c[1] + r * Math.sin(a1)], col);
        }
      };

      // the hand-drawn stroke (thin, light)
      for (let i = 0; i + 1 < fit.stroke.length; i++) strip(fit.stroke[i], fit.stroke[i + 1], COL.stroke, 0.006);

      if (fit.result) {
        const b = fit.result.points;
        const pts = Array.from({ length: SAMPLES + 1 }, (_, k) => cubicBezier(...b, k / SAMPLES));
        for (let k = 0; k < SAMPLES; k++) strip(pts[k], pts[k + 1], COL.strokeEdge, 0.014);
        for (let k = 0; k < SAMPLES; k++) strip(pts[k], pts[k + 1], COL.fit, 0.009);
        strip(b[0], b[1], COL.polygon, 0.004);
        strip(b[2], b[3], COL.polygon, 0.004);
        for (const [i, p] of b.entries()) {
          const end = i === 0 || i === 3;
          disc(p, (end ? 0.023 : 0.017), COL.strokeEdge);
          disc(p, (end ? 0.019 : 0.013), end ? COL.end : COL.inner);
        }
      }
      return new Float32Array(out);
    },
  };
  return fit;
}
