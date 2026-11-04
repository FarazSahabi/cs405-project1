/**
 * mat4 — 4×4 matrices for Parts A and C.
 *
 * CONVENTIONS (the tests check exactly these):
 *   • A matrix is a Float32Array(16) in COLUMN-MAJOR order — the layout WebGPU
 *     expects for a mat4x4f in a uniform buffer. Element (row r, column c)
 *     lives at index  c * 4 + r.  The translation of an affine matrix is
 *     therefore at indices 12, 13, 14.
 *   • Column vectors: a point p is transformed as  M · p.
 *     multiply(A, B) returns A·B, so B is applied FIRST.
 *   • Right-handed world space. Angles in RADIANS. A positive angle rotates
 *     counter-clockwise when you look down the axis towards the origin
 *     (rotateZ(π/2) takes +x to +y).
 *   • View space: the camera sits at the origin and looks down −z, +y is up.
 *   • Clip space is WebGPU's: after the divide by w, x and y are in [−1, 1]
 *     and z is in [0, 1] (near → 0, far → 1). NOT OpenGL's [−1, 1].
 *
 * No maths libraries (no gl-matrix, no Three.js). Tests: tests/mat4.test.js
 */
import { todo } from './todo.js';

/* ------------------------------------------------------------- Part A ---- */

/** The 4×4 identity. */
export function identity() {
  // Ones on the diagonal (indices 0, 5, 10, 15), zeros elsewhere.
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ]);
}

/** A · B (apply B first, then A). Must not modify a or b. */
export function multiply(a, b) {
  // out(row r, col c) = sum over k of  a(row r, col k) * b(row k, col c)
  // With column-major storage, element (r, c) lives at index c * 4 + r.
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[k * 4 + r] * b[c * 4 + k];
      out[c * 4 + r] = sum;
    }
  }
  return out;
}

/** Translation by (tx, ty, tz). */
export function translate(tx, ty, tz) {
  // Identity, with the offset in the last column (indices 12, 13, 14).
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    tx, ty, tz, 1,
  ]);
}

/** Rotation by `rad` about the x axis. */
export function rotateX(rad) {
  const c = Math.cos(rad), s = Math.sin(rad);
  // x stays fixed; y and z rotate into each other (+y → +z for 90°).
  return new Float32Array([
    1, 0, 0, 0,
    0, c, s, 0,
    0, -s, c, 0,
    0, 0, 0, 1,
  ]);
}

/** Rotation by `rad` about the y axis. */
export function rotateY(rad) {
  const c = Math.cos(rad), s = Math.sin(rad);
  // y stays fixed; z and x rotate into each other (+z → +x for 90°).
  return new Float32Array([
    c, 0, -s, 0,
    0, 1, 0, 0,
    s, 0, c, 0,
    0, 0, 0, 1,
  ]);
}

/** Rotation by `rad` about the z axis. */
export function rotateZ(rad) {
  const c = Math.cos(rad), s = Math.sin(rad);
  // z stays fixed; x and y rotate into each other (+x → +y for 90°).
  return new Float32Array([
    c, s, 0, 0,
    -s, c, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ]);
}

/** Non-uniform scale by (sx, sy, sz). */
export function scale(sx, sy, sz) {
  // Scale factors on the diagonal.
  return new Float32Array([
    sx, 0, 0, 0,
    0, sy, 0, 0,
    0, 0, sz, 0,
    0, 0, 0, 1,
  ]);
}

/** Mᵀ */
export function transpose(m) {
  // Swap rows and columns: element (r, c) of the result is element (c, r) of m.
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) out[c * 4 + r] = m[r * 4 + c];
  }
  return out;
}

/**
 * Inverse of a RIGID transform M = T·R (rotation + translation only, no scale).
 * Do not write a general 4×4 inverse: use the structure (Week 3).
 */
export function invertRigid(m) {
  // M = T·R  →  M⁻¹ = R⁻¹·T⁻¹ = Rᵀ · T(−t).
  // The inverse of a pure rotation is its transpose, so the upper-left 3×3
  // block of the result is the transpose of M's. The new translation is −Rᵀ·t.
  const out = new Float32Array(16);
  for (let c = 0; c < 3; c++) {
    for (let r = 0; r < 3; r++) out[c * 4 + r] = m[r * 4 + c];
  }
  const tx = m[12], ty = m[13], tz = m[14];
  out[12] = -(m[0] * tx + m[1] * ty + m[2] * tz);
  out[13] = -(m[4] * tx + m[5] * ty + m[6] * tz);
  out[14] = -(m[8] * tx + m[9] * ty + m[10] * tz);
  out[15] = 1;
  return out;
}

/** M · v for a 4-component v = [x, y, z, w]; returns [x', y', z', w']. */
export function transformVec4(m, v) {
  // Each output component is (row r of m) · v.
  const out = [0, 0, 0, 0];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) out[r] += m[c * 4 + r] * v[c];
  }
  return out;
}

/* ------------------------------------------------------------- Part C ---- */

/**
 * View matrix for a camera at `eye` looking at `target`, with `up` as the
 * approximate up direction. Build the camera basis with two cross products.
 * Must stay finite when `up` is parallel to the view direction — handle it.
 * eye, target, up: [x, y, z]
 */
export function lookAt(eye, target, up) { return todo('mat4.lookAt'); }

/**
 * Perspective projection for WebGPU (depth z ∈ [0, 1]).
 * fovY: vertical field of view in radians; aspect = width / height;
 * near, far: positive distances along −z.
 */
export function perspective(fovY, aspect, near, far) { return todo('mat4.perspective'); }

/**
 * Orthographic projection for WebGPU (depth z ∈ [0, 1]) of the box
 * x ∈ [left, right], y ∈ [bottom, top], z ∈ [−near, −far] in view space.
 */
export function orthographic(left, right, bottom, top, near, far) {
  return todo('mat4.orthographic');
}

/* ------------------------------------------------- provided (not graded) - */

/**
 * Pretty-print a column-major matrix as four rows, for showing matrices on
 * screen (Part A asks you to display T·R·S and S·R·T).
 */
export function format(m, digits = 2) {
  if (!m) return '(none)';
  const w = digits + 4;
  let s = '';
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) s += (+m[c * 4 + r]).toFixed(digits).padStart(w);
    if (r < 3) s += '\n';
  }
  return s;
}
