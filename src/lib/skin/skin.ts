import type { SkinModel } from "./layout";

export const SKIN_SIZE = 64;

/** A normalized 64x64 RGBA skin. */
export interface SkinPixels {
  data: Uint8ClampedArray;
}

function copyRect(px: Uint8ClampedArray, x: number, y: number, dx: number, dy: number, w: number, h: number, mirrorX: boolean) {
  // Mirrors vanilla's legacy-skin upgrade (64x32 -> 64x64).
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const sx = x + i;
      const sy = y + j;
      const tx = x + dx + (mirrorX ? w - 1 - i : i);
      const ty = y + dy + j;
      const s = (sy * SKIN_SIZE + sx) * 4;
      const t = (ty * SKIN_SIZE + tx) * 4;
      px[t] = px[s];
      px[t + 1] = px[s + 1];
      px[t + 2] = px[s + 2];
      px[t + 3] = px[s + 3];
    }
  }
}

function setOpaque(px: Uint8ClampedArray, x0: number, y0: number, x1: number, y1: number) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) px[(y * SKIN_SIZE + x) * 4 + 3] = 255;
}

function clearIfFullyOpaque(px: Uint8ClampedArray, x0: number, y0: number, x1: number, y1: number) {
  // Old skins painted the hat area solid; the game treats that as "no hat".
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (px[(y * SKIN_SIZE + x) * 4 + 3] < 128) return;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) px[(y * SKIN_SIZE + x) * 4 + 3] = 0;
}

/**
 * Normalize raw image pixels (64x64 or legacy 64x32) the same way the game does:
 * upgrade legacy layouts, force the base layer opaque, apply the hat transparency rule.
 */
export function normalizeSkin(src: Uint8ClampedArray, width: number, height: number): SkinPixels {
  if (width !== 64 || (height !== 64 && height !== 32)) {
    throw new Error(`Skins must be 64×64 or 64×32 pixels. This image is ${width}×${height}.`);
  }
  const px = new Uint8ClampedArray(SKIN_SIZE * SKIN_SIZE * 4);
  px.set(src.subarray(0, width * height * 4));
  const legacy = height === 32;
  if (legacy) {
    copyRect(px, 4, 16, 16, 32, 4, 4, true);
    copyRect(px, 8, 16, 16, 32, 4, 4, true);
    copyRect(px, 0, 20, 24, 32, 4, 12, true);
    copyRect(px, 4, 20, 16, 32, 4, 12, true);
    copyRect(px, 8, 20, 8, 32, 4, 12, true);
    copyRect(px, 12, 20, 16, 32, 4, 12, true);
    copyRect(px, 44, 16, -8, 32, 4, 4, true);
    copyRect(px, 48, 16, -8, 32, 4, 4, true);
    copyRect(px, 40, 20, 0, 32, 4, 12, true);
    copyRect(px, 44, 20, -8, 32, 4, 12, true);
    copyRect(px, 48, 20, -16, 32, 4, 12, true);
    copyRect(px, 52, 20, -8, 32, 4, 12, true);
    clearIfFullyOpaque(px, 32, 0, 64, 32);
  }
  setOpaque(px, 0, 0, 32, 16);
  setOpaque(px, 0, 16, 64, 32);
  setOpaque(px, 16, 48, 48, 64);
  return { data: px };
}

/**
 * Guess the arm model from the pixels. Slim skins leave the outer column of the
 * classic 4px arm empty (x = 54..55 on the right arm's back face).
 */
export function detectModel(raw: Uint8ClampedArray, width: number, height: number): SkinModel {
  if (width !== 64 || height !== 64) return "classic";
  for (let y = 20; y < 32; y++) {
    for (let x = 54; x < 56; x++) {
      if (raw[(y * 64 + x) * 4 + 3] !== 0) return "classic";
    }
  }
  return "slim";
}

export interface LoadedSkin {
  pixels: SkinPixels;
  model: SkinModel;
  dataUrl: string;
}

function imageToRaw(img: CanvasImageSource & { width: number; height: number }) {
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  return { raw: ctx.getImageData(0, 0, img.width, img.height).data, width: img.width, height: img.height, canvas };
}

export function skinToDataUrl(pixels: SkinPixels): string {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SKIN_SIZE;
  const ctx = canvas.getContext("2d")!;
  ctx.putImageData(new ImageData(new Uint8ClampedArray(pixels.data), SKIN_SIZE, SKIN_SIZE), 0, 0);
  return canvas.toDataURL("image/png");
}

export async function loadSkinFromBlob(blob: Blob, forcedModel?: SkinModel): Promise<LoadedSkin> {
  if (blob.type && !blob.type.startsWith("image/")) throw new Error("That file isn't an image. Skins are PNG files.");
  const bitmap = await createImageBitmap(blob).catch(() => {
    throw new Error("This image couldn't be read. Try exporting it as a PNG.");
  });
  const { raw, width, height } = imageToRaw(bitmap);
  bitmap.close();
  const pixels = normalizeSkin(raw, width, height);
  return { pixels, model: forcedModel ?? detectModel(raw, width, height), dataUrl: skinToDataUrl(pixels) };
}

export async function loadSkinFromDataUrl(url: string, model?: SkinModel): Promise<LoadedSkin> {
  const blob = await (await fetch(url)).blob();
  return loadSkinFromBlob(blob, model);
}

const USERNAME = /^[A-Za-z0-9_]{1,16}$/;

export function isValidUsername(name: string) {
  return USERNAME.test(name);
}

/**
 * Fetch a player's current skin. Tries this site's own /api/skin first (talks to
 * Mojang, knows the arm model), then a public CORS-enabled mirror.
 */
export async function loadSkinFromUsername(name: string): Promise<LoadedSkin & { name: string }> {
  if (!isValidUsername(name)) throw new Error("Java usernames are 1–16 letters, numbers or underscores.");
  try {
    const res = await fetch(`/api/skin?name=${encodeURIComponent(name)}`);
    if (res.status === 404) {
      const body = await res.json().catch(() => null);
      if (body && body.error === "not_found") throw new NotFound(name);
      throw new Error("no api");
    }
    if (!res.ok) throw new Error("api error");
    const body = (await res.json()) as { name: string; model: SkinModel; png: string };
    const skin = await loadSkinFromDataUrl(`data:image/png;base64,${body.png}`, body.model);
    return { ...skin, name: body.name };
  } catch (e) {
    if (e instanceof NotFound) throw e;
  }
  const res = await fetch(`https://mc-heads.net/skin/${encodeURIComponent(name)}`, { mode: "cors" }).catch(() => null);
  if (!res || !res.ok) throw new Error(`Couldn't reach the skin servers. Download the skin and drop the PNG here instead.`);
  const skin = await loadSkinFromBlob(await res.blob());
  return { ...skin, name };
}

class NotFound extends Error {
  constructor(name: string) {
    super(`No Java player named “${name}”.`);
  }
}
