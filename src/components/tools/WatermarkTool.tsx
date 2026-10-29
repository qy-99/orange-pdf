/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Stamp, Download, Loader2, Image as ImageIcon, Type } from 'lucide-react';
import type { QueuedFile, WatermarkConfig } from '../../types';
import { watermarkPdf } from '../../utils/pdfOperations';
import { renderPageThumbnail, downloadFile } from '../../utils/pdfHelper';

interface WatermarkToolProps {
  files: QueuedFile[];
  activeFileId: string | null;
}

export const WatermarkTool: React.FC<WatermarkToolProps> = ({ files, activeFileId }) => {
  const pdfFiles = useMemo(() => files.filter((f) => f.type === 'pdf'), [files]);
  const [selectedFileId, setSelectedFileId] = useState<string>(activeFileId || pdfFiles[0]?.id || '');

  const currentFile = useMemo(
    () => pdfFiles.find((f) => f.id === selectedFileId),
    [pdfFiles, selectedFileId]
  );

  const [config, setConfig] = useState<WatermarkConfig>({
    type: 'text',
    text: 'CONFIDENTIAL',
    fontSize: 36,
    opacity: 0.35,
    rotation: 45,
    color: '#ea580c',
    position: 'center',
    pages: 'all',
  });

  const [previewThumb, setPreviewThumb] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Load preview thumbnail of page 1
  useEffect(() => {
    if (!currentFile) {
      setPreviewThumb(null);
      return;
    }
    const load = async () => {
      try {
        const bytes = currentFile.data || new Uint8Array(await currentFile.file.arrayBuffer());
        const thumb = await renderPageThumbnail(bytes, 1, 300);
        setPreviewThumb(thumb);
      } catch (err) {
        console.warn('Failed preview thumbnail:', err);
      }
    };
    load();
  }, [currentFile]);

  // Render live preview canvas overlaying page 1 thumbnail
  useEffect(() => {
    if (!canvasRef.current || !previewThumb) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      // Draw watermark overlay
      ctx.save();
      ctx.globalAlpha = config.opacity;
      ctx.fillStyle = config.color;
      ctx.font = `bold ${config.fontSize * (img.width / 400)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const cx = canvas.width / 2;
      const cy = canvas.height / 2;

      if (config.position === 'repeat') {
        const step = 80;
        for (let x = 40; x < canvas.width; x += step) {
          for (let y = 40; y < canvas.height; y += step) {
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate((config.rotation * Math.PI) / 180);
            ctx.fillText(config.text, 0, 0);
            ctx.restore();
          }
        }
      } else {
        ctx.translate(cx, cy);
        ctx.rotate((config.rotation * Math.PI) / 180);
        ctx.fillText(config.text, 0, 0);
      }

      ctx.restore();
    };
    img.src = previewThumb;
  }, [previewThumb, config]);

  const handleApplyWatermark = async () => {
    if (!currentFile) return;
    setIsProcessing(true);

    try {
      const bytes = currentFile.data || new Uint8Array(await currentFile.file.arrayBuffer());
      const watermarkedBytes = await watermarkPdf(bytes, config);
      const cleanBase = currentFile.name.replace(/\.pdf$/i, '');
      downloadFile(watermarkedBytes, `${cleanBase}_watermarked.pdf`);
    } catch (err: any) {
      alert(`Watermark error: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  if (!currentFile) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-8 text-center">
        <Stamp className="mx-auto h-8 w-8 text-slate-500 mb-2" />
        <h4 className="text-sm font-semibold text-slate-200">No PDF Loaded</h4>
        <p className="mt-1 text-xs text-slate-400">
          Drop or upload a PDF above to apply vector text or stamp watermarks.
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
              <Stamp className="h-4 w-4 text-orange-500" />
              Add PDF Watermark
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Add transparent vector text or stamp overlays to protect your documents.
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400">Target File:</span>
            <select
              value={selectedFileId}
              onChange={(e) => setSelectedFileId(e.target.value)}
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
            {/* Watermark Text */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-300">Watermark Text</label>
              <input
                type="text"
                value={config.text}
                onChange={(e) => setConfig((prev) => ({ ...prev, text: e.target.value }))}
                placeholder="e.g. CONFIDENTIAL, DRAFT, FOR REVIEW ONLY"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
            </div>

            {/* Position & Page scope */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-slate-400">Position</label>
                <select
                  value={config.position}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, position: e.target.value as any }))
                  }
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-orange-500"
                >
                  <option value="center">Center</option>
                  <option value="diagonal">Diagonal Center</option>
                  <option value="repeat">Repeat Grid Pattern</option>
                  <option value="top-left">Top Left</option>
                  <option value="top-right">Top Right</option>
                  <option value="bottom-left">Bottom Left</option>
                  <option value="bottom-right">Bottom Right</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-medium text-slate-400">Apply to Pages</label>
                <select
                  value={config.pages}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, pages: e.target.value as any }))
                  }
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-orange-500"
                >
                  <option value="all">All Pages ({currentFile.pageCount || 1})</option>
                  <option value="first">First Page Only</option>
                  <option value="odd">Odd Pages Only</option>
                  <option value="even">Even Pages Only</option>
                </select>
              </div>
            </div>

            {/* Sliders for Font Size, Opacity, Rotation */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] text-slate-300">
                  <span>Font Size:</span>
                  <span className="font-mono text-orange-400 font-semibold">{config.fontSize} pt</span>
                </div>
                <input
                  type="range"
                  min={14}
                  max={72}
                  step={2}
                  value={config.fontSize}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, fontSize: parseInt(e.target.value) }))
                  }
                  className="w-full accent-orange-500 cursor-pointer"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-[11px] text-slate-300">
                  <span>Opacity:</span>
                  <span className="font-mono text-orange-400 font-semibold">
                    {Math.round(config.opacity * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0.05}
                  max={0.9}
                  step={0.05}
                  value={config.opacity}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, opacity: parseFloat(e.target.value) }))
                  }
                  className="w-full accent-orange-500 cursor-pointer"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-[11px] text-slate-300">
                  <span>Angle:</span>
                  <span className="font-mono text-orange-400 font-semibold">{config.rotation}°</span>
                </div>
                <input
                  type="range"
                  min={-90}
                  max={90}
                  step={5}
                  value={config.rotation}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, rotation: parseInt(e.target.value) }))
                  }
                  className="w-full accent-orange-500 cursor-pointer"
                />
              </div>
            </div>

            {/* Color picker */}
            <div className="flex items-center gap-3">
              <label className="text-xs font-medium text-slate-300">Color:</label>
              <div className="flex items-center gap-2">
                {['#ea580c', '#ef4444', '#3b82f6', '#64748b', '#000000'].map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setConfig((prev) => ({ ...prev, color: c }))}
                    style={{ backgroundColor: c }}
                    className={`h-6 w-6 rounded-full border-2 transition ${
                      config.color === c ? 'border-white scale-110' : 'border-slate-800'
                    }`}
                  />
                ))}
                <input
                  type="color"
                  value={config.color}
                  onChange={(e) => setConfig((prev) => ({ ...prev, color: e.target.value }))}
                  className="h-6 w-6 rounded cursor-pointer border-0 bg-transparent"
                />
              </div>
            </div>
          </div>

          {/* Live Preview Card */}
          <div className="flex flex-col items-center justify-center rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-center">
            <span className="text-[10px] uppercase font-semibold text-slate-400 mb-2">
              Live Page Preview
            </span>
            <div className="aspect-[3/4] w-48 max-w-full overflow-hidden rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center">
              <canvas ref={canvasRef} className="max-h-full max-w-full object-contain" />
            </div>
          </div>
        </div>

        {/* Action Button */}
        <div className="pt-3 border-t border-slate-800 flex justify-end">
          <button
            onClick={handleApplyWatermark}
            disabled={isProcessing}
            className="inline-flex items-center gap-2 rounded-xl bg-orange-600 hover:bg-orange-500 active:bg-orange-700 disabled:opacity-40 text-white px-5 py-2 text-xs font-semibold shadow-md shadow-orange-600/20 transition"
          >
            {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            <span>Apply Watermark & Download PDF</span>
          </button>
        </div>
      </div>
    </div>
  );
};
