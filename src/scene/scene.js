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
 *         joint chain, and a debug mode that draws every node's local axes.
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
import { cube, axes } from './geometry.js';
import { MeshRenderer } from '../render/mesh.js';
import { LineRenderer } from '../render/lines.js';
import { createArm, poseArm, treeText } from './arm.js';

const mul = mat4.multiply;

/** Starting values of everything the panel controls (reset() restores them). */
const DEFAULTS = Object.freeze({
  // — which parts are visible, and the debug drawing —
  showA: true,          // the Part A boxes
  showB: true,          // the Part B arm
  debugAxes: false,     // draw every scene-graph node's local axes
  // — Part A —
  tx: 0.6, ty: -0.3, tz: 0.9, // translation (world units); z > 0 = in front of the painting
  rotY: 0.4, rotZ: 0.6,       // rotation angles in radians
  scale: 0.3,                 // uniform scale (the unit cube has side 1)
  useTRS: true,               // true: M = T·R·S   false: M = S·R·T
  showOther: true,            // also draw the box you get with the OTHER order (grey)
  // — Part B —
  animate: true,              // joints driven by time; off: driven by the sliders
  a1: 0.3, a2: -0.5, a3: 0.4, // joint angles (radians)
  spin: 0,                    // orbit angle of the satellite (radians)
});

/** R = Ry · Rz : rotate about z first, then about y. */
const rotation = (rotY, rotZ) => mul(mat4.rotateY(rotY), mat4.rotateZ(rotZ));

/** M = T · R · S  (S acts first). */
const composeTRS = (T, R, S) => mul(T, mul(R, S));

/** M = S · R · T  (T acts first — so the translation gets rotated and scaled too). */
const composeSRT = (T, R, S) => mul(S, mul(R, T));

const AXES_LENGTH = 0.25;
const wrapAngle = (x) => ((x + Math.PI) % (2 * Math.PI)) - Math.PI;

export function createScene({ gpu, renderer, painting, panel }) {
  const mesh = new MeshRenderer(gpu, cube());
  const lines = new LineRenderer(gpu, axes(AXES_LENGTH));
  const state = { ...DEFAULTS };
  const handles = []; // panel controls that must be refreshed by reset()

  /* ================= Part A objects ================= */

  // Three fixed boxes in front of the painting (z > 0).
  const fixed = [
    {
      name: 'box B (blue)',
      instance: mesh.createInstance([0.05, 0.22, 0.7]),
      model: composeTRS(
        mat4.translate(-0.8, -0.45, 0.35),
        rotation(0.5, 0.0),
        mat4.scale(0.3, 0.3, 0.3)),
    },
    {
      name: 'box C (green, tall)',
      instance: mesh.createInstance([0.08, 0.55, 0.12]),
      model: composeTRS(
        mat4.translate(-0.15, 0.45, 0.5),
        rotation(-0.6, 0.15),
        mat4.scale(0.2, 0.45, 0.2)),
    },
    {
      name: 'box D (yellow, flat)',
      instance: mesh.createInstance([0.85, 0.6, 0.05]),
      model: composeTRS(
        mat4.translate(0.05, -0.62, 0.3),
        rotation(0.2, -0.25),
        mat4.scale(0.55, 0.12, 0.25)),
    },
  ];

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
  const tree = bf.text();
  const leaf = bf.text();
  bf.note('Each node stores only its local transform: world = parent.world · local.');

  return {
    state,

    update(dt, time) {
      /* ---- Part A ---- */
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
      poseArm(arm, state); // sets every local matrix, then root.updateWorld()

      const p = arm.satellite.world;
      tree.set(treeText(arm));
      leaf.set(
        'world(satellite) = base · arm1 · arm2 · hand · satellite\n' +
        `${mat4.format(arm.satellite.world)}\n` +
        `position (${p[12].toFixed(2)}, ${p[13].toFixed(2)}, ${p[14].toFixed(2)})`);
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
    },

    reset() {
      Object.assign(state, DEFAULTS);
      for (const h of handles) h.update();
    },
  };
}
