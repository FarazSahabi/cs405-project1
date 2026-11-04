// Coloured line segments (the debug axes of Part B). Colour comes per vertex.
// Linear RGB in, toOutput(...) out.

struct Uniforms {
  mvp: mat4x4f,   // P · V · M
};

@group(0) @binding(0) var<uniform> u: Uniforms;

struct VSOut {
  @builtin(position) position: vec4f,
  @location(0) color: vec3f,
};

@vertex
fn vs(@location(0) pos: vec3f, @location(1) col: vec3f) -> VSOut {
  var o: VSOut;
  o.position = u.mvp * vec4f(pos, 1.0);
  o.color = col;
  return o;
}

@fragment
fn fs(i: VSOut) -> @location(0) vec4f {
  return toOutput(vec4f(i.color, 1.0));
}
