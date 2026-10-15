import * as THREE from "three";
import type { BuildPayload } from "../engine";

export type MeshArrays = BuildPayload["mesh"];

export function toGeometry(mesh: MeshArrays): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(mesh.positions, 3));
  g.setAttribute("color", new THREE.BufferAttribute(mesh.colors, 3));
  g.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

/** Frame a box of the given size (x, y, z) from a 3/4 angle. */
export function frameCamera(camera: THREE.PerspectiveCamera, size: [number, number, number], yawDeg = 32, pitchDeg = 12, margin = 1.12) {
  const [sx, sy, sz] = size;
  const center = new THREE.Vector3(0, sy / 2, 0);
  const radius = 0.5 * Math.sqrt(sx * sx + sy * sy + sz * sz);
  const fov = (camera.fov * Math.PI) / 180;
  const fovH = 2 * Math.atan(Math.tan(fov / 2) * camera.aspect);
  const dist = (radius * margin) / Math.sin(Math.min(fov, fovH) / 2);
  const yaw = (yawDeg * Math.PI) / 180;
  const pitch = (pitchDeg * Math.PI) / 180;
  camera.position.set(center.x + dist * Math.sin(yaw) * Math.cos(pitch), center.y + dist * Math.sin(pitch), center.z + dist * Math.cos(yaw) * Math.cos(pitch));
  camera.near = Math.max(0.1, dist - radius * 3);
  camera.far = dist + radius * 4;
  camera.lookAt(center);
  camera.updateProjectionMatrix();
  return { center, dist, radius };
}

let shared: { renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; material: THREE.MeshBasicMaterial } | null = null;

function offscreen() {
  if (shared) return shared;
  const canvas = document.createElement("canvas");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 1000);
  const material = new THREE.MeshBasicMaterial({ vertexColors: true });
  shared = { renderer, scene, camera, material };
  return shared;
}

function renderOnce(mesh: MeshArrays, size: [number, number, number], w: number, h: number, yaw = 28) {
  const { renderer, scene, camera, material } = offscreen();
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  frameCamera(camera, size, yaw, 10, 1.04);
  const geo = toGeometry(mesh);
  const obj = new THREE.Mesh(geo, material);
  scene.add(obj);
  renderer.render(scene, camera);
  scene.remove(obj);
  geo.dispose();
  return renderer;
}

/** Render a mesh to a PNG data URL with a transparent background. */
export function renderThumbnail(mesh: MeshArrays, size: [number, number, number], w: number, h: number): string {
  const r = renderOnce(mesh, size, w, h);
  return r.domElement.toDataURL("image/png");
}

/** Square ARGB pixels for Litematica's schematic browser preview. */
export function renderPreviewArgb(mesh: MeshArrays, size: [number, number, number], px = 140): Int32Array {
  const r = renderOnce(mesh, size, px, px, 30);
  const gl = r.getContext();
  const buf = new Uint8Array(px * px * 4);
  gl.readPixels(0, 0, px, px, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  const out = new Int32Array(px * px);
  // Litematica's browser shows it on dark grey; composite so edges stay clean.
  const bg = [0x1e, 0x1f, 0x22];
  for (let y = 0; y < px; y++) {
    for (let x = 0; x < px; x++) {
      const i = ((px - 1 - y) * px + x) * 4; // GL rows are bottom-up
      const a = buf[i + 3] / 255;
      const red = Math.round(buf[i] + bg[0] * (1 - a));
      const green = Math.round(buf[i + 1] + bg[1] * (1 - a));
      const blue = Math.round(buf[i + 2] + bg[2] * (1 - a));
      out[y * px + x] = (0xff << 24) | (red << 16) | (green << 8) | blue;
    }
  }
  return out;
}
