// Minimal ZIP builder (STORE — no compression) for browser use.
// Produces a valid .zip Blob without any external dependencies.

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(dv: DataView, off: number, v: number) { dv.setUint16(off, v, true); }
function u32(dv: DataView, off: number, v: number) { dv.setUint32(off, v, true); }

export function buildZip(files: { name: string; content: string }[]): Blob {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const entries: { nameBytes: Uint8Array; dataBytes: Uint8Array; localOffset: number }[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = enc.encode(file.name);
    const dataBytes = enc.encode(file.content);
    const crc = crc32(dataBytes);
    const localOffset = offset;

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    u32(lv,  0, 0x04034b50); // local file header sig
    u16(lv,  4, 20);          // version needed
    u16(lv,  6, 0);           // flags
    u16(lv,  8, 0);           // compression: STORE
    u16(lv, 10, 0);           // mod time
    u16(lv, 12, 0);           // mod date
    u32(lv, 14, crc);         // CRC-32
    u32(lv, 18, dataBytes.length); // compressed size
    u32(lv, 22, dataBytes.length); // uncompressed size
    u16(lv, 26, nameBytes.length); // filename length
    u16(lv, 28, 0);           // extra field length
    localHeader.set(nameBytes, 30);

    parts.push(localHeader, dataBytes);
    entries.push({ nameBytes, dataBytes, localOffset });
    offset += localHeader.length + dataBytes.length;
  }

  const cdStart = offset;
  for (const e of entries) {
    const crc = crc32(e.dataBytes);
    const cd = new Uint8Array(46 + e.nameBytes.length);
    const cv = new DataView(cd.buffer);
    u32(cv,  0, 0x02014b50); // central dir sig
    u16(cv,  4, 20);          // version made by
    u16(cv,  6, 20);          // version needed
    u16(cv,  8, 0);           // flags
    u16(cv, 10, 0);           // compression
    u16(cv, 12, 0);           // mod time
    u16(cv, 14, 0);           // mod date
    u32(cv, 16, crc);         // CRC-32
    u32(cv, 20, e.dataBytes.length); // compressed size
    u32(cv, 24, e.dataBytes.length); // uncompressed size
    u16(cv, 28, e.nameBytes.length); // filename length
    u16(cv, 30, 0);           // extra length
    u16(cv, 32, 0);           // comment length
    u16(cv, 34, 0);           // disk number start
    u16(cv, 36, 0);           // internal attrs
    u32(cv, 38, 0);           // external attrs
    u32(cv, 42, e.localOffset); // local header offset
    cd.set(e.nameBytes, 46);
    parts.push(cd);
    offset += cd.length;
  }

  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  u32(ev,  0, 0x06054b50);       // end of central dir sig
  u16(ev,  4, 0);                 // disk number
  u16(ev,  6, 0);                 // disk with cd
  u16(ev,  8, entries.length);    // entries on this disk
  u16(ev, 10, entries.length);    // total entries
  u32(ev, 12, offset - cdStart);  // cd size
  u32(ev, 16, cdStart);           // cd offset
  u16(ev, 20, 0);                 // comment length
  parts.push(eocd);

  return new Blob(parts as BlobPart[], { type: 'application/zip' });
}
