// Renders public/favicon.svg into PNG icons. Run: node scripts/gen-icons.mjs
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const svg = await readFile(new URL('../public/favicon.svg', import.meta.url));
for (const size of [192, 512]) {
  const out = fileURLToPath(new URL(`../public/icon-${size}.png`, import.meta.url));
  await sharp(svg, { density: 384 }).resize(size, size).png().toFile(out);
  console.log(`wrote icon-${size}.png`);
}
