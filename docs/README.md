# Effimero Documentation

Effimero is a self-hosted, privacy-first web analytics service. It counts unique visitors without cookies, localStorage, or fingerprinting, using a daily-salted hash that makes cross-day tracking impossible by construction.

## Contents

| Guide | What it covers |
|---|---|
| [Getting Started](getting-started.md) | Install the snippet and see your first data in five minutes |
| [Self-Hosting](self-hosting.md) | Docker deployment, reverse proxy setup, configuration reference |
| [API Reference](api.md) | Every endpoint, with an interactive Swagger UI at `/docs/api` |
| [Privacy Model](privacy.md) | The hashing algorithm, what is stored, what is not, and why |
| [Architecture](architecture.md) | Monorepo layout, data flow, and design decisions |

## Quick links

- Interactive API docs: `https://your-host/docs/api`
- Dashboard: `https://your-host/`
- Health check: `https://your-host/health`
