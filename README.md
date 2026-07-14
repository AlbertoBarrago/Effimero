# Effimero

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL_3.0-blue.svg)](LICENSE)

Privacy-first web analytics: no cookies, no localStorage, no fingerprinting, no consent banner needed.

## Philosophy

Effimero is free and open source, with no cloud plan and no premium tier. You self-host it, you own your data, and the AGPL-3.0 guarantees the whole stack stays open: anyone may offer Effimero hosting to others, provided their modifications remain open too. Privacy comes from the algorithm, not from a policy page, and the same applies to freedom: it comes from the license, not from a promise.

## How it works

Unique visitors are counted with a **daily rotating salted hash**:

```
visitorHash = SHA-256(IP | User-Agent | dailySalt | siteId)
```

```mermaid
flowchart LR
    IP["IP address"] --> H["SHA-256"]
    UA["User-Agent"] --> H
    S["daily salt 🎲"] --> H
    SID["siteId"] --> H
    H --> HLL["HyperLogLog<br/>unique count only"]
```

- The salt is random, generated once per UTC day, kept only in Redis, and never logged. When it rotates, yesterday's hashes become uncorrelatable with today's, so cross-day tracking is impossible **by construction**, not by policy.
- The raw IP is used only in memory to compute the hash and is never stored.
- Hashes are fed into a Redis **HyperLogLog**, so not even the hash itself is stored verbatim, only a probabilistic cardinality sketch (~0.81% standard error).
- Nothing is written on the visitor's device.

### Known trade-offs (by design)

- No returning-visitor or cross-day unique metrics.
- No multi-touch attribution or session stitching.
- Visitors sharing IP + identical User-Agent within a day count as one.
- Unique counts are probabilistic (HyperLogLog).

## Quick start (self-hosted)

```sh
cp .env.sample .env
docker compose up -d
```

Then add the snippet to your site:

```html
<script src="https://your-host/effimero.js"
        data-site="my-site"
        data-endpoint="https://your-host/collect" defer></script>
```

View stats through the dashboard at `https://your-host/`. The dashboard asks for the `STATS_API_KEY`; set it in `.env`, or retrieve the generated key from the server logs if you left it empty:

```sh
docker compose logs effimero | grep generated
```

You can also query `GET /stats/my-site?range=30` with `Authorization: Bearer <STATS_API_KEY>`.

## Development

```sh
pnpm install
docker run -d -p 6379:6379 redis:7-alpine   # or your own Redis
pnpm --filter @effimero/server dev            # API on :3000
pnpm --filter @effimero/dashboard dev         # dashboard on :5173 (proxies /stats)
pnpm --filter @effimero/snippet build         # builds dist/effimero.js
```

## Configuration (env vars)

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection |
| `ALLOWED_ORIGINS` | `*` | Comma-separated CORS origins |
| `TRUST_PROXY` | `false` | Set `true` behind a reverse proxy so the real client IP is read from `X-Forwarded-For` |
| `RETENTION_DAYS` | `90` | Days of aggregate stats kept in Redis |
| `STATS_API_KEY` | auto-generated | Bearer key protecting `/stats`, `/live`, and `/sites`. Set it in `.env` to keep dashboard access stable across restarts. Empty/unset: a random key is generated and logged at boot. `disabled`: read endpoints are public |

> **Important:** if Effimero runs behind nginx/Caddy/Traefik, set `TRUST_PROXY=true`, otherwise every visitor appears to come from the proxy's IP and unique counts collapse to ~1.

## Packages

- `packages/server`: Fastify ingest + stats API
- `packages/snippet`: ~1 KB browser snippet (SPA-aware, respects DNT/GPC)
- `packages/dashboard`: React dashboard (uniques/day, pageviews, top pages/referrers)

## Documentation

Full docs live in [`docs/`](docs/README.md): [getting started](docs/getting-started.md), [self-hosting](docs/self-hosting.md), [API reference](docs/api.md) (interactive Swagger UI at `/docs/api`), [privacy model](docs/privacy.md), [architecture](docs/architecture.md).

## License

[AGPL-3.0-only](LICENSE). In short: use it, self-host it, modify it, even offer it as a service, but derivative work and network-served modifications must stay open source.

## Credits

Approach inspired by [Margin's blog post on tracking unique visitors without cookies](https://inmargin.io/blog/tracking-unique-visitors-without-cookies).
