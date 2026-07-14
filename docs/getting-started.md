# Getting Started

This guide takes you from zero to live analytics in about five minutes.

## Prerequisites

- Docker with Compose (for the server)
- A website you can add a `<script>` tag to

## 1. Start the server

```sh
git clone https://github.com/albertobarrago/effimero && cd effimero
docker compose up -d
```

This starts two containers: the Effimero server on port 3000 and a Redis instance with persistence enabled. Verify it is up:

```sh
curl http://localhost:3000/health
# {"status":"ok","redis":true}
```

## 2. Add the snippet to your site

Place this tag in your page `<head>` or before `</body>`:

```html
<script src="https://your-host/effimero.js" data-site="my-site" defer></script>
```

Attributes:

| Attribute | Required | Description |
|---|---|---|
| `data-site` | yes | Site identifier. Letters, digits, `.`, `_`, `-`, max 64 chars. Pick one per site. |
| `data-endpoint` | no | Collect endpoint URL. Defaults to `/collect` on the host serving the snippet. |

The snippet weighs about 700 bytes, tracks SPA navigations (pushState and popstate), and disables itself when the browser sends Do Not Track or Global Privacy Control.

## 3. Unlock the dashboard

Read endpoints are protected by an access key. On first boot Effimero generates one and logs it:

```sh
docker compose logs effimero | grep generated
```

The log line looks like this:

```text
STATS_API_KEY not set, generated one for this run: <key>
```

Open the dashboard at `http://localhost:3000/` or `https://your-host/`, paste the key when prompted, and you are in. The generated key changes whenever the server restarts. Set `STATS_API_KEY` in `docker-compose.yml` to keep a stable key:

```yaml
environment:
  STATS_API_KEY: "change-me"
```

## 4. Watch the data arrive

Enter your site id in the dashboard and you will see:

- live visitors (rolling 5-minute window)
- daily unique visitors and pageviews
- top pages and referrers
- browsers, operating systems, device classes, languages, countries
- pageviews by hour of day

## Local development

```sh
pnpm install
docker run -d -p 6379:6379 redis:7-alpine
pnpm --filter @effimero/server dev        # API on :3000
pnpm --filter @effimero/dashboard dev     # dashboard on :5180
pnpm --filter @effimero/snippet build     # rebuilds dist/effimero.js
```

A ready-made test site lives in `packages/test-site`; serve it with any static server:

```sh
python3 -m http.server 8080 -d packages/test-site
```

Click around it and watch hits land in the dashboard.

## Next steps

- How the access key works and how to rotate it: see [Self-Hosting](self-hosting.md).
- Put Effimero behind a reverse proxy: see [Self-Hosting](self-hosting.md). Do not skip the `TRUST_PROXY` note.
- Understand what is (and is not) stored: see [Privacy Model](privacy.md).
