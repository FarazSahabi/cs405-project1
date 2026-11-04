/**
 * MeshRenderer — draws lit triangle meshes (the cubes of Parts A and B).
 *
 * Same structure as render/painting.js:
 *   vertex buffer → uniform buffer → bind group → pipeline → draw().
 *
 * One MeshRenderer owns one mesh (shared vertex buffer + pipeline). Every
 * object that uses the mesh gets its OWN uniform buffer and bind group from
 * createInstance(): queue.writeBuffer() calls all run before the frame's
 * commands, so objects sharing a single uniform buffer would all draw with the
 * last value written.
 *
 * Vertex layout: [x, y, z, nx, ny, nz] (see scene/geometry.js).
 */
import meshWGSL from './shaders/mesh.wgsl?raw';
import { createShader, fragmentConstants } from './shader.js';
import { DEPTH_FORMAT } from './renderer.js';

const FLOATS_PER_VERTEX = 6;
const UNIFORM_FLOATS = 16 + 16 + 4; // mvp, model, colour

export class MeshRenderer {
  /**
   * @param gpu         result of initWebGPU()
   * @param vertexData  Float32Array of interleaved position + normal
   */
  constructor(gpu, vertexData) {
    const { device } = gpu;
    this.gpu = gpu;
    this.vertexCount = vertexData.length / FLOATS_PER_VERTEX;
    this.scratch = new Float32Array(UNIFORM_FLOATS);

    this.vertices = device.createBuffer({
      label: 'mesh vertices',
      size: vertexData.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(this.vertices, 0, vertexData);

    const module = createShader(device, meshWGSL, 'mesh');
    this.pipeline = device.createRenderPipeline({
      label: 'mesh',
      layout: 'auto',
      vertex: {
        module, entryPoint: 'vs',
        buffers: [{
          arrayStride: FLOATS_PER_VERTEX * 4,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' },     // position
            { shaderLocation: 1, offset: 3 * 4, format: 'float32x3' }, // normal
          ],
        }],
      },
      fragment: {
        module, entryPoint: 'fs',
        targets: [{ format: gpu.viewFormat }],
        constants: fragmentConstants(gpu),
      },
      primitive: { topology: 'triangle-list', cullMode: 'back' },
      depthStencil: { format: DEPTH_FORMAT, depthWriteEnabled: true, depthCompare: 'less' },
    });
  }

  /**
   * One drawable object: its own uniform buffer + bind group.
   * @param {number[]} color  linear RGB, e.g. [0.9, 0.3, 0.05]
   */
  createInstance(color) {
    const { device } = this.gpu;
    const uniforms = device.createBuffer({
      label: 'mesh instance uniforms',
      size: UNIFORM_FLOATS * 4, // 144 bytes
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const bindGroup = device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: uniforms } }],
    });
    return { uniforms, bindGroup, color };
  }

  /**
   * Draw one instance.
   * @param {GPURenderPassEncoder} pass
   * @param instance  from createInstance()
   * @param {Float32Array} mvp    P · V · M
   * @param {Float32Array} model  M (used to rotate the normals for lighting)
   * @param {import('./renderer.js').Renderer} renderer  for the vertex counter
   */
  draw(pass, instance, mvp, model, renderer) {
    const s = this.scratch;
    s.set(mvp, 0);
    s.set(model, 16);
    s.set(instance.color, 32);
    s[35] = 1;
    this.gpu.device.queue.writeBuffer(instance.uniforms, 0, s);

    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, instance.bindGroup);
    pass.setVertexBuffer(0, this.vertices);
    pass.draw(this.vertexCount);
    renderer.countDraw(this.vertexCount);
  }
}
