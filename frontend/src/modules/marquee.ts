/**
 * Pauses the marquee whenever it is off screen.
 *
 * A CSS animation on an offscreen element still forces the compositor to
 * produce frames for it. On a page this tall that is a permanent background
 * cost for something nobody can see.
 */

export function initMarquee(): () => void {
  const nodes = [...document.querySelectorAll<HTMLElement>('[data-marquee]')];
  if (nodes.length === 0) return () => {};

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        entry.target.classList.toggle('is-paused', !entry.isIntersecting);
      }
    },
    { threshold: 0 }
  );

  nodes.forEach((n) => io.observe(n));
  return () => io.disconnect();
}
