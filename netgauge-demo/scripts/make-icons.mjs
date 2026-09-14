import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

/**
 * Generates the app icon set from a single SVG so the logo can never drift from
 * the marketing mark. Writes:
 *   apps/desktop/build-resources/icon.ico  (multi-size, PNG-compressed)
 *   apps/desktop/build-resources/icon.png  (512)
 *   apps/web/public/app-icon.png           (512)
 */
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0b1526"/>
      <stop offset="100%" stop-color="#05070d"/>
    </linearGradient>
    <linearGradient id="g" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0%" stop-color="#22d3ee"/>
      <stop offset="100%" stop-color="#a78bfa"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#bg)"/>
  <rect x="6" y="6" width="500" height="500" rx="108" fill="none" stroke="rgba(255,255,255,0.10)" stroke-width="8"/>
  <path d="M96 344a160 160 0 0 1 320 0" fill="none" stroke="url(#g)" stroke-width="34" stroke-linecap="round"/>
  <path d="M256 344 356 190" stroke="url(#g)" stroke-width="34" stroke-linecap="round"/>
  <circle cx="256" cy="344" r="30" fill="#eaf0ff"/>
</svg>`;

const ICON_SIZES = [16, 24, 32, 48, 64, 128, 256];

function buildIco(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(pngs.length, 4);

  const entries = [];
  let offset = 6 + 16 * pngs.length;
  for (const { size, data } of pngs) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // 0 means 256
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2); // palette
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += data.length;
  }

  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)]);
}

const root = new URL('..', import.meta.url);
const outDir = new URL('apps/desktop/build-resources/', root);
const webDir = new URL('apps/web/public/', root);

await mkdir(outDir, { recursive: true });
await mkdir(webDir, { recursive: true });

const pngs = [];
for (const size of ICON_SIZES) {
  const data = await sharp(Buffer.from(SVG)).resize(size, size).png().toBuffer();
  pngs.push({ size, data });
}

await writeFile(new URL('icon.ico', outDir), buildIco(pngs));
await writeFile(new URL('icon.png', outDir), await sharp(Buffer.from(SVG)).resize(512, 512).png().toBuffer());
await writeFile(new URL('app-icon.png', webDir), await sharp(Buffer.from(SVG)).resize(512, 512).png().toBuffer());

console.log(`[netgauge] wrote icon.ico (${ICON_SIZES.join(', ')} px), icon.png, app-icon.png`);
