// Ticket icons: each ingredient and each finished plate is photographed from its own
// 3D model, so the order ticket always matches what is on the board.

import * as THREE from 'three';
import { setupRenderer, environment, stageLights } from './look.js';

let R = null;
function studio(){
  if (R) return R;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  setupRenderer(renderer);
  renderer.shadowMap.enabled = false;
  const scene = new THREE.Scene();
  scene.environment = environment(renderer);
  const look = stageLights();
  look.key.castShadow = false;
  scene.add(look.rig);
  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 500);
  R = { renderer, scene, camera };
  return R;
}

const box = new THREE.Box3(), sphere = new THREE.Sphere();
// Render `object` and return a PNG data URL. The view looks down at 38°, from the front-left.
export function snapshot(object, size = 160, { el = 38, az = -28, pad = 1.08 } = {}){
  const { renderer, scene, camera } = studio();
  renderer.setSize(size, size, false);
  scene.add(object);
  object.updateMatrixWorld(true);
  box.setFromObject(object).getBoundingSphere(sphere);
  const d = (sphere.radius * pad) / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2));
  const e = THREE.MathUtils.degToRad(el), a = THREE.MathUtils.degToRad(az);
  camera.position.set(sphere.center.x + Math.sin(a) * Math.cos(e) * d, sphere.center.y + Math.sin(e) * d, sphere.center.z + Math.cos(a) * Math.cos(e) * d);
  camera.lookAt(sphere.center);
  camera.near = d / 20; camera.far = d * 4; camera.updateProjectionMatrix();
  renderer.setClearColor(0x000000, 0);
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/png');
  scene.remove(object);
  return url;
}

export function disposeStudio(){
  if (!R) return;
  R.renderer.dispose();
  R.renderer.forceContextLoss?.();
  R = null;
}
