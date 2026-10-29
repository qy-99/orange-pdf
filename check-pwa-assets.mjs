import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dist = join(process.cwd(), 'dist');
const requiredFiles = [
  'index.html',
  'manifest.webmanifest',
  'sw.js',
  'pdf.worker.min.mjs',
  'pwa-192x192.png',
  'pwa-512x512.png',
];
const missing = requiredFiles.filter((file) => !existsSync(join(dist, file)));
if (missing.length) {
  console.error(`PWA verification failed. Missing dist assets: ${missing.join(', ')}`);
  process.exitCode = 1;
} else {
  const manifest = JSON.parse(readFileSync(join(dist, 'manifest.webmanifest'), 'utf8'));
  if (manifest.display !== 'standalone') {
    console.error(`PWA verification failed. Expected manifest display="standalone", found "${manifest.display}".`);
    process.exitCode = 1;
  }
  const serviceWorker = readFileSync(join(dist, 'sw.js'), 'utf8');
  if (!serviceWorker.includes('pdf.worker.min.mjs')) {
    console.error('PWA verification failed. The PDF.js worker is not listed in the generated service worker. Offline PDF tools may fail.');
    process.exitCode = 1;
  }
  if (!process.exitCode) {
    console.log('PWA asset check passed: manifest, icons, service worker and offline PDF.js worker are present.');
  }
}
