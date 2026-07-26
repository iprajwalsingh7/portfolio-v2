/**
 * Capability + preference detection, resolved once at boot.
 *
 * Everything expensive on the page checks these flags before starting, so a
 * low-end phone or a reduced-motion user never pays for the decoration.
 */

/** The slice of MediaQueryList this app uses. */
export interface MediaFlag {
  readonly matches: boolean;
  addEventListener(type: 'change', listener: () => void): void;
  removeEventListener(type: 'change', listener: () => void): void;
}

/**
 * Wraps matchMedia so a missing implementation cannot take the page down.
 *
 * This runs at module scope, which makes the failure mode unusually bad: a
 * throw here happens while the module is still evaluating, before any of the
 * per-module try/catch in main.ts can catch it, so the whole bundle dies and the
 * page loses every enhancement at once rather than one feature. Every browser
 * since IE10 has matchMedia — but the cost of not assuming it is four lines.
 */
function mq(query: string): MediaFlag {
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    return window.matchMedia(query);
  }
  return {
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}

export const prefersReducedMotion = mq('(prefers-reduced-motion: reduce)');
export const canHover = mq('(hover: hover)');

/**
 * Heuristic for "this device should not run a canvas animation":
 * few cores, little memory, or a narrow screen.
 * Deliberately conservative — the site is fully readable without any of it.
 */
export function isLowPower(): boolean {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const cores = nav.hardwareConcurrency ?? 4;
  const memory = nav.deviceMemory ?? 4;
  return cores <= 4 || memory <= 2 || window.innerWidth < 640;
}

export const reduceMotion = (): boolean => prefersReducedMotion.matches;

/**
 * Device pixel ratio, capped. Past ~1.5 the extra pixels are invisible on this
 * content but the fill cost keeps scaling.
 */
export const dpr = (): number => Math.min(window.devicePixelRatio || 1, 1.5);

/**
 * The idle-callback API as an optional shape rather than an augmentation of
 * Window — lib.dom declares these as required, so extending Window would be a
 * type conflict rather than a feature probe.
 */
interface IdleApi {
  requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
}

/**
 * Runs `fn` when the browser is idle, or after `timeout` at the latest.
 *
 * @returns a cancel function. Returning it matters: a pending idle callback that
 *          cannot be cancelled will still fire after teardown, so restarting the
 *          page would run the deferred work twice.
 */
export function whenIdle(fn: () => void, timeout = 1500): () => void {
  const w = window as unknown as IdleApi;

  if (typeof w.requestIdleCallback === 'function') {
    const handle = w.requestIdleCallback(fn, { timeout });
    return () => w.cancelIdleCallback?.(handle);
  }

  const handle = window.setTimeout(fn, 1);
  return () => window.clearTimeout(handle);
}
