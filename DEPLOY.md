# Deploying this tutorial

This is a **Next.js** app with **PWA / offline** support. Deploy it on Vercel with zero config.

**Live site:** [system-design-iota-ten.vercel.app](https://system-design-iota-ten.vercel.app)  
**GitHub:** [github.com/saroj990/system-design](https://github.com/saroj990/system-design)

## Local development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

> The service worker is **disabled in development** so hot reload stays clean. Test offline with a production build.

## Production build (required to test PWA)

```bash
npm run build
npm start
```

Then:

1. Open [http://localhost:3000](http://localhost:3000) in Chrome  
2. DevTools → **Application** → **Service Workers** — confirm `sw.js` is registered  
3. Browse a few lessons (they get cached)  
4. DevTools → Network → check **Offline** → reload — pages you visited should still work  
5. Optional: **Install app** from the address bar / install banner  

## How offline works

| Piece | Role |
|-------|------|
| `manifest.webmanifest` | App name, icons, standalone display |
| Service worker (`sw.js`) | Generated at build time by `@ducanh2912/next-pwa` |
| Runtime caching | Pages (NetworkFirst), JS/CSS/images (StaleWhileRevalidate), fonts (CacheFirst) |
| `/offline` | Fallback when a page isn’t in the cache |

**Important:** Offline ≠ download the whole course automatically. Pages become available offline **after you visit them once online** (or after the install caches the app shell). Tip: open the fundamentals list and key case studies once while online.

## Install on a phone

### Android (Chrome)
1. Open the live site  
2. Menu → **Install app** / **Add to Home screen**  

### iPhone (Safari)
1. Open the live site  
2. Share → **Add to Home Screen**  

iOS offline support is more limited than Chrome, but the installed shortcut still works well for reading cached pages.

## Deploy to Vercel

1. Push this repo to GitHub  
2. Import at [vercel.com/new](https://vercel.com/new)  
3. Vercel auto-detects Next.js — no build settings needed  
4. Deploy  

Every push to `main` / `master` triggers a new deployment. The service worker is generated during `next build` on Vercel.

## Project structure

```text
app/              Next.js pages & layout (includes /offline)
components/       Sidebar, Markdown, Mermaid, PWA install prompt
fundamentals/     Markdown lessons (15)
case-studies/     Markdown case studies (40)
lib/              Content loading & navigation
public/           Manifest, icons, generated sw.js (build)
```

## Custom domain

In Vercel: Project → Settings → Domains → add your domain and update DNS.

HTTPS is required for service workers (Vercel provides this automatically).
