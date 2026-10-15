import * as THREE from "three";
import { Figure } from "./figure";
import type { SkinModel } from "../skin/layout";
import type { ItemSpec } from "../voxel/items";
import type { Pose } from "../rig/pose";

export interface StageFrame {
  pose: Pose;
  explode: number;
  item: number;
  itemAngle: number;
  /** figure yaw in degrees */
  yaw: number;
  /** override the camera framing for this frame */
  framing?: { height: number; centerY: number };
}

/**
 * A lit, shadowed stage with one voxel figure on a transparent background.
 * The page drives it by returning a frame from `onFrame` every tick.
 */
export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly figure: Figure;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(18, 1, 1, 2000);
  private pivot = new THREE.Group();
  private raf = 0;
  private running = false;
  private ro: ResizeObserver;
  private start = performance.now();
  onFrame: ((t: number) => StageFrame) | null = null;

  constructor(
    private host: HTMLElement,
    skin: Uint8ClampedArray,
    model: SkinModel,
    item: ItemSpec | null,
    private framing: { height: number; centerY: number } = { height: 1.0, centerY: 0.5 },
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    host.appendChild(this.renderer.domElement);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xb8b4ae, 2.1));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(-22, 90, 34);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -40;
    key.shadow.camera.right = 40;
    key.shadow.camera.top = 60;
    key.shadow.camera.bottom = -20;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 200;
    key.shadow.radius = 6;
    key.shadow.bias = -0.0005;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xffffff, 0.6);
    rim.position.set(40, 20, -30);
    this.scene.add(rim);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.ShadowMaterial({ opacity: 0.13 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    this.figure = new Figure(skin, model, item);
    this.pivot.add(this.figure.object);
    this.scene.add(this.pivot);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
  }

  private resize() {
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.frameCamera();
    this.render();
  }

  private frameCamera() {
    // Fit a 34 px tall figure to `framing.height` of the viewport height.
    const fov = (this.camera.fov * Math.PI) / 180;
    // On narrow screens keep the figure (about 18 px wide) inside ~60% of the width.
    const targetH = Math.max(34 / this.framing.height, 18 / (0.6 * this.camera.aspect));
    const dist = targetH / 2 / Math.tan(fov / 2);
    // figure centre (y = 17) lands at `framing.centerY` of the viewport, measured from the top
    const cy = 17 - (0.5 - this.framing.centerY) * targetH;
    this.camera.position.set(0, cy + dist * 0.05, dist);
    this.camera.lookAt(0, cy, 0);
    this.camera.updateProjectionMatrix();
  }

  play() {
    if (this.running) return;
    this.running = true;
    const tick = () => {
      if (!this.running) return;
      this.render();
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  pause() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  render() {
    if (this.onFrame) {
      const f = this.onFrame((performance.now() - this.start) / 1000);
      this.figure.set(f.pose, f.explode, f.item, f.itemAngle);
      this.pivot.rotation.y = (f.yaw * Math.PI) / 180;
      if (f.framing && (f.framing.height !== this.framing.height || f.framing.centerY !== this.framing.centerY)) {
        this.framing = f.framing;
        this.frameCamera();
      }
    }
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.pause();
    this.ro.disconnect();
    this.figure.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
