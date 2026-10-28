# Implementation Plan: Vercel Deployment & Multi-Device Access Guide

Deploy DocPocket to Vercel with zero build errors and provide a step-by-step operations guide for running the application on both Android and desktop browsers as an offline-capable Progressive Web App (PWA).

---

## User Review Required

> [!IMPORTANT]
> **Vercel Environment Variables:** If you are using custom Firebase project keys rather than default client credentials, you will need to add any custom `VITE_FIREBASE_*` keys in the Vercel Project Settings under **Environment Variables**.
> 
> **Repository Sync:** If your project is connected via GitHub, a simple `git pull` followed by `git push` to your repository will automatically trigger a clean Vercel deployment. Alternatively, `npx vercel` can be executed directly from your terminal.

---

## Proposed Changes

### Platform & Deployment Setup

#### 1. Deployment Documentation (`/DEPLOYMENT.md`)
Create a comprehensive, production-grade guide covering:
- **Root Cause & Fix Summary:** Technical recap of why the previous build failed (peer dependency clash and missing `package.json` entry) and how `.npmrc` and `package-lock.json` safeguard future CI runs.
- **Vercel Deployment (Option A - Git Integration):**
  - Linking GitHub repository to Vercel.
  - Recommended build settings: Framework `Vite`, Build Command `npm run build`, Output Directory `dist`.
  - Adding optional environment variables.
- **Vercel Deployment (Option B - Vercel CLI):**
  - Running `npx vercel` / `vercel --prod` for one-command terminal deploys.
- **Android Browser & PWA Setup:**
  - Launching in Chrome or Firefox on Android.
  - Adding to Home Screen for full-screen, offline-enabled native feel.
  - Local IndexedDB storage and camera/file picker permissions for PDF uploads.
- **Desktop Browser & PWA Setup:**
  - Installing via Chrome/Edge app icon in the address bar.
  - Keyboard shortcuts, responsive wide-screen layout, and drag-and-drop document import.

#### 2. Verify Repository Configuration Files
Ensure all configuration files are optimal for Vercel's automated builder:
- `/vercel.json`: Validated SPA routing rules (redirecting routes to `/index.html`), caching headers for PWA assets (`sw.js`, `manifest.webmanifest`), and immutable cache for chunked JS/CSS.
- `/.npmrc`: Contains `legacy-peer-deps=true` and `engine-strict=false` to prevent npm 10+ peer resolution halts.
- `/package.json`: Contains `"firebase": "^13.1.0"` in dependencies, devDependencies cleaned of conflicting esbuild locks.

---

## Verification Plan

### Automated Build Verification
1. **Local Build:** Run `npm run build` to confirm Vite bundles all 22+ PWA assets, Web Workers, and PDF.js modules in under 2 seconds.
2. **TypeScript & Linter:** Run `npm run lint` (`tsc --noEmit`) to verify zero type mismatches or unresolvable imports.
3. **Applet Compilation:** Run `compile_applet` to ensure runtime server and client compatibility.

### Manual & Browser Verification
1. **Vercel Configuration Check:** Test that `/vercel.json` matches Vercel OpenApi schema specifications.
2. **PWA Manifest & Worker Validation:** Verify `dist/manifest.webmanifest` and `dist/sw.js` are correctly configured with theme color, icons, and offline caching rules.
3. **Multi-Device Compatibility:** Ensure the UI gracefully adapts between mobile bottom navigation (< 768px) and desktop refined sidebar (>= 768px).
