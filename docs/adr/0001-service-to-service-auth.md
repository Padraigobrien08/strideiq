# ADR 0001 — Service-to-service authentication between the Next BFF and FastAPI

- **Status:** Accepted for local development. Production mechanism **proposed**, not
  implemented; remote traffic is disabled until it is.
- **Date:** 2026-10-17
- **Context:** [ARCHITECTURE-MIGRATION.md §6](../ui-overhaul/ARCHITECTURE-MIGRATION.md), Milestone A

## Context

The browser talks only to same-origin Next routes. Those routes (the BFF) will call a
FastAPI service for capabilities as they move across. FastAPI must be able to trust two
things about each request: that it came from our BFF, and which athlete it is for.

What the repository tells us today:

- Browser identity is an HMAC-signed session cookie (`strideiq_session`,
  `lib/auth/session.ts`, keyed by `SESSION_SECRET`): `userId.exp.signature`, 30-day
  lifetime, verified with `timingSafeEqual`.
- Automation uses `x-strideiq-api-key` mapped to one user (`STRIDEIQ_API_KEY`,
  `STRIDEIQ_API_KEY_USER_ID`), resolved in `lib/intelligence/auth.ts`.
- Production hosting for Next is Vercel + Neon (`docs/DEPLOYMENT.md`). **No backend host
  is chosen** (§10 of the migration plan leaves it open on purpose), so the network
  topology between Next and FastAPI — public internet, private networking, same region —
  is unknown.
- Milestone A exposes only unauthenticated health/readiness endpoints. No endpoint that
  needs identity exists on the backend yet.

## Decision

### Now (Milestone A): no remote traffic at all

Rather than invent an auth scheme for an unknown network, nothing is allowed to cross one:

1. **Next side** — `lib/api-client/backend.ts` refuses any `STRIDEIQ_BACKEND_URL` whose
   host is not loopback (`127.0.0.1`, `localhost`, `[::1]`), returning
   `503 backend_disabled` without making a request.
2. **Backend side** — `Settings` refuses to start when
   `STRIDEIQ_BACKEND_ENVIRONMENT` is `preview` or `production`. `npm run backend:dev`
   binds to `127.0.0.1`.
3. **Never forward browser credentials.** The BFF builds outbound headers from scratch
   (`accept`, `x-request-id`); cookies and `authorization` are never copied. This is
   tested (`app/api/__tests__/backend-health.test.ts`).
4. **No CORS** on FastAPI: no browser origin is ever a legitimate caller.

### Later (before the first protected endpoint moves): signed identity assertion

Proposed mechanism, to be confirmed when a backend host is chosen:

- For each backend call the BFF mints a **short-lived signed assertion** (JWT):
  `iss=strideiq-bff`, `aud=strideiq-backend`, `sub=<user id>`, `iat`, `exp ≤ 60s`, `jti`.
  It travels in `Authorization: Bearer …`. Requests with no athlete (health, webhooks
  relayed by the BFF) use the same token without `sub`.
- **Asymmetric signing (EdDSA/Ed25519)**: Next holds the private key, FastAPI only the
  public key, so a compromised backend cannot mint BFF tokens. A dedicated key — never
  `SESSION_SECRET` — with a `kid` header so keys rotate without downtime.
- FastAPI verifies signature, `aud`, `iss`, `exp` (small clock skew allowance) on every
  protected route via one dependency, and **independently authorizes** the
  user ↔ resource relationship. A valid token proves the caller; it does not prove the
  athlete owns the activity being requested.
- Network isolation (private networking or an allow-listed ingress) is
  defence-in-depth, not the control. The token must be sufficient on its own.

### Options considered

| Option                                            | Verdict                                                                                                                    |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Forward the browser session cookie                | Rejected. Couples FastAPI to the cookie format and `SESSION_SECRET`; forbidden by the migration plan.                      |
| Static shared bearer secret + `x-user-id` header  | Rejected. A leaked secret lets anyone act as any athlete indefinitely; no expiry, no audience.                             |
| HMAC (HS256) signed assertion                     | Acceptable fallback. Simpler, but FastAPI then holds a key that can mint tokens.                                           |
| **Ed25519 signed short-lived assertion**          | **Proposed.** Expiring, audience-bound, per-user, verifiable without the signing key.                                      |
| Host-provided workload identity (e.g. OIDC, mTLS) | Possibly better, but depends on the unchosen host. Re-evaluate when hosting is chosen; it can replace the token transport. |

## Consequences

- Milestone A can be deployed nowhere but a developer machine. That is intended.
- Before any protected endpoint or non-local environment: implement the assertion on both
  sides, add `preview`/`production` to the allowed environments only when it is enforced,
  replace the loopback rule with "authenticated", and add tests for expired, wrong-audience,
  wrong-signature and missing-token requests.

## Unresolved (needs a decision outside this repository)

1. Backend hosting provider and region, and whether it offers private networking to
   Vercel.
2. Key storage and rotation process for the signing key in each environment.
3. Preview environments: whether each preview gets its own backend, and how keys and
   compatible contract versions are paired.
4. Whether MCP/API-key automation keeps terminating in Next (current behaviour) or gets
   its own backend credential.
