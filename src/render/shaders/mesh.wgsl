// Lit, single-colour triangle meshes (the cubes of Parts A and B).
// All colour maths is LINEAR; the fragment returns toOutput(...).

struct Uniforms {
  mvp: mat4x4f,    // P · V · M  — object space → clip space
  model: mat4x4f,  // M          — object space → world space (used for the normal)
  color: vec4f,    // linear RGB, alpha unused
};

@group(0) @binding(0) var<uniform> u: Uniforms;

struct VSOut {
  @builtin(position) position: vec4f,
  @location(0) normal: vec3f,   // world-space normal
};

@vertex
fn vs(@location(0) pos: vec3f, @location(1) nrm: vec3f) -> VSOut {
  var o: VSOut;
  o.position = u.mvp * vec4f(pos, 1.0);
  // w = 0: a direction, so the translation part of M is ignored.
  // (For non-uniform scale the exact fix is the inverse transpose of M;
  //  this is good enough for the shading of a few boxes.)
  o.normal = (u.model * vec4f(nrm, 0.0)).xyz;
  return o;
}

@fragment
fn fs(i: VSOut) -> @location(0) vec4f {
  let n = normalize(i.normal);
  let light = normalize(vec3f(0.4, 0.7, 0.6));       // fixed light, in world space
  let shade = 0.25 + 0.75 * max(dot(n, light), 0.0); // ambient + diffuse
  return toOutput(vec4f(u.color.rgb * shade, 1.0));
}
