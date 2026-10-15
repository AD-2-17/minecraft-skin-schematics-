import type { StatueSettings } from "./build";
import type { BuildPayload, ThumbMesh, WorkerRequest, WorkerResponse } from "../worker/statue.worker";
import type { Pose } from "./rig/pose";
import type { SkinModel } from "./skin/layout";
import type { ItemSpec } from "./voxel/items";

export type { BuildPayload, ThumbMesh };

/**
 * Talks to the statue worker. Builds are "latest wins": while one runs, newer
 * requests replace each other and only the most recent is started next.
 */
export class StatueEngine {
  private worker: Worker;
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  private running = false;
  private queued: { settings: StatueSettings; resolve: (v: BuildPayload | null) => void } | null = null;

  constructor() {
    this.worker = new Worker(new URL("../worker/statue.worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      if (msg.type === "error") p.reject(new Error(msg.message));
      else if (msg.type === "built") p.resolve(msg.result);
      else p.resolve(msg.meshes);
    };
  }

  setSkin(data: Uint8ClampedArray) {
    this.post({ type: "skin", data: new Uint8ClampedArray(data) });
  }

  private post(msg: WorkerRequest) {
    this.worker.postMessage(msg);
  }

  private request<T>(make: (id: number) => WorkerRequest): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.post(make(id));
    });
  }

  /** Resolves with the build, or null if a newer request superseded it. */
  build(settings: StatueSettings): Promise<BuildPayload | null> {
    return new Promise((resolve) => {
      if (this.running) {
        this.queued?.resolve(null);
        this.queued = { settings, resolve };
        return;
      }
      this.run(settings, resolve);
    });
  }

  private run(settings: StatueSettings, resolve: (v: BuildPayload | null) => void) {
    this.running = true;
    this.request<BuildPayload>((id) => ({ type: "build", id, settings }))
      .then(resolve, (e) => {
        console.error(e);
        resolve(null);
      })
      .finally(() => {
        this.running = false;
        const next = this.queued;
        this.queued = null;
        if (next) this.run(next.settings, next.resolve);
      });
  }

  thumbs(model: SkinModel, poses: { key: string; pose: Pose; item: ItemSpec | null }[]): Promise<ThumbMesh[]> {
    return this.request<ThumbMesh[]>((id) => ({ type: "thumbs", id, model, poses }));
  }

  dispose() {
    this.worker.terminate();
  }
}
