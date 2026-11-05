/**
 * Part D — the editable curve over the painting (no GPU code in here).
 * The drawing is built from triangles (thick strips and filled markers).
 *
 * Two curves live in the plane of the painting (world z = CURVE_Z):
 *   'bezier-c1'   three cubic Bézier segments, C¹ at the two inner joints
 *   'catmull-rom' a Catmull–Rom spline through a list of points
 * Both start out tracing a shape in the painting (the hull of the boat in
 * Kabataş Rıhtımı / the edge of the jetty) and every point can be dragged.
 *
 * Bézier data: 8 free points,
 *     free = [P0, P1, P2, P3,   P2', P3',   P2'', P3'']
 * Segment 0 = free[0..3]. Every later segment starts at the previous P3 and
 * its P1 is NOT free: it is c1NextControl(prev P2, prev P3), which is what
 * makes the joint C¹ whatever you drag.
 *
 * Mouse: pickPoint() turns a pixel into a point on the painting plane by
 * building the camera ray and intersecting it with z = CURVE_Z.
 */
import * as vec3 from '../math/vec3.js';
import * as mat4 from '../math/mat4.js';
import {
  cubicBezier, cubicBezierTangent, deCasteljau, c1NextControl, catmullRom,
  catmullRomTangent, locate,
} from '../math/curves.js';
import { normalisedToWorld } from './curveExport.js';

export const CURVE_Z = 0.02;           // the curve floats just in front of the painting
export const CURVE_MAX_VERTICES = 9000;
const SAMPLES = 40;                    // line pieces per curve segment
const W_CURVE = 0.009;                 // widths and sizes, in world units
const W_THIN = 0.004;
const W_CROSS = 0.009, S_CROSS = 0.022;

/* Default traces, in normalised painting coordinates (u right, v down). */
const px = (x, y) => [x / 1055, y / 1280]; // pixel position in the 1055 × 1280 Kabataş image
const TRACES = {
  kabatas: {
    // hull of the boat: stern → keel → bow
    bezier: [px(312, 748), px(306, 792), px(316, 820), px(362, 828),
      px(640, 836), px(722, 805),
      px(826, 768), px(834, 735)],
    // the edge of the jetty on the left
    catmull: [px(8, 692), px(110, 642), px(215, 588), px(300, 534), px(352, 506)],
  },
};
const FALLBACK = {
  bezier: [[0.2, 0.7], [0.2, 0.5], [0.35, 0.4], [0.45, 0.5], [0.6, 0.65], [0.65, 0.4], [0.75, 0.35], [0.8, 0.5]],
  catmull: [[0.1, 0.8], [0.3, 0.6], [0.5, 0.55], [0.7, 0.4], [0.9, 0.3]],
};

// Linear RGB colours.
const COL = {
  curve: [1, 0.12, 0.5], polygon: [0.55, 0.55, 0.55],
  joint: [1, 0.85, 0.1], handle: [1, 0.45, 0.05], derived: [0.6, 0.3, 0.1],
  point: [0.1, 0.9, 1], active: [1, 1, 1],
  outline: [0.01, 0.01, 0.01],
  dc1: [0.2, 1, 0.3], dc2: [0.3, 0.5, 1], dc3: [1, 0, 0],
};

/* Dragging a free point moves these free points together (joint + its handle). */
const GROUPS = { 0: [0, 1], 3: [3, 2], 5: [5, 4], 7: [7, 6] };
const JOINT_OF = { 1: [3, 2], 2: [5, 4] }; // derived P1 of segment s → [joint index, left P2 index]

/* ------------------------------------------------ mouse → painting plane -- */

/**
 * Camera ray through the normalised device coordinate ndc = [x, y] (+y up).
 * Perspective: all rays start at the eye; orthographic: parallel rays.
 */
export function pickRay(cam, aspect, ndc) {
  const f = vec3.normalize(vec3.sub(cam.target, cam.eye));
  const r = vec3.normalize(vec3.cross(f, cam.up));
  const u = vec3.cross(r, f);
  if (cam.projection === 'orthographic') {
    const h = cam.orthoHeight / 2;
    const origin = vec3.add(cam.eye, vec3.add(vec3.scale(r, ndc[0] * h * aspect), vec3.scale(u, ndc[1] * h)));
    return { origin, dir: f };
  }
  const th = Math.tan(cam.fovY / 2);
  const dir = vec3.normalize(vec3.add(f, vec3.add(vec3.scale(r, ndc[0] * th * aspect), vec3.scale(u, ndc[1] * th))));
  return { origin: cam.eye, dir };
}

/** The point [x, y] where that ray meets the plane z = z0, or null. */
export function pickPoint(cam, aspect, ndc, z0 = CURVE_Z) {
  const { origin, dir } = pickRay(cam, aspect, ndc);
  if (Math.abs(dir[2]) < 1e-6) return null;
  const s = (z0 - origin[2]) / dir[2];
  if (s <= 0) return null; // plane is behind the camera
  return [origin[0] + s * dir[0], origin[1] + s * dir[1]];
}

/* ------------------------------------------------------------- editor ---- */

export function createCurveEditor({ painting, paintingId = () => 'kabatas' }) {
  const toWorld = (q) => normalisedToWorld(q, painting.aspect);
  const trace = () => TRACES[paintingId()] ?? FALLBACK;

  const ed = {
    kind: 'bezier-c1',
    free: [],        // Bézier free points (8), world [x, y]
    cr: [],          // Catmull–Rom points, world [x, y]
    active: null,    // id of the marker being dragged
    hover: null,

    reset() {
      ed.free = trace().bezier.map(toWorld);
      ed.cr = trace().catmull.map(toWorld);
      ed.active = ed.hover = null;
    },

    /** The three Bézier segments (derived P1s included). */
    segments() {
      const f = ed.free;
      const s0 = [f[0], f[1], f[2], f[3]];
      const s1 = [f[3], c1NextControl(f[2], f[3]), f[4], f[5]];
      const s2 = [f[5], c1NextControl(f[4], f[5]), f[6], f[7]];
      return [s0, s1, s2];
    },

    segmentCount() {
      return ed.kind === 'bezier-c1' ? 3 : ed.cr.length - 1;
    },

    /** Position and tangent (both [x, y]) at the global parameter u ∈ [0, 1]. */
    evalAt(u) {
      const n = ed.segmentCount();
      const { index, t } = locate(n, u);
      if (ed.kind === 'bezier-c1') {
        const seg = ed.segments()[index];
        return { pos: cubicBezier(...seg, t), tan: cubicBezierTangent(...seg, t) };
      }
      const q = ed.crSegment(index);
      return { pos: catmullRom(...q, t), tan: catmullRomTangent(...q, t) };
    },

    /** Four points controlling Catmull–Rom segment i (the ends are repeated). */
    crSegment(i) {
      const p = ed.cr, last = p.length - 1;
      return [p[Math.max(i - 1, 0)], p[i], p[i + 1], p[Math.min(i + 2, last)]];
    },

    /** Everything that can be grabbed: [{ id, pos, role }]. */
    markers() {
      if (ed.kind === 'catmull-rom') {
        return ed.cr.map((pos, i) => ({ id: `c${i}`, pos, role: 'point' }));
      }
      const f = ed.free, seg = ed.segments();
      const out = f.map((pos, i) => ({ id: `b${i}`, pos, role: GROUPS[i] && i !== 1 ? 'joint' : 'handle' }));
      out[0].role = 'joint';
      out.push({ id: 'd1', pos: seg[1][1], role: 'derived' }, { id: 'd2', pos: seg[2][1], role: 'derived' });
      return out;
    },

    /**
     * The marker within `radius` pixels of the pointer (nearest), or null.
     * @param ndc   pointer in normalised device coordinates
     * @param vp    P · V of the camera being drawn
     * @param size  { w, h } canvas size in CSS pixels
     */
    pick(ndc, vp, size, radius = 14) {
      let best = null, bestD = radius;
      for (const m of ed.markers()) {
        const c = mat4.transformVec4(vp, [m.pos[0], m.pos[1], CURVE_Z, 1]);
        if (c[3] <= 0) continue;
        const dx = (c[0] / c[3] - ndc[0]) * size.w / 2;
        const dy = (c[1] / c[3] - ndc[1]) * size.h / 2;
        const d = Math.hypot(dx, dy);
        if (d < bestD) { bestD = d; best = m.id; }
      }
      return best;
    },

    /** Move the active marker to p = [x, y] on the painting plane. */
    dragTo(p) {
      const id = ed.active;
      if (!id) return;
      const k = +id.slice(1);
      if (id[0] === 'c') { ed.cr[k] = [...p]; return; }
      if (id[0] === 'b') {
        const delta = [p[0] - ed.free[k][0], p[1] - ed.free[k][1]];
        for (const j of GROUPS[k] ?? [k]) ed.free[j] = [ed.free[j][0] + delta[0], ed.free[j][1] + delta[1]];
        return;
      }
      // derived P1 of segment k: set the previous P2 so that P1' = mirror(P2) = p (C¹ kept)
      const [joint, left] = JOINT_OF[k];
      ed.free[left] = c1NextControl(p, ed.free[joint]);
    },

    /** The curve data in the form curveToJSON() takes. */
    toExport() {
      return {
        painting: paintingId(), aspect: painting.aspect, kind: ed.kind,
        segments: ed.segments(), points: ed.cr,
      };
    },

    /**
     * Triangle-list vertices [x, y, z, r, g, b] for the whole drawing.
     * Lines are drawn as thin flat strips (a GPU line is always 1 pixel wide,
     * so thick lines have to be built from triangles).
     * opts: { polygon, dc: { on, segment, t } }
     */
    lineVertices(opts = {}) {
      const out = [];
      const V = (x, y, c) => out.push(x, y, CURVE_Z, c[0], c[1], c[2]);
      const tri = (a, b, c, col) => { V(a[0], a[1], col); V(b[0], b[1], col); V(c[0], c[1], col); };
      // A strip of width w from a to b.
      const strip = (a, b, col, w) => {
        const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
        if (len < 1e-9) return;
        const nx = (-dy / len) * w / 2, ny = (dx / len) * w / 2;
        const p = [a[0] + nx, a[1] + ny], q = [a[0] - nx, a[1] - ny];
        const r = [b[0] + nx, b[1] + ny], s = [b[0] - nx, b[1] - ny];
        tri(p, q, r, col); tri(q, s, r, col);
      };
      const square = (c, h, col) => {
        const [x, y] = c;
        tri([x - h, y - h], [x + h, y - h], [x + h, y + h], col);
        tri([x - h, y - h], [x + h, y + h], [x - h, y + h], col);
      };
      const disc = (c, r, col, n = 14) => {
        for (let i = 0; i < n; i++) {
          const a0 = (2 * Math.PI * i) / n, a1 = (2 * Math.PI * (i + 1)) / n;
          tri(c, [c[0] + r * Math.cos(a0), c[1] + r * Math.sin(a0)], [c[0] + r * Math.cos(a1), c[1] + r * Math.sin(a1)], col);
        }
      };
      // Marker with a dark outline so it stays visible on any colour.
      const outlined = (draw, size, col) => { draw(size + 0.004, COL.outline); draw(size, col); };
      const cross = (c, size, col, w) => {
        strip([c[0] - size, c[1]], [c[0] + size, c[1]], col, w);
        strip([c[0], c[1] - size], [c[0], c[1] + size], col, w);
      };

      /* The curve itself, with a dark underlay so it stands out on the painting. */
      const n = ed.segmentCount();
      const evalSeg = (i, t) => (ed.kind === 'bezier-c1'
        ? cubicBezier(...ed.segments()[i], t)
        : catmullRom(...ed.crSegment(i), t));
      const samples = [];
      for (let i = 0; i < n; i++) {
        const pts = [];
        for (let k = 0; k <= SAMPLES; k++) pts.push(evalSeg(i, k / SAMPLES));
        samples.push(pts);
      }
      for (const pts of samples) for (let k = 0; k < SAMPLES; k++) strip(pts[k], pts[k + 1], COL.outline, W_CURVE + 0.005);
      for (const pts of samples) for (let k = 0; k < SAMPLES; k++) strip(pts[k], pts[k + 1], COL.curve, W_CURVE);

      if (opts.polygon) {
        if (ed.kind === 'bezier-c1') {
          for (const s of ed.segments()) { strip(s[0], s[1], COL.polygon, W_THIN); strip(s[2], s[3], COL.polygon, W_THIN); }
        } else {
          for (let i = 0; i < ed.cr.length - 1; i++) strip(ed.cr[i], ed.cr[i + 1], COL.polygon, W_THIN);
        }
      }

      if (opts.dc?.on && ed.kind === 'bezier-c1') {
        const levels = deCasteljau(ed.segments()[opts.dc.segment], opts.dc.t);
        const colours = [COL.polygon, COL.dc1, COL.dc2];
        for (let l = 0; l < levels.length - 1; l++) {
          for (let i = 0; i < levels[l].length - 1; i++) strip(levels[l][i], levels[l][i + 1], colours[l], W_THIN * 1.4);
          if (l > 0) for (const p of levels[l]) outlined((r, c) => disc(p, r, c), 0.011, colours[l]);
        }
        outlined((r, c) => disc(levels[levels.length - 1][0], r, c), 0.02, COL.dc3);
      }

      for (const m of ed.markers()) {
        const hot = m.id === ed.active || m.id === ed.hover;
        const c = hot ? COL.active : COL[m.role];
        if (m.role === 'joint' || m.role === 'point') outlined((r, col) => disc(m.pos, r, col, 20), hot ? 0.024 : 0.019, c);
        else {
          cross(m.pos, S_CROSS + 0.005, COL.outline, W_CROSS + 0.009);
          cross(m.pos, S_CROSS, c, W_CROSS);
        }
      }
      return new Float32Array(out);
    },
  };
  ed.reset();
  return ed;
}
