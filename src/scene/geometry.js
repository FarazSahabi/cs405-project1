/**
 * Ready-made vertex data, so you do not have to type it in. Provided.
 * Every array is interleaved as  [x, y, z,  nx, ny, nz]  per vertex
 * (stride 24 bytes), for topology 'triangle-list' unless stated.
 */

/** Unit cube centred at the origin (side 1), 36 vertices with face normals. */
export function cube() {
  const faces = [
    // normal      u axis      v axis
    [[ 1, 0, 0], [0, 0, -1], [0, 1, 0]],
    [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
    [[0, 1, 0], [1, 0, 0], [0, 0, -1]],
    [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
    [[0, 0, 1], [1, 0, 0], [0, 1, 0]],
    [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
  ];
  const out = [];
  for (const [n, u, v] of faces) {
    const corner = (su, sv) => [0, 1, 2].map((i) => 0.5 * n[i] + 0.5 * su * u[i] + 0.5 * sv * v[i]);
    const quad = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, -1), corner(1, 1), corner(-1, 1)];
    for (const p of quad) out.push(...p, ...n);
  }
  return new Float32Array(out);
}

/**
 * Coordinate axes for the debug view: three lines of length `len`
 * (topology 'line-list'), as [x, y, z, r, g, b] — x red, y green, z blue.
 */
export function axes(len = 1) {
  return new Float32Array([
    0, 0, 0, 1, 0, 0, len, 0, 0, 1, 0, 0,
    0, 0, 0, 0, 1, 0, 0, len, 0, 0, 1, 0,
    0, 0, 0, 0, 0, 1, 0, 0, len, 0, 0, 1,
  ]);
}

/**
 * Unit sphere (radius 0.5) centred at the origin, as a triangle list with
 * smooth normals. `rings` bands from pole to pole, `segments` around the y axis.
 */
export function sphere(rings = 14, segments = 24) {
  const point = (i, j) => {
    const theta = (Math.PI * i) / rings;       // 0 at +y, π at −y
    const phi = (2 * Math.PI * j) / segments;
    return [Math.sin(theta) * Math.cos(phi), Math.cos(theta), Math.sin(theta) * Math.sin(phi)];
  };
  const out = [];
  const push = (p) => out.push(0.5 * p[0], 0.5 * p[1], 0.5 * p[2], p[0], p[1], p[2]); // position, normal
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < segments; j++) {
      const a = point(i, j), b = point(i + 1, j), c = point(i + 1, j + 1), d = point(i, j + 1);
      for (const p of [a, c, b, a, d, c]) push(p); // counter-clockwise seen from outside
    }
  }
  return new Float32Array(out);
}

/**
 * Unit cylinder (radius 0.5, height 1) centred at the origin, axis along y,
 * with flat caps, as a triangle list with side and cap normals.
 */
export function cylinder(segments = 28) {
  const out = [];
  const push = (p, n) => out.push(p[0], p[1], p[2], n[0], n[1], n[2]);
  const ring = (j, y) => [0.5 * Math.cos((2 * Math.PI * j) / segments), y, 0.5 * Math.sin((2 * Math.PI * j) / segments)];
  const side = (j) => [Math.cos((2 * Math.PI * j) / segments), 0, Math.sin((2 * Math.PI * j) / segments)];
  for (let j = 0; j < segments; j++) {
    const t0 = ring(j, 0.5), t1 = ring(j + 1, 0.5), b0 = ring(j, -0.5), b1 = ring(j + 1, -0.5);
    // side: counter-clockwise seen from outside
    for (const [p, k] of [[t0, j], [b1, j + 1], [b0, j], [t0, j], [t1, j + 1], [b1, j + 1]]) push(p, side(k));
    // caps
    for (const p of [[0, 0.5, 0], t1, t0]) push(p, [0, 1, 0]);
    for (const p of [[0, -0.5, 0], b0, b1]) push(p, [0, -1, 0]);
  }
  return new Float32Array(out);
}
