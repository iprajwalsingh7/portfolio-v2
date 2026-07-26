/**
 * Contact form — progressive enhancement.
 *
 * The form in the HTML has a real `action` and `method`, so with JS disabled the
 * browser posts it and the server replies with a plain confirmation page. This
 * module intercepts that and does it over fetch instead, with inline validation
 * and no navigation.
 */

import { api, type ContactPayload } from './api';

type Tone = 'idle' | 'ok' | 'error';

const RULES: Record<
  keyof Omit<ContactPayload, 'company'>,
  (v: string) => string | null
> = {
  name: (v) =>
    v.trim().length < 2 ? 'Tell me what to call you.' : null,
  email: (v) =>
    // Deliberately loose. The server does the authoritative check; this only
    // catches obvious typos before a round trip.
    /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) ? null : 'That email looks off.',
  message: (v) =>
    v.trim().length < 10 ? 'A little more detail, please.' : null,
};

export function initContact(): () => void {
  const form = document.querySelector<HTMLFormElement>('[data-contact-form]');
  if (!form) return () => {};

  const status = form.querySelector<HTMLElement>('[data-form-status]');
  const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  let busy = false;

  const setStatus = (text: string, tone: Tone = 'idle'): void => {
    if (!status) return;
    status.textContent = text;
    status.dataset.tone = tone;
  };

  const fieldError = (name: string, text: string | null): void => {
    const slot = form.querySelector<HTMLElement>(`[data-error-for="${name}"]`);
    if (slot) slot.textContent = text ?? '';

    const input = form.elements.namedItem(name) as HTMLInputElement | null;
    if (!input) return;

    input.setAttribute('aria-invalid', text ? 'true' : 'false');

    // aria-invalid alone announces "invalid entry" without saying why. Pointing
    // aria-describedby at the message only while there is a message means the
    // reason is read out, and nothing stale is announced once it is fixed.
    if (text && slot?.id) input.setAttribute('aria-describedby', slot.id);
    else input.removeAttribute('aria-describedby');
  };

  /** Clears every field error. Used after a reset, so nothing stale survives. */
  const clearErrors = (): void => {
    for (const key of Object.keys(RULES)) fieldError(key, null);
  };

  const readValues = (): ContactPayload => {
    const data = new FormData(form);
    return {
      name: String(data.get('name') ?? ''),
      email: String(data.get('email') ?? ''),
      message: String(data.get('message') ?? ''),
      company: String(data.get('company') ?? ''),
    };
  };

  /** Returns true when everything passes. Paints errors either way. */
  const validate = (values: ContactPayload): boolean => {
    let valid = true;
    for (const key of Object.keys(RULES) as (keyof typeof RULES)[]) {
      const problem = RULES[key](values[key]);
      fieldError(key, problem);
      if (problem) valid = false;
    }
    return valid;
  };

  // Clear a field's error as soon as the visitor starts fixing it.
  const onInput = (event: Event): void => {
    const el = event.target as HTMLInputElement;
    // hasOwn, not `in`: `in` walks the prototype chain, so a field named
    // "constructor" or "toString" would pass the guard.
    if (Object.hasOwn(RULES, el.name)) fieldError(el.name, null);
  };
  form.addEventListener('input', onInput);

  const onSubmit = async (event: SubmitEvent): Promise<void> => {
    event.preventDefault();
    if (busy) return;

    const values = readValues();

    // Honeypot: a human never sees this field, so anything in it is a bot.
    // Answer as if it worked — telling a bot it failed just invites a retry.
    if (values.company) {
      setStatus('Thanks — message sent.', 'ok');
      form.reset();
      clearErrors();
      return;
    }

    if (!validate(values)) {
      setStatus('Check the highlighted fields.', 'error');
      return;
    }

    busy = true;
    if (submit) submit.disabled = true;
    setStatus('Sending…');

    const res = await api.sendContact(values);

    busy = false;
    if (submit) submit.disabled = false;

    if (res.ok) {
      form.reset();
      // reset() restores the values but leaves aria-invalid and the error text
      // sitting on a now-empty form.
      clearErrors();
      setStatus('Thanks — message sent. I usually reply within a day.', 'ok');
      return;
    }

    if (res.errors) {
      for (const [field, text] of Object.entries(res.errors)) fieldError(field, text);
    }

    setStatus(
      res.message ??
        (res.status === 429
          ? 'Too many messages from this address. Try again later.'
          : 'Could not send. Email me directly instead.'),
      'error'
    );
  };

  form.addEventListener('submit', onSubmit);

  return () => {
    form.removeEventListener('submit', onSubmit);
    form.removeEventListener('input', onInput);
  };
}
