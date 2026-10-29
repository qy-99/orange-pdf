/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { PDFDocument, rgb, degrees, StandardFonts, type PDFPage } from 'pdf-lib';
import { encryptPDF } from '@pdfsmaller/pdf-encrypt';
import { decryptPDF } from '@pdfsmaller/pdf-decrypt';
import { renderPageToCanvas } from './pdfHelper';
import type {
  WatermarkConfig,
  PageNumberConfig,
  CompressionConfig,
  ImagesToPdfConfig,
  PdfToImagesConfig,
  ProtectConfig,
} from '../types';

/**
 * Organizes pages (reorder, rotate, delete) while preserving vector content
 */
export async function organizePdf(
  sourceBytes: Uint8Array,
  pageOrder: number[], // 1-based page indices
  rotations: Record<number, number> = {} // pageIndex (1-based) -> rotation delta degrees
): Promise<Uint8Array> {
  const srcDoc = await PDFDocument.load(sourceBytes);
  const outDoc = await PDFDocument.create();

  // Convert 1-based to 0-based indices
  const pageIndices = pageOrder.map((p) => p - 1);
  const copiedPages = await outDoc.copyPages(srcDoc, pageIndices);

  copiedPages.forEach((page, idx) => {
    const originalPageNum = pageOrder[idx];
    const addRotation = rotations[originalPageNum] || 0;
    if (addRotation !== 0) {
      const currentRotation = page.getRotation().angle;
      page.setRotation(degrees((currentRotation + addRotation) % 360));
    }
    outDoc.addPage(page);
  });

  return await outDoc.save();
}

/**
 * A single page in the output sequence. Page numbers are 1-based in the UI.
 */
export interface OrderedPdfPage {
  fileId: string;
  pageNumber: number;
  rotation?: number;
}

/**
 * Organizes a page sequence assembled from one or more source PDFs.
 * Each source is parsed once; pages are copied only once per source page, then
 * assembled in the exact page order requested by the caller.
 */
export async function organizePagesAcrossPdfs(
  sources: Array<{ id: string; bytes: Uint8Array }>,
  orderedPages: OrderedPdfPage[]
): Promise<Uint8Array> {
  if (!orderedPages.length) throw new Error('There are no pages to export.');

  const sourceMap = new Map<string, { doc: PDFDocument; pageCount: number }>();
  for (const source of sources) {
    if (sourceMap.has(source.id)) continue;
    try {
      const doc = await PDFDocument.load(source.bytes);
      sourceMap.set(source.id, { doc, pageCount: doc.getPageCount() });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`Could not open a source PDF. It may be password-protected or damaged. Details: ${detail}`);
    }
  }

  const requestedBySource = new Map<string, Set<number>>();
  for (const item of orderedPages) {
    const source = sourceMap.get(item.fileId);
    if (!source) throw new Error(`A source PDF for page ${item.pageNumber} is missing. Please re-import that PDF.`);
    if (!Number.isInteger(item.pageNumber) || item.pageNumber < 1 || item.pageNumber > source.pageCount) {
      throw new Error(`Page ${item.pageNumber} is outside the valid range for one of the source PDFs.`);
    }
    if (!requestedBySource.has(item.fileId)) requestedBySource.set(item.fileId, new Set<number>());
    requestedBySource.get(item.fileId)!.add(item.pageNumber);
  }

  const copiedByKey = new Map<string, PDFPage>();
  const outDoc = await PDFDocument.create();

  for (const [fileId, pageNumbers] of requestedBySource) {
    const source = sourceMap.get(fileId)!;
    const sortedPageNumbers = [...pageNumbers].sort((a, b) => a - b);
    const copiedPages = await outDoc.copyPages(source.doc, sortedPageNumbers.map((n) => n - 1));
    copiedPages.forEach((page, index) => {
      copiedByKey.set(`${fileId}::${sortedPageNumbers[index]}`, page);
    });
  }

  for (const item of orderedPages) {
    const key = `${item.fileId}::${item.pageNumber}`;
    const page = copiedByKey.get(key);
    if (!page) throw new Error(`Could not copy source page ${item.pageNumber}.`);
    const rotationDelta = ((item.rotation ?? 0) % 360 + 360) % 360;
    if (rotationDelta !== 0) {
      const currentRotation = page.getRotation().angle;
      page.setRotation(degrees(((currentRotation + rotationDelta) % 360 + 360) % 360));
    }
    outDoc.addPage(page);
  }

  return await outDoc.save({ useObjectStreams: true });
}

/**
 * Extracts a single page from a PDF for Split & Rename
 */
export async function splitSinglePage(
  sourceBytes: Uint8Array,
  pageNum: number // 1-based
): Promise<Uint8Array> {
  const srcDoc = await PDFDocument.load(sourceBytes);
  if (pageNum < 1 || pageNum > srcDoc.getPageCount()) {
    throw new Error(`Page ${pageNum} out of bounds (1-${srcDoc.getPageCount()})`);
  }

  const outDoc = await PDFDocument.create();
  const [copiedPage] = await outDoc.copyPages(srcDoc, [pageNum - 1]);
  outDoc.addPage(copiedPage);

  return await outDoc.save();
}

/**
 * Extracts multiple selected pages into a new PDF
 */
export async function extractSelectedPages(
  sourceBytes: Uint8Array,
  pageNumbers: number[] // 1-based
): Promise<Uint8Array> {
  const srcDoc = await PDFDocument.load(sourceBytes);
  const outDoc = await PDFDocument.create();

  const validIndices = pageNumbers
    .filter((p) => p >= 1 && p <= srcDoc.getPageCount())
    .map((p) => p - 1);

  if (validIndices.length === 0) {
    throw new Error('No valid pages selected for extraction');
  }

  const copiedPages = await outDoc.copyPages(srcDoc, validIndices);
  copiedPages.forEach((page) => outDoc.addPage(page));

  return await outDoc.save();
}

/**
 * Merges multiple PDFs into one
 */
export async function mergePdfs(pdfByteArrays: Uint8Array[]): Promise<Uint8Array> {
  if (pdfByteArrays.length === 0) {
    throw new Error('No PDF files provided to merge');
  }
  const outDoc = await PDFDocument.create();

  for (const bytes of pdfByteArrays) {
    const doc = await PDFDocument.load(bytes);
    const indices = Array.from({ length: doc.getPageCount() }, (_, i) => i);
    const copiedPages = await outDoc.copyPages(doc, indices);
    copiedPages.forEach((page) => outDoc.addPage(page));
  }

  return await outDoc.save();
}

/**
 * Compresses PDF:
 * - Lossless / structural optimization: rebuilds document, cleans unused objects, compresses streams
 * - High compression / rasterize: converts each page to image with configurable DPI & JPEG quality
 */
export async function compressPdf(
  sourceBytes: Uint8Array,
  config: CompressionConfig,
  onProgress?: (progress: number) => void
): Promise<{
  bytes: Uint8Array;
  originalSize: number;
  compressedSize: number;
  isRasterized: boolean;
}> {
  const originalSize = sourceBytes.length;

  if (config.mode === 'lossless') {
    // Lossless structural cleanup
    const srcDoc = await PDFDocument.load(sourceBytes, { ignoreEncryption: true });
    const outDoc = await PDFDocument.create();
    const count = srcDoc.getPageCount();
    const indices = Array.from({ length: count }, (_, i) => i);
    const copied = await outDoc.copyPages(srcDoc, indices);
    copied.forEach((p) => outDoc.addPage(p));

    const saved = await outDoc.save({ useObjectStreams: true });
    return {
      bytes: saved,
      originalSize,
      compressedSize: saved.length,
      isRasterized: false,
    };
  }

  // Lossy Rasterization mode
  const srcDoc = await PDFDocument.load(sourceBytes);
  const totalPages = srcDoc.getPageCount();
  const outDoc = await PDFDocument.create();

  // DPI conversion: 72 DPI is 1.0x scale
  const scale = Math.max(0.5, config.dpi / 72);

  for (let i = 1; i <= totalPages; i++) {
    onProgress?.(Math.round(((i - 1) / totalPages) * 100));
    const canvas = await renderPageToCanvas(sourceBytes, i, scale);
    const quality = Math.max(0.2, Math.min(1.0, config.quality));
    const blob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b || new Blob()), 'image/jpeg', quality)
    );
    const imgBuffer = await blob.arrayBuffer();
    const jpgImage = await outDoc.embedJpg(imgBuffer);

    // Get original page dimensions to preserve aspect ratio
    const originalPage = srcDoc.getPage(i - 1);
    const { width, height } = originalPage.getSize();
    const newPage = outDoc.addPage([width, height]);
    newPage.drawImage(jpgImage, {
      x: 0,
      y: 0,
      width,
      height,
    });
  }

  onProgress?.(100);
  const compressedBytes = await outDoc.save({ useObjectStreams: true });

  return {
    bytes: compressedBytes,
    originalSize,
    compressedSize: compressedBytes.length,
    isRasterized: true,
  };
}

/**
 * Renders all PDF pages to images (PNG or JPEG)
 */
export async function pdfToImages(
  sourceBytes: Uint8Array,
  baseFilename: string,
  config: PdfToImagesConfig,
  onProgress?: (progress: number) => void
): Promise<Array<{ filename: string; blob: Blob }>> {
  const srcDoc = await PDFDocument.load(sourceBytes);
  const totalPages = srcDoc.getPageCount();
  const results: Array<{ filename: string; blob: Blob }> = [];

  const cleanBase = baseFilename.replace(/\.pdf$/i, '');

  for (let i = 1; i <= totalPages; i++) {
    onProgress?.(Math.round(((i - 1) / totalPages) * 100));
    const canvas = await renderPageToCanvas(sourceBytes, i, config.scale);
    const mime = config.format === 'png' ? 'image/png' : 'image/jpeg';
    const ext = config.format === 'png' ? 'png' : 'jpg';

    const blob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b || new Blob()), mime, config.quality)
    );

    const padDigits = totalPages >= 100 ? 3 : 2;
    const pageStr = String(i).padStart(padDigits, '0');
    results.push({
      filename: `${cleanBase}-page-${pageStr}.${ext}`,
      blob,
    });
  }

  onProgress?.(100);
  return results;
}

/**
 * Converts multiple images (PNG, JPG, WebP) into a multi-page PDF
 */
export async function imagesToPdf(
  images: Array<{ file: File; name: string }>,
  config: ImagesToPdfConfig
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();

  for (const item of images) {
    let imgBytes: Uint8Array;
    let isJpg = item.file.type === 'image/jpeg' || /\.jpe?g$/i.test(item.name);
    let isPng = item.file.type === 'image/png' || /\.png$/i.test(item.name);

    if (!isJpg && !isPng) {
      // Draw WebP or other image onto canvas to export as PNG
      const bitmap = await createImageBitmap(item.file);
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bitmap, 0, 0);
      const blob = await new Promise<Blob>((resolve) =>
        canvas.toBlob((b) => resolve(b || new Blob()), 'image/png')
      );
      imgBytes = new Uint8Array(await blob.arrayBuffer());
      isPng = true;
    } else {
      imgBytes = new Uint8Array(await item.file.arrayBuffer());
    }

    const embeddedImage = isPng
      ? await doc.embedPng(imgBytes)
      : await doc.embedJpg(imgBytes);

    let targetWidth: number;
    let targetHeight: number;

    if (config.pageSize === 'a4') {
      targetWidth = 595.28;
      targetHeight = 841.89;
    } else if (config.pageSize === 'letter') {
      targetWidth = 612;
      targetHeight = 792;
    } else {
      targetWidth = embeddedImage.width;
      targetHeight = embeddedImage.height;
    }

    // Handle orientation
    if (config.orientation === 'landscape' && targetWidth < targetHeight) {
      [targetWidth, targetHeight] = [targetHeight, targetWidth];
    } else if (config.orientation === 'portrait' && targetWidth > targetHeight) {
      [targetWidth, targetHeight] = [targetHeight, targetWidth];
    }

    const page = doc.addPage([targetWidth, targetHeight]);

    // Margins
    let margin = 0;
    if (config.margin === 'small') margin = 20;
    else if (config.margin === 'normal') margin = 36;
    else if (config.margin === 'large') margin = 54;

    const availWidth = targetWidth - margin * 2;
    const availHeight = targetHeight - margin * 2;

    const imgAspect = embeddedImage.width / embeddedImage.height;
    const availAspect = availWidth / availHeight;

    let drawW: number;
    let drawH: number;

    if (config.fit === 'cover') {
      if (imgAspect > availAspect) {
        drawH = availHeight;
        drawW = availHeight * imgAspect;
      } else {
        drawW = availWidth;
        drawH = availWidth / imgAspect;
      }
    } else {
      // contain
      if (imgAspect > availAspect) {
        drawW = availWidth;
        drawH = availWidth / imgAspect;
      } else {
        drawH = availHeight;
        drawW = availHeight * imgAspect;
      }
    }

    const posX = margin + (availWidth - drawW) / 2;
    const posY = margin + (availHeight - drawH) / 2;

    page.drawImage(embeddedImage, {
      x: posX,
      y: posY,
      width: drawW,
      height: drawH,
    });
  }

  return await doc.save();
}

/**
 * Adds watermarks (Text or Image) to PDF pages
 */
export async function watermarkPdf(
  sourceBytes: Uint8Array,
  config: WatermarkConfig
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(sourceBytes);
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const totalPages = doc.getPageCount();

  // Embed watermark image if type === 'image'
  let embeddedImg: any = null;
  if (config.type === 'image' && config.imageUrl) {
    try {
      const res = await fetch(config.imageUrl);
      const buffer = await res.arrayBuffer();
      const u8 = new Uint8Array(buffer);
      if (config.imageUrl.includes('png') || u8[0] === 0x89) {
        embeddedImg = await doc.embedPng(u8);
      } else {
        embeddedImg = await doc.embedJpg(u8);
      }
    } catch {
      // Fallback to text if image fetch fails
    }
  }

  // Parse color hex (e.g. #ea580c)
  const hex = config.color.replace('#', '');
  const r = parseInt(hex.substring(0, 2) || 'ea', 16) / 255;
  const g = parseInt(hex.substring(2, 4) || '58', 16) / 255;
  const b = parseInt(hex.substring(4, 6) || '0c', 16) / 255;

  const targetPages: number[] = [];
  for (let i = 1; i <= totalPages; i++) {
    if (config.pages === 'all') targetPages.push(i);
    else if (config.pages === 'first' && i === 1) targetPages.push(i);
    else if (config.pages === 'odd' && i % 2 !== 0) targetPages.push(i);
    else if (config.pages === 'even' && i % 2 === 0) targetPages.push(i);
    else if (config.pages === 'custom' && config.customPages) {
      const ranges = config.customPages.split(',').map((s) => s.trim());
      for (const r of ranges) {
        if (r.includes('-')) {
          const [start, end] = r.split('-').map(Number);
          if (i >= start && i <= end) targetPages.push(i);
        } else if (Number(r) === i) {
          targetPages.push(i);
        }
      }
    }
  }

  targetPages.forEach((pageNum) => {
    const page = doc.getPage(pageNum - 1);
    const { width, height } = page.getSize();
    const text = config.text || 'CONFIDENTIAL';
    const textWidth = font.widthOfTextAtSize(text, config.fontSize);
    const textHeight = config.fontSize;

    if (config.position === 'repeat') {
      // Grid repeat
      const stepX = textWidth + 120;
      const stepY = textHeight + 120;
      for (let x = 40; x < width; x += stepX) {
        for (let y = 40; y < height; y += stepY) {
          page.drawText(text, {
            x,
            y,
            size: config.fontSize,
            font,
            color: rgb(r, g, b),
            opacity: config.opacity,
            rotate: degrees(config.rotation),
          });
        }
      }
      return;
    }

    let x = width / 2;
    let y = height / 2;

    if (config.position === 'center' || config.position === 'diagonal') {
      x = (width - textWidth) / 2;
      y = (height - textHeight) / 2;
    } else if (config.position === 'top-left') {
      x = 40;
      y = height - 40 - textHeight;
    } else if (config.position === 'top-right') {
      x = width - textWidth - 40;
      y = height - 40 - textHeight;
    } else if (config.position === 'bottom-left') {
      x = 40;
      y = 40;
    } else if (config.position === 'bottom-right') {
      x = width - textWidth - 40;
      y = 40;
    }

    if (embeddedImg) {
      const imgScale = config.fontSize / 24;
      const imgW = embeddedImg.width * imgScale * 0.4;
      const imgH = embeddedImg.height * imgScale * 0.4;
      page.drawImage(embeddedImg, {
        x: (width - imgW) / 2,
        y: (height - imgH) / 2,
        width: imgW,
        height: imgH,
        opacity: config.opacity,
        rotate: degrees(config.rotation),
      });
    } else {
      page.drawText(text, {
        x,
        y,
        size: config.fontSize,
        font,
        color: rgb(r, g, b),
        opacity: config.opacity,
        rotate: degrees(config.rotation),
      });
    }
  });

  return await doc.save();
}

/**
 * Adds page numbers with rotation awareness and custom positioning
 */
export async function addPageNumbers(
  sourceBytes: Uint8Array,
  config: PageNumberConfig
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(sourceBytes);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const totalPages = doc.getPageCount();

  const hex = config.color.replace('#', '');
  const r = parseInt(hex.substring(0, 2) || '47', 16) / 255;
  const g = parseInt(hex.substring(2, 4) || '55', 16) / 255;
  const b = parseInt(hex.substring(4, 6) || '69', 16) / 255;

  for (let i = 1; i <= totalPages; i++) {
    if (config.skipFirstPage && i === 1) continue;

    const page = doc.getPage(i - 1);
    const { width, height } = page.getSize();
    const currentNum = i + config.startNumber - 1;

    let text = String(currentNum);
    if (config.format === 'page-x') text = `Page ${currentNum}`;
    else if (config.format === 'page-x-of-y') text = `Page ${currentNum} of ${totalPages}`;
    else if (config.format === 'x-slash-y') text = `${currentNum} / ${totalPages}`;
    else if (config.format === 'dash-x-dash') text = `- ${currentNum} -`;

    const textWidth = font.widthOfTextAtSize(text, config.fontSize);
    const margin = config.margin;

    let x = (width - textWidth) / 2;
    let y = margin;

    if (config.position === 'bottom-center') {
      x = (width - textWidth) / 2;
      y = margin;
    } else if (config.position === 'bottom-right') {
      x = width - textWidth - margin;
      y = margin;
    } else if (config.position === 'bottom-left') {
      x = margin;
      y = margin;
    } else if (config.position === 'top-center') {
      x = (width - textWidth) / 2;
      y = height - margin - config.fontSize;
    } else if (config.position === 'top-right') {
      x = width - textWidth - margin;
      y = height - margin - config.fontSize;
    } else if (config.position === 'top-left') {
      x = margin;
      y = height - margin - config.fontSize;
    }

    page.drawText(text, {
      x,
      y,
      size: config.fontSize,
      font,
      color: rgb(r, g, b),
    });
  }

  return await doc.save();
}

/**
 * Encrypts PDF using genuine client-side AES-256 with verification
 */
export async function protectPdf(
  sourceBytes: Uint8Array,
  config: ProtectConfig
): Promise<Uint8Array> {
  if (!config.userPassword) {
    throw new Error('Please enter a password');
  }
  if (config.userPassword !== config.confirmPassword) {
    throw new Error('Passwords do not match');
  }

  const encrypted = await encryptPDF(sourceBytes, config.userPassword, {
    ownerPassword: config.ownerPassword || config.userPassword,
    algorithm: config.algorithm || 'AES-256',
    allowPrinting: config.allowPrinting,
    allowModifying: config.allowModifying,
    allowCopying: config.allowCopying,
    allowAnnotating: config.allowAnnotating,
  });

  // Verify encryption immediately in memory
  try {
    await decryptPDF(encrypted, config.userPassword);
  } catch (err: any) {
    throw new Error(`Encryption verification check failed: ${err.message}`);
  }

  return encrypted;
}
