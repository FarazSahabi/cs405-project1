/**
 * YOUR SCENE — Parts A, B and D live here (and in files you add next to it).
 *
 * main.js calls, every frame:
 *     scene.update(dt, time)          dt and time in seconds
 *     scene.draw(pass, viewProj)      inside the frame's render pass
 * and scene.reset() from the panel's "reset" button.
 *
 * Part A: three fixed boxes in front of the painting, one box driven by UI
 *         sliders, and a switch between M = T·R·S and M = S·R·T with both
 *         matrices printed.
 * Part B: a jointed arm built as a scene graph (see scene/arm.js): each node
 *         stores a local transform, world = parent.world · local. One animated
 *         joint chain, a debug mode that draws every node's local axes, and
 *         sliders that move the arm's base (the whole subtree follows).
 * Part D: an editable curve over the painting (scene/curveEditor.js): a C¹
 *         piecewise Bézier or a Catmull–Rom spline, de Casteljau drawing, an
 *         object that travels along it oriented by the tangent, JSON export.
 * Part C: scene.setFrustum() lets main.js hand over the main camera's frustum
 *         (line segments) to draw when looking through the inspection camera.
 *
 * Placement: x positions are given as a fraction of the painting's half-width
 * (painting.aspect), so the objects stay over the picture whichever painting
 * is loaded (they are portrait or landscape).
 *
 * The convention used everywhere in this project (state it in the report):
 *   column vectors, p' = M · p, and  M = T · R · S  — the object is SCALED
 *   first, then ROTATED, then TRANSLATED.
 *
 * WebGPU gotcha: queue.writeBuffer() calls all run BEFORE the frame's
 * commands execute, so every object needs its own uniform buffer — the
 * MeshRenderer / LineRenderer give each instance one.
 *
 * Call renderer.countDraw(vertexCount) after each draw so the vertex
 * counter in the panel is correct (Part E) — the renderers do it.
 */
import * as mat4 from '../math/mat4.js';
import { cube, axes, sphere } from './geometry.js';
import { MeshRenderer } from '../render/mesh.js';
import { LineRenderer } from '../render/lines.js';
import { createArm, poseArm, treeText } from './arm.js';
import { FRUSTUM_MAX_VERTICES } from './frustum.js';
import { createCurveEditor, CURVE_MAX_VERTICES, CURVE_Z } from './curveEditor.js';
import { curveToJSON, downloadJSON, worldToNormalised } from './curveExport.js';
import { cubicBezier } from '../math/curves.js';

const mul = mat4.multiply;

/** R = Ry · Rz : rotate about z first, then about y. */
const rotation = (rotY, rotZ) => mul(mat4.rotateY(rotY), mat4.rotateZ(rotZ));

/** M = T · R · S  (S acts first). */
const composeTRS = (T, R, S) => mul(T, mul(R, S));

/** M = S · R · T  (T acts first — so the translation gets rotated and scaled too). */
const composeSRT = (T, R, S) => mul(S, mul(R, T));

const AXES_LENGTH = 0.25;
const wrapAngle = (x) => ((x + Math.PI) % (2 * Math.PI)) - Math.PI;

export function createScene({ gpu, renderer, painting, panel, paintingId = () => 'kabatas' }) {
  const mesh = new MeshRenderer(gpu, cube());
  const lines = new LineRenderer(gpu, axes(AXES_LENGTH));
  // Frustum overlay: the vertex buffer is rewritten whenever the camera changes.
  const frustumLines = new LineRenderer(gpu, new Float32Array(FRUSTUM_MAX_VERTICES * 6));
  const frustumInstance = frustumLines.createInstance();
  let frustumOn = false;

  // Part D: the curve, drawn as one dynamic line list in world space.
  const curve = createCurveEditor({ painting, paintingId });
  const curveLines = new LineRenderer(gpu, new Float32Array(CURVE_MAX_VERTICES * 6), { topology: 'triangle-list' });
  const curveInstance = curveLines.createInstance();

  /** Starting values of everything the panel controls (reset() restores them). */
  const makeDefaults = () => ({
    // — which parts are visible, and the debug drawing —
    showA: true,          // the Part A boxes
    showB: true,          // the Part B arm
    debugAxes: false,     // draw every scene-graph node's local axes
    // — Part A —
    tx: -0.05, ty: 0.2, tz: 0.9, // translation (world units); z > 0 = in front of the painting
    rotY: 0.4, rotZ: 0.6,        // rotation angles in radians
    scale: 0.3,                  // uniform scale (the unit cube has side 1)
    useTRS: true,                // true: M = T·R·S   false: M = S·R·T
    showOther: true,             // also draw the box you get with the OTHER order (grey)
    // — Part B —
    animate: true,               // joints driven by time; off: driven by the sliders
    a1: 0.3, a2: -0.5, a3: 0.4,  // joint angles (radians)
    spin: 0,                     // orbit angle of the satellite (radians)
    bx: 0.7 * painting.aspect, by: -0.85, bz: 0.4, // where the arm's base stands
    // — Part D —
    showCurve: true,             // curve, control points and the travelling object
    polygon: true,               // control polygon
    showDC: true,                // de Casteljau construction (Bézier only)
    dcSeg: 2, dcT: 0.5,          // which segment (1–3) and parameter t
    animateCurve: true,          // object moves along the curve
    speed: 0.1,                  // curve parameter units per second
    u: 0,                        // position along the whole curve, 0 … 1
  });
  const state = makeDefaults();
  const handles = []; // panel controls that must be refreshed by reset()

  /* ================= Part A objects ================= */

  // Three fixed boxes in front of the painting (z > 0). x is a fraction of
  // the painting's half-width a, so that the boxes stay over the picture.
  const fixed = [
    { name: 'box B (blue)', instance: mesh.createInstance([0.05, 0.22, 0.7]),
      fx: -0.65, y: -0.2, z: 0.35, rotY: 0.5, rotZ: 0.0, size: [0.3, 0.3, 0.3] },
    { name: 'box C (green, tall)', instance: mesh.createInstance([0.08, 0.55, 0.12]),
      fx: -0.1, y: 0.55, z: 0.5, rotY: -0.6, rotZ: 0.15, size: [0.2, 0.45, 0.2] },
    { name: 'box D (yellow, flat)', instance: mesh.createInstance([0.85, 0.6, 0.05]),
      fx: -0.15, y: -0.7, z: 0.3, rotY: 0.2, rotZ: -0.25, size: [0.55, 0.12, 0.25] },
  ];
  for (const box of fixed) box.model = mat4.identity();

  // The box controlled from the UI, and the same box under the other order.
  const controlled = mesh.createInstance([0.9, 0.28, 0.04]); // orange
  const other = mesh.createInstance([0.45, 0.45, 0.45]);     // grey
  let mTRS = mat4.identity();
  let mSRT = mat4.identity();

  /* ================= Part B objects ================= */

  const arm = createArm();
  arm.root.traverse((node) => {
    if (node.data.color) node.data.instance = mesh.createInstance(node.data.color);
    node.data.axes = lines.createInstance(); // one per node, for the debug view
  });

  // The object that travels along the curve: a white ball.
  const ballMesh = new MeshRenderer(gpu, sphere());
  const body = ballMesh.createInstance([0.95, 0.95, 0.95]);
  let bodyModel = mat4.identity();

  /* ================= panel ================= */

  const sf = panel.folder('Scene');
  handles.push(sf.toggle('show Part A boxes', state, 'showA'));
  handles.push(sf.toggle('show Part B arm', state, 'showB'));
  handles.push(sf.toggle('debug: local axes of each node', state, 'debugAxes'));

  const f = panel.folder('Part A · Transformations');
  handles.push(f.toggle('M = T·R·S   (off: S·R·T)', state, 'useTRS'));
  handles.push(f.toggle('also show the other order (grey)', state, 'showOther'));
  handles.push(f.slider('translate x', state, 'tx', -2, 2, 0.01));
  handles.push(f.slider('translate y', state, 'ty', -1.2, 1.2, 0.01));
  handles.push(f.slider('translate z', state, 'tz', 0.2, 2, 0.01));
  handles.push(f.slider('rotate about y', state, 'rotY', -Math.PI, Math.PI, 0.01));
  handles.push(f.slider('rotate about z', state, 'rotZ', -Math.PI, Math.PI, 0.01));
  handles.push(f.slider('scale', state, 'scale', 0.1, 0.8, 0.01));
  const trsText = f.text();
  const srtText = f.text();
  f.note('Orange = the order selected above. Grey = the other order, same sliders.');

  const bf = panel.folder('Part B · Scene graph');
  handles.push(bf.toggle('animate (off: use the sliders)', state, 'animate'));
  const jointHandles = [
    bf.slider('joint 1  (arm1)', state, 'a1', -1.2, 1.2, 0.01),
    bf.slider('joint 2  (arm2)', state, 'a2', -1.5, 1.5, 0.01),
    bf.slider('joint 3  (hand)', state, 'a3', -1.5, 1.5, 0.01),
    bf.slider('satellite orbit', state, 'spin', -Math.PI, Math.PI, 0.01),
  ];
  handles.push(...jointHandles);
  handles.push(bf.slider('base x', state, 'bx', -2, 2, 0.01));
  handles.push(bf.slider('base y', state, 'by', -1.2, 1, 0.01));
  handles.push(bf.slider('base z', state, 'bz', 0.2, 1.5, 0.01));
  const tree = bf.text();
  const leaf = bf.text();
  bf.note('Each node stores only its local transform: world = parent.world · local. ' +
    'Moving the base moves the whole arm.');

  const cfold = panel.folder('Part D · Curves');
  handles.push(cfold.toggle('show curve', state, 'showCurve'));
  const kindSelect = cfold.select('curve type',
    [{ value: 'bezier-c1', label: 'cubic Bézier, 3 segments, C¹' }, { value: 'catmull-rom', label: 'Catmull–Rom spline' }],
    curve.kind, (v) => { curve.kind = v; curve.active = curve.hover = null; });
  handles.push(cfold.toggle('control polygon', state, 'polygon'));
  handles.push(cfold.toggle('de Casteljau construction', state, 'showDC'));
  handles.push(cfold.slider('  segment', state, 'dcSeg', 1, 3, 1));
  handles.push(cfold.slider('  parameter t', state, 'dcT', 0, 1, 0.01));
  handles.push(cfold.toggle('animate the object', state, 'animateCurve'));
  handles.push(cfold.slider('speed', state, 'speed', 0.02, 0.4, 0.01));
  const uSlider = cfold.slider('position u', state, 'u', 0, 1, 0.001);
  handles.push(uSlider);
  const curveText = cfold.text();
  cfold.button('export curve as JSON', () => {
    const json = curveToJSON(curve.toExport());
    downloadJSON(json, `curve-${paintingId()}-${curve.kind}.json`);
  });
  cfold.button('reset curve', () => curve.reset());
  cfold.note('Drag the yellow squares (joints) and orange crosses (handles) on the painting. ' +
    'Dark crosses are computed: dragging them mirrors the previous handle, which keeps C¹.');

  /** Text for the Part D readout: C(t) at the de Casteljau parameter, formulas, C¹ rule. */
  const describeCurve = (pos, tan, heading) => {
    const f = (x, d = 3) => x.toFixed(d);
    const px = (p) => {
      const [w, h] = painting.size ?? [1, 1];
      const [u, v] = worldToNormalised(p, painting.aspect);
      return { u, v, x: u * w, y: v * h };
    };
    const here = px(pos);
    const object =
      `object  u = ${f(state.u)}\n` +
      `  position (${f(here.u)}, ${f(here.v)}) normalised\n` +
      `  tangent (${f(tan[0], 2)}, ${f(tan[1], 2)})  heading ${f((heading * 180) / Math.PI, 0)}°\n`;
    if (curve.kind === 'catmull-rom') {
      return `curve type : Catmull–Rom spline\npoints     : ${curve.cr.length}  (segments: ${curve.cr.length - 1})\n\n` + object +
        '\nq(t) = ½ [ 2P₁ + (−P₀+P₂) t + (2P₀−5P₁+4P₂−P₃) t²\n          + (−P₀+3P₁−3P₂+P₃) t³ ]\n' +
        'passes through P₁ at t = 0 and P₂ at t = 1; tangent (P₂−P₀)/2 at P₁.';
    }
    const k = Math.round(state.dcSeg) - 1;
    const C = cubicBezier(...curve.segments()[k], state.dcT);
    const c = px(C);
    return (
      'curve type : piecewise cubic Bézier\n' +
      `segments   : 3\n` +
      `de Casteljau: segment ${k + 1}, t = ${f(state.dcT, 2)}\n` +
      `C(t)       : (${f(c.x, 1)}, ${f(c.y, 1)}) px\n` +
      `             (${f(c.u)}, ${f(c.v)}) normalised\n\n` + object +
      '\nB(t) = (1−t)³P₀ + 3(1−t)²t P₁ + 3(1−t)t² P₂ + t³P₃\n\n' +
      'de Casteljau: repeatedly interpolate neighbouring points\nby t until one point is left — that point is B(t).\n\n' +
      'C¹ at an interior joint K needs P_after = 2K − P_before\n(handles opposite and equal in length).');
  };

  return {
    state,
    curve,
    kindSelect,

    update(dt, time) {
      /* ---- Part A ---- */
      const a = painting.aspect; // painting half-width (its half-height is 1)
      for (const box of fixed) {
        box.model = composeTRS(
          mat4.translate(box.fx * a, box.y, box.z),
          rotation(box.rotY, box.rotZ),
          mat4.scale(...box.size));
      }
      const T = mat4.translate(state.tx, state.ty, state.tz);
      const R = rotation(state.rotY, state.rotZ);
      const S = mat4.scale(state.scale, state.scale, state.scale);
      mTRS = composeTRS(T, R, S);
      mSRT = composeSRT(T, R, S);
      const mark = (on) => (on ? '   <- drawn in orange' : '');
      trsText.set(`M = T·R·S${mark(state.useTRS)}\n${mat4.format(mTRS)}`);
      srtText.set(`M = S·R·T${mark(!state.useTRS)}\n${mat4.format(mSRT)}`);

      /* ---- Part B ---- */
      if (state.animate) {
        state.a1 = 0.55 * Math.sin(0.8 * time);
        state.a2 = 0.8 * Math.sin(1.1 * time + 1.0);
        state.a3 = 0.7 * Math.sin(1.7 * time);
        state.spin = wrapAngle(1.5 * time);
        for (const h of jointHandles) h.update(); // keep the sliders in step
      }
      // Sets every local matrix, then root.updateWorld().
      poseArm(arm, { a1: state.a1, a2: state.a2, a3: state.a3, spin: state.spin,
        base: [state.bx, state.by, state.bz] });

      const p = arm.satellite.world;
      tree.set(treeText(arm));
      leaf.set(
        'world(satellite) = base · arm1 · arm2 · hand · satellite\n' +
        `${mat4.format(arm.satellite.world)}\n` +
        `position (${p[12].toFixed(2)}, ${p[13].toFixed(2)}, ${p[14].toFixed(2)})`);

      /* ---- Part D ---- */
      if (state.animateCurve) {
        state.u = (state.u + dt * state.speed) % 1;
        uSlider.update();
      }
      const { pos, tan } = curve.evalAt(state.u);
      const heading = Math.atan2(tan[1], tan[0]); // angle of the tangent in the painting plane
      // M = T · R · S: the box is stretched along x, turned to the tangent, moved onto the curve.
      const place = (len, thick, ahead) => composeTRS(
        mat4.translate(pos[0], pos[1], CURVE_Z + 0.03),
        mat4.rotateZ(heading),
        mat4.multiply(mat4.translate(ahead, 0, 0), mat4.scale(len, thick, len)));
      bodyModel = place(0.07, 0.07, 0);        // a ball of diameter 0.07

      curveLines.setVertices(curve.lineVertices({
        polygon: state.polygon,
        dc: { on: state.showDC, segment: Math.round(state.dcSeg) - 1, t: state.dcT },
      }));
      curveText.set(describeCurve(pos, tan, heading));
    },

    /**
     * Part C: the line segments of the main camera's frustum (world space,
     * see scene/frustum.js), or null to draw none.
     */
    setFrustum(vertices) {
      frustumOn = !!vertices;
      if (vertices) frustumLines.setVertices(vertices);
    },

    /** @param {GPURenderPassEncoder} pass  @param {Float32Array} viewProj  P · V */
    draw(pass, viewProj) {
      // p_clip = P · V · M · p_object  — one multiplication per object.
      const drawBox = (instance, model) =>
        mesh.draw(pass, instance, mul(viewProj, model), model, renderer);

      if (state.showA) {
        for (const box of fixed) drawBox(box.instance, box.model);
        const main = state.useTRS ? mTRS : mSRT;
        const alt = state.useTRS ? mSRT : mTRS;
        drawBox(controlled, main);
        if (state.showOther) drawBox(other, alt);
      }

      if (state.showB) {
        // A node's box = its WORLD matrix · its visual (size/offset) matrix.
        arm.root.traverse((node) => {
          if (node.data.instance) drawBox(node.data.instance, mul(node.world, node.data.visual));
        });
        // Debug: each node's local axes (x red, y green, z blue) = its world matrix.
        if (state.debugAxes) {
          arm.root.traverse((node) => {
            lines.draw(pass, node.data.axes, mul(viewProj, node.world), renderer);
          });
        }
      }

      if (state.showCurve) {
        // The curve's vertices are already in world space: M = identity.
        curveLines.draw(pass, curveInstance, viewProj, renderer);
        ballMesh.draw(pass, body, mul(viewProj, bodyModel), bodyModel, renderer);
      }

      // The frustum's vertices are already in world space: M = identity.
      if (frustumOn) frustumLines.draw(pass, frustumInstance, viewProj, renderer);
    },

    reset() {
      Object.assign(state, makeDefaults());
      for (const h of handles) h.update();
      curve.reset();
      curve.kind = 'bezier-c1';
      kindSelect.set('bezier-c1');
    },
  };
}
