# Forge — Workout Tracker

A personal workout, body, and progress tracker. Built with React + Vite.
Your data is saved in your browser (localStorage) — private to your device.

## Run locally
```
npm install
npm run dev
```

## Deploy free on Vercel

### Option A — GitHub (recommended, no terminal needed)
1. Create a new repository on github.com and upload all these files
   (everything EXCEPT the `node_modules` and `dist` folders).
2. Go to vercel.com, sign in with GitHub (free).
3. Click "Add New… → Project", pick this repo, click "Deploy".
4. Vercel auto-detects Vite. Done — you get a yourname.vercel.app URL.

### Option B — Vercel CLI (if you have Node installed)
```
npm install -g vercel
vercel
```
Follow the prompts. Run `vercel --prod` to publish the production version.

## Build settings (Vercel auto-fills these)
- Framework preset: Vite
- Build command: `npm run build`
- Output directory: `dist`
