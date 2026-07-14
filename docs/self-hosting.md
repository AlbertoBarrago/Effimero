# Self-Hosting

Effimero ships as a single Docker image plus Redis. This page covers production deployment.

## Docker Compose (recommended)

The repository includes a production-ready `docker-compose.yml`:

```sh
docker compose up -d
```

Redis persists to a named volume with RDB snapshots every 5 minutes. Aggregate stats survive restarts; the daily salt intentionally lives only in Redis memory keys with a TTL.

## Configuration reference

All configuration is via environment variables on the `effimero` service:

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP listen port |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection string |
| `ALLOWED_ORIGINS` | `*` | Comma-separated list of CORS origins allowed to POST hits. Use your site origins in production. |
| `TRUST_PROXY` | `false` | Trust `X-Forwarded-For` for the client IP. Required behind any reverse proxy. |
| `RETENTION_DAYS` | `90` | How long aggregate daily stats are kept in Redis. |
| `STATS_API_KEY` | auto-generated | Bearer key required by `/stats`, `/live`, and `/sites`. When unset, a random key is generated and logged once at boot. Set `disabled` to make read endpoints public. |

## Dashboard access key

The dashboard reads `/stats`, `/live`, and `/sites`, so it needs the same bearer key as the API. If `STATS_API_KEY` is not set, Effimero generates a random key for the current server run:

```sh
docker compose logs effimero | grep generated
```

Use the value after `generated one for this run:` in the dashboard prompt, or in API requests:

```sh
curl -H "Authorization: Bearer <STATS_API_KEY>" \
  "http://localhost:3000/stats/my-site?range=30"
```

Auto-generated keys are convenient for local testing, but they change on restart. For production or long-running self-hosted instances, set a stable key:

```yaml
services:
  effimero:
    environment:
      STATS_API_KEY: "change-me"
```

To rotate it, change the value and restart the `effimero` service. Use `STATS_API_KEY=disabled` only when the read endpoints can be public.

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

- Restrict `ALLOWED_ORIGINS` to the sites that actually embed the snippet.
- Do not expose Redis outside the Docker network.
- Keep `STATS_API_KEY` set to a strong value. Optionally add proxy auth for the dashboard, while leaving `/collect` and `/effimero.js` public.
- Keep `RETENTION_DAYS` as low as your reporting needs allow. Less retained data is always the better privacy default.

## Scaling notes

- The server is stateless; you can run multiple replicas against the same Redis. Daily salt creation is atomic (`SET NX`), so concurrent instances agree on the salt.
- Redis memory use is modest: HyperLogLog keys are at most 12 KB each regardless of traffic volume, plus small counter hashes per site and day.

## Backup

The only data worth backing up is the Redis volume (aggregate history). The daily salt must never be backed up; losing it is by design, restoring an old one would weaken the privacy model.
