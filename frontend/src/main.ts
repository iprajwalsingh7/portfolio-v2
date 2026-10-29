/**
 * Entry point.
 *
 * The page is already painted by the time this runs — markup and the whole
 * stylesheet are inlined into index.html at build time (scripts/prerender.mjs),
 * which is why no CSS is imported here. Everything below is enhancement,
 * ordered by how soon the visitor can notice it:
 *
 *   1. scroll    — Lenis + progress + section rail
 *   2. statement — scroll-driven highlight, needs the ticker running
 *   3. reveal    — IntersectionObserver reveals and stat counters
 *   4. marquee   — pause when offscreen
 *   5. contact   — form interception
 *   6. views     — network call, deferred to idle
 *
 * Each initialiser is independent and individually guarded, so one failing
 * never takes the rest of the page with it.
 */

import { initSculpture } from './modules/sculpture';
import { initScroll } from './modules/scroll';
import { initStatement } from './modules/statement';
import { initReveal } from './modules/reveal';
import { initMarquee } from './modules/marquee';
import { initContact } from './modules/contact';
import { initViews } from './modules/views';
import { probeApi } from './modules/api-probe';
import { whenIdle, prefersReducedMotion } from './env';

type Teardown = () => void;

let teardowns: Teardown[] = [];

function safely(label: string, fn: () => Teardown | void): void {
  try {
    const off = fn();
    if (off) teardowns.push(off);
  } catch (err) {
    console.warn(`[portfolio] ${label} failed to start`, err);
  }
}

function boot(): void {
  safely('scroll', () => {
    const controller = initScroll();
    return () => controller.destroy();
  });
  safely('statement', initStatement);
  safely('reveal', initReveal);
  safely('marquee', initMarquee);
  safely('sculpture', initSculpture);
  safely('contact', initContact);

  // whenIdle returns a cancel function; register it as a teardown so a pending
  // callback cannot fire after shutdown and run the deferred work a second time.
  teardowns.push(
    whenIdle(() => {
      // Swaps the contact form for an email button on a backend-less deploy.
      void probeApi().catch(() => {});
      void initViews().catch(() => {});
    })
  );
}

function shutdown(): void {
  for (const off of teardowns.reverse()) {
    try {
      off();
    } catch {
      /* ignore */
    }
  }
  teardowns = [];
}

// Registered once, outside boot, so restarting does not stack listeners.
prefersReducedMotion.addEventListener('change', () => {
  shutdown();
  boot();
});

/**
 * Tells the inline failsafe in <head> that the bundle is alive.
 *
 * [data-reveal] starts at opacity 0, and this module is the only thing that ever
 * reveals it. If the bundle 404s on a stale hash, is blocked by an extension, or
 * throws while evaluating, most of the page would stay invisible on an otherwise
 * successful load. The failsafe restores the .no-js styling if this flag never
 * appears — this is the flag.
 */
(window as Window & { __portfolioBooted?: boolean }).__portfolioBooted = true;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
