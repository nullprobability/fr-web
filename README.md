# tf - image macro maker

Create image macros (meme-style images with overlaid text) and export them as PNGs.

## Live site

GitHub Pages URL after deployment:

```text
https://nullprobability.github.io/fr-web/
```

## Features

- **Image upload** — accepts PNG, JPG, WebP files.
- **Fit modes** — cover, contain, or stretch the image on a square canvas.
- **Darken overlay & blur** — improve text readability or add atmosphere.
- **Multi-line caption** — with auto word-wrap and case transforms (upper/lower/keep).
- **Typography controls** — font family (custom Upright, Arial, Times New Roman), weight, size, line height, outline/stroke size, text & outline color pickers, alignment.
- **Drag to reposition** — grab and drag text anywhere on the canvas.
- **Position presets** — 4×2 grid for quick placement.
- **Fine-tune X/Y sliders** — pixel-precise positioning.
- **Export PNG** — at 1080×1080, 1440×1440, or 2048×2048 resolution.

## Getting Started

```bash
npm install
npm run dev
npm run build
```

## GitHub Pages

This repository is configured for GitHub Pages with:

- `vite.config.ts` base set to `/fr-web/`
- `.github/workflows/deploy.yml` building and deploying `dist`
- `public/.nojekyll` included for static hosting compatibility

In GitHub, set **Settings → Pages → Build and deployment → Source** to **GitHub Actions**.
