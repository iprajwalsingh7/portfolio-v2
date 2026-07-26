# prajwalsingh.dev

Portfolio site. A prerendered static frontend served by a Spring Boot backend that
also handles contact intake and view metrics.

Built from the Claude Design source (`Prajwal Portfolio v5.dc.html`) — same
typography, palette, and layout, rebuilt as a real project with the design tool's
runtime removed.

---

## Run it

**Everything, one command** — needs Docker only:

```bash
cp .env.example .env      # set DATABASE_PASSWORD and IP_SALT
docker compose up --build
# http://localhost:8080
```

`--build` matters. Compose reuses a cached image otherwise, so changes to the
Dockerfile or to any source file will not appear.

**Frontend only** — needs Node 20+:

```bash
cd frontend
npm install
npm run dev               # http://localhost:5173
```

`/api/*` is proxied to `localhost:8080`, so the form and view counter work if the
backend is running and degrade quietly if it isn't.

**Backend only** — needs JDK 21 and Maven 3.9+:

```bash
cd frontend && npm install && npm run build   # generates the static bundle first
cd ../backend && mvn spring-boot:run          # http://localhost:8080
```

The default `dev` profile uses in-memory H2 and disables mail, so this needs no
Postgres and no SMTP.

**Verify everything:**

```bash
cd frontend && npm run verify   # build + typecheck + 72 smoke checks in jsdom
cd backend  && mvn test         # API contract, rate limits, concurrent dedupe
```

`npm run smoke` loads the real built `index.html` and the real bundle into jsdom
and asserts the things that fail silently: that the design tool's runtime is gone,
that every anchor resolves, that a filled honeypot looks like success, that the
frame loop survives a throwing subscriber, that no accent-derived colour is
hardcoded. Most of those checks exist because the corresponding bug was actually
found in review.

---

## How it's put together

```
frontend/
  content.json            single source of truth for every word on the page
  scripts/
    prerender.mjs         content.json + CSS -> index.html, at build time
    template.mjs          the HTML itself (pure function, no framework)
    copy-fonts.mjs        pulls the woff2 subsets out of node_modules
  src/
    main.ts               boots the enhancement modules, guards each one
    env.ts               capability + preference detection
    modules/
      ticker.ts           the page's only requestAnimationFrame loop
      scroll.ts           Lenis, progress bar, section rail
      reveal.ts           IntersectionObserver reveals, stat counters
      hero-canvas.ts      generated hero backdrop
      marquee.ts          pauses the ticker tape when offscreen
      contact.ts          form interception + inline validation
      views.ts            footer view counter
      accent.ts           accent switcher
      api.ts              typed client for the backend
  styles/index.css        the whole stylesheet; inlined into <head> at build

backend/
  config/                 properties, cache policy, security headers, executors
  content/                serves the same content.json the page was built from
  contact/                intake: validation, honeypot, rate limits, mail
  metrics/                unique daily view counter + retention
  common/                 error shape, rate limiter, visitor identity
  resources/db/migration/ Flyway schema
```

The frontend build writes into `backend/src/main/resources/static`, so `mvn package`
produces **one jar** containing the site and the API. No CDN to sync, no CORS in
production, no second deploy target.

### Content flows one way

`content.json` is the only place any copy lives.

```
content.json ──> prerender.mjs ──> index.html   (what visitors read)
             └─> resources/     ──> /api/content (same bytes, over HTTP)
```

Editing a project description means editing one file and rebuilding. The page and
the API cannot drift apart because they are generated from the same source.

---

## Why it's fast

The point of the original design was motion, so the budget went on making motion
cheap rather than on trimming features.

**Nothing blocks the first paint.** Markup and the entire stylesheet are inlined
into `index.html` at build time. The LCP element — the hero headline — is in the
first bytes off the wire. No framework hydration, no client-side rendering, no
layout shift.

| | transfer |
|---|---|
| `index.html` (markup + all CSS) | **11.2 kB** gzipped |
| JavaScript (Lenis + all page code) | **9.3 kB** gzipped |
| fonts (4 woff2 subsets, cached forever) | 108 kB |

**Fonts are self-hosted.** The design pulled Archivo and JetBrains Mono from Google
Fonts, which costs two extra DNS lookups and TLS handshakes before any text can
render. They now ship from `/fonts` as latin-only subsets, preloaded, `swap`.

Only glyphs inside those subsets are used. The original's `✕ ◆ ↗` sit outside the
latin range and would have silently fallen back to a system font mid-layout, so
they are inline SVG now.

**One rAF loop, not three.** Lenis, the hero canvas, and every scroll-linked write
share a single `requestAnimationFrame` subscription (`modules/ticker.ts`). It stops
completely when the tab is hidden or nothing is subscribed.

**Nothing animates offscreen.** The marquee pauses (and drops its compositor
layer), the hero canvas stops, reveal observers unsubscribe after firing.

`content-visibility: auto` was tried on the below-fold sections and removed. It
reports each unrendered section as its `contain-intrinsic-size` placeholder, and
Lenis resolves and clamps a `scrollTo` target once against a cached scroll limit —
so rail links to later sections landed short and the progress readout ran
backwards as real heights appeared. The document is 11 kB gzipped and paints in
one frame; skipping offscreen layout was not worth losing scroll accuracy for.

**No layout thrash.** Only `transform` and `opacity` are animated. Section offsets
are measured on resize and cached, never read inside the loop. Text writes are
guarded by a dirty check, so a stationary page writes nothing. `will-change` is
added on reveal and removed on `transitionend` rather than left on.

**Caching is split by mutability.** Vite content-hashes everything under `/assets`,
so those are `immutable, max-age=1y`. `index.html` is `no-cache` — otherwise a
deploy would be invisible to returning visitors.

**Reduced motion is honoured properly.** `prefers-reduced-motion` is respected in
CSS before JS boots, the canvas never initialises, and flipping the OS setting
mid-session tears down and rebuilds rather than half-applying. The canvas is also
skipped on low-core / low-memory devices.

---

## Why there's a backend

`POST /api/contact` — validated, honeypotted, rate limited, persisted, then
emailed. Three independent brakes, cheapest first: the honeypot runs before
anything touches the database, then a per-IP token bucket, then a per-address
daily cap. The database is the source of truth and the email is best-effort and
async — if SMTP is down the message is still safely stored.

`GET|POST /api/metrics/views` — unique visitors per day. The dedupe is the part
worth reading. The obvious version — "select, then insert if absent" — lets two
concurrent requests from the same visitor both pass the check. Instead it inserts
into a table whose primary key is `(ip_hash, day)` with
`on conflict do nothing`, and reads the affected-row count as the answer: 1 means
new, 0 means already counted. Uniqueness is decided by the database, atomically,
in one statement. A test fires sixteen simultaneous requests from one visitor and
asserts the total moves by exactly one.

(This started out using `save()` and catching the constraint violation. That
silently did nothing: Spring Data sees a non-null assigned id, decides the entity
is not new, and routes to `merge()` — which finds the row and updates it, so no
violation ever fires and every hit counted. Catching it would not have worked
either, since a JPA flush failure marks the transaction rollback-only.)

`GET /api/content` — the content that built the page.

`GET /actuator/health` — liveness and readiness probes.

**Visitor IPs are never stored.** Both the rate limiter and the counter need only
"is this the same caller as before", which a salted SHA-256 answers. Set `IP_SALT`
per deployment — with a known salt, hashing the whole IPv4 space is minutes of
work. The prod profile refuses to start without it.

**Virtual threads.** The workload is entirely blocking I/O — one Postgres round
trip and one SMTP handshake — which is exactly the case virtual threads exist for.
`@Async` mail runs on them too, so a slow relay parks a cheap carrier rather than
occupying a pooled platform thread.

**Security headers ship on every response** (`SecurityHeadersFilter`): a strict
CSP with no third-party origins, `nosniff`, `DENY` framing, a referrer policy, a
permissions policy, and HSTS over TLS. Spring Security would supply these, but
pulling in the whole framework for a site with no authentication isn't a trade
worth making.

---

## Contact email

Submissions are always written to Postgres. Email is a notification on top of
that, so getting it wrong loses nothing — but it is worth getting right.

```bash
CONTACT_MAIL_ENABLED=true
CONTACT_NOTIFY_TO=prajwalsingh0605@gmail.com   # where it lands
CONTACT_FROM=                                   # blank = use MAIL_USERNAME
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USERNAME=you@gmail.com
MAIL_PASSWORD=xxxxxxxxxxxxxxxx                  # 16-char App Password
```

**Gmail needs an App Password, not your account password.** Turn on 2-Step
Verification, then Google Account → Security → App passwords. You get 16
characters; spaces in it are ignored.

**`CONTACT_FROM` must be the authenticated account.** Gmail rejects any other
sender with `5.7.001`, so `no-reply@yourdomain.dev` fails even though it looks
right. Leave it blank and the app uses `MAIL_USERNAME`. To send as your own
domain, add it under Gmail → Settings → Accounts → *Send mail as* first, or use a
relay built for it (Resend, Postmark, SES) — those only need `MAIL_HOST`,
`MAIL_USERNAME` and `MAIL_PASSWORD` swapped out.

`Reply-To` is set to the visitor's address, so replying from your inbox reaches
them directly.

**On startup the app tells you whether it is set up correctly.** Look for one of:

```
Contact mail ready: you@gmail.com -> prajwalsingh0605@gmail.com via smtp.gmail.com
Contact mail is disabled. Submissions are stored in contact_message ...
Gmail will reject mail sent as <no-reply@...> from the account <you@gmail.com> ...
```

**Test it end to end:**

```bash
curl -si localhost:8080/api/contact \
  -H 'Content-Type: application/json' \
  -d '{"name":"Test","email":"you@example.com","message":"Testing the contact form."}'
```

`{"ok":true,...}` means it was stored. The email follows a second later; watch the
logs for `Notified for contact <id>`. If mail fails, the row is still there:

```sql
select id, name, email, created_at, notified from contact_message order by created_at desc;
```

`notified = false` means the message arrived but the email did not.

Note the rate limit — 3 submissions per IP per hour in production. In the `dev`
profile it is 50 per minute so testing is not a chore.

---

## The form works without JavaScript

`POST /api/contact` accepts both `application/json` (the fetch path) and
`application/x-www-form-urlencoded`. The form in the HTML has a real `action` and
`method`, so with JS disabled the browser submits it natively and the server
replies with a plain confirmation page. Same validation, same rate limits, same
storage.

---

## Deploying

Any host that runs a container and gives you a Postgres URL. The image is a
non-root Alpine JRE running the Spring Boot jar with a plain `java -jar`.

The build is three stages: Node builds the site into the backend's
`resources/static`, Maven packages both into one jar, and the runtime stage carries
only that jar. Dependency layers cache on the manifests, so an edit to
`content.json` or a `.java` file does not re-download anything.

Deliberately *not* layered-jar extracted. Splitting the jar into Boot's layer
directories does make a code-only deploy push kilobytes instead of ~60 MB, but both
the layer layout and the launcher class have moved between Boot versions, and
getting either wrong fails at container start with `ClassNotFoundException` — not
at build time. Not worth it for a personal site.

Required in production:

| variable | why |
|---|---|
| `SPRING_PROFILES_ACTIVE=prod` | switches to Postgres + Flyway + real SMTP |
| `DATABASE_URL`, `DATABASE_USER`, `DATABASE_PASSWORD` | Postgres |
| `IP_SALT` | app will not start without it — `openssl rand -hex 32` |
| `MAIL_*`, `CONTACT_*` | only if you want notification email — see below |

Put it behind exactly one reverse proxy. `server.forward-headers-strategy=framework`
trusts `X-Forwarded-*`, which is correct behind a proxy you control and wrong if
anything can reach the app directly — `X-Forwarded-For` is client-supplied, so a
direct caller could forge their own address and defeat the rate limiter.

To deploy as a **static site instead** (Vercel, Netlify, Cloudflare Pages), point
the build at `frontend` and run `npm run build`. Everything degrades on its own:
the contact form falls back to the `mailto:` link beside it and the view counter
stays hidden rather than showing a broken value.

---

## Editing the content

Everything is in `frontend/content.json`.

| what | where |
|---|---|
| headline, lede | `hero` |
| the three statistics | `stats` |
| jobs and bullet points | `experience.roles` |
| projects | `projects` |
| skills | `stack` |
| education | `education` |
| email, phone, links | `contact.reach`, `socials` |
| accent colour options | `accents` |

Then `npm run build`. The four accent colours from the design's `accent` prop are
wired to the swatches in the bottom-left corner and remembered in `localStorage`.

Replace `frontend/public/Prajwal-Singh-Resume.pdf` to update the resume download.

---

## Notes on the port

- **The "Java — primary language" statistic is gone**, as requested. Its slot now
  holds *2,700+ lines of Lua shipped without a backend recompile*, from the
  LuaJ pipeline on your resume.
- **`education` is a new section** (`05 — BACKGROUND`) that the design didn't have.
  A 2026 graduate's site probably shouldn't omit the degree — but if you disagree,
  delete the `background` entry from `sections` in `content.json` and it disappears.
- **The hero image slot was empty** in the design. Rather than ship a heavy
  photograph, the backdrop is generated: drifting tick series over a faint grid,
  zero bytes of network.
- **A third project card, "This Site", was added** so the stack on the page matches
  the stack behind it.
- Stated numbers all trace to your resume. `20+ technologies` counts the `stack`
  entries; `4+ years` is carried over from the design.
