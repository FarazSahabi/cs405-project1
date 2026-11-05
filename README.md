# CS405 Project 1 — Transformations, Projection & Curves from Paintings

One WebGPU application (no libraries: the matrix, scene-graph and curve code is
written from scratch) that turns a painting into a small 3D scene.

**Painting:** Feyhaman Duran — *Kabataş Rıhtımı* (1936), Sakıp Sabancı Museum collection.

The whole pipeline is one chain:

```
p_clip = P · V · M · p_object
```

## 1. Run it

Requirements: **Node.js 20.19 or newer** and a browser with WebGPU (current
Chrome or Edge, Safari 26+, or Firefox 141+ on Windows).

```bash
npm install
npm run dev        # opens http://localhost:5173
npm test           # unit tests (maths, scene graph, camera, curves, export)
```

If the browser has no WebGPU the page says so. Serve from `localhost`; opening
`index.html` as a file does not work.

## 2. What you see

The painting hangs in the scene as a textured quad. In front of it:

- **Part A:** three fixed boxes and an orange box driven by sliders.
  A grey box shows the same transformation applied in the other order (five boxes in all).
- **Part B:** a jointed arm (a scene graph) with a small box orbiting its hand.
- **Part D:** a pink curve traced over the boat, its control points, and a white
  ball that travels along it.

## 3. Mouse

| Action | Effect |
|---|---|
| Drag on empty canvas | orbit the camera around the target |
| Mouse wheel | zoom (perspective: distance; orthographic: visible height) |
| Drag a yellow circle or an orange cross | move that control point in the plane of the painting |

Orbiting only works in the main-camera view. The cursor becomes a hand when a
control point can be grabbed.

## 4. Controls (panel on the right)

**Camera**
- `view`: *main camera* (orbit with the mouse) or *inspection camera*, a fixed
  second camera that looks at the scene from outside and draws the main camera's
  frustum (yellow = near plane, red = far plane, cyan = viewing direction).
- `projection`: perspective or orthographic, switchable at run time.
- `fov`, `near`, `far`: the main camera's parameters. The readout below shows eye,
  target, projection, aspect, fov (or visible height) and near/far.

**Scene**
- `show Part A boxes`, `show Part B arm`: show or hide each part.
- `debug: local axes of each node`: draws every scene-graph node's local axes
  (x red, y green, z blue).

**Part A · Transformations**
- `M = T·R·S` switch: chooses the order used for the orange box (off: `S·R·T`).
- `also show the other order (grey)`: draws the result of the other order.
- `translate x/y/z`, `rotate about y/z`, `scale`: the orange box's parameters.
- Both matrices are printed below the sliders (the one in use is marked).

**Part B · Scene graph**
- `animate`: joints driven by time; off: use the sliders.
- `joint 1/2/3`, `satellite orbit`: joint angles.
- `base x/y/z`: moves the arm's base; the whole subtree follows.
- The tree with each node's local transform and the world matrix of the
  satellite (the leaf) are printed below.

**Part D · Curves**
- `show curve`: hides or shows the curve, control points and the ball.
- `curve type`: a cubic Bézier with 3 segments and C¹ continuity (traces the
  boat's hull), or a Catmull–Rom spline through its points (traces the jetty).
- `control polygon`: the lines between control points.
- `de Casteljau construction`, `segment`, `parameter t`: draws the construction
  for the chosen Bézier segment (green = first level, blue = second level,
  red = the point on the curve).
- `animate the object`, `speed`, `position u`: the white ball moves along the
  curve, oriented by the tangent (its heading is in the readout).
- `export curve as JSON`: downloads the curve with control points in normalised
  painting coordinates (u, v ∈ [0, 1], origin top-left).
- `reset curve`: back to the starting trace.
- The readout shows C(t) of the construction (in pixels and normalised), the
  ball's position and tangent, and the formulas.

Dark crosses are computed, not free: the first handle after a joint is
`2·joint − previous handle`, which is what keeps the joint C¹. Dragging it moves
the previous handle for you.

**View**
- `reset`: restores the camera, the sliders, the curve and the view.
- Also shows the GPU and the sRGB mode.

**Frame statistics** (top of the panel): frame time in ms and fps, CPU time per
frame, number of draw calls and vertices submitted per frame.

## 5. Code layout

| Path | Contents |
|---|---|
| `src/math/vec3.js`, `mat4.js` | vectors and 4×4 matrices (identity, multiply, translate, rotate, scale, transpose, rigid inverse, `lookAt`, `perspective`, `orthographic`) |
| `src/math/curves.js` | Bernstein basis, cubic Bézier and tangent, de Casteljau, C¹ rule, piecewise evaluation, Catmull–Rom, B-spline |
| `src/scene/node.js` | scene-graph node: local matrix, parent, children, world matrix |
| `src/scene/arm.js` | the Part B tree and its pose |
| `src/scene/camera.js`, `frustum.js` | cameras, orbit controls, frustum lines |
| `src/scene/curveEditor.js`, `curveExport.js` | the editable curve, mouse picking on the painting plane, JSON export |
| `src/scene/scene.js` | puts Parts A–D together and builds their panels |
| `src/render/*` | WebGPU: device and canvas, painting quad, mesh and line renderers, shaders |
| `src/ui/*` | panel, frame statistics, pointer events |
| `tests/` | `npm test` |

## 6. Conventions

- Matrices are `Float32Array(16)`, **column-major**: element (row r, col c) is at
  `c*4 + r`; translation is at indices 12, 13, 14. This is what a WGSL `mat4x4f`
  expects.
- Column vectors: `p' = M · p`. `multiply(A, B)` is `A·B`, so `B` acts first.
- Every transform in the project is composed as **M = T · R · S**: scale first,
  then rotate, then translate.
- Right-handed world; angles in radians; the camera looks down −z.
- Clip space is WebGPU's: after dividing by w, x, y ∈ [−1, 1] and z ∈ [0, 1].
- The painting quad is centred at the origin in the plane z = 0, y ∈ [−1, 1],
  x ∈ [−a, a], a = image width / height. "In front of the painting" means z > 0.
- Curve control points are stored as world [x, y] in that plane and exported as
  u = (x + a) / (2a), v = (1 − y) / 2.
- Colours are computed in linear RGB; shaders return `toOutput(colour)`.

## 7. Notes on the rendering

- Every drawn object has its own uniform buffer, because `queue.writeBuffer()`
  calls all run before the frame's commands.
- Curves, control points and markers are drawn as thin triangle strips (a GPU line
  is always one pixel wide), which is why the vertex counter is a few thousand.
- The debug axes and the curve overlay ignore the depth buffer so they stay
  visible over the painting.