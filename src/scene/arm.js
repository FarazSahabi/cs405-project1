/**
 * Part B — the scene graph: a jointed arm standing on the lower right of the
 * painting, with a small "satellite" box orbiting its hand.
 *
 *   root
 *   └─ base          fixed on the ground plane in front of the painting
 *      └─ arm1       joint 1: rotates about z, carries everything below it
 *         └─ arm2    joint 2
 *            └─ hand joint 3
 *               └─ satellite   orbits the hand (rotation about the hand's y axis)
 *
 * Six nodes, six levels (root = level 0). Every node stores ONLY its local
 * transform (relative to its parent). Its world matrix comes from
 * SceneNode.updateWorld():  world = parent.world · local.
 *
 * Local matrices are pure  T · R  (no scale). The size of each box is a
 * separate "visual" matrix applied only when drawing — that way a scale never
 * leaks into the children of a node.
 */
import * as mat4 from '../math/mat4.js';
import { SceneNode } from './node.js';

const mul = mat4.multiply;

/** Fixed dimensions of the arm (world units). */
export const ARM = Object.freeze({
  basePos: [1.0, -0.85, 0.4], // where the base stands (z > 0: in front of the painting)
  baseHeight: 0.12,
  len1: 0.7,                  // length of arm1
  len2: 0.6,                  // length of arm2
  orbit: 0.28,                // distance of the satellite from the hand's origin
});

/** Build the tree (no GPU involved). Poses are set by poseArm(). */
export function createArm() {
  const root = new SceneNode('root');
  const base = root.addChild(new SceneNode('base'));
  const arm1 = base.addChild(new SceneNode('arm1'));
  const arm2 = arm1.addChild(new SceneNode('arm2'));
  const hand = arm2.addChild(new SceneNode('hand'));
  const satellite = hand.addChild(new SceneNode('satellite'));

  // How each node is DRAWN: a unit cube, moved and scaled in the node's own frame.
  const T = mat4.translate, S = mat4.scale;
  base.data.visual = mul(T(0, ARM.baseHeight / 2, 0), S(0.4, ARM.baseHeight, 0.4));
  arm1.data.visual = mul(T(0, ARM.len1 / 2, 0), S(0.1, ARM.len1, 0.1));
  arm2.data.visual = mul(T(0, ARM.len2 / 2, 0), S(0.08, ARM.len2, 0.08));
  hand.data.visual = S(0.2, 0.14, 0.2);
  satellite.data.visual = S(0.1, 0.1, 0.1);

  // Linear RGB.
  base.data.color = [0.3, 0.3, 0.34];
  arm1.data.color = [0.04, 0.5, 0.55];
  arm2.data.color = [0.5, 0.12, 0.6];
  hand.data.color = [0.9, 0.78, 0.15];
  satellite.data.color = [0.95, 0.95, 0.95];

  const arm = { root, base, arm1, arm2, hand, satellite };
  poseArm(arm, { a1: 0, a2: 0, a3: 0, spin: 0 });
  return arm;
}

/**
 * Set every node's LOCAL matrix from the joint angles (radians), then
 * recompute all world matrices.
 *
 *   base       T(basePos)
 *   arm1       T(0, baseHeight, 0) · Rz(a1)
 *   arm2       T(0, len1, 0)       · Rz(a2)
 *   hand       T(0, len2, 0)       · Rz(a3)
 *   satellite  Ry(spin) · T(orbit, 0, 0)
 */
export function poseArm(arm, { a1, a2, a3, spin }) {
  const f = (x) => x.toFixed(2);
  const [bx, by, bz] = ARM.basePos;

  arm.base.local = mat4.translate(bx, by, bz);
  arm.arm1.local = mul(mat4.translate(0, ARM.baseHeight, 0), mat4.rotateZ(a1));
  arm.arm2.local = mul(mat4.translate(0, ARM.len1, 0), mat4.rotateZ(a2));
  arm.hand.local = mul(mat4.translate(0, ARM.len2, 0), mat4.rotateZ(a3));
  arm.satellite.local = mul(mat4.rotateY(spin), mat4.translate(ARM.orbit, 0, 0));

  // Short text for the on-screen tree (and the report diagram).
  arm.base.data.desc = `T(${f(bx)}, ${f(by)}, ${f(bz)})`;
  arm.arm1.data.desc = `T(0, ${f(ARM.baseHeight)}, 0) · Rz(${f(a1)})`;
  arm.arm2.data.desc = `T(0, ${f(ARM.len1)}, 0) · Rz(${f(a2)})`;
  arm.hand.data.desc = `T(0, ${f(ARM.len2)}, 0) · Rz(${f(a3)})`;
  arm.satellite.data.desc = `Ry(${f(spin)}) · T(${f(ARM.orbit)}, 0, 0)`;

  arm.root.updateWorld();
}

/** The tree as indented text, one node per line, with its local transform. */
export function treeText(arm) {
  const lines = [];
  arm.root.traverse((node, depth) => {
    const prefix = depth === 0 ? '' : `${'   '.repeat(depth - 1)}└─ `;
    lines.push(prefix + node.name + (node.data.desc ? `   ${node.data.desc}` : ''));
  });
  return lines.join('\n');
}
