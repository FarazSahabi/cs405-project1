/**
 * Entry point: wires GPU, painting, camera, scene and UI together and runs
 * the render loop. You will edit this file a little (camera controls, views);
 * most of your work goes into src/math/ and src/scene/.
 *
 *   p_clip = P · V · M · p_object
 */
import './ui/style.css';
import { initWebGPU, showFatal } from './render/gpu.js';
import { Renderer } from './render/renderer.js';
import { Painting } from './render/painting.js';
import { createCamera, createInspectionCamera, createOrbit, applyOrbit, viewProjection } from './scene/camera.js';
import { frustumVertices } from './scene/frustum.js';
import { pickPoint } from './scene/curveEditor.js';
import { createScene } from './scene/scene.js';
import { createPanel } from './ui/panel.js';
import { Stats } from './ui/stats.js';
import { attachPointer } from './ui/input.js';
import { PAINTINGS, DEFAULT_PAINTING, paintingURL } from './config.js';
import * as mat4 from './math/mat4.js';

async function main() {
  const canvas = document.getElementById('gfx');
  const gpu = await initWebGPU(canvas);
  const renderer = new Renderer(gpu);
  const painting = new Painting(gpu);

  // One painting for the whole project (chosen in src/config.js).
  const current = PAINTINGS.find((p) => p.id === DEFAULT_PAINTING);
  await painting.load(paintingURL(current));

  /* ---------------- UI ---------------- */
  const panelRoot = document.getElementById('panel');
  const panel = createPanel(panelRoot);
  const title = document.createElement('h1');
  title.textContent = 'CS405 · Project 1';
  panelRoot.appendChild(title);
  const stats = new Stats(panelRoot);

  // Create the folders in the order they appear on screen (A, B, C, D); the code
  // below and scene.js fill them in. panel.folder() returns the same folder for the same title.
  for (const title of ['Painting', 'Scene', 'Part A · Transformations', 'Part B · Scene graph',
    'Part C · Camera and projection', 'Part D · Curves', 'View']) panel.folder(title);

  const pf = panel.folder('Painting');
  pf.note(`${current.artist} — ${current.title}`);

  const camera = createCamera();
  const inspection = createInspectionCamera(); // fixed: never moves
  const orbit = createOrbit(camera);
  const view = { mode: 'main' };               // 'main' | 'inspection'
  const ui = { fov: 45, near: camera.near, far: camera.far };

  const cf = panel.folder('Part C · Camera and projection');
  const camStatus = cf.text('');
  const viewSelect = cf.select('view',
    [{ value: 'main', label: 'main camera (orbit with the mouse)' },
     { value: 'inspection', label: 'inspection camera (shows the frustum)' }],
    view.mode, (v) => (view.mode = v));
  const projSelect = cf.select('projection', ['perspective', 'orthographic'], camera.projection,
    (v) => (camera.projection = v));
  const fovSlider = cf.slider('fov (degrees)', ui, 'fov', 15, 120, 1,
    (v) => (camera.fovY = (v * Math.PI) / 180));
  let nearSlider, farSlider;
  nearSlider = cf.slider('near', ui, 'near', 0.05, 5, 0.05, (v) => {
    if (v >= camera.far - 0.1) { ui.near = camera.far - 0.1; nearSlider.update(); }
    camera.near = ui.near;
  });
  farSlider = cf.slider('far', ui, 'far', 1, 30, 0.1, (v) => {
    if (v <= camera.near + 0.1) { ui.far = camera.near + 0.1; farSlider.update(); }
    camera.far = ui.far;
  });
  const camReadout = cf.text('');
  cf.note('Drag = orbit (drag a curve point instead to move it), wheel = zoom (in orthographic mode zoom changes the visible height).');

  const scene = createScene({ gpu, renderer, painting, panel, paintingId: () => current.id });

  const vf = panel.folder('View');
  vf.button('reset', () => {
    Object.assign(camera, createCamera());
    Object.assign(orbit, createOrbit(camera));
    Object.assign(ui, { fov: 45, near: camera.near, far: camera.far });
    view.mode = 'main';
    viewSelect.set('main'); projSelect.set(camera.projection);
    fovSlider.update(); nearSlider.update(); farSlider.update();
    scene.reset();
  });
  const info = gpu.adapter.info ?? {};
  const gpuName = [info.vendor, info.architecture, info.description].filter(Boolean).join(' · ');
  vf.note(`GPU: ${gpuName || 'unknown'}`);
  vf.note(gpu.encodeSRGB ? 'sRGB: encoded in shader (fallback)' : 'sRGB: canvas -srgb view');

  /* -------------- input --------------- */
  // A press on a control point of the curve drags that point (in the plane of
  // the painting); a press anywhere else orbits the camera.
  let lastVP = null;   // P · V of the camera drawn in the last frame
  let editing = false; // true while a control point is being dragged
  const canvasSize = () => ({ w: canvas.clientWidth, h: canvas.clientHeight });
  const canMove = () => view.mode === 'main' && scene.state.showCurve && lastVP;
  const aspectNow = () => canvas.width / canvas.height;

  attachPointer(canvas, {
    down(e) {
      if (e.button !== 0 || !canMove()) return;
      const id = scene.curve.pick(e.ndc, lastVP, canvasSize());
      if (id) { scene.curve.active = id; editing = true; }
    },
    move(e) {
      if (!canMove()) { scene.curve.hover = null; canvas.style.cursor = ''; return; }
      scene.curve.hover = scene.curve.pick(e.ndc, lastVP, canvasSize());
      canvas.style.cursor = scene.curve.hover ? 'grab' : '';
    },
    drag(e) {
      if (editing) {
        const p = pickPoint(camera, aspectNow(), e.ndc);
        if (p) scene.curve.dragTo(p);
        return;
      }
      if (view.mode !== 'main') return;
      orbit.yaw -= e.dx * 0.006;
      orbit.pitch = Math.max(-1.5, Math.min(1.5, orbit.pitch + e.dy * 0.006));
      applyOrbit(camera, orbit);
    },
    up() {
      editing = false;
      scene.curve.active = null;
    },
    wheel(e) {
      const k = Math.exp(e.delta * 0.001);
      if (camera.projection === 'orthographic') {
        camera.orthoHeight = Math.max(0.3, Math.min(10, camera.orthoHeight * k));
      } else {
        orbit.dist = Math.max(0.6, Math.min(15, orbit.dist * k));
        applyOrbit(camera, orbit);
      }
    },
  });

  /* ------------ render loop ----------- */
  let last = performance.now();
  function frame(now) {
    stats.begin(now);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;

    scene.update(dt, now / 1000);

    const aspect = canvas.width / canvas.height;
    const inspecting = view.mode === 'inspection';
    const activeCam = inspecting ? inspection : camera;
    const vp = viewProjection(activeCam, aspect, painting.aspect);
    lastVP = vp.fallback ? null : (inspecting ? null : vp.matrix);
    scene.setFrustum(inspecting ? frustumVertices(camera, aspect) : null);

    camStatus.set(vp.fallback
      ? `PLACEHOLDER view (no camera yet)\n${vp.missing}`
      : `viewing through: ${inspecting ? 'inspection camera' : 'main camera'} (${activeCam.projection})`);
    camStatus.el.classList.toggle('warn', vp.fallback);
    const f2 = (v) => v.map((x) => x.toFixed(2)).join(', ');
    camReadout.set(
      `main camera\n` +
      `eye    ${f2(camera.eye)}\n` +
      `target ${f2(camera.target)}\n` +
      `${camera.projection}  aspect ${aspect.toFixed(2)}\n` +
      (camera.projection === 'orthographic'
        ? `visible height ${camera.orthoHeight.toFixed(2)}\n`
        : `fovY ${(camera.fovY * 180 / Math.PI).toFixed(1)}°\n`) +
      `near ${camera.near.toFixed(2)}  far ${camera.far.toFixed(2)}`
    );

    const paintingMVP = vp.fallback ? vp.matrix : mat4.multiply(vp.matrix, painting.model);
    renderer.render((pass) => {
      painting.draw(pass, paintingMVP, renderer);
      scene.draw(pass, vp.matrix);
    });

    stats.end(renderer.stats);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main().catch((e) => {
  console.error(e);
  showFatal(e.message ?? String(e));
});
