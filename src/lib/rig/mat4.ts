// Minimal row-major 4x4 affine matrices. Small, allocation-light, worker-safe.

export type Mat4 = Float64Array;

export function identity(): Mat4 {
  const m = new Float64Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

export function multiply(a: Mat4, b: Mat4): Mat4 {
  const o = new Float64Array(16);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      o[r * 4 + c] = a[r * 4] * b[c] + a[r * 4 + 1] * b[4 + c] + a[r * 4 + 2] * b[8 + c] + a[r * 4 + 3] * b[12 + c];
    }
  }
  return o;
}

export function chain(...ms: Mat4[]): Mat4 {
  return ms.reduce((acc, m) => multiply(acc, m), identity());
}

export function translation(x: number, y: number, z: number): Mat4 {
  const m = identity();
  m[3] = x;
  m[7] = y;
  m[11] = z;
  return m;
}

export function scaling(x: number, y: number, z: number): Mat4 {
  const m = identity();
  m[0] = x;
  m[5] = y;
  m[10] = z;
  return m;
}

const RAD = Math.PI / 180;

export function rotX(deg: number): Mat4 {
  const c = Math.cos(deg * RAD);
  const s = Math.sin(deg * RAD);
  const m = identity();
  m[5] = c;
  m[6] = -s;
  m[9] = s;
  m[10] = c;
  return m;
}

export function rotY(deg: number): Mat4 {
  const c = Math.cos(deg * RAD);
  const s = Math.sin(deg * RAD);
  const m = identity();
  m[0] = c;
  m[2] = s;
  m[8] = -s;
  m[10] = c;
  return m;
}

export function rotZ(deg: number): Mat4 {
  const c = Math.cos(deg * RAD);
  const s = Math.sin(deg * RAD);
  const m = identity();
  m[0] = c;
  m[1] = -s;
  m[4] = s;
  m[5] = c;
  return m;
}

/** Rotate around a pivot point. */
export function around(pivot: readonly number[], r: Mat4): Mat4 {
  return chain(translation(pivot[0], pivot[1], pivot[2]), r, translation(-pivot[0], -pivot[1], -pivot[2]));
}

/** Inverse of an affine matrix whose 3x3 part is rotation * uniform scale. */
export function invertAffine(m: Mat4): Mat4 {
  // General 3x3 inverse keeps this correct for any non-singular linear part.
  const a = m[0], b = m[1], c = m[2];
  const d = m[4], e = m[5], f = m[6];
  const g = m[8], h = m[9], i = m[10];
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  const inv = 1 / det;
  const o = identity();
  o[0] = A * inv;
  o[1] = -(b * i - c * h) * inv;
  o[2] = (b * f - c * e) * inv;
  o[4] = B * inv;
  o[5] = (a * i - c * g) * inv;
  o[6] = -(a * f - c * d) * inv;
  o[8] = C * inv;
  o[9] = -(a * h - b * g) * inv;
  o[10] = (a * e - b * d) * inv;
  const tx = m[3], ty = m[7], tz = m[11];
  o[3] = -(o[0] * tx + o[1] * ty + o[2] * tz);
  o[7] = -(o[4] * tx + o[5] * ty + o[6] * tz);
  o[11] = -(o[8] * tx + o[9] * ty + o[10] * tz);
  return o;
}

export function apply(m: Mat4, x: number, y: number, z: number, out: number[] | Float64Array): void {
  out[0] = m[0] * x + m[1] * y + m[2] * z + m[3];
  out[1] = m[4] * x + m[5] * y + m[6] * z + m[7];
  out[2] = m[8] * x + m[9] * y + m[10] * z + m[11];
}
