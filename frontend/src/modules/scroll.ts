/**
 * Smooth scrolling (Lenis) plus everything derived from scroll position.
 *
 * Rules followed here, because they are the difference between "smooth" and
 * "janky":
 *   - no `scroll` listener on window; Lenis already gives us the value
 *   - all DOM writes happen in the frame callback, never in the scroll event
 *   - writes are guarded by a dirty check, so a still page writes nothing
 *   - only `transform` and `opacity` are animated (compositor-only)
 */

import Lenis from 'lenis';
import { onFrame } from './ticker';
import { reduceMotion } from '../env';

export interface ScrollController {
  scrollTo(target: string | HTMLElement | number): void;
  destroy(): void;
}

export function initScroll(): ScrollController {
  const reduced = reduceMotion();

  const lenis = new Lenis({
    // lerp gives frame-rate-independent easing; 0.09 matches the original
    // design's feel but settles a touch faster.
    lerp: reduced ? 1 : 0.09,
    wheelMultiplier: 1,
    touchMultiplier: 1.6,
    // Native momentum on touch is already good and hijacking it feels wrong.
    smoothWheel: !reduced,
    syncTouch: false,
    autoRaf: false, // we drive it from the shared ticker
    anchors: false, // handled below so we can offset for fixed chrome
  });

  // -- progress bar + counter ------------------------------------------------
  const bar = document.querySelector<HTMLElement>('[data-progress]');
  const pct = document.querySelector<HTMLElement>('[data-progress-pct]');
  let lastPct = -1;
  let lastProgress = "";

  // -- section rail ----------------------------------------------------------
  const railItems = new Map<string, HTMLElement>();
  document.querySelectorAll<HTMLElement>('[data-rail]').forEach((el) => {
    railItems.set(el.dataset.rail!, el);
  });
  const sections = [...document.querySelectorAll<HTMLElement>('[data-section]')];
  let activeId = '';

  // Section offsets are layout reads, so cache them and only recompute on
  // resize — never inside the frame loop.
  let offsets: { id: string; top: number }[] = [];
  const measure = (): void => {
    offsets = sections.map((s) => ({
      id: s.id,
      top: s.getBoundingClientRect().top + window.scrollY,
    }));
  };
  measure();

  // Only remeasure our own cached offsets here. Lenis installs its own
  // ResizeObserver plus a window listener, both debounced — calling lenis.resize()
  // from this un-debounced callback would defeat that during a window drag.
  const ro = new ResizeObserver(() => measure());
  ro.observe(document.body);

  function paint(scroll: number, limit: number): void {
    const p = limit > 0 ? Math.min(Math.max(scroll / limit, 0), 1) : 0;

    const progress = p.toFixed(4);
    if (bar && progress !== lastProgress) {
      bar.style.transform = `scaleX(${progress})`;
      lastProgress = progress;
    }

    const whole = Math.round(p * 100);
    if (whole !== lastPct) {
      lastPct = whole;
      if (pct) pct.textContent = String(whole).padStart(3, '0');
    }

    // Active section = last one whose top has passed the 40% viewport line.
    const probe = scroll + window.innerHeight * 0.4;
    let current = offsets[0]?.id ?? '';
    for (const o of offsets) if (o.top <= probe) current = o.id;

    if (current !== activeId) {
      railItems.get(activeId)?.setAttribute('aria-current', 'false');
      railItems.get(current)?.setAttribute('aria-current', 'true');
      activeId = current;
    }
  }

  const stopFrame = onFrame((time) => {
    lenis.raf(time);
    paint(lenis.scroll, lenis.limit);
  });

  // -- anchors ---------------------------------------------------------------
  // Handled manually so links land below the fixed top chrome and so Lenis
  // animates rather than the browser jumping.
  const onClick = (event: MouseEvent): void => {
    // Shift and Alt open a new window / trigger a download. Swallowing those with
    // preventDefault breaks behaviour the visitor explicitly asked for.
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    const link = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#"]');
    if (!link) return;

    const id = link.getAttribute('href')!.slice(1);
    const target = id ? document.getElementById(id) : document.body;
    if (!target) return;

    event.preventDefault();
    lenis.scrollTo(target, { offset: -70, duration: reduced ? 0 : 1.1 });

    // preventDefault also cancels the browser's move of the sequential-focus
    // starting point, which is the entire job of a skip link. Move focus manually.
    // <main> carries tabindex="-1" so it can receive it.
    if (target !== document.body) {
      (target as HTMLElement).focus({ preventScroll: true });
    }

    history.replaceState(null, '', id ? `#${id}` : location.pathname + location.search);
  };
  document.addEventListener('click', onClick);

  return {
    scrollTo(target) {
      lenis.scrollTo(target as never, { offset: -70 });
    },
    destroy() {
      stopFrame();
      ro.disconnect();
      document.removeEventListener('click', onClick);
      lenis.destroy();
    },
  };
}
