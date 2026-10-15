import * as THREE from "three";
import { buildRig, lerpPose, restPose, type Pose } from "../rig/pose";
import type { Mat4 } from "../rig/mat4";
import { chain, rotX, translation } from "../rig/mat4";
import type { SkinModel } from "../skin/layout";
import { spritePixels, type ItemSpec } from "../voxel/items";
import { voxelize } from "../voxel/voxelize";

// A player figure made of one cube per skin voxel. Each cube is rigidly
// attached to its body segment, so the figure can be posed, exploded into
// floating blocks and reassembled, all on the GPU via instancing.

interface Cube {
  seg: number; // 1-based segment index, 0 = held item
  x: number;
  y: number;
  z: number;
  dx: number; // explode direction (unit)
  dy: number;
  dz: number;
  r: number; // random 0..1
}

const tmp = new THREE.Matrix4();
const tmp2 = new THREE.Matrix4();
const scaleM = new THREE.Matrix4();

function toThree(m: Mat4, out: THREE.Matrix4) {
  // our matrices are row-major, Matrix4.set takes row-major arguments
  return out.set(m[0], m[1], m[2], m[3], m[4], m[5], m[6], m[7], m[8], m[9], m[10], m[11], m[12], m[13], m[14], m[15]);
}

function rand(i: number) {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export class Figure {
  readonly object = new THREE.Group();
  private body: THREE.InstancedMesh;
  private item: THREE.InstancedMesh | null = null;
  private cubes: Cube[] = [];
  private itemCubes: Cube[] = [];
  private segMatrices: THREE.Matrix4[] = [];

  constructor(
    skin: Uint8ClampedArray,
    private model: SkinModel,
    private itemSpec: ItemSpec | null,
  ) {
    const g = voxelize(skin, { model, pose: restPose(), scale: 1, outer: "shell", item: null });
    const colors: number[] = [];
    const filled = (x: number, y: number, z: number) =>
      x >= 0 && y >= 0 && z >= 0 && x < g.sx && y < g.sy && z < g.sz && g.color[(y * g.sz + z) * g.sx + x] !== 0;
    let n = 0;
    for (let y = 0; y < g.sy; y++)
      for (let z = 0; z < g.sz; z++)
        for (let x = 0; x < g.sx; x++) {
          const i = (y * g.sz + z) * g.sx + x;
          if (!g.color[i]) continue;
          // only cubes that can ever be seen
          if (filled(x - 1, y, z) && filled(x + 1, y, z) && filled(x, y - 1, z) && filled(x, y + 1, z) && filled(x, y, z - 1) && filled(x, y, z + 1)) continue;
          const px = g.origin[0] + x + 0.5;
          const py = g.origin[1] + y + 0.5;
          const pz = g.origin[2] + z + 0.5;
          const d = new THREE.Vector3(px, py - 16, pz * 1.6).normalize();
          this.cubes.push({ seg: g.seg[i], x: px, y: py, z: pz, dx: d.x, dy: d.y, dz: d.z, r: rand(n++) });
          colors.push(g.color[i] - 1);
        }

    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    this.body = new THREE.InstancedMesh(geo, mat, this.cubes.length);
    this.body.castShadow = true;
    this.body.receiveShadow = true;
    const c = new THREE.Color();
    colors.forEach((hex, i) => this.body.setColorAt(i, c.setHex(hex)));
    this.object.add(this.body);

    if (itemSpec) {
      const { w, h, px, grip } = spritePixels(itemSpec.kind, itemSpec.material);
      const itemColors: number[] = [];
      for (let row = 0; row < h; row++)
        for (let col = 0; col < w; col++) {
          const v = px[row * w + col];
          if (v < 0) continue;
          // sprite space relative to the grip, matching the voxelizer
          const u = col + 0.5 - (grip[0] + 0.5);
          const vv = h - row - 0.5 - (h - grip[1] - 0.5);
          const d = new THREE.Vector3(u, vv, 0).normalize();
          this.itemCubes.push({ seg: 0, x: 0, y: vv, z: u, dx: 0, dy: d.y, dz: d.x, r: rand(n++) });
          itemColors.push(v);
        }
      this.item = new THREE.InstancedMesh(geo, mat, this.itemCubes.length);
      this.item.castShadow = true;
      itemColors.forEach((hex, i) => this.item!.setColorAt(i, c.setHex(hex)));
      this.object.add(this.item);
    }
    this.set(restPose(), 0, 0);
  }

  get cubeCount() {
    return this.cubes.length;
  }

  /**
   * @param explode 0 = assembled, 1 = fully exploded
   * @param itemAmount 0..1 fades the held item in, cube by cube
   */
  set(pose: Pose, explode: number, itemAmount: number, itemAngle = 0) {
    const rig = buildRig(this.model, pose);
    this.segMatrices = [new THREE.Matrix4()];
    for (const s of rig.segments) this.segMatrices[s.index] = toThree(s.matrix, new THREE.Matrix4());

    const e = explode;
    const size = 1 - 0.22 * Math.min(1, e * 1.6);
    scaleM.makeScale(size, size, size);
    for (let i = 0; i < this.cubes.length; i++) {
      const q = this.cubes[i];
      const k = e * (5 + 9 * q.r);
      tmp.makeTranslation(q.x + q.dx * k, q.y + q.dy * k + e * 1.5, q.z + q.dz * k);
      tmp2.multiplyMatrices(this.segMatrices[q.seg] ?? this.segMatrices[1], tmp).multiply(scaleM);
      this.body.setMatrixAt(i, tmp2);
    }
    this.body.instanceMatrix.needsUpdate = true;

    if (this.item && this.itemSpec) {
      const hand = rig.hand[this.itemSpec.hand];
      const m = chain(hand.matrix, translation(hand.point[0], hand.point[1], hand.point[2]), rotX(-itemAngle));
      const handM = toThree(m, new THREE.Matrix4());
      for (let i = 0; i < this.itemCubes.length; i++) {
        const q = this.itemCubes[i];
        // cubes arrive one after another along the blade
        const t = Math.min(1, Math.max(0, itemAmount * 1.6 - q.r * 0.6));
        const s = t * size;
        const k = (1 - t) * (4 + 6 * q.r);
        tmp.makeTranslation(q.x, q.y + q.dy * k, q.z + q.dz * k);
        scaleM.makeScale(s, s, s);
        tmp2.multiplyMatrices(handM, tmp).multiply(scaleM);
        this.item.setMatrixAt(i, tmp2);
      }
      this.item.instanceMatrix.needsUpdate = true;
      scaleM.makeScale(size, size, size);
    }
  }

  dispose() {
    this.body.geometry.dispose();
    (this.body.material as THREE.Material).dispose();
    this.body.dispose();
    this.item?.dispose();
  }
}

export { lerpPose };
