# Deploying this tutorial

This is a **Next.js** app. Deploy it on Vercel with zero config.

**Live site:** [system-design-iota-ten.vercel.app](https://system-design-iota-ten.vercel.app)  
**GitHub:** [github.com/saroj990/system-design](https://github.com/saroj990/system-design)

## Local development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Production build

```bash
npm run build
npm start
```

## Deploy to Vercel

1. Push this repo to GitHub  
2. Import the project at [vercel.com/new](https://vercel.com/new)  
3. Vercel auto-detects Next.js — no build settings needed  
4. Deploy  

Every push to `main` / `master` triggers a new deployment.

## Project structure

```text
app/              Next.js pages & layout
components/       Sidebar, Markdown, Mermaid, Cover hero
fundamentals/     Markdown lessons (15)
case-studies/     Markdown case studies (20)
lib/              Content loading & navigation
```

## Custom domain

In Vercel: Project → Settings → Domains → add your domain and update DNS.
