// The icons a phone uses when the site is added to its home screen (Safari "Add to Home Screen",
// Chrome "Install app"), drawn from public/icon.svg. The square has no rounded corners of its own:
// iOS and Android round them. Run by hand when the icon changes: node scripts/web-icons.mjs
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const svg = readFileSync(join(PUBLIC, 'icon.svg'), 'utf8').replace('rx="116" ', '');
if (svg.includes('rx="116"')) throw new Error('icon.svg changed: the corner radius was not found');

for (const [name, size] of [
  ['apple-touch-icon.png', 180],
  ['icon-192.png', 192],
  ['icon-512.png', 512],
]) {
  await sharp(Buffer.from(svg), { density: (72 * size) / 512 * 2 })
    .resize(size, size)
    .flatten({ background: '#0B1026' })
    .png()
    .toFile(join(PUBLIC, name));
  console.log(`${name}: ${size}×${size}`);
}
