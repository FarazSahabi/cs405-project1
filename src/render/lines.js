/**
 * LineRenderer — draws coloured line lists (the debug axes of Part B).
 *
 * Same structure as render/mesh.js: one shared vertex buffer + pipeline,
 * and one uniform buffer per drawn instance (see the writeBuffer gotcha in
 * the README).
 *
 * Vertex layout: [x, y, z, r, g, b] — see axes() in scene/geometry.js.
 * The lines ignore the depth buffer (depthCompare 'always') so the axes stay
 * visible even when they sit inside a box.
 */
import linesWGSL from './shaders/lines.wgsl?raw';
import { createShader, fragmentConstants } from './shader.js';
import { DEPTH_FORMAT } from './renderer.js';

const FLOATS_PER_VERTEX = 6;

export class LineRenderer {
  /**
   * @param gpu         result of initWebGPU()
   * @param vertexData  Float32Array of interleaved position + colour
   * @param options     { topology: 'line-list' (default) | 'triangle-list' } — the
   *                    triangle list is for thick lines drawn as flat strips
   */
  constructor(gpu, vertexData, { topology = 'line-list' } = {}) {
    const { device } = gpu;
    this.gpu = gpu;
    this.vertexCount = vertexData.length / FLOATS_PER_VERTEX;
    this.capacityBytes = vertexData.byteLength;

    this.vertices = device.createBuffer({
      label: 'line vertices',
      size: vertexData.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(this.vertices, 0, vertexData);

    const module = createShader(device, linesWGSL, 'lines');
    this.pipeline = device.createRenderPipeline({
      label: 'lines',
      layout: 'auto',
      vertex: {
        module, entryPoint: 'vs',
        buffers: [{
          arrayStride: FLOATS_PER_VERTEX * 4,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' },     // position
            { shaderLocation: 1, offset: 3 * 4, format: 'float32x3' }, // colour
          ],
        }],
      },
      fragment: {
        module, entryPoint: 'fs',
        targets: [{ format: gpu.viewFormat }],
        constants: fragmentConstants(gpu),
      },
      primitive: { topology },
      depthStencil: { format: DEPTH_FORMAT, depthWriteEnabled: false, depthCompare: 'always' },
    });
  }

  /**
   * Replace the vertices (for lines that change every frame, e.g. a camera
   * frustum). The new data may be shorter than the data given to the
   * constructor, but not longer.
   */
  setVertices(vertexData) {
    if (vertexData.byteLength > this.capacityBytes) {
      throw new Error(`LineRenderer.setVertices: ${vertexData.byteLength} bytes > capacity ${this.capacityBytes}`);
    }
    this.gpu.device.queue.writeBuffer(this.vertices, 0, vertexData);
    this.vertexCount = vertexData.length / FLOATS_PER_VERTEX;
  }

  /** One drawable instance: its own uniform buffer + bind group. */
  createInstance() {
    const { device } = this.gpu;
    const uniforms = device.createBuffer({
      label: 'line instance uniforms',
      size: 64, // one mat4x4f
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const bindGroup = device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: uniforms } }],
    });
    return { uniforms, bindGroup };
  }

  /**
   * @param {GPURenderPassEncoder} pass
   * @param instance  from createInstance()
   * @param {Float32Array} mvp  P · V · M
   * @param {import('./renderer.js').Renderer} renderer  for the vertex counter
   */
  draw(pass, instance, mvp, renderer) {
    this.gpu.device.queue.writeBuffer(instance.uniforms, 0, mvp);
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, instance.bindGroup);
    pass.setVertexBuffer(0, this.vertices);
    pass.draw(this.vertexCount);
    renderer.countDraw(this.vertexCount);
  }
}
