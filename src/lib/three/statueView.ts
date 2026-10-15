import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { BuildPayload } from "../engine";
import { frameCamera, toGeometry } from "./geometry";

function shadowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(0,0,0,0.22)");
  grad.addColorStop(0.5, "rgba(0,0,0,0.1)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export type ViewPreset = "front" | "side" | "back" | "angle";

const VIEW_YAW: Record<ViewPreset, number> = { front: 0, side: 90, back: 180, angle: 32 };

export class StatueView {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.1, 5000);
  private controls: OrbitControls;
  private mesh: THREE.Mesh | null = null;
  /** holds the statue, scaled so one skin pixel is one unit whatever the build scale */
  private root = new THREE.Group();
  private baseColors: Float32Array | null = null;
  private shadow: THREE.Mesh;
  private material = new THREE.MeshBasicMaterial({ vertexColors: true });
  private size: [number, number, number] = [16, 32, 8];
  private quadSeg: Uint8Array | null = null;
  private frame = 0;
  private resizeObserver: ResizeObserver;
  private down: { x: number; y: number } | null = null;
  onPick: ((seg: number | null) => void) | null = null;

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.setClearColor(0x000000, 0);
    host.appendChild(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.rotateSpeed = 0.8;
    this.controls.zoomSpeed = 0.9;
    this.controls.panSpeed = 0.8;
    this.controls.addEventListener("change", () => this.invalidate());

    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = -0.02;
    this.scene.add(this.shadow);
    this.scene.add(this.root);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();

    const el = this.renderer.domElement;
    el.addEventListener("pointerdown", (e) => (this.down = { x: e.clientX, y: e.clientY }));
    el.addEventListener("pointerup", (e) => {
      if (!this.down) return;
      const moved = Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y);
      this.down = null;
      if (moved < 5) this.pick(e.clientX, e.clientY);
    });
  }

  private resize() {
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.invalidate();
  }

  invalidate() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      const moving = this.controls.update();
      this.renderer.render(this.scene, this.camera);
      if (moving) this.invalidate();
    });
  }

  setBuild(b: BuildPayload, refit: boolean, scale: number) {
    if (this.mesh) {
      this.root.remove(this.mesh);
      this.mesh.geometry.dispose();
    }
    const geo = toGeometry(b.mesh);
    this.baseColors = b.mesh.colors;
    this.mesh = new THREE.Mesh(geo, this.material);
    this.root.scale.setScalar(1 / scale);
    this.root.add(this.mesh);
    this.root.updateMatrixWorld(true);
    this.quadSeg = b.mesh.quadSeg;
    this.size = [b.sx / scale, b.sy / scale, b.sz / scale];
    const footprint = Math.max(this.size[0], this.size[2]) * 1.5;
    this.shadow.scale.set(footprint, footprint * 0.75, 1);
    if (refit) this.fit("angle");
    this.invalidate();
  }

  fit(view: ViewPreset = "angle") {
    const { center } = frameCamera(this.camera, this.size, VIEW_YAW[view], view === "angle" ? 12 : 4, 1.18);
    this.controls.target.copy(center);
    const r = Math.max(...this.size);
    this.controls.minDistance = r * 0.25;
    this.controls.maxDistance = r * 6;
    this.controls.update();
    this.invalidate();
  }

  /** Fade every quad whose segment is not in `segs`, so the selected part stands out. */
  setHighlight(segs: Set<number> | null) {
    if (!this.mesh || !this.quadSeg || !this.baseColors) return;
    const attr = this.mesh.geometry.getAttribute("color") as THREE.BufferAttribute;
    if (!segs || !segs.size) {
      if (attr.array !== this.baseColors) {
        attr.array = this.baseColors;
        attr.needsUpdate = true;
        this.invalidate();
      }
      return;
    }
    const out = new Float32Array(this.baseColors);
    const m = 0.5;
    const bg = 0.84; // background, linear
    for (let q = 0; q < this.quadSeg.length; q++) {
      if (segs.has(this.quadSeg[q])) continue;
      for (let k = q * 12; k < q * 12 + 12; k++) out[k] = out[k] * (1 - m) + bg * m;
    }
    attr.array = out;
    attr.needsUpdate = true;
    this.invalidate();
  }

  private pick(clientX: number, clientY: number) {
    if (!this.mesh || !this.quadSeg || !this.onPick) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const hit = ray.intersectObject(this.mesh, false)[0];
    if (!hit || hit.faceIndex == null) return this.onPick(null);
    this.onPick(this.quadSeg[Math.floor(hit.faceIndex / 2)]);
  }

  dispose() {
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.mesh?.geometry.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
