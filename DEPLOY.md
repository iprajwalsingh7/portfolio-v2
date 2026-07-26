# Getting this live at iprajwalsingh7.dev

Written for someone who has only used GitHub Pages. Facts checked against vendor
docs on **26 July 2026** — free tiers change, so re-check anything surprising.

---

## Short answer

**Do Step 1 today (20 minutes). It gets your site live on your domain, free,
forever.** Step 2 is optional and can wait weeks.

| | What it gives you | Time |
|---|---|---|
| **Step 1 — Cloudflare Pages** | The whole site, on your domain, HTTPS, global CDN | ~20 min |
| **Step 2 — a server (optional)** | The contact form saving to a database + emailing you | ~1 hour |

Without Step 2 the site is fully working. It notices there is no backend and
shows an **"Email me"** button where the contact form would be. Nothing looks
broken, nothing is missing — I built that in for exactly this reason.

---

## About AWS S3 and the student pack

**S3 is the wrong tool here, and I would skip it.** Three reasons:

1. S3 only serves static files. It cannot run your Spring Boot backend, so it
   solves the easy half of the problem and none of the hard half.
2. S3 alone cannot do HTTPS on your own domain. You need CloudFront in front of
   it plus a certificate in AWS Certificate Manager — three services and an IAM
   policy to host one HTML file. Cloudflare Pages does the same thing in four
   clicks.
3. **AWS no longer has an always-free tier in the old sense.** As of 2026 it is a
   6-month credit model, and accounts can be auto-closed when the credit runs
   out. A portfolio you'll link on your CV for years should not sit on a clock.

**The GitHub Student Developer Pack is still worth claiming** —
<https://education.github.com/pack>, verify with your MVJ email. Historically it
has included DigitalOcean and Azure credits, JetBrains, and a free domain.
Credits expire though, and a dead portfolio link is worse than none, so use them
for experiments and keep the portfolio on something permanently free.

For this project, permanently free means: **Cloudflare Pages** for the site, and
**Oracle Cloud Always Free** if you later want the backend.

---

## First: find out where your domain is

You said Namecheap or Name.com and don't remember. Log in to both — whichever
shows `iprajwalsingh7.dev` under *Domain List* is the one. Or run this and read
the `Registrar:` line:

```bash
nslookup -type=NS iprajwalsingh7.dev
```

Either way, the thing you need from the registrar is the page called
**Nameservers** (Namecheap: Domain List → Manage → Nameservers. Name.com:
My Domains → the domain → Nameservers).

---

# Step 1 — Get the site live

### 1.1 Put the code on GitHub

If it isn't already:

```bash
cd "C:\Users\prajwal\Downloads\Prajwal Singh Portfolio Design\portfolio"
git init
git add .
git commit -m "Portfolio"
```

Create an empty repo at <https://github.com/new> — name it `portfolio`, **do not**
add a README or .gitignore — then:

```bash
git remote add origin https://github.com/iprajwalsingh7/portfolio.git
git branch -M main
git push -u origin main
```

`.gitignore` already excludes `.env`, so your Gmail App Password will not be
uploaded. Check that before pushing: `git status` must not list `.env`.

### 1.2 Connect Cloudflare Pages

This is the GitHub Pages idea, but it can run a build step.

1. Sign up at <https://dash.cloudflare.com/sign-up> — free, no card.
2. Left sidebar → **Workers & Pages** → **Create** → **Pages** →
   **Connect to Git** → authorise GitHub → pick `portfolio`.
3. Fill in the build settings **exactly**:

   | Field | Value |
   |---|---|
   | Framework preset | `None` |
   | Build command | `cd frontend && npm ci && npm run build` |
   | Build output directory | `backend/src/main/resources/static` |
   | Root directory | *(leave empty)* |

4. **Save and Deploy.** First build takes 2–3 minutes.

You get a URL like `portfolio-a1b.pages.dev`. Open it — the whole site should be
there, with the "Email me" button in place of the form.

> **If the build fails**, click the failed deploy and read the log. Almost always
> it is the output directory: it must be `backend/src/main/resources/static`,
> because that is where the frontend build writes.

From now on, `git push` redeploys automatically. That is the whole workflow.

### 1.3 Point your domain at it

1. Cloudflare dashboard → **Add a site** → type `iprajwalsingh7.dev` → **Free**
   plan → Continue.
2. Cloudflare shows **two nameservers**, like
   `dana.ns.cloudflare.com` / `rob.ns.cloudflare.com`. Copy both.
3. At your registrar, open the Nameservers page, switch from "Basic/Default DNS"
   to **Custom DNS**, delete what's there, paste Cloudflare's two, save.
4. Back in Cloudflare, click **Check nameservers**. This takes 5 minutes to a few
   hours. You get an email when it's active.
5. Once active: **Workers & Pages** → your project → **Custom domains** →
   **Set up a domain** → `iprajwalsingh7.dev` → Activate. Repeat for
   `www.iprajwalsingh7.dev`.

Cloudflare creates the DNS records and the HTTPS certificate for you. Nothing to
configure.

Wait a few minutes, then open **https://iprajwalsingh7.dev**. Done.

> `.dev` is on the HSTS preload list, so browsers *refuse* to load it over plain
> HTTP. If you see a security warning right after setup, the certificate is still
> being issued — give it 10 minutes.

### 1.4 Check it

- Open the site on your phone.
- Paste the URL into a LinkedIn post box (don't post) — the preview card should
  show your name on the dark background. That's `og.png`.
- Run <https://pagespeed.web.dev> against it. Expect ~100 on performance.

---

# Step 2 — The backend (optional, later)

Only do this when you want the contact form storing messages in Postgres and
emailing you. Everything else already works without it.

**Use Oracle Cloud Always Free.** It is a real always-free virtual machine —
2 CPU, 12 GB RAM, no time limit, no card charged.

Two other options and why not:

- **Render free** blocks outbound ports 25/465/587, so **Gmail SMTP cannot work
  there**, and its free Postgres is deleted after 30 days. Confirmed at
  <https://render.com/docs/free>.
- **Fly.io / Railway** no longer have usable free tiers for new accounts.

### 2.1 The VM

Sign up at <https://cloud.oracle.com>. Compute → Instances → Create:

- Image **Ubuntu 24.04**
- Shape **VM.Standard.A1.Flex**, 2 OCPU / 12 GB
- Region **India South (Hyderabad)** or **India West (Mumbai)**
- Download the SSH key — you cannot get it again

If you see **"Out of host capacity"**, that region's free ARM machines are full.
Retry in a few hours, or pick shape `VM.Standard.E2.1.Micro` instead — smaller,
but enough.

### 2.2 Open the ports

There are two firewalls and forgetting the second is the classic mistake.

**Cloud side:** Networking → your VCN → Security Lists → Default → Add Ingress
Rules. Source `0.0.0.0/0`, protocol TCP, destination ports **80** and **443**.

**Machine side**, over SSH:

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

### 2.3 Run it

```bash
sudo apt update && sudo apt install -y docker.io docker-compose-plugin git
sudo usermod -aG docker $USER && newgrp docker

git clone https://github.com/iprajwalsingh7/portfolio.git && cd portfolio
cp .env.example .env
nano .env        # DATABASE_PASSWORD, IP_SALT, MAIL_* — see the README
docker compose up -d --build
curl -s localhost:8080/actuator/health     # expect {"status":"UP"}
```

### 2.4 HTTPS on the VM

Add Caddy to `docker-compose.yml`; it gets and renews a certificate by itself.

```yaml
  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports: ["80:80", "443:443"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
    depends_on: [app]

volumes:
  caddy_data:
```

Create `Caddyfile` next to it:

```
iprajwalsingh7.dev, www.iprajwalsingh7.dev {
    encode zstd gzip
    reverse_proxy app:8080
}
```

Then delete the `ports:` block from the `app` service, so only Caddy is exposed.

### 2.5 Move the domain from Pages to the VM

In Cloudflare:

1. Workers & Pages → your project → Custom domains → remove
   `iprajwalsingh7.dev` and `www`.
2. DNS → Records → add:

   | Type | Name | Content | Proxy |
   |---|---|---|---|
   | A | `@` | your VM's public IP | Proxied |
   | CNAME | `www` | `iprajwalsingh7.dev` | Proxied |

3. **SSL/TLS → Overview → Full (strict).** This matters: on *Flexible*,
   Cloudflare talks to your server over HTTP, Caddy redirects HTTP → HTTPS, and
   you get an infinite redirect loop.

The contact form appears on its own once the API answers — no rebuild needed.

Keep the Pages deployment around. If the VM ever dies, point the DNS back at
Pages and your site is up again in minutes.

---

## Cost

| | |
|---|---|
| Cloudflare Pages + DNS + HTTPS | ₹0 |
| Oracle VM | ₹0, no time limit |
| Gmail SMTP | ₹0 |
| `iprajwalsingh7.dev` | ~₹1,200/yr, already paid |

---

## When something breaks

**Pages build fails** — read the deploy log; it's nearly always the output
directory. It is `backend/src/main/resources/static`.

**Domain shows a Cloudflare error** — nameservers haven't propagated. Check the
Overview page says "Active".

**Redirect loop** — SSL/TLS mode is Flexible. Set Full (strict).

**Site is stale after a push** — check the Pages deploy actually succeeded.
`index.html` is served `no-cache`, so there is no browser cache to blame.

**Form shows "Email me" when you expected the form** — the API isn't answering.
`docker compose ps` and `docker compose logs app` on the VM.

---

## Changing the domain later

Edit `frontend/content.json` → `meta.siteUrl`, then `npm run build`. The canonical
tag, social preview URLs, JSON-LD, `robots.txt` and `sitemap.xml` are all
generated from that one field.
