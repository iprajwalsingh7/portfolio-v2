/**
 * Scroll-driven highlight for the statement lines.
 *
 * The design shipped a fixed treatment — line one bright, the rest dim — which
 * reads as a mistake rather than a choice, because nothing explains why those
 * particular lines are emphasised. This instead lights each line as it passes a
 * focal band about two thirds down the viewport, so the emphasis follows the
 * reader sentence by sentence.
 *
 * Cheap by construction:
 *   - runs inside the shared ticker, not its own rAF loop
 *   - line geometry is measured on resize and cached; the frame callback performs
 *     no layout reads at all
 *   - writes are quantised and dirty-checked, so a stationary page writes nothing
 *   - the only property written is a custom property consumed by `color-mix`,
 *     which repaints three small elements and never reflows
 */

import { onFrame } from './ticker';
import { reduceMotion } from '../env';

interface Line {
  el: HTMLElement;
  top: number;
  height: number;
  lit: number;
}

/** Where on screen a line counts as "being read". 0 = top, 1 = bottom. */
const FOCAL = 0.62;

/** Written values are rounded to this step, to avoid pointless repaints. */
const STEP = 0.02;

export function initStatement(): () => void {
  const nodes = [...document.querySelectorAll<HTMLElement>('[data-statement]')];
  if (nodes.length === 0) return () => {};

  const clear = (): void => {
    for (const el of nodes) el.style.removeProperty('--lit');
  };

  // Reduced motion: light everything and stay out of the frame loop entirely.
  if (reduceMotion()) {
    for (const el of nodes) el.style.setProperty('--lit', '1');
    return clear;
  }

  const lines: Line[] = nodes.map((el) => ({ el, top: 0, height: 1, lit: -1 }));

  const measure = (): void => {
    for (const line of lines) {
      const rect = line.el.getBoundingClientRect();
      line.top = rect.top + window.scrollY;
      line.height = Math.max(rect.height, 1);
    }
  };
  measure();

  const ro = new ResizeObserver(measure);
  ro.observe(document.body);

  const stopFrame = onFrame(() => {
    // window.scrollY is a cached value on the scroll timeline, not a forced
    // layout — unlike getBoundingClientRect, which is why geometry is cached.
    const focal = window.scrollY + window.innerHeight * FOCAL;

    for (const line of lines) {
      // 0 before the focal line reaches the top of the text, 1 once it has
      // travelled the full height of it — so long lines fill in gradually.
      const raw = (focal - line.top) / line.height;
      const lit = Math.round(Math.min(Math.max(raw, 0), 1) / STEP) * STEP;

      if (lit !== line.lit) {
        line.lit = lit;
        line.el.style.setProperty('--lit', lit.toFixed(2));
      }
    }
  });

  return () => {
    stopFrame();
    ro.disconnect();
    clear();
  };
}
