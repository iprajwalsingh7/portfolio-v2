/**
 * Scroll-triggered reveals and the stat counters.
 *
 * IntersectionObserver rather than scroll math: the browser does the work off the
 * main thread and only calls us when something crosses the threshold. Each element
 * is unobserved after firing, so the observer set shrinks to nothing by the time
 * the visitor reaches the footer.
 *
 * `will-change` is added on reveal and removed on transitionend. Leaving it on
 * permanently is a well-known way to burn GPU memory on a long page.
 */

import { reduceMotion } from '../env';

export function initReveal(): () => void {
  const targets = [...document.querySelectorAll<HTMLElement>('[data-reveal]')];

  /**
   * Undoes everything this module wrote.
   *
   * Teardown has to be this thorough because boot() is re-runnable (a
   * reduced-motion change restarts it). Leaving `.is-in` behind meant the next run
   * observed elements already at their final state: show() would set will-change,
   * no property would actually change, transitionend would never fire, and the
   * cleanup below would never run — pinning every reveal target to a GPU layer.
   */
  const reset = (): void => {
    for (const el of targets) {
      el.classList.remove('is-in');
      el.style.willChange = '';
    }
    for (const el of document.querySelectorAll<HTMLElement>('[data-count]')) {
      delete el.dataset.counted;
    }
  };

  if (reduceMotion()) {
    targets.forEach((el) => el.classList.add('is-in'));
    document.querySelectorAll<HTMLElement>('[data-count]').forEach(settle);
    return reset;
  }

  const show = (el: HTMLElement): void => {
    // Already revealed: setting will-change now would never be cleared, because no
    // transition would start and so transitionend would never fire.
    if (el.classList.contains('is-in')) return;

    el.style.willChange = 'opacity, transform';
    el.classList.add('is-in');
    el.addEventListener(
      'transitionend',
      () => {
        el.style.willChange = '';
      },
      { once: true }
    );
    el.querySelectorAll<HTMLElement>('[data-count]').forEach(countUp);
  };

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        show(entry.target as HTMLElement);
        io.unobserve(entry.target);
      }
    },
    // Fire slightly before the element is fully on screen, so the motion has
    // finished by the time the eye lands on it.
    { threshold: 0.12, rootMargin: '0px 0px -6% 0px' }
  );

  targets.forEach((el) => io.observe(el));

  return () => {
    io.disconnect();
    reset();
  };
}

// ------------------------------------------------------------------ counters

/** Formats to match the prerendered markup exactly, so nothing shifts. */
function format(n: number): string {
  return n >= 1000 ? n.toLocaleString('en-US') : String(n);
}

/** Jumps straight to the final value (reduced motion). */
function settle(el: HTMLElement): void {
  el.textContent = format(Number(el.dataset.count ?? '0'));
  el.dataset.counted = '1';
}

/** Counts an element up to its `data-count` value, once. */
function countUp(el: HTMLElement): void {
  if (el.dataset.counted) return;
  el.dataset.counted = '1';

  const to = Number(el.dataset.count ?? '0');
  if (!Number.isFinite(to) || to === 0) return;

  const duration = 1100;
  const start = performance.now();

  // Self-contained rAF: it lives for about a second and there are three of them
  // on the whole page, so routing it through the shared ticker buys nothing.
  const step = (now: number): void => {
    const t = Math.min((now - start) / duration, 1);
    // easeOutExpo — fast start, long settle, reads as "counting up".
    const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
    el.textContent = format(Math.round(to * eased));
    if (t < 1) requestAnimationFrame(step);
  };

  el.textContent = format(0);
  requestAnimationFrame(step);
}
