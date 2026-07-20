# Deploying this tutorial

This folder is a **static Docsify site**. Any static host works.

## Local

```bash
npm start
```

Open http://localhost:3000

## GitHub Pages

1. Push this folder to a GitHub repo  
2. Settings → Pages → Deploy from branch → `/` (root)  
3. Site URL will be `https://<user>.github.io/<repo>/`  

The empty `.nojekyll` file tells GitHub Pages not to ignore underscore files like `_sidebar.md`.

## Netlify / Vercel / Cloudflare Pages

- Publish directory: repository root (where `index.html` lives)  
- No build command required  

## Custom domain

Point DNS at your static host and set the domain in the host’s dashboard.
