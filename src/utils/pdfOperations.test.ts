import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import {
  organizePdf,
  organizePagesAcrossPdfs,
  splitSinglePage,
  extractSelectedPages,
  mergePdfs,
  compressPdf,
  watermarkPdf,
  addPageNumbers,
  protectPdf,
} from './pdfOperations';
import { decryptPDF } from '@pdfsmaller/pdf-decrypt';

async function createSamplePdf(pageCount = 3): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 1; i <= pageCount; i++) {
    const page = doc.addPage([400, 600]);
    page.drawText(`Sample Document Page ${i}`);
  }
  return await doc.save();
}

test('splitSinglePage extracts exactly one page preserving document validity', async () => {
  const sample = await createSamplePdf(5);
  const single = await splitSinglePage(sample, 3);
  const loaded = await PDFDocument.load(single);
  assert.equal(loaded.getPageCount(), 1);
});

test('organizePdf reorders and rotates pages', async () => {
  const sample = await createSamplePdf(3);
  // Reorder to page 3, then page 1 (drop page 2), rotate page 3 by 90 deg
  const organized = await organizePdf(sample, [3, 1], { 3: 90 });
  const loaded = await PDFDocument.load(organized);
  assert.equal(loaded.getPageCount(), 2);
  const p1 = loaded.getPage(0);
  assert.equal(p1.getRotation().angle, 90);
});

test('extractSelectedPages extracts selected subset of pages', async () => {
  const sample = await createSamplePdf(6);
  const extracted = await extractSelectedPages(sample, [2, 4, 6]);
  const loaded = await PDFDocument.load(extracted);
  assert.equal(loaded.getPageCount(), 3);
});

test('mergePdfs merges multiple PDFs sequentially', async () => {
  const pdf1 = await createSamplePdf(2);
  const pdf2 = await createSamplePdf(3);
  const merged = await mergePdfs([pdf1, pdf2]);
  const loaded = await PDFDocument.load(merged);
  assert.equal(loaded.getPageCount(), 5);
});

test('compressPdf lossless preserves vector content and page count', async () => {
  const sample = await createSamplePdf(3);
  const res = await compressPdf(sample, { mode: 'lossless', dpi: 72, quality: 0.8 });
  const loaded = await PDFDocument.load(res.bytes);
  assert.equal(loaded.getPageCount(), 3);
  assert.equal(res.isRasterized, false);
});

test('watermarkPdf adds vector overlay to pages', async () => {
  const sample = await createSamplePdf(2);
  const watermarked = await watermarkPdf(sample, {
    type: 'text',
    text: 'FOR REVIEW ONLY',
    fontSize: 24,
    opacity: 0.5,
    rotation: 45,
    color: '#ea580c',
    position: 'center',
    pages: 'all',
  });
  const loaded = await PDFDocument.load(watermarked);
  assert.equal(loaded.getPageCount(), 2);
});

test('addPageNumbers embeds page numbers on all pages', async () => {
  const sample = await createSamplePdf(4);
  const numbered = await addPageNumbers(sample, {
    format: 'page-x-of-y',
    startNumber: 1,
    skipFirstPage: true,
    position: 'bottom-center',
    fontSize: 10,
    color: '#334155',
    margin: 30,
    pages: 'all',
  });
  const loaded = await PDFDocument.load(numbered);
  assert.equal(loaded.getPageCount(), 4);
});

test('protectPdf performs real AES-256 encryption verifiable by decryptPDF', async () => {
  const sample = await createSamplePdf(1);
  const encrypted = await protectPdf(sample, {
    userPassword: 'OrangeSecure2026!',
    confirmPassword: 'OrangeSecure2026!',
    algorithm: 'AES-256',
    allowPrinting: true,
    allowModifying: false,
    allowCopying: false,
    allowAnnotating: false,
  });

  // Verify wrong password fails
  let wrongFailed = false;
  try {
    await decryptPDF(encrypted, 'WrongPassword');
  } catch {
    wrongFailed = true;
  }
  assert.equal(wrongFailed, true, 'Encrypted PDF must reject incorrect passwords');

  // Verify correct password succeeds
  const decrypted = await decryptPDF(encrypted, 'OrangeSecure2026!');
  const loaded = await PDFDocument.load(decrypted);
  assert.equal(loaded.getPageCount(), 1);
});


test('organizePagesAcrossPdfs interleaves source PDFs in requested order and rotates selected pages', async () => {
  const sourceA = await PDFDocument.create();
  sourceA.addPage([400, 600]);
  sourceA.addPage([401, 601]);
  sourceA.addPage([402, 602]);
  const sourceB = await PDFDocument.create();
  sourceB.addPage([502, 702]);
  sourceB.addPage([503, 703]);

  const organized = await organizePagesAcrossPdfs(
    [
      { id: 'source-a', bytes: await sourceA.save() },
      { id: 'source-b', bytes: await sourceB.save() },
    ],
    [
      { fileId: 'source-b', pageNumber: 2 },
      { fileId: 'source-a', pageNumber: 3, rotation: 90 },
      { fileId: 'source-a', pageNumber: 1 },
    ]
  );
  const loaded = await PDFDocument.load(organized);
  assert.equal(loaded.getPageCount(), 3);
  assert.equal(loaded.getPage(0).getSize().width, 503);
  assert.equal(loaded.getPage(1).getSize().width, 402);
  assert.equal(loaded.getPage(1).getRotation().angle, 90);
  assert.equal(loaded.getPage(2).getSize().width, 400);
});

test('organizePagesAcrossPdfs rejects references to missing source PDFs', async () => {
  const source = await createSamplePdf(1);
  await assert.rejects(
    () => organizePagesAcrossPdfs([{ id: 'source-a', bytes: source }], [{ fileId: 'missing', pageNumber: 1 }]),
    /source PDF.*missing/i
  );
});
