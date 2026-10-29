/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  Minimize2,
  AlertTriangle,
  Download,
  CheckCircle2,
  FileCheck,
  Loader2,
  ArrowRight,
  ShieldCheck,
  Sliders,
} from 'lucide-react';
import type { QueuedFile, CompressionConfig } from '../../types';
import { compressPdf } from '../../utils/pdfOperations';
import { formatBytes, downloadFile } from '../../utils/pdfHelper';

interface CompressToolProps {
  files: QueuedFile[];
  activeFileId: string | null;
}

export const CompressTool: React.FC<CompressToolProps> = ({ files, activeFileId }) => {
  const pdfFiles = useMemo(() => files.filter((f) => f.type === 'pdf'), [files]);
  const [selectedFileId, setSelectedFileId] = useState<string>(activeFileId || pdfFiles[0]?.id || '');

  const currentFile = useMemo(
    () => pdfFiles.find((f) => f.id === selectedFileId),
    [pdfFiles, selectedFileId]
  );

  const [config, setConfig] = useState<CompressionConfig>({
    mode: 'lossless',
    dpi: 96,
    quality: 0.75,
  });

  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [result, setResult] = useState<{
    bytes: Uint8Array;
    originalSize: number;
    compressedSize: number;
    isRasterized: boolean;
  } | null>(null);

  const handleCompress = async () => {
    if (!currentFile) return;
    setIsProcessing(true);
    setProgress(0);
    setResult(null);

    try {
      const bytes = currentFile.data || new Uint8Array(await currentFile.file.arrayBuffer());
      const res = await compressPdf(bytes, config, (p) => setProgress(p));
      setResult(res);
    } catch (err: any) {
      alert(`Compression failed: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownloadResult = () => {
    if (!result || !currentFile) return;
    const baseName = currentFile.name.replace(/\.pdf$/i, '');
    const suffix = result.isRasterized ? '_raster_compressed' : '_optimized';
    downloadFile(result.bytes, `${baseName}${suffix}.pdf`);
  };

  if (!currentFile) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-8 text-center">
        <Minimize2 className="mx-auto h-8 w-8 text-slate-500 mb-2" />
        <h4 className="text-sm font-semibold text-slate-200">No PDF Loaded</h4>
        <p className="mt-1 text-xs text-slate-400">
          Drop or upload a PDF above to inspect compression and optimization options.
        </p>
      </div>
    );
  }

  const reduction = result
    ? Math.round(((result.originalSize - result.compressedSize) / result.originalSize) * 100)
    : 0;

  const isLarger = result && result.compressedSize >= result.originalSize;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Minimize2 className="h-4 w-4 text-orange-500" />
              Compress & Optimize PDF
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Choose between lossless drawing structure optimization or configurable page rasterization.
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400">Target File:</span>
            <select
              value={selectedFileId}
              onChange={(e) => {
                setSelectedFileId(e.target.value);
                setResult(null);
              }}
              className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-orange-500"
            >
              {pdfFiles.map((pdf) => (
                <option key={pdf.id} value={pdf.id}>
                  {pdf.name} ({formatBytes(pdf.size)})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Compression Mode Selection */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Mode 1: Lossless Structural Optimization */}
          <div
            onClick={() => setConfig((prev) => ({ ...prev, mode: 'lossless' }))}
            className={`cursor-pointer rounded-2xl border p-4 transition-all ${
              config.mode === 'lossless'
                ? 'border-orange-500 bg-orange-500/10 shadow-sm ring-1 ring-orange-500/30'
                : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-orange-400" />
                <h4 className="text-xs font-bold text-white">
                  Optimize / Preserve Drawing Quality
                </h4>
              </div>
              <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                Recommended for CAD / Engineering
              </span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Cleans redundant PDF objects, optimizes object streams, and removes metadata while preserving <strong>100% of vector lines, fonts, layers, and searchable text</strong>. No rasterization or blur.
            </p>
          </div>

          {/* Mode 2: Lossy Rasterization */}
          <div
            onClick={() => setConfig((prev) => ({ ...prev, mode: 'rasterize' }))}
            className={`cursor-pointer rounded-2xl border p-4 transition-all ${
              config.mode === 'rasterize'
                ? 'border-orange-500 bg-orange-500/10 shadow-sm ring-1 ring-orange-500/30'
                : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-orange-400" />
                <h4 className="text-xs font-bold text-white">
                  High Compression (Rasterize Pages)
                </h4>
              </div>
              <span className="text-[10px] font-semibold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                Lossy Mode
              </span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Renders entire pages to JPEG images at configurable DPI and quality. Produces small file sizes for scanned reports or viewing on mobile devices.
            </p>
          </div>
        </div>

        {/* Warning if rasterize mode is chosen */}
        {config.mode === 'rasterize' && (
          <div className="rounded-xl bg-amber-500/10 border border-amber-500/25 p-4 space-y-3 text-xs text-amber-300">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
              <div className="space-y-1">
                <strong className="text-amber-200">Engineering Drawing Caution:</strong>
                <p className="leading-relaxed">
                  Rasterization converts line drawings and text into bitmap images. Fine CAD lines, measurements, and text searchability may be degraded. Only use this mode if you explicitly need a small bitmap copy.
                </p>
              </div>
            </div>

            {/* Sliders for DPI and Quality */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-amber-500/20">
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] text-slate-300">
                  <span>Resolution (DPI):</span>
                  <span className="font-mono text-orange-400 font-semibold">{config.dpi} DPI</span>
                </div>
                <input
                  type="range"
                  min={72}
                  max={150}
                  step={6}
                  value={config.dpi}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, dpi: parseInt(e.target.value) }))
                  }
                  className="w-full accent-orange-500 cursor-pointer"
                />
                <div className="flex justify-between text-[9px] text-slate-500">
                  <span>72 (Compact)</span>
                  <span>96 (Standard)</span>
                  <span>150 (Detailed)</span>
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-[11px] text-slate-300">
                  <span>JPEG Quality:</span>
                  <span className="font-mono text-orange-400 font-semibold">
                    {Math.round(config.quality * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0.3}
                  max={0.9}
                  step={0.05}
                  value={config.quality}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, quality: parseFloat(e.target.value) }))
                  }
                  className="w-full accent-orange-500 cursor-pointer"
                />
                <div className="flex justify-between text-[9px] text-slate-500">
                  <span>30% (Smallest)</span>
                  <span>65% (Balanced)</span>
                  <span>90% (Crisp)</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Action Button */}
        <div className="pt-2 flex items-center justify-between">
          <span className="text-xs text-slate-400">
            Original Size: <strong className="text-slate-200">{formatBytes(currentFile.size)}</strong>
          </span>

          <button
            onClick={handleCompress}
            disabled={isProcessing}
            className="inline-flex items-center gap-2 rounded-xl bg-orange-600 hover:bg-orange-500 active:bg-orange-700 disabled:opacity-40 text-white px-5 py-2 text-xs font-semibold shadow-md shadow-orange-600/20 transition"
          >
            {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Minimize2 className="w-4 h-4" />}
            <span>
              {isProcessing
                ? config.mode === 'rasterize'
                  ? `Rasterizing (${progress}%)...`
                  : 'Optimizing streams...'
                : 'Run Compression'}
            </span>
          </button>
        </div>
      </div>

      {/* Results View */}
      {result && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-sm space-y-4">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
            Compression Result
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-xl bg-slate-950 p-3 border border-slate-800 text-center">
              <span className="text-[10px] text-slate-400 uppercase">Original Size</span>
              <div className="text-sm font-bold text-slate-200 mt-1">
                {formatBytes(result.originalSize)}
              </div>
            </div>

            <div className="rounded-xl bg-slate-950 p-3 border border-slate-800 text-center">
              <span className="text-[10px] text-slate-400 uppercase">New Size</span>
              <div className="text-sm font-bold text-white mt-1">
                {formatBytes(result.compressedSize)}
              </div>
            </div>

            <div
              className={`rounded-xl p-3 border text-center ${
                isLarger
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              }`}
            >
              <span className="text-[10px] uppercase font-semibold">
                {isLarger ? 'Difference' : 'Reduction'}
              </span>
              <div className="text-sm font-bold mt-1">
                {isLarger ? `+${formatBytes(result.compressedSize - result.originalSize)}` : `-${reduction}%`}
              </div>
            </div>
          </div>

          {/* Honest reporting if larger */}
          {isLarger ? (
            <div className="rounded-xl bg-slate-950 p-3.5 border border-slate-800 text-xs text-slate-300 space-y-1">
              <p className="font-medium text-amber-400">
                Notice: The file is already tightly compressed!
              </p>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Rebuilding this document did not reduce its size because its streams and objects were already well-optimized. We recommend keeping the original file, but you may still download the rebuilt file if desired.
              </p>
            </div>
          ) : (
            <div className="rounded-xl bg-emerald-500/5 p-3.5 border border-emerald-500/20 text-xs text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                Successfully reduced file size by {reduction}% ({formatBytes(result.originalSize - result.compressedSize)} saved).
              </span>
            </div>
          )}

          <div className="pt-2 flex justify-end">
            <button
              onClick={handleDownloadResult}
              className="inline-flex items-center gap-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white px-4 py-2 text-xs font-semibold shadow-sm transition"
            >
              <Download className="w-4 h-4" />
              <span>Download Compressed PDF</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
