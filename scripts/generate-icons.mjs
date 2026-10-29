import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const svgBuffer = readFileSync(join(process.cwd(), 'public', 'icon.svg'));

async function generate() {
  console.log('Generating minimalist PWA icons from public/icon.svg...');

  // 192x192 standard icon
  await sharp(svgBuffer)
    .resize(192, 192)
    .png()
    .toFile(join(process.cwd(), 'public', 'pwa-192x192.png'));
  console.log('Generated public/pwa-192x192.png');

  // 512x512 standard icon
  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(join(process.cwd(), 'public', 'pwa-512x512.png'));
  console.log('Generated public/pwa-512x512.png');

  // 512x512 maskable icon with safe zone padding
  await sharp(svgBuffer)
    .resize(410, 410)
    .extend({
      top: 51,
      bottom: 51,
      left: 51,
      right: 51,
      background: { r: 13, g: 17, b: 26, alpha: 1 },
    })
    .png()
    .toFile(join(process.cwd(), 'public', 'pwa-maskable-512x512.png'));
  console.log('Generated public/pwa-maskable-512x512.png');

  // Apple touch icon (180x180)
  await sharp(svgBuffer)
    .resize(180, 180)
    .png()
    .toFile(join(process.cwd(), 'public', 'apple-touch-icon.png'));
  console.log('Generated public/apple-touch-icon.png');

  console.log('All icons generated successfully!');
}

generate().catch((err) => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
