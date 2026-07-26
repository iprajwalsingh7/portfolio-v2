/**
 * Thin client for the Spring Boot API.
 *
 * Every call is optional to the page working: the site is prerendered, so if
 * the backend is down or the site is deployed as pure static files, these
 * simply fail and nothing visible breaks.
 */

export interface ContactPayload {
  name: string;
  email: string;
  message: string;
  company?: string; // honeypot — must stay empty
}

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data?: T;
  message?: string;
  errors?: Record<string, string>;
}

const BASE = '/api';
const TIMEOUT = 12_000;

async function request<T>(
  path: string,
  init: RequestInit = {}
): Promise<ApiResult<T>> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT);

  try {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      signal: abort.signal,
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    });

    const text = await res.text();
    const body = text ? safeJson(text) : undefined;

    return {
      ok: res.ok,
      status: res.status,
      data: res.ok ? (body as T) : undefined,
      message: (body as { message?: string } | undefined)?.message,
      errors: (body as { errors?: Record<string, string> } | undefined)?.errors,
    };
  } catch (err) {
    const aborted = err instanceof DOMException && err.name === 'AbortError';
    return {
      ok: false,
      status: 0,
      message: aborted ? 'Request timed out.' : 'Network unavailable.',
    };
  } finally {
    clearTimeout(timer);
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export const api = {
  sendContact(payload: ContactPayload) {
    return request<{ id: string }>('/contact', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /** Registers a visit and returns the running total. */
  registerView() {
    return request<{ total: number }>('/metrics/views', { method: 'POST' });
  },

  /** Reads the total without counting a new visit. */
  readViews() {
    return request<{ total: number }>('/metrics/views');
  },
};
