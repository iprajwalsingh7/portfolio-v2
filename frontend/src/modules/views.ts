/**
 * Footer view counter.
 *
 * Counts once per browser session, reads the total otherwise. Runs on idle so
 * it never competes with first paint, and the element stays hidden unless the
 * request actually succeeds — a static deploy with no backend simply shows
 * nothing rather than a broken "—".
 */

import { api } from './api';
import { probeApi } from './api-probe';

const KEY = 'ps.counted';

function session(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export async function initViews(): Promise<void> {
  const slot = document.querySelector<HTMLElement>('[data-views]');
  if (!slot) return;

  // One probe decides both whether the counter can work and which contact UI to
  // show, so a static deploy makes exactly one failed request, not two.
  if (!(await probeApi())) return;

  const store = session();
  const first = store?.getItem(KEY) !== '1';

  // Claim the session *before* awaiting. Writing the flag after the response came
  // back left a window in which a second call also saw first === true and
  // registered a duplicate view.
  if (first) store?.setItem(KEY, '1');

  // The probe already performed the read, so only a first visit needs a request.
  const res = first ? await api.registerView() : await api.readViews();
  if (!res.ok || typeof res.data?.total !== 'number') return;

  slot.textContent = `${res.data.total.toLocaleString('en-US')} views`;
  slot.hidden = false;
}
