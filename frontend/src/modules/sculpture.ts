/** Let CSS composite the rotation, and stop it whenever it cannot be seen. */
export function initSculpture(): () => void {
  const sculpture = document.querySelector<HTMLElement>('[data-sculpture]');
  if (!sculpture) return () => {};
  let visible = true;
  const sync = (): void => {
    sculpture.classList.toggle('is-paused', document.hidden || !visible);
  };
  const observer = new IntersectionObserver((entries) => {
    const entry = entries[entries.length - 1];
    if (entry) visible = entry.isIntersecting;
    sync();
  });
  observer.observe(sculpture);
  document.addEventListener('visibilitychange', sync);
  sync();
  return () => {
    observer.disconnect();
    document.removeEventListener('visibilitychange', sync);
    sculpture.classList.remove('is-paused');
  };
}
