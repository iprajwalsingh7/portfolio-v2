/**
 * Hero backdrop.
 *
 * The original design had an empty `<image-slot>` here. Rather than ship a
 * multi-megabyte hero photo, this draws what the page is actually about: drifting
 * tick series over a faint grid. Zero bytes of network.
 *
 * Cheap by construction:
 *   - the grid is rasterised once into an offscreen canvas and blitted
 *   - only three polylines (~120 segments each) are redrawn per frame
 *   - the accent colour is read once, not per frame — `getComputedStyle` forces a
 *     style recalculation, and doing that inside the frame loop would flush style
 *     on every single frame
 *   - resize work is debounced, so dragging a window edge does not allocate a
 *     full-resolution canvas dozens of times a second
 *   - it never runs when offscreen, hidden, reduced-motion, or low-power
 */

import { onFrame } from './ticker';
import { dpr, isLowPower, reduceMotion } from '../env';

const SERIES = 3;
const POINTS = 120;
const GRID = 64; // css px
const RESIZE_DEBOUNCE = 120; // ms

/** Deterministic 1D value noise — smooth, seedable, no dependency. */
function noise(x: number, seed: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const h = (n: number): number => {
    const s = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const smooth = f * f * (3 - 2 * f); // smoothstep
  return h(i) * (1 - smooth) + h(i + 1) * smooth;
}

export function initHeroCanvas(): () => void {
  const canvas = document.querySelector<HTMLCanvasElement>('[data-hero-canvas]');
  if (!canvas) return () => {};

  // Hidden, never removed. boot() can run again after a reduced-motion change,
  // and an element taken out of the DOM can never be found by that second run.
  const disable = (): (() => void) => {
    canvas.classList.add('u-hide');
    return () => canvas.classList.remove('u-hide');
  };

  if (reduceMotion() || isLowPower()) return disable();

  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return disable();

  let w = 0;
  let h = 0;
  let ratio = dpr();
  let grid: HTMLCanvasElement | null = null;
  let accent = '#c8ff4d';
  let visible = true;
  let stopFrame: (() => void) | null = null;
  let resizeTimer = 0;
  let bootFrame = 0;

  /**
   * Read once, not per frame. getComputedStyle forces a style recalculation, and
   * calling it inside draw() would flush style on every single frame.
   */
  function readAccent(): void {
    accent =
      getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() ||
      '#c8ff4d';
  }

  function buildGrid(): void {
    // Reuse one offscreen canvas across resizes instead of allocating a new one.
    if (!grid) grid = document.createElement('canvas');
    grid.width = canvas!.width;
    grid.height = canvas!.height;

    const g = grid.getContext('2d');
    if (!g) return;
    g.setTransform(ratio, 0, 0, ratio, 0, 0);
    g.clearRect(0, 0, w, h);
    g.strokeStyle = 'rgba(239,237,232,0.055)';
    g.lineWidth = 1;
    g.beginPath();
    for (let x = 0; x <= w; x += GRID) {
      g.moveTo(Math.round(x) + 0.5, 0);
      g.lineTo(Math.round(x) + 0.5, h);
    }
    for (let y = 0; y <= h; y += GRID) {
      g.moveTo(0, Math.round(y) + 0.5);
      g.lineTo(w, Math.round(y) + 0.5);
    }
    g.stroke();
  }

  function resize(): void {
    const rect = canvas!.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    ratio = dpr();
    w = rect.width;
    h = rect.height;
    canvas!.width = Math.round(w * ratio);
    canvas!.height = Math.round(h * ratio);
    ctx!.setTransform(ratio, 0, 0, ratio, 0, 0);
    buildGrid();
  }

  function scheduleResize(): void {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(resize, RESIZE_DEBOUNCE);
  }

  function draw(time: number): void {
    if (!visible || w === 0) return;
    const t = time * 0.00006;

    ctx!.setTransform(1, 0, 0, 1, 0, 0);
    ctx!.clearRect(0, 0, canvas!.width, canvas!.height);
    if (grid) ctx!.drawImage(grid, 0, 0);
    ctx!.setTransform(ratio, 0, 0, ratio, 0, 0);

    const step = w / (POINTS - 1);

    for (let s = 0; s < SERIES; s++) {
      const seed = s * 17 + 3;
      const amp = h * (0.1 + s * 0.045);
      const mid = h * (0.42 + s * 0.11);
      const speed = 1 + s * 0.35;

      ctx!.beginPath();
      for (let i = 0; i < POINTS; i++) {
        // Two octaves: a slow drift plus fine "tick" chop.
        const n =
          noise(i * 0.09 + t * speed, seed) * 0.75 +
          noise(i * 0.5 + t * speed * 2.4, seed + 91) * 0.25;
        const y = mid + (n - 0.5) * 2 * amp;
        if (i === 0) ctx!.moveTo(0, y);
        else ctx!.lineTo(i * step, y);
      }

      // The topmost series carries the accent; the others stay neutral so the
      // headline keeps its contrast.
      ctx!.strokeStyle = s === 0 ? accent : 'rgba(239,237,232,0.5)';
      ctx!.globalAlpha = s === 0 ? 0.5 : 0.22 - s * 0.05;
      ctx!.lineWidth = s === 0 ? 1.4 : 1;
      ctx!.stroke();
    }
    ctx!.globalAlpha = 1;
  }

  // Only animate while the hero is actually on screen.
  const io = new IntersectionObserver(
    (entries) => {
      const entry = entries[entries.length - 1];
      if (!entry) return;
      visible = entry.isIntersecting;
      if (visible && !stopFrame) stopFrame = onFrame(draw);
      else if (!visible && stopFrame) {
        stopFrame();
        stopFrame = null;
      }
    },
    { threshold: 0 }
  );

  const ro = new ResizeObserver(scheduleResize);

  // A DPR change (dragging the window between a 1x and a 2x display) does not
  // alter the element's CSS box, so the ResizeObserver never fires and the canvas
  // would keep rendering at the old ratio.
  const dprWatch = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
  const onDprChange = (): void => resize();
  dprWatch.addEventListener('change', onDprChange);

  readAccent();
  resize();
  bootFrame = requestAnimationFrame((t) => {
    bootFrame = 0;
    draw(t);
    canvas.classList.add('is-ready');
  });
  io.observe(canvas);
  ro.observe(canvas);

  return () => {
    stopFrame?.();
    stopFrame = null;
    if (bootFrame) cancelAnimationFrame(bootFrame);
    clearTimeout(resizeTimer);
    io.disconnect();
    ro.disconnect();
    dprWatch.removeEventListener('change', onDprChange);
    canvas.classList.remove('is-ready');
    grid = null;
  };
}
