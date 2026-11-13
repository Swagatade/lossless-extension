<p align="center">
  <img src="assets/banner.png" alt="Echo Music · Lossless Extension" width="100%">
</p>

<p align="center">
  A self-hosted lossless audio addon for Echo Music, powered by multi-provider streaming.
</p>

## Overview

Lossless Extension resolves lossless audio streams across multiple upstream providers in parallel, serving whichever responds first. It integrates directly into Echo Music to deliver FLAC and high-fidelity audio with automatic quality fallback.

> **Note:** This addon is community-maintained and relies on third-party upstream providers. As a result, streams may stop working at any time without notice, though active efforts will always be made to restore functionality.

## Quick Setup

Pick one host: **Cloudflare Workers** (recommended, free tier works) or Vercel.

### 1a. Deploy to Cloudflare Workers

```bash
npm install
npx wrangler login
npx wrangler secret put QOBUZ_ID_SECRET   # paste output of: openssl rand -hex 32
npm run deploy:cf
```

Wrangler prints your URL (e.g. `https://lossless-extension.<account>.workers.dev`). Optional settings (`QOBUZ_PROVIDER`, `CACHE_TTL_SECONDS`, provider base URLs, ...) can go in the `[vars]` block of `wrangler.toml`. Test locally with `npm run dev:cf` (put `QOBUZ_ID_SECRET=...` in a `.dev.vars` file).

You can also connect the GitHub repo in the Cloudflare dashboard (Workers & Pages → Create → Import a repository) with build command `npm install` and deploy command `npx wrangler deploy`.

### 1b. Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/EchoMusicApp/lossless-extension&project-name=lossless-extension&repository-name=lossless-extension&env=QOBUZ_ID_SECRET&envDescription=A%20long%20random%20secret%20used%20to%20sign%20track%20IDs.%20Generate%20one%20with%20openssl%20rand%20-hex%2032&envLink=https://github.com/EchoMusicApp/lossless-extension%23configuration)

Configure the required environment variable during deployment:

| Variable | Required | Description |
| :--- | :---: | :--- |
| `QOBUZ_ID_SECRET` | Yes | 32-byte secret used to sign track IDs. Generate via `openssl rand -hex 32`. |

All other provider settings include preconfigured defaults.

### 2. Copy Deployment URL

Copy your production URL (e.g. `https://lossless-extension.<account>.workers.dev` or `https://lossless-extension-xxxx.vercel.app`). Do not append `/search` or `/stream` paths.

### 3. Connect to Echo Music

1. Open **Echo Music**.
2. Go to **Settings → Sources → Add an Addon**.
3. Set an addon name (e.g. `Lossless`) and paste your deployment URL into **Server URL**.
4. Save and enable the addon.

## Configuration

Custom upstream URLs and provider modes can be customized using environment variables:

```dotenv
# Required
QOBUZ_ID_SECRET=                   # generate with: openssl rand -hex 32

# Optional (defaults shown)
QOBUZ_PROVIDER=multi               # multi | qobuzdl | http | stub
QOBUZ_UPSTREAM_BASE_URL=https://qobuz-dll.foreyou.workers.dev
LASTBABE_BASE_URL=https://lastbabe.velixir.run
MONOCHROME_BASE_URL=https://tracks.monochrome.st
DEEZER_BASE_URL=https://dzr.tabs-vs-spaces.wtf
ELJOHNZC_BASE_URL=https://eljohnzc-addon.de.deplexo.com/4433c7caff7fd070309e
INSTABLE_BASE_URL=https://instable.arcod.xyz
```

### Provider Routing

Providers can be queried collectively or routed individually using path prefixes:

| Route Prefix | Provider | Target Quality |
| :---: | :--- | :--- |
| `/` *(root)* | Multi (races all providers) | FLAC / Best Available |
| `/a` | Qobuz-DL | Lossless |
| `/b` | LastBabe | Lossless |
| `/c` | Monochrome | FLAC |
| `/d` | Deezer | High / Low |
| `/e` | Eljohnzc | Lossless |
| `/f` | Instable | Lossless |

Each route exposes standard addon endpoints:
- `GET /manifest.json`
- `GET /search?q=<query>&quality=<quality>`
- `GET /stream/:id`

## Local Development

Requires Node.js 20 or higher. The request logic lives in `src/app.ts` (Web-standard `Request`/`Response`); `src/worker.ts` is the Cloudflare entry and `src/server.ts` the Node/Vercel adapter.

```bash
# Install dependencies
npm install

# Start local dev server (Node)
npm run dev

# Or run it in the Cloudflare Workers runtime
npm run dev:cf

# Run test suite and build
npm test
npm run build
```

Example requests:

```bash
# Addon manifest
curl http://localhost:3000/manifest.json

# Search
curl "http://localhost:3000/search?q=kind+of+blue&quality=LOSSLESS"

# Stream metadata
curl -i "http://localhost:3000/stream/<track_id>?quality=LOSSLESS"
```

## Legal & Disclaimer

- **No Media Stored:** This server operates strictly as a real-time metadata resolver and stream redirector. No audio files or streams are cached, downloaded, or stored on this server.
- **Host Responsibility:** Users deploying and hosting this software are solely responsible for compliance with applicable local laws, regulations, and third-party terms of service.
- **Availability:** This project is maintained on a best-effort community basis. Upstream provider endpoints may change or go offline without notice; fixes are developed to restore streaming as quickly as possible.
- **Disclaimer:** This is an independent, community-driven project not affiliated with, endorsed by, or sponsored by Qobuz, Deezer, JioSaavn, or any upstream service providers.

## Credits

All source files and provider implementations provided by [Silly Kat](https://github.com/KATx-dev).

## License

Licensed under the [GNU General Public License v3.0](LICENSE).
