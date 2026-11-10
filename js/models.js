// Sushi models, built in code at real size: 1 unit = 1 cm, y up, resting on y = 0.
//
//   rawModel(id)        an ingredient as it waits on its dish (a block of salmon, a mound of rice…)
//   assembly(recipe)    the piece being built in the middle of the board, one stage at a time
//   finishedModel(r)    the served plate: a pair of nigiri or gunkan, or a roll cut into 6
//   boardModel()        the hinoki geta board the game is played on
//   dishModel()         a small glazed dish that holds one ingredient
//
// Realism comes from three things: true proportions, physically based materials
// (wet fish has a clear-coat, rice is matte with a soft sheen) and real grains:
// every rice surface carries a few hundred instanced grains over a grain texture.

import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import * as T from './textures.js';

const { rr, rand } = T;
const ENV = 0.6;
const std = (o) => new THREE.MeshStandardMaterial({ envMapIntensity: ENV, ...o });
const phys = (o) => new THREE.MeshPhysicalMaterial({ envMapIntensity: ENV, ...o });

// Shared materials, made on first use.
const M = {};
const mat = (k) => M[k] ||= ({
  rice:    () => phys({ map: T.riceMap(), bumpMap: T.riceBump(), bumpScale: 1.2, roughness: 0.62, sheen: 0.35, sheenColor: new THREE.Color('#fffaf0'), sheenRoughness: 0.6 }),
  grain:   () => phys({ color: '#f5efe1', roughness: 0.42, clearcoat: 0.25, clearcoatRoughness: 0.5, sheen: 0.4, sheenColor: new THREE.Color('#ffffff') }),
  nori:    () => std({ map: T.noriMap(), roughnessMap: T.noriRough(), roughness: 0.75, metalness: 0.05, side: THREE.DoubleSide }),
  wasabi:  () => std({ color: '#86a83c', bumpMap: T.pasteBump(), bumpScale: 2.5, roughness: 0.86 }),
  salmon:  () => phys({ map: T.salmonMap(), roughness: 0.36, clearcoat: 0.7, clearcoatRoughness: 0.22, sheen: 0.25, sheenColor: new THREE.Color('#ffb48a') }),
  tuna:    () => phys({ map: T.tunaMap(), roughness: 0.32, clearcoat: 0.85, clearcoatRoughness: 0.18 }),
  ebi:     () => phys({ map: T.ebiMap(), roughness: 0.42, clearcoat: 0.55, clearcoatRoughness: 0.3, side: THREE.DoubleSide }),
  tamago:  () => std({ map: T.tamagoAtlas(), roughness: 0.62 }),
  ikura:   () => phys({ color: '#ff520a', roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.04, emissive: '#7a1800', emissiveIntensity: 0.45, sheen: 0.5, sheenColor: new THREE.Color('#ffc080') }),
  kani:    () => std({ map: T.kaniMap(), roughness: 0.55 }),
  avocado: () => phys({ vertexColors: true, roughness: 0.38, clearcoat: 0.35, clearcoatRoughness: 0.4 }),
  kyuri:   () => phys({ vertexColors: true, roughness: 0.35, clearcoat: 0.5, clearcoatRoughness: 0.3 }),
  seed:    () => phys({ color: '#ffffff', roughness: 0.45, clearcoat: 0.3 }),
  gari:    () => phys({ color: '#f0a094', roughness: 0.25, clearcoat: 0.8, clearcoatRoughness: 0.2, transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
  wood:    () => std({ map: T.woodMap(), bumpMap: T.woodBump(), bumpScale: 0.6, roughness: 0.72 }),
  woodEnd: () => std({ color: '#c9a46c', roughness: 0.8 }),
  dish:    () => phys({ map: T.dishMap(), roughness: 0.22, clearcoat: 0.6, clearcoatRoughness: 0.2 }),
  bamboo:  () => std({ map: T.bambooMap(), roughness: 0.65 }),
  string:  () => std({ color: '#5b4630', roughness: 0.9 }),
})[k]();

// ------------------------------------------------------------------ geometry helpers
// UVs from the object's own bounding box, picking the plane each face looks along.
// `atlas` splits the texture: sides use the left half, tops the right half.
function boxUV(geo, { atlas = false, tile = 0 } = {}){
  geo.computeBoundingBox();
  const b = geo.boundingBox, s = new THREE.Vector3(); b.getSize(s);
  const p = geo.attributes.position, n = geo.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++){
    const x = (p.getX(i) - b.min.x), y = (p.getY(i) - b.min.y), z = (p.getZ(i) - b.min.z);
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v, top = false;
    if (ay >= ax && ay >= az){ u = x; v = z; top = true; } else if (ax >= az){ u = z; v = y; } else { u = x; v = y; }
    if (tile){ u /= tile; v /= tile; }
    else {
      const su = top ? s.x : (ax >= az ? s.z : s.x), sv = top ? s.z : s.y;
      u /= Math.max(su, 1e-6); v /= Math.max(sv, 1e-6);
      if (!top) v = v * (s.y / Math.max(s.x, s.z)) * 2; // keep side layers at their true thickness
    }
    if (atlas){ u = (top ? 0.5 : 0) + 0.5 * THREE.MathUtils.clamp(u, 0, 1); v = THREE.MathUtils.clamp(v, 0, 1); }
    uv[i * 2] = u; uv[i * 2 + 1] = v;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}
// A box with evenly rounded edges that stays subdivided, so it can be bent and draped.
function roundedSlab(w, h, d, r, sx = 8, sy = 3, sz = 6){
  let g = new THREE.BoxGeometry(w, h, d, sx, sy, sz);
  const p = g.attributes.position, v = new THREE.Vector3(), inner = new THREE.Vector3();
  const hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r;
  for (let i = 0; i < p.count; i++){
    v.fromBufferAttribute(p, i);
    inner.set(THREE.MathUtils.clamp(v.x, -hx, hx), THREE.MathUtils.clamp(v.y, -hy, hy), THREE.MathUtils.clamp(v.z, -hz, hz));
    v.sub(inner);
    if (v.lengthSq() > 0) v.setLength(r);
    v.add(inner);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g);
  g.computeVertexNormals();
  return g;
}
function warp(geo, fn){
  const p = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++){ v.fromBufferAttribute(p, i); fn(v); p.setXYZ(i, v.x, v.y, v.z); }
  geo.computeVertexNormals();
  return geo;
}
function vertexColors(geo, fn){
  const p = geo.attributes.position, n = geo.attributes.normal, col = new Float32Array(p.count * 3), c = new THREE.Color();
  for (let i = 0; i < p.count; i++){
    fn(c, p.getX(i), p.getY(i), p.getZ(i), n ? n.getX(i) : 0, n ? n.getY(i) : 0, n ? n.getZ(i) : 0);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}
const mesh = (geo, m) => { const o = new THREE.Mesh(geo, typeof m === 'string' ? mat(m) : m); o.castShadow = true; o.receiveShadow = true; return o; };
const group = (...kids) => { const g = new THREE.Group(); kids.forEach((k) => k && g.add(k)); return g; };

// A hand-pressed mound: a squashed sphere, a little boxy, flat underneath.
// Returns the mesh plus a sampler for points on its upper surface.
function mound(rx, ry, rz, { boxy = 0.12, cut = -0.5, wobble = 0.03 } = {}){
  const geo = new THREE.SphereGeometry(1, 48, 28);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++){
    const x = p.getX(i), z = p.getZ(i);
    let y = p.getY(i);
    const k = (1 + boxy * (1 - Math.abs(y))) * (1 + wobble * Math.sin(x * 7 + z * 5) * Math.cos(y * 6));
    if (y < cut) y = cut;
    p.setXYZ(i, x * k * rx, (y - cut) * ry, z * k * rz);
  }
  geo.computeVertexNormals();
  const height = (1 - cut) * ry;
  const sample = (pt, nrm, minY = cut + 0.08) => {
    const u = rr(0, Math.PI * 2), v = Math.acos(rr(minY, 1));
    const sx = Math.sin(v) * Math.cos(u), sy = Math.cos(v), sz = Math.sin(v) * Math.sin(u);
    const k = 1 + boxy * (1 - Math.abs(sy));
    pt.set(sx * k * rx, (sy - cut) * ry, sz * k * rz);
    nrm.set(sx / rx, sy / ry, sz / rz).normalize();
    pt.addScaledVector(nrm, -0.03);
  };
  return { mesh: mesh(geo, 'rice'), sample, height };
}

// Instanced rice grains (about 5 mm long), each placed and tilted by `place(point, normal)`.
function grains(count, place, scale = 1){
  const m = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), mat('grain'), count);
  m.castShadow = true; m.receiveShadow = true;
  const mx = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), n = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0), spin = new THREE.Quaternion();
  for (let i = 0; i < count; i++){
    place(p, n);
    q.setFromUnitVectors(up, n);
    spin.setFromAxisAngle(up, rr(0, Math.PI * 2));
    q.multiply(spin);
    s.set(rr(0.24, 0.29) * scale, rr(0.085, 0.11) * scale, rr(0.12, 0.145) * scale);
    mx.compose(p, q, s);
    m.setMatrixAt(i, mx);
  }
  return m;
}
// Sesame seeds (3 mm teardrops), a quarter of them black.
function seeds(count, place){
  const m = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), mat('seed'), count);
  m.castShadow = true;
  const mx = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), n = new THREE.Vector3(), c = new THREE.Color();
  const up = new THREE.Vector3(0, 1, 0), spin = new THREE.Quaternion();
  for (let i = 0; i < count; i++){
    place(p, n);
    q.setFromUnitVectors(up, n); spin.setFromAxisAngle(up, rr(0, Math.PI * 2)); q.multiply(spin);
    mx.compose(p, q, new THREE.Vector3(0.15, 0.06, 0.09));
    m.setMatrixAt(i, mx);
    m.setColorAt(i, rand() < 0.22 ? c.set('#2a221c') : c.setHSL(0.11, rr(0.4, 0.55), rr(0.66, 0.78)));
  }
  return m;
}
// A heap of glossy salmon eggs.
function roe(count, place){
  const m = new THREE.InstancedMesh(new THREE.SphereGeometry(0.3, 16, 12), mat('ikura'), count);
  m.castShadow = true;
  const mx = new THREE.Matrix4(), p = new THREE.Vector3();
  for (let i = 0; i < count; i++){ place(p, i); const s = rr(0.92, 1.08); mx.compose(p, new THREE.Quaternion(), new THREE.Vector3(s, s * 0.94, s)); m.setMatrixAt(i, mx); }
  return m;
}

// ------------------------------------------------------------------ shapes reused below
function fishSlab(kind, w, t, d, drape = 0){
  const g = roundedSlab(w, t, d, Math.min(t * 0.45, 0.25), 36, 3, 12);
  boxUV(g, { tile: 0 });
  if (drape) warp(g, (v) => {
    const u = v.x / (w / 2);
    v.y = v.y * (1 - 0.35 * u * u) - drape * u * u - 0.16 * v.z * v.z + 0.05 * Math.sin(u * 5);
    v.z *= 1 - 0.1 * Math.abs(u);
  });
  return mesh(g, kind);
}
// Butterflied shrimp, seen from above: a body that widens then tapers to a fanned tail.
function shrimpGeo(len, wid, thick, arch){
  const s = new THREE.Shape();
  const L = len / 2, W = wid / 2;
  s.moveTo(-L, 0);
  s.bezierCurveTo(-L, W * 0.9, -L * 0.2, W * 1.1, L * 0.55, W * 0.42);
  s.lineTo(L * 0.7, W * 0.3);
  s.bezierCurveTo(L * 0.85, W * 0.9, L, W * 0.8, L, W * 0.55);  // tail fan, top lobe
  s.lineTo(L * 0.92, 0);
  s.lineTo(L, -W * 0.55);
  s.bezierCurveTo(L, -W * 0.8, L * 0.85, -W * 0.9, L * 0.7, -W * 0.3);
  s.lineTo(L * 0.55, -W * 0.42);
  s.bezierCurveTo(-L * 0.2, -W * 1.1, -L, -W * 0.9, -L, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: true, bevelThickness: thick * 0.35, bevelSize: thick * 0.35, bevelSegments: 3, curveSegments: 18, steps: 1 });
  g.translate(0, 0, -thick / 2);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++){ uv[i * 2] = (p.getX(i) + L) / len; uv[i * 2 + 1] = (p.getZ(i) + W) / wid; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return warp(g, (v) => { const u = v.x / L; v.y += arch * (1 - u * u) - 0.12 * v.z * v.z; });
}
function avocadoSlice(){
  const s = new THREE.Shape();
  s.absarc(0, -1.6, 2.6, Math.PI * 0.2, Math.PI * 0.8, false);
  s.absarc(0, -2.5, 2.75, Math.PI * 0.77, Math.PI * 0.23, true);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.42, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.1, bevelSegments: 2, curveSegments: 24 });
  g.rotateX(-Math.PI / 2);
  g.computeVertexNormals();
  return vertexColors(g, (c, x, y, z) => {
    const d = Math.hypot(x, -z + 1.6);            // distance from the outer arc's centre
    const t = THREE.MathUtils.clamp((2.6 - d) / 0.85, 0, 1);
    c.set('#355c1d').lerp(new THREE.Color('#9fbe45'), THREE.MathUtils.smoothstep(t, 0.02, 0.16))
      .lerp(new THREE.Color('#e9e48c'), THREE.MathUtils.smoothstep(t, 0.25, 1));
  });
}
function cucumberStick(len, s){
  const g = new THREE.BoxGeometry(len, s, s, 6, 1, 1);
  return vertexColors(g, (c, x, y, z, nx, ny) => c.set(ny > 0.5 ? '#2c5a1e' : (Math.abs(nx) > 0.5 ? '#e4f2c4' : '#cfe6a6')));
}
function kaniStick(len, r){
  const g = new THREE.CylinderGeometry(r, r, len, 28, 4);
  g.rotateZ(Math.PI / 2); // lies along x; the texture's red skin (u = 0.25) is now on top
  return mesh(g, 'kani');
}
function gariPetals(n, size = 1){
  const g = new THREE.Group();
  for (let i = 0; i < n; i++){
    const geo = new THREE.CircleGeometry(1, 32);
    const sx = rr(1.6, 2.0) * size, sy = rr(1.1, 1.4) * size;
    warp(geo, (v) => { const x = v.x, y = v.y; v.set(x * sx * (1 + 0.06 * Math.sin(y * 7)), y * sy, 0.7 * x * x * size + 0.15 * Math.sin(x * 6 + i)); });
    const petal = mesh(geo, 'gari');
    petal.castShadow = false;
    petal.rotation.set(-Math.PI / 2 + 0.38 + rr(-0.1, 0.1), 0, 0);
    petal.position.set(0, 0.25 + i * 0.16, 0.55 * size);
    const holder = new THREE.Group();
    holder.rotation.y = (i / n) * Math.PI * 2 + rr(-0.2, 0.2);
    holder.add(petal);
    g.add(holder);
  }
  return g;
}

// ------------------------------------------------------------------ raw ingredients (on their dishes)
const RAW = {
  rice(){
    const m = mound(1.75, 0.72, 1.6, { boxy: 0.05, cut: -0.6, wobble: 0.06 });
    return group(m.mesh, grains(170, (p, n) => m.sample(p, n, -0.4)));
  },
  nori(){
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++){
      const geo = warp(new THREE.BoxGeometry(3.1, 0.035, 3.1, 10, 1, 10), (v) => { v.y += 0.06 * Math.sin(v.x * 1.3 + i) + (i === 2 ? 0.12 * (v.x / 2) ** 2 : 0); });
      const s = mesh(geo, 'nori');
      s.position.set(rr(-0.15, 0.15), 0.05 + i * 0.07, rr(-0.15, 0.15));
      s.rotation.y = rr(-0.25, 0.25);
      g.add(s);
    }
    return g;
  },
  wasabi(){
    const prof = [[0, 0], [1.25, 0], [1.38, 0.2], [1.28, 0.55], [1.0, 0.9], [0.68, 1.2], [0.36, 1.45], [0.14, 1.58], [0, 1.62]].map(([x, y]) => new THREE.Vector2(x, y));
    const geo = warp(new THREE.LatheGeometry(prof.map((p) => new THREE.Vector2(p.x, p.y * 0.72)), 48), (v) => {
      const a = Math.atan2(v.z, v.x), k = 1 + 0.08 * Math.sin(a * 3 + v.y * 2.5) + 0.03 * Math.sin(a * 11 + v.y * 7);
      v.x *= k; v.z *= k; v.y += 0.12 * Math.sin(a * 2) * (v.y / 1.6);
    });
    return group(mesh(geo, 'wasabi'));
  },
  salmon(){ const m = fishSlab('salmon', 4.4, 1.15, 2.5); m.position.y = 0.58; return group(m); },
  tuna(){ const m = fishSlab('tuna', 4.4, 1.2, 2.5); m.position.y = 0.6; return group(m); },
  ebi(){
    const g = new THREE.Group();
    for (const [z, r] of [[-0.6, 0.12], [0.6, -0.08]]){
      const s = mesh(shrimpGeo(3.9, 1.4, 0.26, 0.26), 'ebi');
      s.position.set(0, 0.18 + (z > 0 ? 0.25 : 0), z); s.rotation.y = r;
      g.add(s);
    }
    return g;
  },
  tamago(){
    const geo = boxUV(roundedSlab(4.2, 1.3, 2.6, 0.16, 8, 5, 6), { atlas: true });
    const m = mesh(geo, 'tamago'); m.position.y = 0.65;
    return group(m);
  },
  ikura(){
    return group(roe(46, (p, i) => {
      const layer = i < 26 ? 0 : i < 42 ? 1 : 2;
      const rMax = [1.45, 1.05, 0.55][layer], a = rr(0, Math.PI * 2), r = Math.sqrt(rand()) * rMax;
      p.set(Math.cos(a) * r, 0.3 + layer * 0.42, Math.sin(a) * r);
    }));
  },
  kani(){
    const g = new THREE.Group();
    for (const [x, y, z] of [[0, 0.45, -0.95], [0.1, 0.45, 0], [-0.1, 0.45, 0.95]]){   // side by side, not stacked
      const k = kaniStick(3.9, 0.45); k.position.set(x, y, z); k.rotation.y = rr(-0.1, 0.1); g.add(k);
    }
    return g;
  },
  avocado(){
    const g = new THREE.Group();
    g.scale.setScalar(0.78); // the fan of slices stays inside its dish (an inner group, so animations can scale the outer one)
    for (let i = 0; i < 4; i++){
      const s = mesh(avocadoSlice(), 'avocado');
      s.position.set(-0.6 + i * 0.4, 0.05 + i * 0.12, 0.9 - i * 0.15);
      s.rotation.y = -0.25 + i * 0.16;
      g.add(s);
    }
    return group(g);
  },
  kyuri(){
    const g = new THREE.Group();
    for (const [z, y, r] of [[-0.82, 0.35, 0.05], [0, 0.35, -0.04], [0.82, 0.35, 0.08]]){   // side by side, not stacked
      const s = mesh(cucumberStick(3.9, 0.72), 'kyuri'); s.position.set(0, y, z); s.rotation.y = r; g.add(s);
    }
    return g;
  },
  goma(){
    return group(seeds(220, (p, n) => {
      const a = rr(0, Math.PI * 2), r = Math.sqrt(rand()) * 1.45, h = 0.75 * (1 - (r / 1.5) ** 2);
      p.set(Math.cos(a) * r, 0.04 + rand() * h, Math.sin(a) * r);
      n.set(rr(-0.5, 0.5), 1, rr(-0.5, 0.5)).normalize();
    }));
  },
  gari(){ return gariPetals(7, 0.85); },
};
export const rawModel = (id) => RAW[id]();

// ------------------------------------------------------------------ the piece being built
// Each recipe form lays its parts where a chef would put them. `add(id)` returns the
// new part (already in place) so the stage can animate it dropping in.
export function assembly(recipe){
  const root = new THREE.Group();
  const parts = {};
  const f = recipe.form;
  let addFn;

  if (f === 'nigiri' || f === 'gunkan'){
    const big = f === 'nigiri';
    const rice = big ? mound(2.7, 1.15, 1.25, { boxy: 0.15 }) : mound(2.2, 0.95, 1.45, { boxy: 0.2 });
    const top = rice.height;
    addFn = (id) => {
      if (id === 'rice') return group(rice.mesh, grains(big ? 330 : 240, (p, n) => rice.sample(p, n)));
      if (id === 'wasabi'){
        // a small dab, hidden under the topping once it goes on (as a chef does it)
        const w = mesh(warp(new THREE.SphereGeometry(1, 24, 14), (v) => { v.set(v.x * 0.75, Math.max(v.y, -0.2) * 0.14, v.z * 0.38); }), 'wasabi');
        w.position.y = top - 0.1;
        return group(w);
      }
      if (id === 'salmon' || id === 'tuna'){
        const s = fishSlab(id, 6.8, 0.55, 3.0, 0.75); s.position.y = top + 0.15; return group(s);
      }
      if (id === 'ebi'){
        const s = mesh(shrimpGeo(7.0, 2.8, 0.3, 0.0), 'ebi');
        warp(s.geometry, (v) => { const u = v.x / 3.5; v.y += -0.7 * u * u - 0.15 * v.z * v.z; });
        s.position.y = top + 0.3; s.rotation.y = Math.PI;
        return group(s);
      }
      if (id === 'tamago'){
        const t = mesh(boxUV(roundedSlab(5.6, 1.05, 2.5, 0.14, 8, 5, 6), { atlas: true }), 'tamago');
        t.position.y = top + 0.48;
        return group(t);
      }
      if (id === 'nori' && big){ // the belt that holds tamago on its rice
        const h = top + 1.0, geo = new THREE.CylinderGeometry(1, 1, 0.9, 48, 1, true);
        geo.rotateZ(Math.PI / 2);
        const b = mesh(geo, 'nori'); b.scale.set(1, h / 2 + 0.06, 1.45); b.position.y = h / 2;
        return group(b);
      }
      if (id === 'nori'){ // gunkan's wall
        const geo = new THREE.CylinderGeometry(1, 1, 2.7, 56, 1, true);
        const w = mesh(geo, 'nori'); w.scale.set(2.3, 1, 1.55); w.position.y = 1.35;
        return group(w);
      }
      if (id === 'ikura'){
        return group(roe(58, (p, i) => {
          const a = rr(0, Math.PI * 2), r = Math.sqrt(rand());
          p.set(Math.cos(a) * r * 1.85, top + 0.15 + (i % 3) * 0.3 + (1 - r) * 0.55, Math.sin(a) * r * 1.2);
        }));
      }
      return null;
    };
  } else {
    // Rolls are laid out flat on a bamboo mat: nori, then rice, then fillings in a line.
    const ura = f === 'uramaki', futo = f === 'futomaki';
    const W = 8.6, D = futo ? 6.4 : ura ? 6.2 : 5.4;   // fits on the mat, inside the board's middle
    root.add(makisu());
    const lift = 0.36;
    let fillCount = 0;
    addFn = (id) => {
      if (id === 'nori'){
        const n = mesh(new THREE.BoxGeometry(W, 0.04, D, 1, 1, 1), 'nori'); n.position.y = lift; return group(n);
      }
      if (id === 'rice'){
        const rd = ura ? D : D * 0.82, rw = W - 0.2;
        const slab = mesh(boxUV(roundedSlab(rw, 0.55, rd, 0.2, 10, 2, 8), { tile: 2.6 }), 'rice');
        slab.position.set(0, lift + 0.3, ura ? 0 : D * 0.09);
        return group(slab, grains(320, (p, n) => {
          p.set(rr(-rw / 2 + 0.2, rw / 2 - 0.2), lift + 0.56, slab.position.z + rr(-rd / 2 + 0.2, rd / 2 - 0.2));
          n.set(rr(-0.3, 0.3), 1, rr(-0.3, 0.3)).normalize();
        }));
      }
      if (id === 'goma'){
        return group(seeds(260, (p, n) => { p.set(rr(-W / 2 + 0.3, W / 2 - 0.3), lift + 0.62, rr(-D / 2 + 0.3, D / 2 - 0.3)); n.set(rr(-0.4, 0.4), 1, rr(-0.4, 0.4)).normalize(); }));
      }
      // fillings run across the rice in a line, a little apart from each other
      const z = (ura ? -0.6 : 0.3) + (fillCount - 1) * 0.95, y = lift + 0.62;
      fillCount++;
      if (id === 'wasabi'){ const w = mesh(new THREE.CylinderGeometry(0.12, 0.12, W - 1.4, 10).rotateZ(Math.PI / 2), 'wasabi'); w.position.set(0, y, z - 0.6); return group(w); }
      if (id === 'salmon' || id === 'tuna'){ const s = fishSlab(id, W - 1.0, 0.8, 0.85); s.position.set(0, y + 0.4, z); return group(s); }
      if (id === 'kyuri'){ const s = mesh(cucumberStick(W - 1.0, 0.7), 'kyuri'); s.position.set(0, y + 0.35, z); return group(s); }
      if (id === 'kani'){ const k = kaniStick(W - 1.2, 0.42); k.position.set(0, y + 0.42, z); return group(k); }
      if (id === 'tamago'){ const t = mesh(boxUV(roundedSlab(W - 1.0, 0.8, 0.85, 0.1, 8, 3, 3), { atlas: true }), 'tamago'); t.position.set(0, y + 0.4, z); return group(t); }
      if (id === 'avocado'){
        const g = new THREE.Group();
        for (let i = 0; i < 3; i++){ const s = mesh(avocadoSlice(), 'avocado'); s.scale.set(0.9, 1, 0.45); s.position.set(-2.3 + i * 2.3, y, z + 0.5); s.rotation.y = Math.PI; g.add(s); }
        return g;
      }
      return null;
    };
  }

  return {
    root,
    add(id){
      const part = addFn(id);
      if (part){ root.add(part); (parts[id] ||= []).push(part); }
      return part;
    },
  };
}

// ------------------------------------------------------------------ the served plate
export function finishedModel(recipe){
  const g = new THREE.Group();
  if (recipe.form === 'nigiri' || recipe.form === 'gunkan'){
    for (const [x, r] of [[-1.9, 0.25], [1.9, 0.1]]){
      const a = assembly(recipe);
      recipe.stages.flat().forEach((id) => a.add(id));
      a.root.scale.setScalar(0.92);
      a.root.position.set(x, 0, 0); a.root.rotation.y = Math.PI / 2 + r;
      g.add(a.root);
    }
    return g;
  }
  // A roll cut into six pieces, standing cut-face up in two rows, like a sushi bar plate.
  const ura = recipe.form === 'uramaki', futo = recipe.form === 'futomaki';
  const R = futo ? 2.2 : ura ? 2.0 : 1.35, H = futo ? 2.4 : ura ? 2.4 : 2.2;
  const face = std({ map: T.cutFaceMap(recipe), roughness: 0.6, bumpMap: T.riceBump(), bumpScale: 0.6 });
  for (let i = 0; i < 6; i++){
    const piece = new THREE.Group();
    const side = mesh(new THREE.CylinderGeometry(R, R * 1.01, H, 56, 1, true), ura ? 'rice' : 'nori');
    side.position.y = H / 2;
    const cap = mesh(new THREE.CircleGeometry(R, 56).rotateX(-Math.PI / 2), face); cap.position.y = H + 0.001;
    piece.add(side, cap);
    // a few loose grains on the cut face catch the light
    piece.add(grains(ura ? 70 : 40, (p, n) => {
      const a = rr(0, Math.PI * 2), r = rr(R * (ura ? 0.6 : 0.55), R * 0.9);
      p.set(Math.cos(a) * r, H + 0.02, Math.sin(a) * r); n.set(rr(-0.3, 0.3), 1, rr(-0.3, 0.3)).normalize();
    }));
    if (ura){
      piece.add(grains(150, (p, n) => { const a = rr(0, Math.PI * 2); n.set(Math.cos(a), 0, Math.sin(a)); p.set(n.x * (R - 0.03), rr(0.15, H - 0.1), n.z * (R - 0.03)); }));
      piece.add(seeds(110, (p, n) => { const a = rr(0, Math.PI * 2); n.set(Math.cos(a), rr(-0.2, 0.2), Math.sin(a)).normalize(); p.set(Math.cos(a) * (R + 0.04), rr(0.1, H - 0.05), Math.sin(a) * (R + 0.04)); }));
    }
    const col = i % 3, row = Math.floor(i / 3);
    piece.position.set((col - 1) * (R * 2 + 0.35) + (row ? R * 0.5 : 0), 0, (row - 0.5) * (R * 2 + 0.35));
    piece.rotation.y = rr(0, Math.PI * 2);
    piece.rotation.z = rr(-0.04, 0.04);
    g.add(piece);
  }
  return g;
}

// ------------------------------------------------------------------ board, dishes, mat
export { BOARD } from './layout.js';
import { BOARD } from './layout.js';
export function boardModel(){
  const g = new THREE.Group();
  const top = mesh(boxUV(roundedSlab(BOARD.w, 1.5, BOARD.d, 0.35, 12, 2, 8), { tile: 30 }), 'wood');
  top.position.y = BOARD.top - 0.75;
  g.add(top);
  for (const x of [-BOARD.w / 2 + 3.2, BOARD.w / 2 - 3.2]){ // the two geta feet
    const foot = mesh(roundedSlab(1.6, 0.9, BOARD.d - 1.2, 0.2, 2, 2, 6), 'woodEnd');
    foot.position.set(x, 0.45, 0);
    g.add(foot);
  }
  return g;
}
export function dishModel(r = 2.45){
  // profile from the centre of the well, out over the rim, down to the foot and back underneath
  const P = [[0, 0.32], [r * 0.55, 0.32], [r * 0.82, 0.4], [r * 0.95, 0.58], [r, 0.66], [r * 1.02, 0.6], [r * 0.98, 0.38],
             [r * 0.8, 0.16], [r * 0.6, 0.1], [r * 0.58, 0], [r * 0.5, 0], [r * 0.48, 0.08], [0, 0.08]];
  const geo = new THREE.LatheGeometry(P.map(([x, y]) => new THREE.Vector2(x, y)), 48);
  return mesh(geo, 'dish');
}
export function makisu(){
  const g = new THREE.Group();
  const n = 18, W = 10.5;
  const slats = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.17, 0.17, W, 10).rotateZ(Math.PI / 2), mat('bamboo'), n);
  slats.receiveShadow = true; slats.castShadow = true;
  const mx = new THREE.Matrix4();
  for (let i = 0; i < n; i++){ mx.makeTranslation(0, 0.17, (i - (n - 1) / 2) * 0.36); slats.setMatrixAt(i, mx); }
  g.add(slats);
  for (const x of [-3.6, 0, 3.6]){
    const s = mesh(new THREE.CylinderGeometry(0.05, 0.05, n * 0.36, 6).rotateX(Math.PI / 2), 'string');
    s.position.set(x, 0.33, 0); g.add(s);
  }
  return g;
}
export function contactShadow(w, d, strength = 0.5){
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: T.shadowMap(), transparent: true, depthWrite: false, opacity: strength, color: 0x000000 }));
  m.renderOrder = -1;
  return m;
}
