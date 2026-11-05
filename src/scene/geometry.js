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
