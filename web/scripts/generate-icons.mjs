import sharp from 'sharp';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const workspaceRoot = dirname(root);
const iconSource = '/Users/mac/Desktop/Untitled.icon/Assets/cross 3.png';
const androidRes = join(root, 'android/app/src/main/res');

const backgroundSvg = Buffer.from(`
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#FFD0D2"/>
      <stop offset="1" stop-color="#F4AEB5"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" rx="220" fill="url(#bg)"/>
</svg>`);

const cross = await sharp(iconSource).resize(338, 338, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
const icon1024 = await sharp(backgroundSvg).composite([{ input: cross, gravity: 'center' }]).png().toBuffer();

await sharp(icon1024).resize(512, 512).png().toFile(join(root, 'public/app-icon.png'));
await sharp(icon1024).resize(64, 64).png().toFile(join(root, 'public/favicon.png'));

const androidSizes = [
  ['mdpi', 48],
  ['hdpi', 72],
  ['xhdpi', 96],
  ['xxhdpi', 144],
  ['xxxhdpi', 192],
];

for (const [density, size] of androidSizes) {
  const dir = join(androidRes, `mipmap-${density}`);
  const icon = await sharp(icon1024).resize(size, size).png().toBuffer();
  const mask = Buffer.from(`<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="white"/></svg>`);
  const round = await sharp(icon).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  await sharp(icon).toFile(join(dir, 'ic_launcher.png'));
  await sharp(round).toFile(join(dir, 'ic_launcher_round.png'));

  const foregroundSize = Math.round(size * 2.25);
  const foregroundCross = await sharp(iconSource).resize(Math.round(foregroundSize * 0.36), Math.round(foregroundSize * 0.36), { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  const foreground = await sharp({ create: { width: foregroundSize, height: foregroundSize, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: foregroundCross, gravity: 'center' }])
    .png()
    .toBuffer();
  await sharp(foreground).toFile(join(dir, 'ic_launcher_foreground.png'));
}

console.log(`generated icons from ${iconSource} in ${workspaceRoot}`);
