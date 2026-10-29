/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import JSZip from 'jszip';
import { FileImage, Download, Loader2, Sliders, CheckCircle2 } from 'lucide-react';
import type { QueuedFile, PdfToImagesConfig } from '../../types';
import { pdfToImages } from '../../utils/pdfOperations';
import { renderPageThumbnail, downloadFile } from '../../utils/pdfHelper';

interface PdfToImagesToolProps {
  files: QueuedFile[];
  activeFileId: string | null;
}

export const PdfToImagesTool: React.FC<PdfToImagesToolProps> = ({ files, activeFileId }) => {
  const pdfFiles = useMemo(() => files.filter((f) => f.type === 'pdf'), [files]);
  const [selectedFileId, setSelectedFileId] = useState<string>(activeFileId || pdfFiles[0]?.id || '');

  const currentFile = useMemo(
    () => pdfFiles.find((f) => f.id === selectedFileId),
    [pdfFiles, selectedFileId]
  );

  const [config, setConfig] = useState<PdfToImagesConfig>({
    format: 'png',
    scale: 1.5,
    quality: 0.85,
  });

  const [previewThumb, setPreviewThumb] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [generatedCount, setGeneratedCount] = useState<number | null>(null);

  // Load preview thumbnail
  useEffect(() => {
    if (!currentFile) {
      setPreviewThumb(null);
      return;
    }
    const loadPreview = async () => {
      try {
        const bytes = currentFile.data || new Uint8Array(await currentFile.file.arrayBuffer());
        const thumb = await renderPageThumbnail(bytes, 1, 260);
        setPreviewThumb(thumb);
      } catch (err) {
        console.warn('Failed to load page 1 preview', err);
      }
    };
    loadPreview();
  }, [currentFile]);

  const handleConvert = async () => {
    if (!currentFile) return;
    setIsProcessing(true);
    setProgress(0);
    setGeneratedCount(null);

    try {
      const bytes = currentFile.data || new Uint8Array(await currentFile.file.arrayBuffer());
      const images = await pdfToImages(bytes, currentFile.name, config, (p) => setProgress(p));

      if (images.length === 1) {
        // Single image download
        const img = images[0];
        const mime = config.format === 'png' ? 'image/png' : 'image/jpeg';
        downloadFile(img.blob, img.filename, mime);
      } else {
        // Multi-page ZIP download
        const zip = new JSZip();
        images.forEach((img) => {
          zip.file(img.filename, img.blob);
        });
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const cleanBase = currentFile.name.replace(/\.pdf$/i, '');
        downloadFile(zipBlob, `${cleanBase}_images.zip`, 'application/zip');
      }

      setGeneratedCount(images.length);
    } catch (err: any) {
      alert(`Conversion error: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  if (!currentFile) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-8 text-center">
        <FileImage className="mx-auto h-8 w-8 text-slate-500 mb-2" />
        <h4 className="text-sm font-semibold text-slate-200">No PDF Loaded</h4>
        <p className="mt-1 text-xs text-slate-400">
          Drop or upload a PDF above to export its pages into crisp images.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <FileImage className="h-4 w-4 text-orange-500" />
              Convert PDF to Images
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Render every page into high-resolution PNG or JPEG images bundled in a ZIP.
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400">Target File:</span>
            <select
              value={selectedFileId}
              onChange={(e) => {
                setSelectedFileId(e.target.value);
                setGeneratedCount(null);
              }}
              className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-orange-500"
            >
              {pdfFiles.map((pdf) => (
                <option key={pdf.id} value={pdf.id}>
                  {pdf.name} ({pdf.pageCount || '?'} pages)
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Controls */}
          <div className="md:col-span-2 space-y-4">
            {/* Format Selector */}
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1.5">
                Output Format
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setConfig((prev) => ({ ...prev, format: 'png' }))}
                  className={`rounded-xl border p-3 text-left transition ${
                    config.format === 'png'
                      ? 'border-orange-500 bg-orange-500/10 text-white ring-1 ring-orange-500/30'
                      : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-white'
                  }`}
                >
                  <div className="font-bold text-xs">PNG (Lossless)</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Best for line drawings, architectural plans, and text diagrams.
                  </div>
                </button>

                <button
                  onClick={() => setConfig((prev) => ({ ...prev, format: 'jpeg' }))}
                  className={`rounded-xl border p-3 text-left transition ${
                    config.format === 'jpeg'
                      ? 'border-orange-500 bg-orange-500/10 text-white ring-1 ring-orange-500/30'
                      : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-white'
                  }`}
                >
                  <div className="font-bold text-xs">JPEG (Compact)</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Smaller file sizes, ideal for photos and document scans.
                  </div>
                </button>
              </div>
            </div>

            {/* Resolution / Scale Slider */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-slate-300">
                <span>Rendering Scale / Resolution:</span>
                <span className="font-mono text-orange-400 font-semibold">{config.scale}x</span>
              </div>
              <input
                type="range"
                min={1.0}
                max={3.0}
                step={0.5}
                value={config.scale}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, scale: parseFloat(e.target.value) }))
                }
                className="w-full accent-orange-500 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-500">
                <span>1.0x (Standard ~72 DPI)</span>
                <span>1.5x (Crisp ~110 DPI)</span>
                <span>2.0x (High-Res ~144 DPI)</span>
                <span>3.0x (Ultra 216 DPI)</span>
              </div>
            </div>

            {/* JPEG Quality Slider (if JPEG) */}
            {config.format === 'jpeg' && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-slate-300">
                  <span>JPEG Quality:</span>
                  <span className="font-mono text-orange-400 font-semibold">
                    {Math.round(config.quality * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={1.0}
                  step={0.05}
                  value={config.quality}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, quality: parseFloat(e.target.value) }))
                  }
                  className="w-full accent-orange-500 cursor-pointer"
                />
              </div>
            )}

            {/* Deterministic naming info */}
            <div className="rounded-xl bg-slate-950/60 p-3 border border-slate-800 text-[11px] text-slate-400">
              Output naming: <code className="text-orange-400 font-mono">{currentFile.name.replace(/\.pdf$/i, '')}-page-001.{config.format === 'png' ? 'png' : 'jpg'}</code>
            </div>
          </div>

          {/* Page 1 Preview Card */}
          <div className="flex flex-col items-center justify-center rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-center">
            <span className="text-[10px] uppercase font-semibold text-slate-400 mb-2">
              Page 1 Preview
            </span>
            <div className="aspect-[3/4] w-36 max-w-full overflow-hidden rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center">
              {previewThumb ? (
                <img src={previewThumb} alt="Page 1" className="h-full w-full object-contain" />
              ) : (
                <span className="text-xs text-slate-500">Loading...</span>
              )}
            </div>
            <span className="text-[10px] text-slate-500 mt-2">
              Total {currentFile.pageCount || 1} pages to convert
            </span>
          </div>
        </div>

        {/* Action Button & Progress */}
        <div className="pt-3 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-slate-400">
            {generatedCount !== null && (
              <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
                <CheckCircle2 className="w-4 h-4" /> Downloaded {generatedCount} images.
              </span>
            )}
          </div>

          <button
            onClick={handleConvert}
            disabled={isProcessing}
            className="inline-flex items-center gap-2 rounded-xl bg-orange-600 hover:bg-orange-500 active:bg-orange-700 disabled:opacity-40 text-white px-5 py-2 text-xs font-semibold shadow-md shadow-orange-600/20 transition"
          >
            {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            <span>
              {isProcessing
                ? `Converting pages (${progress}%)...`
                : currentFile.pageCount && currentFile.pageCount > 1
                ? `Convert & Download ZIP (${currentFile.pageCount} Pages)`
                : 'Convert & Download Image'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
