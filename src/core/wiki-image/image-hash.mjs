import fs from 'node:fs';
import { createHash } from 'node:crypto';

export async function sha256File(file) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const input = fs.createReadStream(file);
    input.on('error', reject);
    input.on('data', (chunk) => hash.update(chunk));
    input.on('end', () => resolve(hash.digest('hex')));
  });
}

export async function imageDimensions(file) {
  const handle = await fs.promises.open(file, 'r');
  try {
    const header = Buffer.alloc(32);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    if (bytesRead >= 24 && header.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
      return { width: header.readUInt32BE(16), height: header.readUInt32BE(20), format: 'png' };
    }
    if (bytesRead >= 10 && header[0] === 0xff && header[1] === 0xd8) return jpegDimensions(file);
    return { width: null, height: null, format: 'unknown' };
  } finally {
    await handle.close().catch(() => {});
  }
}

async function jpegDimensions(file) {
  const buf = await fs.promises.readFile(file);
  let offset = 2;
  while (offset < buf.length) {
    if (buf[offset] !== 0xff) break;
    const marker = buf[offset + 1];
    const length = buf.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xc3) {
      return { width: buf.readUInt16BE(offset + 7), height: buf.readUInt16BE(offset + 5), format: 'jpeg' };
    }
    offset += 2 + length;
  }
  return { width: null, height: null, format: 'jpeg' };
}
