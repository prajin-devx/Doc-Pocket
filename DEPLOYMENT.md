# DocPocket Deployment & Multi-Device Access Guide

This guide walks you through deploying **DocPocket** to Vercel with zero build errors, as well as installing and using it as a Progressive Web App (PWA) across Android and Desktop browsers.

---

## 1. Why the Previous Vercel Build Failed & How It Was Resolved

If your earlier Vercel build failed, it was due to three issues that commonly affect fresh CI/CD environments:

1. **Strict Peer Dependency Conflict (`ERESOLVE`):**  
   `esbuild@0.25.0` was explicitly pinned in `devDependencies` while `vite@8.3.5` required `esbuild@^0.27.0 || ^0.28.0`. When Vercel ran clean `npm install`, npm aborted with dependency conflict errors.  
   *Fix:* Removed the conflicting `esbuild` lock and added `legacy-peer-deps=true` in `.npmrc`.
2. **Missing `firebase` in `package.json`:**  
   Firebase was present in the local container but absent from `package.json`. On Vercel's clean container, Vite's Rollup bundler failed when resolving `firebase/app`.  
   *Fix:* Added `"firebase": "^13.1.0"` directly to `package.json` dependencies.
3. **SPA Routing & Package Manager Clashes:**  
   Missing SPA rewrites caused sub-routes to 404 upon browser reload, and an extraneous `bun.lock` file triggered Vercel to misidentify the package manager.  
   *Fix:* Added `vercel.json` with framework presets, rewrite rules to `/index.html`, and strict PWA caching headers.

---

## 2. Deploying to Vercel

### Method A: Via Git / GitHub (Recommended)

1. **Commit and Push:**
   Push your repository to your GitHub/GitLab account:
   ```bash
   git add .
   git commit -m "Fix Vercel build configs and add SPA routing"
   git push origin main
   ```
2. **Import into Vercel:**
   - Log in to [vercel.com](https://vercel.com).
   - Click **"Add New..."** > **"Project"**.
   - Select your Git repository.
3. **Configure Project Settings:**
   - **Framework Preset:** Vite (automatically detected from `vercel.json`).
   - **Root Directory:** `./`
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
   - **Install Command:** `npm install`
4. **Environment Variables (Optional):**
   If you use custom Firebase project keys or Google AI Studio keys, expand **Environment Variables** and add:
   - `GEMINI_API_KEY`: *(Optional)* Your Gemini API key.
   - Any custom `VITE_FIREBASE_*` variables if overriding default client credentials.
5. **Deploy:**
   Click **"Deploy"**. Vercel will complete the build and provide an `https://<your-app>.vercel.app` domain with free SSL.

---

### Method B: Via Vercel CLI

If you prefer deploying directly from your terminal:

1. Install and log in to Vercel CLI:
   ```bash
   npm i -g vercel
   vercel login
   ```
2. Deploy to preview:
   ```bash
   vercel
   ```
3. Deploy directly to production:
   ```bash
   vercel --prod
   ```

---

## 3. Running & Installing on Android (Mobile)

DocPocket is built with an offline-first architecture using **IndexedDB (Dexie)**, so documents remain stored directly on your phone's storage.

### In Browser (Chrome / Brave / Firefox / Edge):
1. Open your deployed URL (`https://<your-project>.vercel.app` or your shared Cloud Run URL) in **Chrome for Android**.
2. Tap the **Three Dots (⋮)** menu in the upper right.
3. Tap **"Install app"** or **"Add to Home screen"**.
4. Confirm by tapping **"Install"**.

### Advantages on Android:
- **Standalone App Experience:** Launches without browser address bars, tabs, or navigation chrome.
- **Offline Access:** Your stored PDFs, Timetable collection, and metadata remain accessible even with zero cellular signal or in airplane mode.
- **Native File Picker:** Import PDFs directly from your device storage, Google Drive, or camera document scanner.
- **Bottom Navigation Bar:** Mobile-optimized touch controls designed for thumb-friendly one-handed use.

---

## 4. Running & Installing on Desktop (Windows, macOS, Linux, ChromeOS)

DocPocket is responsive and provides a multi-column desktop layout with a sidebar and PDF reading pane.

### In Chrome, Edge, or Brave:
1. Open your deployed URL in your desktop browser.
2. Look at the right side of your browser's address bar (URL bar).
3. Click the **Install DocPocket** icon (a monitor with an arrow or a `+` symbol).
4. Click **"Install"**.

### In Safari (macOS Sonoma / Sequoia):
1. Open the URL in Safari.
2. Click **File** > **Add to Dock...**.
3. Click **Add**.

### Advantages on Desktop:
- **Dedicated Desktop Window:** Opens as a clean, native desktop application in your taskbar/dock.
- **Drag-and-Drop:** Drag PDF files directly from your desktop file manager into the DocPocket window to import.
- **High-Resolution PDF Viewer:** Multi-page view, zoom controls, full-screen reading, and instant search.

---

## 5. Verification & Troubleshooting Checklist

- [x] **Local Build Test:** Run `npm run build` — creates static assets in `/dist` without errors.
- [x] **Type Safety Check:** Run `npm run lint` (`tsc --noEmit`) — zero compiler warnings or errors.
- [x] **Service Worker Registration:** `dist/sw.js` and `dist/manifest.webmanifest` are served with `Cache-Control: public, max-age=0, must-revalidate` to ensure immediate updates.
- [x] **IndexedDB Quota:** Uses browser storage quota (typically up to several gigabytes on modern phones and desktops).
