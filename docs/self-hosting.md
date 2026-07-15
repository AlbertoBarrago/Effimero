# Self-Hosting

Effimero ships as a single Docker image plus Redis. This page covers production deployment.

## Docker Compose (recommended)

The repository includes a production-ready `docker-compose.yml`:

```sh
cp .env.sample .env
docker compose up -d
```

Redis persists to a named volume with RDB snapshots every 5 minutes. Aggregate stats survive restarts; the daily salt intentionally lives only in Redis memory keys with a TTL.

## Small indie deployment

For a small indie project, a single low-cost VPS is enough. The simplest setup to try first is:

- Hetzner Cloud CX23, or equivalent small VPS
- Ubuntu LTS
- Docker and Docker Compose
- Caddy in front for HTTPS
- Hetzner backups enabled

Expected cost is roughly 5-6 EUR/month for the server plus backups, excluding the domain. This keeps the deployment boring: one VM, one Docker Compose stack, one Redis volume, no managed services.

Recommended `.env` values for this shape:

```dotenv
STATS_API_KEY=<strong-random-key>
TRUST_PROXY=true
ALLOWED_ORIGINS=https://your-site.example
RETENTION_DAYS=90
```

Use `TRUST_PROXY=true` only when Effimero is actually behind Caddy, nginx, Traefik, or another reverse proxy that forwards the real client IP.

## Configuration reference

All configuration is via environment variables on the `effimero` service:

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP listen port |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection string |
| `ALLOWED_ORIGINS` | `*` | Comma-separated CORS origins for response headers (global). Per-site ingest restriction is configured per site via `allowedOrigins`, not here. |
| `TRUST_PROXY` | `false` | Trust `X-Forwarded-For` for the client IP. Required behind any reverse proxy. |
| `RETENTION_DAYS` | `90` | How long aggregate daily stats are kept in Redis. |
| `STATS_API_KEY` | auto-generated | **Admin** bearer key: manages the site registry (`/admin/*`) and reads every site (`/stats`, `/live`, `/sites`). Per-site read tokens (issued at registration) read a single site. Set it in `.env` to keep access stable across restarts. Empty/unset: a random key is generated and logged once at boot. Set `disabled` to make all endpoints public. |

## Site registry & access levels

Ingest is gated: `/collect` only records hits for **registered** sites, so nobody can inject stats for a site you never set up. Register each site with the admin key, and optionally restrict which origins may send hits:

```sh
curl -X POST https://your-host/admin/sites \
     -H "Authorization: Bearer <STATS_API_KEY>" \
     -H "Content-Type: application/json" \
     -d '{"siteId":"my-site","allowedOrigins":["https://my-site.com"]}'
```

Registration returns a **per-site read token**, shown only once. Two credential levels exist, both passed as `Authorization: Bearer <value>`:

- the **admin key** (`STATS_API_KEY`) — manages the registry and reads every site;
- a **per-site read token** — reads only its own site (`403` for any other). Hand it to a client so they see their data and nothing else. Rotate it with `POST /admin/sites/my-site/token`.

This makes a single instance safe to share across tenants: each site is isolated for both ingest (registry + origins) and reads (scoped token).

## Dashboard access key

The dashboard reads `/stats`, `/live`, and `/sites`; it accepts either the admin key or a per-site read token. If `STATS_API_KEY` is not set, Effimero generates a random admin key for the current server run:

```sh
docker compose logs effimero | grep generated
```

Use the value after `generated one for this run:` in the dashboard prompt, or in API requests:

```sh
curl -H "Authorization: Bearer <STATS_API_KEY>" \
  "http://localhost:3000/stats/my-site?range=30"
```

Auto-generated keys are convenient for local testing, but they change on restart. For production or long-running self-hosted instances, set a stable key in `.env`:

```dotenv
STATS_API_KEY=change-me
```

To rotate it, change the `.env` value and restart the `effimero` service. Use `STATS_API_KEY=disabled` only when the read endpoints can be public.

## Reverse proxy

In production you will normally terminate TLS in front of Effimero. Two things matter:

1. **Set `TRUST_PROXY=true`.** Without it, every request appears to come from the proxy IP, all visitors collapse into one hash, and unique counts flatline at 1. This is the single most common misconfiguration.
2. **Forward the real client IP.**

### Caddy

```
analytics.example.com {
    reverse_proxy effimero:3000
}
```

Caddy sets `X-Forwarded-For` automatically.

### nginx

```nginx
server {
    listen 443 ssl;
    server_name analytics.example.com;

    location / {
        proxy_pass http://effimero:3000;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Host $host;
    }
}
```

## Hardening checklist

- Register only the sites you actually run; unregistered `siteId`s are dropped, so leaving the registry tight is the first line of defense against injected stats.
- Set each site's `allowedOrigins` to the origins that embed its snippet, so only those origins can record hits.
- Hand out **per-site read tokens** instead of the admin key; keep the admin key to yourself.
- Keep `STATS_API_KEY` set to a strong value. Optionally add proxy auth for the dashboard, while leaving `/collect` and `/effimero.js` public.
- Do not expose Redis outside the Docker network.
- Keep `RETENTION_DAYS` as low as your reporting needs allow. Less retained data is always the better privacy default.

## Scaling notes

- The server is stateless; you can run multiple replicas against the same Redis. Daily salt creation is atomic (`SET NX`), so concurrent instances agree on the salt.
- Redis memory use is modest: HyperLogLog keys are at most 12 KB each regardless of traffic volume, plus small counter hashes per site and day.

## Backup

The only data worth backing up is the Redis volume (aggregate history). The daily salt must never be backed up; losing it is by design, restoring an old one would weaken the privacy model.
