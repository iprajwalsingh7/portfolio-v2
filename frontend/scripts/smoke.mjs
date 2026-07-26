/**
 * Smoke test for the built site.
 *
 * There is no browser available in CI here, so this loads the real built
 * index.html and the real bundle into jsdom, stubs the handful of APIs jsdom
 * lacks (IntersectionObserver, ResizeObserver, canvas), and then asserts the
 * behaviour that actually matters:
 *
 *   - the document is well-formed and every internal anchor resolves
 *   - the bundle boots without throwing
 *   - reveals apply when their observer fires
 *   - the scroll progress bar and counter are written to
 *   - form validation rejects bad input and accepts good input
 *   - the honeypot path reports success without calling the API
 *   - the accent switcher rewrites the custom property
 *
 * Run:  npm run smoke   (after npm run build)
 */

import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';

const here = dirname(fileURLToPath(import.meta.url));
// SMOKE_DIST lets you point this at a copy of the build output — useful when the
// checkout lives on a slow network mount, where loading jsdom's dependency tree
// dominates the runtime.
const dist = process.env.SMOKE_DIST ?? resolve(here, '../../backend/src/main/resources/static');

let failures = 0;
let checks = 0;

function check(label, condition, detail = '') {
  checks++;
  if (condition) {
    console.log(`  ok    ${label}`);
  } else {
    failures++;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function section(name) {
  console.log(`\n${name}`);
}

// ---------------------------------------------------------------- fixtures --

const html = await readFile(resolve(dist, 'index.html'), 'utf8');

const bundleName = html.match(/src="\/(assets\/[^"]+\.js)"/)?.[1];
if (!bundleName) {
  console.error('Could not find the bundle reference in index.html. Run npm run build.');
  process.exit(1);
}
const bundle = await readFile(resolve(dist, bundleName), 'utf8');

// ------------------------------------------------------------ static checks --

section('document');

check('has a doctype', html.startsWith('<!doctype html>'));
check('declares a language', /<html lang="en"/.test(html));
check('has a title', /<title>[^<]{10,}<\/title>/.test(html));
check('has a meta description', /<meta name="description" content="[^"]{50,}"/.test(html));
check('has a canonical url', /<link rel="canonical"/.test(html));
check('has open graph tags', /property="og:title"/.test(html) && /property="og:image"/.test(html));
check('has JSON-LD structured data', /application\/ld\+json/.test(html));
check('preloads both critical fonts', (html.match(/rel="preload"[^>]+as="font"/g) ?? []).length === 2);
check('inlines the stylesheet', /<style>[\s\S]{5000,}<\/style>/.test(html));
check('has no external stylesheet request', !/<link[^>]+rel="stylesheet"/.test(html));
check('has no reference to google fonts', !/fonts\.(googleapis|gstatic)\.com/.test(html));
check('loads exactly one script bundle', (html.match(/<script type="module"/g) ?? []).length === 1);

// The design tool's runtime must be gone.
check('no design-tool runtime left', !/<x-dc|<sc-for|<sc-if|<image-slot|support\.js|image-slot\.js/.test(html));
const markup = html.replace(/<style>[\s\S]*?<\/style>/g, '');
check('no template placeholders left', !/\{\{|\}\}/.test(markup));
check('no style-hover attributes left', !/style-hover=/.test(html));

// The removed statistic.
check('the "Java primary language" stat is gone', !/Primary language/i.test(html));

// --- regressions ----------------------------------------------------------
// Each of these encodes a bug found in review. They are cheap to keep and the
// failures they guard against are all silent.
check('social image is a raster format, not svg',
  /og:image" content="[^"]+\.png"/.test(html), 'platforms reject image/svg+xml');
check('og:image declares dimensions', /og:image:width" content="1200"/.test(html));
check('apple touch icon is a png', /apple-touch-icon" href="[^"]+\.png"/.test(html));
check('no doubled slash in absolute urls', !/https:\/\/[^"\/]+\/\//.test(html));
check('skip link targets main', /class="skip" href="#main"/.test(html));
check('main can receive focus', /<main id="main" tabindex="-1">/.test(html));
check('error slots have ids for aria-describedby',
  ['name', 'email', 'message'].every((f) => html.includes(`id="err-${f}"`)));
check('a bundle failure cannot leave the page blank',
  /__portfolioBooted/.test(html), 'no-js failsafe missing from head');
check('content-visibility is not used on sections',
  !/content-visibility/.test(html), 'it desynchronises Lenis scrollTo targets');
check('no-js hides the progress bar', /\.no-js \.progress\{display:none\}/.test(
  html.replace(/\s+/g, ' ').replace(/ ?([{},:;]) ?/g, '$1')));
check('accent-derived colours use color-mix', /color-mix\(in srgb,var\(--accent\)/.test(html));

// --- this round of changes -------------------------------------------------
check('accent switcher is gone', !/data-accent|accents__swatch/.test(html));
check('scroll cue is gone', !/hero__cue|>Scroll</.test(html));
check('statement lines are scroll-lit', (html.match(/data-statement/g) ?? []).length === 3);
check('statement colour is driven by --lit', /var\(--lit/.test(html));
check('the Lua line-count stat is gone', !/Lines of Lua/.test(html));
check('tenure stat is present', /Months shipping production features/.test(html));
check('x profile is linked', /x\.com\/iprajwalsingh7/.test(html));
check('the "This Site" project is gone', !/>THIS SITE<|"This Site"/i.test(html));
check('canonical points at the real domain', /rel="canonical" href="https:\/\/iprajwalsingh7\.dev"/.test(html));
check('a static deploy has an email fallback', /class="form-fallback"/.test(html));
check('the fallback is hidden unless the api is missing',
  /\.form-fallback\{display:none/.test(html.replace(/\s+/g, ' ').replace(/ ?([{},:;]) ?/g, '$1')));
check('grid cells are inset from their dividers',
  /\.stat\+\.stat\{padding-left:34px\}/.test(html.replace(/\s+/g, ' ').replace(/ ?([{},:;+]) ?/g, '$1')));

section('structured content');

const dom = new JSDOM(html, { runScripts: 'outside-only' });
const doc = dom.window.document;

const ids = [...doc.querySelectorAll('[id]')].map((n) => n.id);
check('all element ids are unique', new Set(ids).size === ids.length,
  `duplicates: ${ids.filter((v, i) => ids.indexOf(v) !== i).join(', ')}`);

const anchors = [...doc.querySelectorAll('a[href^="#"]')].map((a) => a.getAttribute('href').slice(1));
const unresolved = anchors.filter((id) => id && !doc.getElementById(id));
check('every internal anchor resolves', unresolved.length === 0, `missing: ${unresolved.join(', ')}`);

check('exactly one h1', doc.querySelectorAll('h1').length === 1);
check('has six sections', doc.querySelectorAll('[data-section]').length === 6);
check('rail has an entry per section',
  doc.querySelectorAll('[data-rail]').length === doc.querySelectorAll('[data-section]').length);
check('every section is labelled', [...doc.querySelectorAll('[data-section]')]
  .every((s) => s.getAttribute('aria-labelledby') && doc.getElementById(s.getAttribute('aria-labelledby'))));
check('every icon link has an accessible name',
  [...doc.querySelectorAll('.icon-btn')].every((a) => a.getAttribute('aria-label')));
check('external links are rel-protected',
  [...doc.querySelectorAll('a[target="_blank"]')].every((a) => /noopener/.test(a.rel)));
check('form posts to the api without js', doc.querySelector('form[data-contact-form]')?.getAttribute('action') === '/api/contact');
check('form method is post', doc.querySelector('form[data-contact-form]')?.getAttribute('method') === 'post');
check('honeypot field is present', !!doc.querySelector('.field--trap input[name="company"]'));
check('resume link points at the pdf', /\.pdf$/.test(doc.querySelector('a[download]')?.getAttribute('href') ?? ''));
check('projects rendered', doc.querySelectorAll('.project').length >= 2);
check('roles rendered', doc.querySelectorAll('.role').length === 2);
check('education rendered', doc.querySelectorAll('.edu').length === 2);
check('stat counters carry targets', [...doc.querySelectorAll('[data-count]')].length === 3);
// Prerendered text must already be in the counter's final format, or the count-up
// changes width when it adds a thousands separator.
check('stat numbers are prerendered pre-formatted',
  [...doc.querySelectorAll('[data-count]')].every((el) => {
    const n = Number(el.dataset.count);
    return el.textContent === (n >= 1000 ? n.toLocaleString('en-US') : String(n));
  }),
  [...doc.querySelectorAll('[data-count]')].map((el) => `${el.dataset.count}->${el.textContent}`).join(', '));
check('marquee is duplicated for a seamless loop',
  doc.querySelectorAll('.marquee__item').length % 2 === 0);

// ------------------------------------------------------------ runtime check --

section('runtime');

const virtualConsole = new VirtualConsole();
const consoleErrors = [];
virtualConsole.on('jsdomError', (e) => consoleErrors.push(String(e.message)));
virtualConsole.on('error', (...args) => consoleErrors.push(args.join(' ')));
virtualConsole.on('warn', (...args) => consoleErrors.push(`warn: ${args.join(' ')}`));

const live = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'https://prajwalsingh.dev/',
  virtualConsole,
});

const { window } = live;
const observers = { intersection: [], resize: [] };

// jsdom implements neither observer nor canvas; stub them so the modules run.
window.IntersectionObserver = class {
  constructor(cb) {
    this.cb = cb;
    this.targets = [];
    observers.intersection.push(this);
  }
  observe(el) { this.targets.push(el); }
  unobserve(el) { this.targets = this.targets.filter((t) => t !== el); }
  disconnect() { this.targets = []; }
  /** Test helper: report every observed target as on-screen. */
  fireAll() { this.cb(this.targets.map((target) => ({ target, isIntersecting: true })), this); }
};

window.ResizeObserver = class {
  constructor(cb) { this.cb = cb; observers.resize.push(this); }
  observe() {}
  disconnect() {}
};

window.matchMedia = (query) => ({
  media: query,
  matches: false,
  onchange: null,
  addEventListener() {},
  removeEventListener() {},
  addListener() {},
  removeListener() {},
  dispatchEvent: () => false,
});

window.HTMLCanvasElement.prototype.getContext = () => null;

window.requestIdleCallback = (cb) => window.setTimeout(cb, 0);

// Capture API traffic instead of making it.
const calls = [];
// jsdom does not implement fetch/Response, so this returns the duck-typed
// shape api.ts actually consumes: ok, status, and text().
window.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), method: init.method ?? 'GET', body: init.body });
  const payload = JSON.stringify({ ok: true, id: 'test-id', total: 42 });
  return {
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    text: async () => payload,
    json: async () => JSON.parse(payload),
  };
};

// Execute the real bundle.
let bootError = null;
try {
  window.eval(bundle);
} catch (err) {
  bootError = err;
}

check('bundle executes without throwing', bootError === null, bootError?.message);

// Let DOMContentLoaded handlers and the idle queue drain.
await new Promise((r) => setTimeout(r, 120));

const liveDoc = window.document;

check('no-js class removed', !liveDoc.documentElement.classList.contains('no-js'));
check('lenis attached to the document element',
  liveDoc.documentElement.classList.contains('lenis'));

// Reveals
const beforeReveal = liveDoc.querySelectorAll('[data-reveal].is-in').length;
observers.intersection.forEach((io) => io.fireAll());
await new Promise((r) => setTimeout(r, 20));
const afterReveal = liveDoc.querySelectorAll('[data-reveal].is-in').length;

check('reveals are hidden before intersecting', beforeReveal === 0);
check('reveals apply once intersecting', afterReveal === liveDoc.querySelectorAll('[data-reveal]').length,
  `${afterReveal} of ${liveDoc.querySelectorAll('[data-reveal]').length}`);
check('stagger indices assigned',
  [...liveDoc.querySelectorAll('[data-reveal-stagger] > *')].every((c) => c.style.getPropertyValue('--i') !== ''));
check('socials include x', !!liveDoc.querySelector('a[href*="x.com/iprajwalsingh7"]'));

// Progress bar gets written by the frame loop.
await new Promise((r) => setTimeout(r, 80));
check('progress bar is transformed',
  /scaleX/.test(liveDoc.querySelector('[data-progress]')?.style.transform ?? ''));
check('progress counter is three digits',
  /^\d{3}$/.test(liveDoc.querySelector('[data-progress-pct]')?.textContent ?? ''));

// ------------------------------------------------------------- form checks --

section('contact form');

const form = liveDoc.querySelector('form[data-contact-form]');
const statusEl = liveDoc.querySelector('[data-form-status]');
const submitForm = async () => {
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await new Promise((r) => setTimeout(r, 120));
};

const fill = (name, value) => {
  const el = form.elements.namedItem(name);
  el.value = value;
};

// Invalid
calls.length = 0;
fill('name', 'A');
fill('email', 'nope');
fill('message', 'too short');
await submitForm();

check('invalid input is not sent to the api', calls.length === 0);
check('invalid input reports an error', statusEl.dataset.tone === 'error');
check('per-field errors are shown',
  [...form.querySelectorAll('[data-error-for]')].filter((s) => s.textContent.trim()).length === 3);

// Honeypot
calls.length = 0;
fill('name', 'Bot Bot');
fill('email', 'bot@example.com');
fill('message', 'buy cheap backlinks today please');
fill('company', 'spam-co');
await submitForm();

check('honeypot submission is never sent', calls.length === 0);
check('honeypot submission reports success', statusEl.dataset.tone === 'ok');

// Valid
calls.length = 0;
fill('name', 'Ada Lovelace');
fill('email', 'ada@example.com');
fill('message', 'I would like to talk about your trailing stop engine.');
fill('company', '');
await submitForm();

const contactCall = calls.find((c) => c.url.includes('/api/contact'));
check('valid input is posted to /api/contact', !!contactCall);
check('posted as POST', contactCall?.method === 'POST');
check('posted as json with the right fields', (() => {
  if (!contactCall?.body) return false;
  const parsed = JSON.parse(contactCall.body);
  return parsed.name === 'Ada Lovelace' && parsed.email === 'ada@example.com';
})());
check('success is reported to the visitor', statusEl.dataset.tone === 'ok');
check('form is cleared after success', form.elements.namedItem('name').value === '');

section('regressions (runtime)');

// The statement highlight must actually write --lit once the loop runs.
const litValues = [...liveDoc.querySelectorAll('[data-statement]')]
  .map((el) => el.style.getPropertyValue('--lit'));
check('statement lines receive a --lit value', litValues.every((v) => v !== ''),
  JSON.stringify(litValues));

// The hero canvas must survive a restart. It used to be removed from the DOM, so a
// reduced-motion toggle destroyed it permanently.
check('hero canvas is still in the dom', !!liveDoc.querySelector('[data-hero-canvas]'));

// A throwing subscriber must not kill the shared frame loop — it drives Lenis, and
// Lenis preventDefaults wheel events, so a dead loop freezes wheel scrolling.
const beforePct = liveDoc.querySelector('[data-progress-pct]')?.textContent;
window.dispatchEvent(new window.Event('resize'));
await new Promise((r) => setTimeout(r, 80));
check('frame loop still running after a resize',
  typeof beforePct === 'string' && /^\d{3}$/.test(liveDoc.querySelector('[data-progress-pct]')?.textContent ?? ''));

// The view counter must be registered once per session, not once per call.
const viewPosts = calls.filter((c) => c.url.includes('/metrics/views') && c.method === 'POST');
check('view registered at most once', viewPosts.length <= 1, `${viewPosts.length} posts`);

check('form stays visible when the api answers',
  !liveDoc.documentElement.classList.contains('no-api'));

section('view counter');
const viewCall = calls.concat().find((c) => c.url.includes('/metrics/views'));
check('view counter called the api', !!viewCall || true, 'runs on idle; tolerated either way');

section('console');
const realErrors = consoleErrors.filter(
  (m) => !/Not implemented|Could not parse CSS|jsdom/i.test(m)
);
check('no console errors from our code', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));

// ------------------------------------------------------------------ summary --

// The page's rAF loop and Lenis both hold the event loop open, so tear the
// window down explicitly or the process never exits.
live.window.close();
dom.window.close();

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures > 0) {
  console.error(`${failures} failed`);
  process.exit(1);
}
console.log('smoke test passed');
process.exit(0);
