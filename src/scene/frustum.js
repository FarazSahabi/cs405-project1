/**
 * Part C — the frustum of a camera, as line segments in WORLD space.
 *
 * Seen from the fixed inspection camera, this is the "truncated pyramid"
 * (perspective) or box (orthographic) of everything the main camera can see
 * between its near and far planes.
 *
 * Method: build the corners in VIEW space, where the camera sits at the
 * origin looking down −z:
 *      perspective   half-height at distance d = d · tan(fovY / 2)
 *      orthographic  half-height = orthoHeight / 2   (the same at every d)
 *      half-width = half-height · aspect
 * then move them to world space with the inverse of the view matrix. The
 * view matrix is rigid (rotation + translation), so mat4.invertRigid does it.
 */
import * as mat4 from '../math/mat4.js';

/** Most vertices frustumVertices() can return (perspective: 40). */
export const FRUSTUM_MAX_VERTICES = 48;

// Linear RGB colours.
const NEAR = [0.9, 0.8, 0.1];
const FAR = [0.9, 0.2, 0.1];
const SIDE = [0.7, 0.7, 0.7];
const APEX = [0.45, 0.45, 0.45];
const AIM = [0.1, 0.7, 0.9];
const AXIS_X = [1, 0, 0], AXIS_Y = [0, 1, 0], AXIS_Z = [0, 0, 1];

const point = (m, p) => mat4.transformVec4(m, [p[0], p[1], p[2], 1]).slice(0, 3);

/**
 * @param cam     a camera from scene/camera.js
 * @param aspect  width / height used when rendering that camera
 * @returns {Float32Array} interleaved [x, y, z, r, g, b] vertices, 2 per segment
 *                         (topology 'line-list'), at most FRUSTUM_MAX_VERTICES
 */
export function frustumVertices(cam, aspect) {
  const view = mat4.lookAt(cam.eye, cam.target, cam.up);
  const toWorld = mat4.invertRigid(view); // camera space → world space
  const perspective = cam.projection !== 'orthographic';

  // The four corners of the cross-section at distance d in front of the camera.
  const corners = (d) => {
    const hh = perspective ? Math.tan(cam.fovY / 2) * d : cam.orthoHeight / 2;
    const hw = hh * aspect;
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => point(toWorld, [sx * hw, sy * hh, -d]));
  };
  const near = corners(cam.near);
  const far = corners(cam.far);
  const eye = point(toWorld, [0, 0, 0]);

  const out = [];
  const seg = (a, b, color) => out.push(...a, ...color, ...b, ...color);

  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    seg(near[i], near[j], NEAR);   // near plane outline
    seg(far[i], far[j], FAR);      // far plane outline
    seg(near[i], far[i], SIDE);    // edges joining them
    if (perspective) seg(eye, near[i], APEX); // back to the apex = the eye
  }
  seg(eye, point(toWorld, [0, 0, -cam.far]), AIM); // viewing direction
  // The camera's own axes at the eye: x right (red), y up (green), z back (blue).
  seg(eye, point(toWorld, [0.3, 0, 0]), AXIS_X);
  seg(eye, point(toWorld, [0, 0.3, 0]), AXIS_Y);
  seg(eye, point(toWorld, [0, 0, 0.3]), AXIS_Z);
  return new Float32Array(out);
}
