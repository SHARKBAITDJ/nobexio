# 🎙️ NobexIO — Free All-in-One Radio Broadcasting Platform

A complete self-hosted remix of NobexPartners.com. Run your own radio station for free.

## Features

- 📊 **Dashboard** — Live listener count (WebSocket), now playing, 7-day chart
- 📡 **Stream Manager** — Shoutcast V1 pre-configured
- 🎵 **Live Player** — Full-screen player with volume & track history
- 📅 **Show Schedule** — Weekly 7-column calendar
- 🎙️ **Podcasts** — Episode manager + RSS feed (`/feed/podcasts.xml`)
- 🔔 **Push Notifications** — Broadcast to all subscribers
- 📈 **Analytics** — 30-day listener trends with charts
- 📱 **App Builder** — Live phone preview with brand colors
- 🧩 **Widgets** — Embeddable player/schedule via `<iframe>`
- 💰 **Monetization** — Ad campaign manager

## Quick Start

```bash
npm install
node server.js
# → http://localhost:3000
```

## Deploy Free

- **Railway**: Push to GitHub → [railway.app](https://railway.app) → New Project
- **Render**: [render.com](https://render.com) → New Web Service → free tier
- **Glitch**: Import from GitHub at [glitch.com](https://glitch.com)
- **Replit**: Upload to [replit.com](https://replit.com)

## Stack

- **Backend**: Node.js + Express + SQLite (better-sqlite3)
- **Realtime**: WebSocket (ws)
- **Frontend**: Vanilla JS + CSS (no frameworks)
- **Push**: Web Push API (web-push)

## License

MIT — free forever, no limits.
