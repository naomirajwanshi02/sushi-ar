// Lighting, as in Noh_Masks: filmic tone mapping, a soft studio environment for the wet
// fish and the glaze to reflect, a warm key light from above with real shadows, and a
// fill. In AR the light follows the room: the camera image is sampled twice a second
// and its brightness and tint ease the exposure and fill toward it.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export function setupRenderer(renderer){
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.86;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
}

export function environment(renderer){
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
  pmrem.dispose();
  return env;
}

// Lights in the stage's own space (1 unit = 1 cm, y up), so shadows fall the same way
// whether the board sits on the card or floats in front of the camera.
export function stageLights(){
  const rig = new THREE.Group();
  rig.name = 'lights';
  const hemi = new THREE.HemisphereLight('#fff6e8', '#5a4128', 0.4);
  const key = new THREE.DirectionalLight('#fff1dc', 1.7);
  key.position.set(-9, 26, 14);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 4;
  const rim = new THREE.DirectionalLight('#ffe2c0', 0.7);
  rim.position.set(14, 8, -16);
  const fill = new THREE.DirectionalLight('#dfe8ff', 0.35);
  fill.position.set(12, 6, 18);
  rig.add(hemi, key, key.target, rim, fill);
  return { rig, hemi, key, rim, fill };
}

// The shadow camera works in world units, so it is re-fitted to the board's current
// world scale every frame (the board is tiny on the card, and bigger when floating).
export function fitShadow(key, worldScale, halfW = 17, halfD = 12){
  const cam = key.shadow.camera;
  const s = worldScale;
  if (Math.abs(cam.right - halfW * s) < 1e-6 * s) return;
  Object.assign(cam, { left: -halfW * s, right: halfW * s, top: halfD * s * 1.4, bottom: -halfD * s * 1.4, near: 1 * s, far: 80 * s });
  cam.updateProjectionMatrix();
}

// Reads the room from the camera image and eases the lights toward it.
export function roomLight(look, renderer){
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const g = c.getContext('2d', { willReadFrequently: true });
  const target = { exp: 0.95, tint: new THREE.Color('#fff6e8') };
  let last = 0;
  return (video, now, dt) => {
    if (video && video.readyState >= 2 && now - last > 500){
      last = now;
      try {
        g.drawImage(video, 0, 0, 16, 16);
        const d = g.getImageData(0, 0, 16, 16).data;
        let r = 0, gg = 0, b = 0;
        for (let i = 0; i < d.length; i += 4){ r += d[i]; gg += d[i + 1]; b += d[i + 2]; }
        const n = d.length / 4; r /= n * 255; gg /= n * 255; b /= n * 255;
        const lum = 0.2126 * r + 0.7152 * gg + 0.0722 * b;
        // a dim room gets dimmer food, never black; a bright room brighter food
        target.exp = THREE.MathUtils.clamp(0.5 + lum * 1.0, 0.6, 1.1);
        const m = Math.max(r, gg, b, 1e-3);
        target.tint.setRGB(0.6 + 0.4 * r / m, 0.6 + 0.4 * gg / m, 0.6 + 0.4 * b / m);
      } catch { /* video not ready */ }
    }
    const k = 1 - Math.exp(-dt * 2);
    renderer.toneMappingExposure += (target.exp - renderer.toneMappingExposure) * k;
    look.hemi.color.lerp(target.tint, k);
    look.fill.color.lerp(target.tint, k);
  };
}
