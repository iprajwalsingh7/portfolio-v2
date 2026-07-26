/**
 * Copies the exact woff2 files we reference from node_modules into public/fonts.
 *
 * Self-hosting instead of Google Fonts removes two extra connections
 * (fonts.googleapis.com + fonts.gstatic.com) from the critical path and lets us
 * preload the faces by a stable path.
 *
 * Only the latin (and latin-ext, unicode-range gated) subsets ship.
 */

import { copyFile, mkdir, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const dest = resolve(root, 'public/fonts');

const FILES = [
  '@fontsource-variable/archivo/files/archivo-latin-wght-normal.woff2',
  '@fontsource-variable/archivo/files/archivo-latin-ext-wght-normal.woff2',
  '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2',
  '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff2',
];

async function main() {
  await mkdir(dest, { recursive: true });

  let total = 0;
  for (const rel of FILES) {
    const from = resolve(root, 'node_modules', rel);
    const name = rel.split('/').pop();
    await copyFile(from, resolve(dest, name));
    total += (await stat(from)).size;
  }

  console.log(
    `fonts      ${FILES.length} woff2 -> public/fonts ` +
      `(${(total / 1024).toFixed(1)} kB total)`
  );
}

main().catch((err) => {
  console.error('[fonts] failed:', err.message);
  console.error('        run `npm install` first.');
  process.exit(1);
});
