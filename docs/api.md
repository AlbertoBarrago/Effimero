# API Reference

The canonical, always-current reference is the interactive Swagger UI served by the API itself at **`/docs/api`** (OpenAPI JSON at `/docs/api/json`). This page is a readable summary.

All endpoints are JSON over HTTP.

**Authentication.** Two credential levels, both passed as `Authorization: Bearer <value>`:

- The **admin key** (`STATS_API_KEY`, auto-generated and logged at boot when not configured) — required for the `/admin/*` registry routes and grants read access to every site.
- A **per-site read token** — issued when a site is registered; grants read access to that one site only. Presenting it for any other site returns `403`.

Read routes (`/stats`, `/live`, `/sites`) accept either credential. `/collect` is public but only records hits for **registered** sites (see `/admin/sites`); hits for unknown sites — or, when a site restricts its origins, from a non-matching `Origin` — are silently dropped.

## POST /collect

Records one pageview. Called by the snippet; you can also call it from any backend.

Request body:

```json
{
  "siteId": "my-site",
  "path": "/pricing",
  "referrer": "https://news.ycombinator.com/item?id=1"
}
```

| Field | Required | Notes |
|---|---|---|
| `siteId` | yes | `^[a-zA-Z0-9._-]{1,64}$` |
| `path` | yes | Max 512 chars. Query string and fragment are stripped server-side. |
| `referrer` | no | Full URL; reduced to hostname before storage. |

Responses: `204` on success (also returned, without recording, when `siteId` is not registered), `400` on schema violation.

The visitor hash is computed server-side from the connection IP and `User-Agent` header, so the payload carries no identity. `Accept-Language` feeds the language counter; GeoIP on the IP feeds the country counter. Both are aggregate-only.

## GET /stats/{siteId}?range={days}

Aggregate statistics for the last `range` days (default 30, capped at `RETENTION_DAYS`).

```json
{
  "days": [{ "day": "2026-07-13", "uniques": 132, "pageviews": 410 }],
  "totals": { "uniques": 132, "pageviews": 410, "pagesPerVisitor": 3.11 },
  "topPaths": [{ "path": "/", "count": 210 }],
  "topReferrers": [{ "referrer": "google.com", "count": 88 }],
  "hours": [0, 0, 3, 12],
  "browsers": [{ "label": "Chrome", "count": 90 }],
  "os": [{ "label": "macOS", "count": 60 }],
  "devices": [{ "label": "desktop", "count": 100 }],
  "languages": [{ "label": "it", "count": 70 }],
  "countries": [{ "label": "IT", "count": 75 }]
}
```

Accuracy notes:

- Daily `uniques` come from HyperLogLog, standard error about 0.81%.
- `totals.uniques` merges the daily HLLs. Because salts differ per day, a returning visitor counts once per day: treat it as an upper bound, not true cross-day uniques. `pagesPerVisitor` inherits this caveat.
- `hours` is a 24-element array of pageviews per UTC hour, summed over the range.

## GET /live/{siteId}

Unique visitors in roughly the last 5 minutes (two 150-second HLL buckets).

```json
{ "live": 7 }
```

Responses: `200`, `401` without a valid credential, `403` when a site token is used for a different site.

## GET /sites

Known site ids seen within the retention window, most recently active first. With the admin key this lists every site; with a per-site token it lists only that site.

```json
{ "sites": ["my-site", "blog"] }
```

## Admin: site registry

All `/admin/*` routes require the **admin key** — a per-site read token cannot manage the registry.

| Method & path | Purpose |
|---|---|
| `POST /admin/sites` | Register a site. Body: `{ "siteId": "my-site", "allowedOrigins": [] }`. Returns the config plus a one-time `readToken`. |
| `GET /admin/sites` | List registered site configs (no token material is returned). |
| `PATCH /admin/sites/{siteId}` | Replace `allowedOrigins`. Body: `{ "allowedOrigins": ["https://example.com"] }`. Does not touch the read token. `404` if unknown. |
| `DELETE /admin/sites/{siteId}` | Remove a site and invalidate its read token. `204`, or `404` if unknown. |
| `POST /admin/sites/{siteId}/token` | Rotate the read token; the previous one stops working. Returns the new `readToken`. |

`allowedOrigins` entries are origins (`https://host[:port]`, no path). An empty list accepts any origin; a non-empty list records hits only from a matching request `Origin` (matched case-insensitively, trailing slash ignored). The `readToken` is shown only once; only its SHA-256 is stored.

## GET /health

```json
{ "status": "ok", "redis": true }
```

`status` is `degraded` when Redis is unreachable.

## Static assets

| Path | Content |
|---|---|
| `/` | Cockpit dashboard |
| `/effimero.js` | The tracking snippet |
| `/docs/api` | Swagger UI |
