/**
 * The page's single requestAnimationFrame loop.
 *
 * Lenis, the hero canvas and every scroll-linked write subscribe here. One loop
 * means one callback per frame instead of three competing ones, and it guarantees
 * ordering: Lenis integrates scroll first, then everything that reads from it. It
 * also stops entirely when the tab is hidden or nothing is subscribed, so an idle
 * tab costs nothing.
 */

type Frame = (time: number, delta: number) => void;

const subscribers = new Set<Frame>();
let handle = 0;
let last = 0;
let running = false;

function frame(time: number): void {
  // Bail if stop() ran since this callback was queued. Without this the loop
  // re-arms itself after being cancelled, producing a chain that stop() can no
  // longer reach (it returns early on !running) — and a later start() then adds a
  // second, independent loop alongside it.
  if (!running) return;

  const delta = last ? Math.min(time - last, 50) : 16.7;
  last = time;

  for (const fn of subscribers) {
    try {
      fn(time, delta);
    } catch (err) {
      // One misbehaving subscriber must not kill the loop. It drives Lenis, and
      // Lenis calls preventDefault on wheel events — so a throw here would leave
      // the page unable to scroll by mouse wheel at all.
      console.warn('[portfolio] frame subscriber failed', err);
    }
  }

  if (running) handle = requestAnimationFrame(frame);
}

function start(): void {
  if (running || subscribers.size === 0 || document.hidden) return;
  running = true;
  last = 0;
  handle = requestAnimationFrame(frame);
}

function stop(): void {
  if (!running) return;
  running = false;
  cancelAnimationFrame(handle);
  handle = 0;
}

document.addEventListener(
  'visibilitychange',
  () => (document.hidden ? stop() : start()),
  { passive: true }
);

/**
 * Subscribe to the frame loop. Returns an unsubscribe function.
 *
 * Safe to call while hidden: start() declines, and the visibilitychange handler
 * picks it up when the tab comes back.
 */
export function onFrame(fn: Frame): () => void {
  subscribers.add(fn);
  start();
  return () => {
    subscribers.delete(fn);
    if (subscribers.size === 0) stop();
  };
}
