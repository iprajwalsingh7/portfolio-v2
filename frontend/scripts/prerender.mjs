/**
 * Build-time prerender.
 *
 * content.json + src/styles/index.css -> index.html
 *
 * Vite then treats that index.html as its entry: it hashes and injects the JS
 * bundle and leaves our inlined <style> alone. The CSS is minified with esbuild
 * (already a Vite dependency, so no extra install) before inlining.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transform } from 'esbuild';
import { renderDocument } from './template.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const repo = resolve(root, '..');

const CONTENT = resolve(root, 'content.json');
const CSS = resolve(root, 'src/styles/index.css');
const OUT = resolve(root, 'index.html');

// The backend serves the same content over /api/content, so it reads the very
// same file. One source of truth, no drift between page and API.
const BACKEND_COPY = resolve(repo, 'backend/src/main/resources/content.json');

async function main() {
  const raw = await readFile(CONTENT, 'utf8');
  const content = JSON.parse(raw);
  const cssSource = await readFile(CSS, 'utf8');

  const { code: css, warnings } = await transform(cssSource, {
    loader: 'css',
    minify: true,
    target: ['chrome111', 'firefox111', 'safari16'],
  });
  for (const w of warnings) console.warn(`[css] ${w.text}`);

  const html = renderDocument({
    content,
    css: css.trim(),
    entry: '/src/main.ts',
  });

  await writeFile(OUT, html, 'utf8');

  // robots.txt and sitemap.xml carry the canonical host, so generate them from
  // the same source rather than leaving two hand-edited files to drift.
  const site = content.meta.siteUrl.replace(/\/$/, '');
  await writeFile(
    resolve(root, 'public/robots.txt'),
    `User-agent: *\nAllow: /\n\nSitemap: ${site}/sitemap.xml\n`,
    'utf8'
  );
  await writeFile(
    resolve(root, 'public/sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${site}/</loc>
    <changefreq>monthly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
`,
    'utf8'
  );

  await mkdir(dirname(BACKEND_COPY), { recursive: true });
  await writeFile(BACKEND_COPY, raw, 'utf8');

  const kb = (n) => `${(n / 1024).toFixed(1)} kB`;
  console.log(
    `prerender  index.html ${kb(Buffer.byteLength(html))}  ` +
      `(css ${kb(Buffer.byteLength(css))} inlined, ` +
      `${content.sections.length} sections)`
  );
}

main().catch((err) => {
  console.error('[prerender] failed:', err);
  process.exit(1);
});
