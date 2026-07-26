/**
 * HTML template. Pure function: content.json + inlined CSS -> full document.
 *
 * Everything the visitor reads is emitted here at build time. That means:
 *   - first paint needs zero JavaScript,
 *   - the LCP element (hero headline) is in the initial HTML byte stream,
 *   - the page still works with JS disabled or broken.
 * The runtime bundle only adds motion, the contact form, and the view counter.
 */

const AMP = /[&<>"']/g;
const ENT = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escape for text nodes and double-quoted attributes. */
const e = (v) => String(v ?? '').replace(AMP, (c) => ENT[c]);

/** Resolve a path against the site URL, tolerant of a trailing slash. */
const url = (base, path) => new URL(path, base.endsWith('/') ? base : `${base}/`).href;

/** Join template fragments, dropping falsy entries. */
const j = (arr, sep = '\n') => arr.filter(Boolean).join(sep);

// ---------------------------------------------------------------- icons ----
// Inline SVG rather than glyphs: the original design used ✕ / ◆ / ↗, which sit
// outside the latin subset of our self-hosted fonts and would silently fall
// back to a system font. SVG is crisper and costs fewer bytes than a subset.

const icons = {
  linkedin:
    '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4.98 3.5A2.5 2.5 0 1 1 2.5 6 2.5 2.5 0 0 1 4.98 3.5ZM3 8.98h4v12H3ZM9.5 8.98h3.83v1.64h.05a4.2 4.2 0 0 1 3.78-2.08c4.04 0 4.79 2.66 4.79 6.12v6.32h-4v-5.6c0-1.34-.02-3.06-1.86-3.06-1.87 0-2.15 1.46-2.15 2.96v5.7h-4Z"/></svg>',
  github:
    '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .5a12 12 0 0 0-3.79 23.39c.6.11.82-.26.82-.58v-2.03c-3.34.73-4.04-1.61-4.04-1.61a3.18 3.18 0 0 0-1.33-1.76c-1.09-.74.08-.73.08-.73a2.52 2.52 0 0 1 1.84 1.24 2.56 2.56 0 0 0 3.5 1 2.57 2.57 0 0 1 .76-1.61c-2.67-.3-5.47-1.34-5.47-5.96a4.66 4.66 0 0 1 1.24-3.23 4.33 4.33 0 0 1 .12-3.19s1-.32 3.3 1.23a11.4 11.4 0 0 1 6 0c2.28-1.55 3.29-1.23 3.29-1.23a4.33 4.33 0 0 1 .12 3.19 4.65 4.65 0 0 1 1.24 3.23c0 4.63-2.81 5.65-5.49 5.95a2.88 2.88 0 0 1 .82 2.23v3.31c0 .32.22.7.83.58A12 12 0 0 0 12 .5Z"/></svg>',
  x:
    '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.65l-5.22-6.82-5.96 6.82H1.67l7.73-8.84L1.25 2.25h6.82l4.71 6.23ZM17.08 19.77h1.83L7.08 4.13H5.11Z"/></svg>',
  mail:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="2.5" y="4.5" width="19" height="15" rx="2"/><path d="m3 6 9 6.5L21 6"/></svg>',
  arrowOut:
    '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M3 9 9 3M9 3H4.2M9 3v4.8"/></svg>',
  arrowDown:
    '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M6 2v8M2.5 6.5 6 10l3.5-3.5"/></svg>',
};

// -------------------------------------------------------------- sections ---

const eyebrow = (index, label) =>
  `<p class="eyebrow">${e(index)} — ${e(label)}</p>`;

function heroBlock(c) {
  const lines = c.hero.lines
    .map(
      (l, i) =>
        `<span class="hero__line${l.tone === 'dim' ? ' hero__line--dim' : ''}" style="--i:${i}">${e(l.text)}${
          l.period ? '<span class="hero__period">.</span>' : ''
        }</span>`
    )
    .join('\n        ');

  return `
  <section class="hero" id="top">
    <canvas class="hero__canvas" aria-hidden="true" data-hero-canvas></canvas>
    <div class="hero__veil" aria-hidden="true"></div>
    <div class="hero__inner">
      <h1 class="u-sr">${e(c.meta.name)} — ${e(c.meta.role)}, ${e(c.meta.domain)}. ${e(
        c.hero.lines.map((l) => l.text).join(' ')
      )}.</h1>
      <div aria-hidden="true">
        ${lines}
      </div>
      <div class="hero__foot" style="--i:3">
        <p class="hero__lede">${e(c.hero.lede)}</p>
      </div>
    </div>
  </section>`;
}

function marqueeBlock(c) {
  // Rendered twice so the -50% keyframe lands on a seamless boundary.
  const run = c.marquee
    .map(
      (m) =>
        `<span class="marquee__item">${e(m)}<span class="marquee__dot" aria-hidden="true"></span></span>`
    )
    .join('');
  return `
  <div class="marquee" data-marquee aria-hidden="true">
    <div class="marquee__track">${run}${run}</div>
  </div>`;
}

function statementBlock(c, s) {
  const lines = c.statement
    .map(
      (l, i) =>
        `<p class="statement__line" data-statement data-reveal style="--i:${i}">${e(l.text)}</p>`
    )
    .join('\n      ');

  const stats = c.stats
    .map(
      (st, i) => `
        <div class="stat" data-reveal style="--i:${i}">
          <p class="stat__n"><span data-count="${e(st.value)}">${e(
            Number(st.value).toLocaleString('en-US')
          )}</span>${e(st.suffix ?? '')}</p>
          <p class="stat__label">${e(st.label)}</p>
        </div>`
    )
    .join('');

  return `
  <section class="section statement shell" id="${e(s.id)}" data-section aria-labelledby="lbl-${e(s.id)}">
    ${eyebrow(s.index, s.label).replace('class="eyebrow"', `class="eyebrow" id="lbl-${e(s.id)}"`)}
    <div class="statement__lines" data-reveal-stagger>
      ${lines}
    </div>
    <div class="stats" data-reveal-stagger>${stats}
    </div>
  </section>`;
}

function experienceBlock(c, s) {
  const roles = c.experience.roles
    .map((r) => {
      const contribs = r.contributions
        .map(
          (x) => `
            <div class="contrib">
              <p class="contrib__tag">${e(x.tag)}</p>
              <p class="contrib__text">${e(x.text)}</p>
            </div>`
        )
        .join('');
      return `
        <article class="role" data-reveal>
          <div class="role__head">
            <h3 class="role__title">${e(r.title)}</h3>
            <p class="role__period">${e(r.period)}</p>
          </div>
          <p class="role__kicker">${e(r.role)}</p>
          <p class="role__blurb">${e(r.blurb)}</p>
          <div class="contribs">${contribs}
          </div>
        </article>`;
    })
    .join('');

  return `
  <section class="section section--deferred shell" id="${e(s.id)}" data-section aria-labelledby="lbl-${e(s.id)}">
    <div class="split">
      <div class="split__aside">
        ${eyebrow(s.index, s.label)}
        <h2 class="split__title" id="lbl-${e(s.id)}">${c.experience.heading.map(e).join('<br>')}</h2>
        <p class="split__blurb">${e(c.experience.blurb)}</p>
      </div>
      <div>${roles}
      </div>
    </div>
  </section>`;
}

function projectsBlock(c, s) {
  const items = c.projects
    .map(
      (p) => `
      <article class="project" data-reveal>
        <div>
          <h3 class="project__name">${e(p.name)}</h3>
          <p class="project__kind">${e(p.kind)}${p.period ? ` · ${e(p.period)}` : ''}</p>
          ${
            p.link
              ? `<a class="link-out" href="${e(p.link)}" target="_blank" rel="noopener noreferrer">Source ${icons.arrowOut}<span class="u-sr"> (opens in a new tab)</span></a>`
              : ''
          }
        </div>
        <div>
          <p class="project__summary">${e(p.summary)}</p>
          <div class="note">
            <p class="note__label">Engineered</p>
            <p class="note__text">${e(p.impact)}</p>
          </div>
          <ul class="tags">${p.tech.map((t) => `<li class="tag">${e(t)}</li>`).join('')}</ul>
        </div>
      </article>`
    )
    .join('');

  return `
  <section class="section section--deferred shell" id="${e(s.id)}" data-section aria-labelledby="lbl-${e(s.id)}">
    ${eyebrow(s.index, s.label).replace('class="eyebrow"', `class="eyebrow" id="lbl-${e(s.id)}"`)}
    <div>${items}
    </div>
    <hr class="rule">
  </section>`;
}

function stackBlock(c, s) {
  const rows = c.stack
    .map(
      (g) => `
      <div class="stack__row" data-reveal>
        <h3 class="stack__name">${e(g.name)}</h3>
        <ul class="stack__items">${g.items.map((i) => `<li class="stack__item">${e(i)}</li>`).join('')}</ul>
      </div>`
    )
    .join('');

  return `
  <section class="section section--deferred shell" id="${e(s.id)}" data-section aria-labelledby="lbl-${e(s.id)}">
    ${eyebrow(s.index, s.label).replace('class="eyebrow"', `class="eyebrow" id="lbl-${e(s.id)}"`)}
    <div>${rows}
    </div>
    <hr class="rule">
  </section>`;
}

function backgroundBlock(c, s) {
  const rows = c.education
    .map(
      (ed) => `
      <div class="edu" data-reveal>
        <h3 class="edu__school">${e(ed.school)}</h3>
        <p class="edu__credential">${e(ed.credential)}${
          ed.detail ? ` <span class="edu__detail">${e(ed.detail)}</span>` : ''
        }</p>
        <p class="edu__meta">${e(ed.period)}<br>${e(ed.place)}</p>
      </div>`
    )
    .join('');

  return `
  <section class="section section--deferred shell" id="${e(s.id)}" data-section aria-labelledby="lbl-${e(s.id)}">
    ${eyebrow(s.index, s.label).replace('class="eyebrow"', `class="eyebrow" id="lbl-${e(s.id)}"`)}
    <div>${rows}
    </div>
    <hr class="rule">
  </section>`;
}

function contactBlock(c, s) {
  const reach = c.contact.reach
    .map(
      (r) => `
        <a class="reach__item" href="${e(r.href)}"${
          r.href.startsWith('http') ? ' target="_blank" rel="noopener noreferrer"' : ''
        }>
          <span class="reach__label">${e(r.label)}</span>
          <span class="reach__value">${e(r.value)}</span>
        </a>`
    )
    .join('');

  const socialButtons = c.socials
    .filter((sc) => sc.id !== 'mail')
    .map(
      (sc) =>
        `<a class="btn btn--ghost" href="${e(sc.href)}" target="_blank" rel="noopener noreferrer">${e(sc.label)} ${icons.arrowOut}</a>`
    )
    .join('\n      ');

  return `
  <section class="section contact shell" id="${e(s.id)}" data-section aria-labelledby="lbl-${e(s.id)}">
    ${eyebrow(s.index, s.label)}
    <h2 class="contact__title" id="lbl-${e(s.id)}" data-reveal>${c.contact.heading
      .map(e)
      .join('<br>')}<span class="hero__period">.</span></h2>
    <p class="contact__note">${e(c.contact.note)}</p>

    <div class="reach">${reach}
    </div>

    <div class="actions">
      <a class="btn btn--solid" href="${e(c.meta.resumeFile)}" download="${e(c.meta.resumeDownloadName)}">Download resume ${icons.arrowDown}</a>
      ${socialButtons}
    </div>

    <!-- Posts to the Spring Boot API. Without JS the browser submits it
         natively and the server replies with a plain confirmation page. -->
    <form class="form" method="post" action="/api/contact" novalidate data-contact-form>
      <p class="eyebrow" style="margin-bottom:26px">Or send a message</p>
      <div class="form__grid">
        <label class="field">
          <span class="field__label">Name</span>
          <input class="field__input" type="text" name="name" required minlength="2" maxlength="80"
                 autocomplete="name" placeholder="Your name">
          <span class="field__error" id="err-name" data-error-for="name"></span>
        </label>
        <label class="field">
          <span class="field__label">Email</span>
          <input class="field__input" type="email" name="email" required maxlength="180"
                 autocomplete="email" placeholder="you@company.com">
          <span class="field__error" id="err-email" data-error-for="email"></span>
        </label>
        <label class="field field--wide">
          <span class="field__label">Message</span>
          <textarea class="field__area" name="message" required minlength="10" maxlength="4000"
                    placeholder="What are you building?"></textarea>
          <span class="field__error" id="err-message" data-error-for="message"></span>
        </label>
        <label class="field field--trap" aria-hidden="true">
          <span class="field__label">Company</span>
          <input type="text" name="company" tabindex="-1" autocomplete="off">
        </label>
      </div>
      <div class="form__foot">
        <button class="btn btn--solid" type="submit">Send ${icons.arrowOut}</button>
        <p class="form__status" role="status" aria-live="polite" data-form-status></p>
      </div>
    </form>

    <!-- Shown instead of the form when the site is deployed as pure static
         files with no API behind it. api-probe.ts decides which one applies. -->
    <div class="form-fallback">
      <p class="eyebrow" style="margin-bottom:26px">Or send a message</p>
      <p class="contact__note" style="margin-bottom:26px">Email is the fastest way
        to reach me — it goes straight to my inbox.</p>
      <a class="btn btn--solid" href="${e(
        c.contact.reach.find((r) => r.label === 'Email')?.href ?? ''
      )}">Email me ${icons.arrowOut}</a>
    </div>

    <footer class="footer">
      <span>© ${e(c.meta.year)} ${e(c.meta.name)}</span>
      <span class="footer__views" data-views hidden></span>
      <span>${e(c.meta.location)}</span>
    </footer>
  </section>`;
}

// ------------------------------------------------------------- document ----

export function renderDocument({ content: c, css, entry }) {
  const bySection = {
    work: statementBlock,
    experience: experienceBlock,
    projects: projectsBlock,
    stack: stackBlock,
    background: backgroundBlock,
    contact: contactBlock,
  };

  const body = c.sections.map((s) => bySection[s.id](c, s)).join('\n');

  const rail = c.sections
    .map(
      (s) => `
      <a class="rail__item" href="#${e(s.id)}" data-rail="${e(s.id)}">
        <span class="rail__label">${e(s.label)}</span>
        <span class="rail__tick" aria-hidden="true"></span>
      </a>`
    )
    .join('');

  const chromeSocials = c.socials
    .map(
      (s) =>
        `<a class="icon-btn" href="${e(s.href)}"${
          s.href.startsWith('http') ? ' target="_blank" rel="noopener noreferrer"' : ''
        } aria-label="${e(s.label)}">${icons[s.id] ?? ''}</a>`
    )
    .join('\n    ');

  // Structured data: cheap, and the reference audit flagged its absence.
  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: c.meta.name,
    jobTitle: `${c.meta.role}, ${c.meta.domain}`,
    description: c.meta.description,
    url: c.meta.siteUrl,
    email: c.contact.reach.find((r) => r.label === 'Email')?.value,
    address: { '@type': 'PostalAddress', addressLocality: c.meta.location },
    sameAs: c.socials.filter((s) => s.href.startsWith('http')).map((s) => s.href),
    knowsAbout: c.stack.flatMap((g) => g.items).slice(0, 24),
  });

  return `<!doctype html>
<html lang="en" class="no-js">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${e(c.meta.title)}</title>
<meta name="description" content="${e(c.meta.description)}">
<meta name="author" content="${e(c.meta.name)}">
<meta name="theme-color" content="#0b0b0c">
<link rel="canonical" href="${e(c.meta.siteUrl)}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">

<meta property="og:type" content="profile">
<meta property="og:title" content="${e(c.meta.title)}">
<meta property="og:description" content="${e(c.meta.description)}">
<meta property="og:url" content="${e(c.meta.siteUrl)}">
<meta property="og:image" content="${e(url(c.meta.siteUrl, 'og.png'))}">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${e(c.meta.name)} — ${e(c.meta.tagline)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${e(c.meta.title)}">
<meta name="twitter:description" content="${e(c.meta.description)}">
<meta name="twitter:image" content="${e(url(c.meta.siteUrl, 'og.png'))}">

<!-- Only the two faces the first screen actually paints with. -->
<link rel="preload" href="/fonts/archivo-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/jetbrains-mono-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin>

<style>${css}</style>
<script>
(function(d){var r=d.documentElement;r.classList.remove('no-js');
/* [data-reveal] starts hidden and only the bundle reveals it. If the bundle never
   runs — stale hash, blocked by an extension, evaluation error — put the no-js
   styling back so the page is readable rather than mostly blank. */
setTimeout(function(){if(!window.__portfolioBooted)r.classList.add('no-js')},4000)})(document);
</script>
<script type="application/ld+json">${jsonLd}</script>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>

<div class="progress" data-progress aria-hidden="true"></div>

<p class="chrome chrome--tl">${e(c.meta.name)}</p>
<p class="chrome chrome--tr">${e(c.meta.tagline)}</p>

<nav class="chrome chrome--bl" aria-label="Social links">
    ${chromeSocials}
</nav>

<p class="chrome chrome--br"><span data-progress-pct>000</span> / 100</p>

<nav class="rail" aria-label="Sections">${rail}
</nav>

<main id="main" tabindex="-1">
${heroBlock(c)}
${marqueeBlock(c)}
${body}
</main>

<script type="module" src="${e(entry)}"></script>
</body>
</html>
`;
}
