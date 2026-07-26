# What to build instead of TickPulse

Research done 26 July 2026. Sources are linked inline; where a source is
commercially interested or weak, it says so.

---

## Your actual gap

You have genuinely uncommon depth — atomic read-modify-write in Redis Lua,
exactly-once semantics, event-driven decoupling, concurrency correctness under
real money. Two problems with how it currently reads:

1. **Every bullet is a trading bullet.** Your strength looks domain-specific
   rather than transferable. TickPulse makes that worse, not better — it is your
   day job again with Binance instead of Polygon. You were right to want it gone.
2. **Your AI experience is one Gemini integration**, and your data experience is
   pipeline-adjacent rather than analytical. You move data; you don't yet measure
   anything.

So the project has to do two jobs: re-express your concurrency depth in
non-trading vocabulary, and give you real applied-AI or analytical substance.

## What the market rewards in 2026

**Judgment over output.** CoderPad's State of Tech Hiring 2026 (650 respondents)
found the top signals are "catches and fixes AI mistakes" (66%) and "explains
trade-offs and correctness" (56%), while the stated importance of *writing* code
is falling. <https://coderpad.io/survey-reports/coderpad-state-of-tech-hiring-2026/>

**Portfolios over resumes.** Shopify's VP of Engineering, April 2026: "a resume
tells you what someone did, but never why. Working software tells you much more."

**The AI hiring split**, from the same survey: AI platform engineer **40%**,
data/ML 38%, LLM apps engineer 22%, evaluation engineer 7%. AI/ML specialist is
the hardest role to fill and getting harder. Note that the demand is at the
*platform* layer, not the app layer.

**India specifically.** 2,117 GCCs, Bengaluru holding 34% of the workforce and
the #1 AI hiring market globally — but Zinnov's analysis of 1.7M job descriptions
found **55% of India's GCC work is under direct AI-displacement threat**, and the
"procedural layer" (37.2%) — precisely the CRUD tier a 1-YOE backend dev competes
in — is named as heavily exposed. Senior AI talent intensity in Indian GCCs is
19% versus 33% at HQ. <https://zinnov.com/centers-of-excellence/zinnov-indiaspora-the-gcc-ai-opportunity-2026-report/>

Read that together: the floor is falling out of generic backend work in your
exact market, and the gap is at the AI-infrastructure layer.

### What is now a negative signal

Blunt version, and the direction is well-supported even though the loudest
sources are commercially motivated. The five projects hiring managers now see on
every resume: a PDF chatbot, a "chat with your docs" app, a support-agent
wrapper, a code-review bot, a Streamlit dashboard over an OpenAI call. "In 2023, a
LangChain chatbot on your GitHub meant something. In 2026, that same project is
noise." A hiring manager on HN, Nov 2025: "under 10% of junior résumés I look at
give me confidence that they'd show up and know how to write real systems instead
of just gluing things together."

Also: **a half-finished repo is now worse than no repo** — automated screeners
flag empty repos, broken links and shallow descriptions.

Avoid: another RAG chatbot, a LangChain wrapper, an LLM gateway clone, naive
semantic caching, a trivial MCP wrapper, a regex prompt-injection filter.

### Which applied-AI patterns are actually substantive

| Pattern | Verdict |
|---|---|
| **Durable execution for agents** | Genuinely unsolved. Best opportunity found. |
| Evals / verifier design | Substantive. "LLM-as-judge" is common; a verifier that resists gaming is not. |
| Structured outputs | Commoditised at the surface, **broken at the conditional edges** |
| Guardrails / injection | Respected problem, oversaturated tooling |
| Vector search / naive RAG | Tutorial tier |
| Semantic caching | Real but narrow, widely distrusted |

Two findings I verified directly, because both are load-bearing below:

**Providers silently drop schema logic.** Google's own docs: Gemini "supports a
subset of the JSON Schema specification" — no `if/then/else`, no
`dependentRequired`, no `allOf`, no string `pattern` — and then, plainly: "**The
model ignores unsupported properties.**"
<https://ai.google.dev/gemini-api/docs/structured-output>

**Constrained decoding can make accuracy worse.** dottxt benchmarked token
masking over 5,047 schemas: xgrammar produced 3,417,108 false acceptances,
llguidance 1,470,773 false rejections; on tool-calling with Qwen3-14B both fell
*below* the unconstrained baseline (75.3% and 75.8% vs 78.2%).
<https://blog.dottxt.ai/comparing-the-quality-of-structured-generation-engines.html>

---

# Option 1 — Ratchet ★ recommended

**A durable execution runtime for LLM agent workflows, in Java: it journals every
model call and tool call so a crashed agent resumes at the exact step that
failed, never re-sends the email, and never lets two writers touch one session.**

### The problem

Every agent framework advertises durability and ships boundary checkpointing.
Restate catalogued seven ways that fails: recovery lands on the boundary rather
than the failing step, "a library cannot supervise itself," in-process retry
state dies with the process, two concurrent writers to one session aren't
prevented, sleeps aren't durable, and redeploys silently corrupt in-flight
semantics — their example is a fraud score whose scale changes from 0–10 to
0–100 mid-execution.
<https://www.restate.dev/blog/why-checkpointing-is-not-production-grade-durable-execution>

Diagrid's CTO reached the same conclusion independently: frameworks "would need
to fundamentally rearchitect their runtimes." Both vendors sell durable
execution, so read them as interested — but their claims are specific and
falsifiable, and they agree.

### Architecture

- **Journal** (Spring Boot + Postgres): append-only step log keyed
  `(invocation_id, seq)` — step type, args hash, result JSON, epoch, code version.
- **SDK**: a `durableStep(name, supplier)` wrapper. On replay it returns the
  journaled result instead of re-executing.
- **Dispatch**: Redis Streams consumer groups, `XAUTOCLAIM` for lease expiry and
  work stealing. Failure detection *is* lease expiry — no supervisor.
- **Lua epoch fencing**: `acquire(session, worker)` bumps an epoch monotonically;
  any journal append carrying a stale epoch is rejected atomically. Zombie
  workers get fenced without losing journaled work.
- **Lua timer wheel**: `ZRANGEBYSCORE` + `ZREM` + `XADD` in one script. This
  *must* be atomic or two schedulers fire the same timer twice.
- **Durable promises**: a suspended invocation waiting on human approval holds
  zero threads and zero connections. A month-long wait costs nothing.
- **Version pinning**: invocations record `code_version`; retries route only to
  workers on that version, and journal/code divergence fails loudly.

### Why concurrency is required, not decorative

The correctness properties *are* concurrency properties. Single-writer-per-session
is impossible without atomic epoch fencing. Exactly-once timer firing across
schedulers is impossible without an atomic pop. At-least-once delivery plus
journal dedupe is what yields effectively-once side effects.

This is the same primitive as your trailing-stop engine — atomic read-modify-write
eliminating races between concurrent events — expressed in the vocabulary
platform interviewers actually use: **epochs, leases, journals, fencing, version
pinning**. That relabelling is the whole point.

### Why AI earns its place

Not decorative, and not a wrapper:

1. Replay **must** return the journaled model output. You cannot re-call a
   nondeterministic, paid API. Determinism-by-journaling is the central design
   constraint, not a feature.
2. Every tool call's arguments are validated at the runtime boundary and the
   **schema version is journaled**, so Restate's 0–10-becomes-0–100 corruption is
   *detected* rather than silently misread.
3. Enforcement uses a full validator (networknt supports `if/then` and
   `dependentRequired`) precisely because providers don't — justified by Google's
   own "the model ignores unsupported properties." **The runtime enforces the
   contract the provider won't.**

### The hardest problem, and the interview story

**Deterministic replay across code changes.** An invocation suspended three days
on an approval, redeployed twice, must resume on code that reads the journal
identically. That needs content-addressed step identity, a versioned deployment
registry, retries pinned to the original version, and loud failure on divergence
— and it has to compose with fencing, so a zombie worker on v1 is fenced out by a
v2 worker without losing journaled work. That is a forty-minute whiteboard
conversation that no other candidate is having.

### Metrics you could truthfully claim

Only after you measure them:

- "Verified exactly-once across 500+ injected crash points" — a Testcontainers
  harness that `kill -9`s workers at every journal boundary and asserts
  side-effect counters equal exactly 1.
- **The strongest one:** build a naive boundary checkpointer as a baseline and
  measure wasted replay tokens. *"Cut post-crash replay token cost 78% versus
  boundary checkpointing on a 12-step workflow."* A real number against the
  incumbent design.
- "Fencing rejected 100% of stale-epoch writes under 200 concurrent double-submits."
- "10,000 concurrent suspended approvals on a 512 MB heap, 0 threads held."

### Scope

**v1, 5–7 weeks part-time:** SDK, Postgres journal, Streams dispatch with leases,
Lua fencing, Lua timer wheel, durable approvals, idempotency keys, one demo agent
with a genuinely irreversible side effect (triage an OSV.dev advisory → open a
GitHub issue), the chaos harness, the baseline comparison.
**v1.5, +2–3 weeks:** version pinning and divergence detection — this is the
centrepiece, do it.

State the non-goals in the README: no HA replicated log, no geo-replication, no
multi-language SDKs. Naming your limits reads as maturity.

### Stack

Exercises Java, Spring Boot, Spring Data JPA, **Redis Lua + Streams + consumer
groups** in a new domain, Postgres, Testcontainers (ideal — crash injection),
JMeter, WebFlux.
Adds credibly: **durable execution as a category** (read Temporal and Restate,
then write "how mine differs and what I got wrong" — Google documents a Temporal
+ Gemini integration, so it's first-class, not fringe), and **OpenTelemetry**,
where tracing a *replayed* execution is a genuinely interesting problem.

### Hosting

Oracle A1 Always Free running Docker Compose. Groq's free tier for model steps
(30 RPM / 1K RPD published). Zero cost.

### Why you might not

It reimplements a known category — have a crisp answer to "why not Temporal?"
ready. It has **no clickable demo**, so it convinces engineers and does nothing
for a recruiter keyword-scanning for "GenAI." It is the largest of the three and
the highest risk of ending up half-finished, which is now actively penalised.

---

# Option 2 — Ironclad

**A continuously-running benchmark measuring whether LLM providers actually
enforce the JSON Schema you hand them — including the conditional keywords most
silently ignore — plus the quota-aware distributed harness needed to run it
entirely on free API tiers.**

### The idea

Engineers treat a schema as a contract. Google's docs admit it isn't. dottxt
showed constrained-decoding engines make millions of provable masking errors.
Nobody publishes a continuously-updated multi-provider conformance matrix. This
is the kind of artifact that gets linked and cited, which is worth a great deal
for a portfolio.

### The concurrency heart

A Redis Lua script enforcing **multi-dimensional** limits per (provider, model,
key) — RPM, TPM, RPD *and* in-flight concurrency — decremented in one atomic
script. Genuinely required: Groq's free tier is simultaneously 30 RPM / 1K RPD /
12K TPM / 100K TPD per model; GitHub Models is 10 RPM / 50 RPD. With N workers,
check-then-act blows the quota and gets your keys throttled.

The hard part is **reserve–reconcile–refund**: reserve an *estimated* token budget
before the call, reconcile against the provider's returned usage, refund the delta
atomically — and handle errors that return no usage at all. Then treat a 429 as
evidence your local model of the bucket is wrong and resync, while still
saturating ~95% of free quota or the benchmark takes months.

### What it gives you that Ratchet doesn't

The analytical half of your gap. Per (provider, model, keyword) violation rates
with **Wilson or bootstrap confidence intervals** — because at 50 requests/day you
have small samples and must reason about significance. That is exactly the
statistical rigor missing from your profile, and it is not fakeable.

Notably absent: no LLM-as-judge, no hand-waving. Verification is programmatic.

### Scope, hosting, downsides

3–4 weeks for v1, +2 for the leaderboard and intervals. Fastest of the three and
the highest ratio of shareable artifact to effort. Runs on **GitHub Actions cron**
— no always-on VM at all — with Aiven free Postgres, Upstash free Redis, GitHub
Pages for the leaderboard.

Downsides: it's a benchmark, not a system, so there's less to draw on a
whiteboard. Provider behaviour changes under you and **a stale benchmark is worse
than none**. You'd be publicly grading vendors, so sloppy methodology gets torn
apart. And a Spring Boot team lead may read it as an ML-eval project rather than
backend work.

---

# Option 3 — Backstop

**Consumes the live Wikipedia edit firehose, scores every edit for revert risk,
escalates only the top slice to an LLM for a typed adjudication under a hard
budget, then grades itself weeks later against what the community actually
reverted.**

Wikimedia EventStreams is free and needs no auth; LiftWing gives a revert-risk
probability but no *reason*, and can't reason about coordination across edits.
Three real concurrency problems: atomic sliding windows per user and page,
bounded priority admission for the LLM budget, and exactly-once over a resumable
at-least-once stream.

The genuinely distinctive part is **the delayed-ground-truth loop**: weeks later,
poll the MediaWiki API for whether each scored revision was actually reverted.
Free, real, unbiased labels — so you can compute honest precision/recall and
calibration per component, and report *zero improvement* if the LLM adds nothing.
That honesty is a strong 2026 signal.

**Why it ranks third for you:** it is structurally the closest thing to TickPulse
— external stream, Redis Streams, Lua evaluation, SSE fan-out. Unless the eval
loop is unmistakably the headline, an interviewer sees TickPulse with wikis
instead of candles. Two of its three hard parts you have already demonstrated at
work. And the payoff is calendar-gated behind 4–6 weeks of label maturation.

Also: keep it strictly read-only and advisory. Never write to Wikipedia.

---

# Recommendation

**Build Ratchet. Add Ironclad as a deliberate 5-week companion.**

Ratchet re-expresses your existing strength in transferable vocabulary — the
highest-leverage relabelling available to you, requiring no new skill to start.
And it positions you not as "an AI person" but as the engineer who owns the
**reliability substrate underneath AI**: the highest-demand, hardest-to-fill
segment in the 2026 data, and the one area where independent sources agree the
incumbents have not solved the problem. Building into a documented gap is the
structural opposite of building into a saturated category.

Ironclad covers what Ratchet doesn't: statistical rigor, a shareable public
artifact, and fast time-to-visible-result to de-risk Ratchet's longer timeline.
They share infrastructure — the same Lua governor thinking, the same validator —
so the marginal cost is low. Together they read as one thesis: *this person makes
AI systems correct, and proves it.* That coherence matters, because the real
negative signal is a pile of unrelated shallow repos.

## Regardless of which you pick

- Write a README that explains **why**, not what, and one blog post per project.
- Be able to defend every line without AI help. The 2026 interview countermeasures
  are "explain every line in the diff" and "what breaks at 10x" — so if an agent
  writes Ratchet's Lua, you had better own the fencing argument yourself.
- Publish measured numbers, not adjectives.
- Ship two deep things rather than five shallow ones.
- **Never put a metric on your resume before you have measured it.**

## When it's ready

Replace the TickPulse entry in `frontend/content.json` → `projects`, then
`npm run build`. Nothing else needs touching.

---

### Research caveats

Reddit, LinkedIn, Naukri, Glassdoor and Blind were all blocked, so vendor docs,
engineering blogs and HN were the primary sources. Strong confidence on hosting
limits, free LLM tiers, dataset availability and the applied-AI evidence — all
fetched directly. Weaker on India startup sentiment and the *intensity* of
portfolio-saturation opinion, where the direction is well-supported but the best
sources are commercially motivated. The durable-execution critique comes from two
independent vendors who sell durable execution; their claims are specific and
falsifiable, but they are not neutral.
