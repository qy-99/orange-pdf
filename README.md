# orange PDF — Private, Offline PDF Workspace

A client-side PDF utility workspace with an installable Progressive Web App (PWA). PDF processing happens in the browser; imported documents are not uploaded to a PDF-processing server.

## Features

- Split & Rename drawing packages from drawing lists (Excel/CSV, PDF text, OCR, or pasted text). Review filename rules and page mappings before export.
- Organize pages from one or multiple PDFs in a single sequence. Drag pages to reorder, identify their source PDFs by color-coded left edges, rotate pages, remove pages, extract selections, undo/redo changes, and export a merged result.
- Compress PDFs, convert PDF pages to images, convert images to PDF, apply watermarks and page numbers, and password-protect PDFs.
- Save output directly to a selected folder in supported browsers, or download a ZIP when direct folder access is unavailable.
- Install as a PWA for a standalone app window and offline app-shell/PDF.js access.

## Run locally

Prerequisite: Node.js 20.19+ (required by `vite-plugin-pwa` v2).

```bash
npm install
npm run dev
```

The local PDF operations do not require a Gemini API key. Do not add secrets unless you intentionally introduce an API-backed feature.

## Quality checks

```bash
npm run lint
npm test
npm run build
```

The build runs `scripts/check-pwa-assets.mjs` after Vite finishes. That check verifies the generated manifest, install icons, service worker and locally hosted PDF.js worker are present in `dist`.

## PWA deployment and offline use

1. Deploy the built `dist` folder to an HTTPS origin. Service workers and folder-picking APIs require a secure context, with localhost allowed for development.
2. Open the site while online, let the service worker install, and reload once. Use **Install App** when the browser offers it, or the **Install help** button for browser-specific manual instructions.
3. Test offline by disconnecting the network and reopening the installed app. The app shell and local PDF.js worker are precached. OCR's worker/core/language assets are runtime-cached after being downloaded during online use, so the first OCR run needs internet.
4. Imported files are held in memory for the current session. They are not automatically persisted between app restarts; re-import sensitive documents as needed.

## Notes and limitations

- Large PDFs can use substantial memory. If a combined package contains hundreds or thousands of pages, process it in smaller batches.
- Password-protected or damaged PDFs may need to be unlocked/repaired before editing.
- Direct folder writing depends on browser support and permissions. Downloading PDFs/ZIPs is the fallback.
- PWA updates are configured to install automatically. If an update appears stale, fully close and reopen the installed app after it has been online.
