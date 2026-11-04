// Extra checks for the Part B arm (scene/arm.js). Not part of the starter.
// Each expected position is worked out by hand in the comments, so these
// numbers can also be used for the "verified by hand" part of the report.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createArm, poseArm, ARM } from '../src/scene/arm.js';
import { closeArr } from './helpers.js';

const origin = (node) => [node.world[12], node.world[13], node.world[14]];

describe('Part B · arm', () => {
  test('tree has at least 5 nodes and at least 3 levels', () => {
    const arm = createArm();
    let count = 0, maxDepth = 0;
    arm.root.traverse((n, d) => { count++; maxDepth = Math.max(maxDepth, d); });
    assert.ok(count >= 5, `nodes: ${count}`);
    assert.ok(maxDepth + 1 >= 3, `levels: ${maxDepth + 1}`);
  });

  test('all joints at 0: positions simply add up', () => {
    const arm = createArm();
    poseArm(arm, { a1: 0, a2: 0, a3: 0, spin: 0 });
    // base (1.00, -0.85, 0.40); arm1 = base + (0, 0.12, 0); arm2 = arm1 + (0, 0.70, 0);
    // hand = arm2 + (0, 0.60, 0); satellite = hand + (0.28, 0, 0)
    closeArr(origin(arm.arm1), [1.0, -0.73, 0.4]);
    closeArr(origin(arm.arm2), [1.0, -0.03, 0.4]);
    closeArr(origin(arm.hand), [1.0, 0.57, 0.4]);
    closeArr(origin(arm.satellite), [1.28, 0.57, 0.4]);
  });

  test('joint 1 = 90°: the whole arm above it swings from +y to −x', () => {
    const arm = createArm();
    poseArm(arm, { a1: Math.PI / 2, a2: 0, a3: 0, spin: 0 });
    // Rz(90°) takes (0, 0.7, 0) to (−0.7, 0, 0) and (0.28, 0, 0) to (0, 0.28, 0):
    closeArr(origin(arm.arm2), [0.3, -0.73, 0.4]);        // arm1 + (−0.70, 0, 0)
    closeArr(origin(arm.hand), [-0.3, -0.73, 0.4]);       // arm2 + (−0.60, 0, 0)
    closeArr(origin(arm.satellite), [-0.3, -0.45, 0.4]);  // hand + (0, 0.28, 0)
  });

  test('moving a parent moves the whole subtree, the base does not move', () => {
    const arm = createArm();
    poseArm(arm, { a1: 0, a2: 0, a3: 0, spin: 0 });
    const before = origin(arm.satellite);
    poseArm(arm, { a1: 0.5, a2: 0, a3: 0, spin: 0 });
    assert.notDeepEqual(origin(arm.satellite).map((x) => +x.toFixed(4)), before.map((x) => +x.toFixed(4)));
    closeArr(origin(arm.base), ARM.basePos);
  });
});
