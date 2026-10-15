// Test-only NBT reader, independent of the writer, used for round-trip checks.
export type Value = number | bigint | string | Uint8Array | Int32Array | bigint[] | Value[] | { [k: string]: Value };

export function readNbt(bytes: Uint8Array): { name: string; value: Record<string, Value> } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p = 0;
  const u8 = () => view.getUint8(p++);
  const str = () => {
    const len = view.getUint16(p);
    p += 2;
    const s = new TextDecoder().decode(bytes.subarray(p, p + len));
    p += len;
    return s;
  };
  const payload = (t: number): Value => {
    switch (t) {
      case 1: { const v = view.getInt8(p); p += 1; return v; }
      case 2: { const v = view.getInt16(p); p += 2; return v; }
      case 3: { const v = view.getInt32(p); p += 4; return v; }
      case 4: { const v = view.getBigInt64(p); p += 8; return v; }
      case 7: { const n = view.getInt32(p); p += 4; const v = bytes.slice(p, p + n); p += n; return v; }
      case 8: return str();
      case 9: {
        const of = u8();
        const n = view.getInt32(p);
        p += 4;
        const out: Value[] = [];
        for (let i = 0; i < n; i++) out.push(payload(of));
        return out;
      }
      case 10: {
        const o: Record<string, Value> = {};
        for (;;) {
          const ct = u8();
          if (ct === 0) return o;
          const name = str();
          o[name] = payload(ct);
        }
      }
      case 11: {
        const n = view.getInt32(p);
        p += 4;
        const v = new Int32Array(n);
        for (let i = 0; i < n; i++) { v[i] = view.getInt32(p); p += 4; }
        return v;
      }
      case 12: {
        const n = view.getInt32(p);
        p += 4;
        const v: bigint[] = [];
        for (let i = 0; i < n; i++) { v.push(view.getBigInt64(p)); p += 8; }
        return v;
      }
    }
    throw new Error("bad tag " + t);
  };
  if (u8() !== 10) throw new Error("root not compound");
  const name = str();
  return { name, value: payload(10) as Record<string, Value> };
}

/** Port of Litematica's LitematicaBitArray.getAt using 64-bit longs. */
export function litematicaGetAt(longs: bigint[], bits: number, index: number): number {
  const max = (1n << BigInt(bits)) - 1n;
  const start = BigInt(index) * BigInt(bits);
  const startArr = Number(start >> 6n);
  const endArr = Number(((BigInt(index) + 1n) * BigInt(bits) - 1n) >> 6n);
  const off = start & 63n;
  const u = (x: bigint) => BigInt.asUintN(64, x);
  if (startArr === endArr) return Number((u(longs[startArr]) >> off) & max);
  const endOff = 64n - off;
  return Number(((u(longs[startArr]) >> off) | u(longs[endArr] << endOff)) & max);
}
