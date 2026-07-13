# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Effimero is privacy-first, self-hosted web analytics (AGPL-3.0). Visitor identity is `SHA-256(IP | User-Agent | dailySalt | siteId)`, computed server-side in memory and never stored: the hash only feeds Redis HyperLogLog sketches, and the salt rotates at midnight UTC (cross-day tracking is impossible by construction). Any change must preserve this invariant: no raw IP, raw User-Agent, or per-visitor row may ever be persisted or logged.

## Commands

```sh
pnpm install
pnpm -r typecheck                     # tsc --noEmit on all packages
pnpm -r build                         # snippet (esbuild) + server (tsc) + dashboard (vite)
pnpm --filter @effimero/server dev    # API on :3000 (needs Redis on :6379)
pnpm --filter @effimero/dashboard dev # Vite on :5180, proxies /stats /live /sites /health to :3000
docker compose up -d --build          # full stack (server+snippet+dashboard image, plus Redis)
```

There is no test suite yet. Verification is done end-to-end: seed hits with `curl -X POST localhost:3000/collect -H 'Content-Type: text/plain' -d '{"siteId":"my-site","path":"/x"}'`, read back via `/stats/my-site?range=1` with the bearer key, or click through `packages/test-site` (serve it with `python3 -m http.server 8080 -d packages/test-site`).

The read endpoints (`/stats`, `/live`, `/sites`) require `Authorization: Bearer <STATS_API_KEY>`. When the env var is unset the server generates a key per run and logs it once: `docker compose logs effimero | grep generated`. `STATS_API_KEY=disabled` opens them.

## Architecture

pnpm workspaces monorepo. `packages/server` is the core; `snippet`, `dashboard`, `website`, `test-site` are satellites. The Dockerfile builds everything into one image where the server serves the dashboard and `effimero.js` as static files from `packages/server/public`.

Server modules (`packages/server/src`) are deliberately single-responsibility:

- `index.ts` — HTTP wiring only; routes call one function each
- `salt.ts` — daily salt via Redis `SET NX` + TTL (atomic across replicas, no cron; the salt must never be logged or persisted elsewhere)
- `hash.ts` — pure hash function
- `enrichment.ts` — UA/GeoIP/language reduced to coarse buckets (never store raw values)
- `stats.ts` — all Redis access: `PFADD` uniques + 5-min live buckets, counters/hashes per site+day with per-key TTL for retention, `sites` zset for the picker
- `auth.ts` — bearer-key preHandler, `timingSafeEqual` comparison, key auto-generation
- `schemas.ts` — JSON Schemas: single source of truth for both request validation and the OpenAPI doc served at `/docs/api`. New/changed routes must update the schema, not just the handler.

Data flow: snippet → `POST /collect` (public) → salt + hash + enrichment in memory → aggregate writes → dashboard reads aggregates via authed endpoints. See the mermaid diagram in `docs/architecture.md`.

## Non-obvious constraints

- **The beacon is sent as `text/plain`, not `application/json`**: a JSON content type forces a CORS preflight that browsers refuse to pair with `sendBeacon`, silently dropping hits. `index.ts` has a matching `text/plain` content-type parser. Do not "fix" either side.
- The snippet self-disables on DNT/Global Privacy Control by design (this is why local testing may show no beacons; use a clean browser profile).
- `TRUST_PROXY=true` is required behind any reverse proxy, otherwise all visitors collapse into one hash.
- pnpm settings (`onlyBuiltDependencies`, `overrides`) live in `pnpm-workspace.yaml`, not in `package.json` (pnpm 10). `packageManager` in root `package.json` pins the version corepack uses in Docker.
- `.dockerignore` excluding `node_modules` is load-bearing: without it, `COPY packages/...` overwrites the image's installed symlinks and the build breaks.
- Range-wide `totals.uniques` merges daily-salted HLLs: it is an upper bound, not true cross-day uniques. Keep this caveat wherever the number is surfaced.
- Docs live twice: markdown in `docs/` (GitHub) and the HTML page `packages/website/docs/index.html` (served with the site). Config/API changes must update both, plus the env table in `README.md`.
- Prose style: no em-dashes in any user-facing copy; the original service that inspired the approach is called Margin (`inmargin.io`) and keeps its own name in credits.
