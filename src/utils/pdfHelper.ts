/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as pdfjs from 'pdfjs-dist';

// Configure the worker to use the local bundled worker in public folder for 100% offline reliability
if (typeof window !== 'undefined') {
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
}

/**
 * Returns total page count of a PDF file or bytes
 */
export async function getPdfPageCount(data: Uint8Array): Promise<number> {
  const loadingTask = pdfjs.getDocument({ data: data.slice() });
  const doc = await loadingTask.promise;
  const count = doc.numPages;
  doc.destroy();
  return count;
}

/**
 * Renders a specific page to an HTMLCanvasElement
 */
export async function renderPageToCanvas(
  data: Uint8Array,
  pageNum: number,
  scale: number = 1.0
): Promise<HTMLCanvasElement> {
  const loadingTask = pdfjs.getDocument({ data: data.slice() });
  const doc = await loadingTask.promise;
  const page = await doc.getPage(pageNum);

  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);

  const context = canvas.getContext('2d', { alpha: false });
  if (!context) {
    throw new Error('Could not get 2D canvas context');
  }

  // Draw white background by default
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({
    canvasContext: context,
    viewport,
  }).promise;

  doc.destroy();
  return canvas;
}

/**
 * Generates a thumbnail data URL for a specific page
 */
export async function renderPageThumbnail(
  data: Uint8Array,
  pageNum: number,
  maxDimension: number = 320
): Promise<string> {
  const loadingTask = pdfjs.getDocument({ data: data.slice() });
  const doc = await loadingTask.promise;
  const page = await doc.getPage(pageNum);

  const unscaledViewport = page.getViewport({ scale: 1.0 });
  const scale = Math.min(
    maxDimension / unscaledViewport.width,
    maxDimension / unscaledViewport.height
  );

  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));

  const ctx = canvas.getContext('2d', { alpha: false });
  if (ctx) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  await page.render({
    canvasContext: ctx!,
    viewport,
  }).promise;

  const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
  doc.destroy();
  return dataUrl;
}

/**
 * Extracts raw text per page from PDF
 */
export async function extractPdfPageTexts(data: Uint8Array): Promise<string[]> {
  const loadingTask = pdfjs.getDocument({ data: data.slice() });
  const doc = await loadingTask.promise;
  const pageTexts: string[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const str = content.items
      .map((item: any) => ('str' in item ? item.str : ''))
      .join(' ')
      .trim();
    pageTexts.push(str);
  }

  doc.destroy();
  return pageTexts;
}

/**
 * Safely triggers browser download for Blob or Uint8Array
 */
export function downloadFile(
  content: Uint8Array | Blob | string,
  filename: string,
  mimeType: string = 'application/pdf'
) {
  let blob: Blob;
  if (content instanceof Blob) {
    blob = content;
  } else if (typeof content === 'string') {
    blob = new Blob([content], { type: mimeType });
  } else {
    blob = new Blob([content.buffer as ArrayBuffer], { type: mimeType });
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 15000);
}

/**
 * Formats bytes to human-readable string (KB, MB)
 */
export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}
