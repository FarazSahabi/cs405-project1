/**
 * Camera — Part C.
 *
 * The camera is plain data. viewProjection() turns it into P · V using YOUR
 * mat4.lookAt / mat4.perspective / mat4.orthographic / mat4.multiply.
 *
 * Until those exist it falls back to a fixed "fit the painting to the window"
 * matrix, so the starter shows your painting from the first `npm run dev`.
 * The panel tells you which of the two is active.
 *
 * Orbit controls: the camera orbits around `target` on a sphere described by
 * (yaw, pitch, dist). createOrbit() reads those from a camera and applyOrbit()
 * writes the new eye position back; main.js changes them on mouse drag / wheel.
 */
import * as mat4 from '../math/mat4.js';
import * as vec3 from '../math/vec3.js';
import { NotImplemented } from '../math/todo.js';

/** The camera you orbit with the mouse. */
export function createCamera() {
  return {
    eye: [0, 0, 2.8],
    target: [0, 0, 0],
    up: [0, 1, 0],
    fovY: Math.PI / 4, // radians
    // The scene lives within a few units of the camera, so a modest depth
    // range keeps the depth buffer precise (see the report discussion).
    near: 0.5,
    far: 12,
    projection: 'perspective', // or 'orthographic'
    orthoHeight: 2.2, // world units visible vertically in orthographic mode
  };
}

/**
 * The second, FIXED camera used to look at the scene from outside, so the
 * orbit camera's frustum can be drawn. It never moves.
 */
export function createInspectionCamera() {
  return {
    eye: [3.4, 2.2, 4.6],
    target: [0, 0, 0.3],
    up: [0, 1, 0],
    fovY: (50 * Math.PI) / 180,
    near: 0.1,
    far: 100,
    projection: 'perspective',
    orthoHeight: 2.2,
  };
}

/* ------------------------------------------------------ orbit controls ---- */

/**
 * Spherical coordinates of the camera around its target:
 *   eye = target + dist · (cos(pitch)·sin(yaw),  sin(pitch),  cos(pitch)·cos(yaw))
 * yaw = 0, pitch = 0 puts the camera on the +z axis looking at the target.
 */
export function createOrbit(cam) {
  const offset = vec3.sub(cam.eye, cam.target);
  const dist = vec3.length(offset);
  return {
    yaw: Math.atan2(offset[0], offset[2]),
    pitch: Math.asin(offset[1] / dist),
    dist,
  };
}

/** Write the orbit state back into cam.eye. */
export function applyOrbit(cam, orbit) {
  const cp = Math.cos(orbit.pitch);
  cam.eye = vec3.add(cam.target, [
    orbit.dist * cp * Math.sin(orbit.yaw),
    orbit.dist * Math.sin(orbit.pitch),
    orbit.dist * cp * Math.cos(orbit.yaw),
  ]);
}

/* ------------------------------------------------------------- P · V ----- */

/**
 * @param {object} cam     from createCamera()
 * @param {number} aspect  canvas width / height
 * @param {number} paintingAspect  image width / height (only used by the fallback)
 * @returns {{ matrix: Float32Array, fallback: boolean, missing?: string }}
 */
export function viewProjection(cam, aspect, paintingAspect = 1) {
  try {
    const view = mat4.lookAt(cam.eye, cam.target, cam.up);
    let proj;
    if (cam.projection === 'orthographic') {
      const h = cam.orthoHeight / 2, w = h * aspect;
      proj = mat4.orthographic(-w, w, -h, h, cam.near, cam.far);
    } else {
      proj = mat4.perspective(cam.fovY, aspect, cam.near, cam.far);
    }
    return { matrix: mat4.multiply(proj, view), fallback: false };
  } catch (e) {
    if (!(e instanceof NotImplemented)) throw e;
    return { matrix: fitMatrix(aspect, paintingAspect), fallback: true, missing: e.message };
  }
}

/**
 * Placeholder used until Part C works: scales the painting quad (height 2,
 * width 2·paintingAspect, centred at the origin in the z = 0 plane) to fit
 * the canvas, and maps world z to depth so that +z is in front.
 * There is no camera here — do not build on this.
 */
function fitMatrix(aspect, paintingAspect) {
  const s = 0.92 * Math.min(1, aspect / paintingAspect);
  return new Float32Array([
    s / aspect, 0, 0, 0,
    0, s, 0, 0,
    0, 0, -0.05, 0,
    0, 0, 0.5, 1,
  ]);
}
