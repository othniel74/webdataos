# Deploy the WebDataOS Frontend on Vercel

The Vercel deployment serves only the Vite frontend from `apps/web`. The FastAPI backend should run on Vultr or another public host.

## Required environment variables

Set these in the Vercel project:

```env
VITE_API_BASE_URL=https://api.your-domain.com
VITE_API_KEY=your-public-or-demo-api-key
```

The backend must allow the Vercel origin:

```env
CORS_ALLOWED_ORIGINS=https://your-vercel-app.vercel.app,https://your-custom-domain.com
TRUSTED_HOSTS=api.your-domain.com,localhost,127.0.0.1,api,web
API_AUTH_ENABLED=true
API_KEYS=your-public-or-demo-api-key,another-private-key
```

## Deploy with the Vercel CLI

```bash
npm i -g vercel
vercel login
vercel link
vercel env add VITE_API_BASE_URL production
vercel env add VITE_API_KEY production
vercel --prod
```

The root `vercel.json` tells Vercel to:

- install dependencies in `apps/web`
- build with `npm run build --prefix apps/web`
- serve `apps/web/dist`
- rewrite all routes to `index.html` for the single-page app

## Deploy from GitHub

Import `othniel74/webdataos` in the Vercel dashboard and keep the default root directory. The checked-in `vercel.json` controls the build, so the project does not need to be imported from `apps/web`.

## Verify

After deployment, open the Vercel URL and check the header badge:

- `API connected` means `VITE_API_BASE_URL`, CORS, and the backend are working.
- `API offline` means the frontend loaded but cannot reach `/health` on the backend.
