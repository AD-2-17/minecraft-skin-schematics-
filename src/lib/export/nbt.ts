// Minimal binary NBT writer (big-endian, Java edition).

export type Tag =
  | { t: 1; v: number } // byte
  | { t: 2; v: number } // short
  | { t: 3; v: number } // int
  | { t: 4; v: bigint } // long
  | { t: 7; v: Uint8Array } // byte array
  | { t: 8; v: string } // string
  | { t: 9; of: number; v: Tag[] } // list
  | { t: 10; v: Record<string, Tag> } // compound
  | { t: 11; v: Int32Array } // int array
  | { t: 12; v: Uint32Array }; // long array as little-endian 32-bit words: long i = words[2i] | words[2i+1] << 32

export const byte = (v: number): Tag => ({ t: 1, v });
export const short = (v: number): Tag => ({ t: 2, v });
export const int = (v: number): Tag => ({ t: 3, v });
export const long = (v: bigint | number): Tag => ({ t: 4, v: BigInt(v) });
export const byteArray = (v: Uint8Array): Tag => ({ t: 7, v });
export const string = (v: string): Tag => ({ t: 8, v });
export const list = (of: number, v: Tag[]): Tag => ({ t: 9, of, v });
export const compound = (v: Record<string, Tag>): Tag => ({ t: 10, v });
export const intArray = (v: Int32Array): Tag => ({ t: 11, v });
export const longArrayWords = (v: Uint32Array): Tag => ({ t: 12, v });

export const TAG_COMPOUND = 10;

class Writer {
  private buf = new Uint8Array(1 << 16);
  private view = new DataView(this.buf.buffer);
  pos = 0;

  private ensure(n: number) {
    if (this.pos + n <= this.buf.length) return;
    let size = this.buf.length * 2;
    while (size < this.pos + n) size *= 2;
    const next = new Uint8Array(size);
    next.set(this.buf.subarray(0, this.pos));
    this.buf = next;
    this.view = new DataView(next.buffer);
  }
  u8(v: number) {
    this.ensure(1);
    this.view.setInt8(this.pos, v);
    this.pos += 1;
  }
  i16(v: number) {
    this.ensure(2);
    this.view.setInt16(this.pos, v);
    this.pos += 2;
  }
  u16(v: number) {
    this.ensure(2);
    this.view.setUint16(this.pos, v);
    this.pos += 2;
  }
  i32(v: number) {
    this.ensure(4);
    this.view.setInt32(this.pos, v);
    this.pos += 4;
  }
  u32(v: number) {
    this.ensure(4);
    this.view.setUint32(this.pos, v);
    this.pos += 4;
  }
  i64(v: bigint) {
    this.ensure(8);
    this.view.setBigInt64(this.pos, v);
    this.pos += 8;
  }
  bytes(b: Uint8Array) {
    this.ensure(b.length);
    this.buf.set(b, this.pos);
    this.pos += b.length;
  }
  str(s: string) {
    const b = modifiedUtf8(s);
    if (b.length > 65535) throw new Error("NBT string too long");
    this.u16(b.length);
    this.bytes(b);
  }
  result() {
    return this.buf.slice(0, this.pos);
  }
}

/** Java's "modified UTF-8": no raw NUL, supplementary chars as surrogate pairs. */
function modifiedUtf8(s: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c !== 0 && c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return new Uint8Array(out);
}

function payload(w: Writer, tag: Tag) {
  switch (tag.t) {
    case 1:
      return w.u8(tag.v);
    case 2:
      return w.i16(tag.v);
    case 3:
      return w.i32(tag.v);
    case 4:
      return w.i64(tag.v);
    case 7:
      w.i32(tag.v.length);
      return w.bytes(tag.v);
    case 8:
      return w.str(tag.v);
    case 9:
      w.u8(tag.of);
      w.i32(tag.v.length);
      for (const item of tag.v) {
        if (item.t !== tag.of) throw new Error("NBT list element type mismatch");
        payload(w, item);
      }
      return;
    case 10:
      for (const [name, child] of Object.entries(tag.v)) {
        w.u8(child.t);
        w.str(name);
        payload(w, child);
      }
      return w.u8(0);
    case 11:
      w.i32(tag.v.length);
      for (let i = 0; i < tag.v.length; i++) w.i32(tag.v[i]);
      return;
    case 12: {
      const n = tag.v.length >> 1;
      w.i32(n);
      for (let i = 0; i < n; i++) {
        w.u32(tag.v[2 * i + 1]);
        w.u32(tag.v[2 * i]);
      }
      return;
    }
  }
}

/** Serialize a named root compound (uncompressed). */
export function writeNbt(rootName: string, root: Tag): Uint8Array {
  if (root.t !== 10) throw new Error("NBT root must be a compound");
  const w = new Writer();
  w.u8(10);
  w.str(rootName);
  payload(w, root);
  return w.result();
}
