/**
 * YOUR SCENE — Parts A, B and D live here (and in files you add next to it).
 *
 * main.js calls, every frame:
 *     scene.update(dt, time)          dt and time in seconds
 *     scene.draw(pass, viewProj)      inside the frame's render pass
 * and scene.reset() from the panel's "reset" button.
 *
 * Part A (this file, so far):
 *   • three fixed boxes in front of the painting (z > 0), each placed with
 *     our own mat4 functions;
 *   • one box ("controlled") driven by UI sliders: translation, two rotation
 *     angles and a uniform scale;
 *   • a switch between M = T·R·S and M = S·R·T, with both matrices printed.
 *
 * The convention used everywhere in this project (state it in the report):
 *   column vectors, p' = M · p, and  M = T · R · S  — the object is SCALED
 *   first, then ROTATED, then TRANSLATED.
 *
 * WebGPU gotcha: queue.writeBuffer() calls all run BEFORE the frame's
 * commands execute, so every object needs its own uniform buffer — the
 * MeshRenderer gives each instance one.
 *
 * Call renderer.countDraw(vertexCount) after each draw so the vertex
 * counter in the panel is correct (Part E) — MeshRenderer.draw() does it.
 */
import * as mat4 from '../math/mat4.js';
import { cube } from './geometry.js';
import { MeshRenderer } from '../render/mesh.js';

const mul = mat4.multiply;

/** Starting values of everything the panel controls (reset() restores them). */
const DEFAULTS = Object.freeze({
  tx: 0.6, ty: -0.3, tz: 0.9, // translation (world units); z > 0 = in front of the painting
  rotY: 0.4, rotZ: 0.6,       // rotation angles in radians
  scale: 0.3,                 // uniform scale (the unit cube has side 1)
  useTRS: true,               // true: M = T·R·S   false: M = S·R·T
  showOther: true,            // also draw the box you get with the OTHER order (grey)
});

/** R = Ry · Rz : rotate about z first, then about y. */
const rotation = (rotY, rotZ) => mul(mat4.rotateY(rotY), mat4.rotateZ(rotZ));

/** M = T · R · S  (S acts first). */
const composeTRS = (T, R, S) => mul(T, mul(R, S));

/** M = S · R · T  (T acts first — so the translation gets rotated and scaled too). */
const composeSRT = (T, R, S) => mul(S, mul(R, T));

export function createScene({ gpu, renderer, painting, panel }) {
  const mesh = new MeshRenderer(gpu, cube());
  const state = { ...DEFAULTS };

  /* -------- three fixed boxes in front of the painting (z > 0) -------- */
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

  /* -------- the box controlled from the UI -------- */
  const controlled = mesh.createInstance([0.9, 0.28, 0.04]); // orange
  const other = mesh.createInstance([0.45, 0.45, 0.45]);     // grey: the other composition order
  let mTRS = mat4.identity();
  let mSRT = mat4.identity();

  /* -------- panel -------- */
  const f = panel.folder('Part A · Transformations');
  const handles = [];
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

  return {
    state,

    update(dt, time) {
      const T = mat4.translate(state.tx, state.ty, state.tz);
      const R = rotation(state.rotY, state.rotZ);
      const S = mat4.scale(state.scale, state.scale, state.scale);
      mTRS = composeTRS(T, R, S);
      mSRT = composeSRT(T, R, S);
      const mark = (on) => (on ? '   <- drawn in orange' : '');
      trsText.set(`M = T·R·S${mark(state.useTRS)}\n${mat4.format(mTRS)}`);
      srtText.set(`M = S·R·T${mark(!state.useTRS)}\n${mat4.format(mSRT)}`);
    },

    /** @param {GPURenderPassEncoder} pass  @param {Float32Array} viewProj  P · V */
    draw(pass, viewProj) {
      // p_clip = P · V · M · p_object  — one multiplication per object.
      const drawBox = (instance, model) =>
        mesh.draw(pass, instance, mul(viewProj, model), model, renderer);

      for (const box of fixed) drawBox(box.instance, box.model);

      const main = state.useTRS ? mTRS : mSRT;
      const alt = state.useTRS ? mSRT : mTRS;
      drawBox(controlled, main);
      if (state.showOther) drawBox(other, alt);
    },

    reset() {
      Object.assign(state, DEFAULTS);
      for (const h of handles) h.update();
    },
  };
}
