/**
 * Decides whether a backend is actually there, once per page load.
 *
 * The site is prerendered, so it deploys equally happily as one Spring Boot jar
 * or as pure static files on a CDN. Those two cases need different contact UI: a
 * working form, or an email button. Rather than a build flag that has to be set
 * correctly at deploy time — and will eventually be set wrong — the page asks.
 *
 * Only a *definitive* absence flips the UI:
 *   - status 0   the request never completed (no server, DNS, CORS, offline)
 *   - status 404 something answered, but the API is not mounted
 *
 * A 500 or a 429 means the backend exists and is simply unhappy, so the form
 * stays: the visitor should see the real error, not be quietly downgraded. This
 * asymmetry is the whole point — a transient blip must not hide the form.
 */

import { api } from './api';

let resolved: Promise<boolean> | null = null;

/**
 * @returns true when the backend answered, false when it is definitively absent
 */
export function probeApi(): Promise<boolean> {
  // Memoised: several modules want this and it must not become several requests.
  resolved ??= api
    .readViews()
    .then((res) => {
      const missing = res.status === 0 || res.status === 404;
      document.documentElement.classList.toggle('no-api', missing);
      return !missing;
    })
    .catch(() => {
      // request() already converts failures into a result, so this is defensive.
      document.documentElement.classList.add('no-api');
      return false;
    });

  return resolved;
}
