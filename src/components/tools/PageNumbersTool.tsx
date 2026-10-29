/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Hash, Download, Loader2 } from 'lucide-react';
import type { QueuedFile, PageNumberConfig } from '../../types';
import { addPageNumbers } from '../../utils/pdfOperations';
import { renderPageThumbnail, downloadFile } from '../../utils/pdfHelper';

interface PageNumbersToolProps {
  files: QueuedFile[];
  activeFileId: string | null;
}

export const PageNumbersTool: React.FC<PageNumbersToolProps> = ({ files, activeFileId }) => {
  const pdfFiles = useMemo(() => files.filter((f) => f.type === 'pdf'), [files]);
  const [selectedFileId, setSelectedFileId] = useState<string>(activeFileId || pdfFiles[0]?.id || '');

  const currentFile = useMemo(
    () => pdfFiles.find((f) => f.id === selectedFileId),
    [pdfFiles, selectedFileId]
  );

  const [config, setConfig] = useState<PageNumberConfig>({
    format: 'page-x-of-y',
    startNumber: 1,
    skipFirstPage: false,
    position: 'bottom-center',
    fontSize: 10,
    color: '#334155',
    margin: 30,
    pages: 'all',
  });

  const [previewThumb, setPreviewThumb] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Load preview thumbnail of page 1 or 2 (if skipFirstPage is active)
  const previewPageNum = config.skipFirstPage && (currentFile?.pageCount || 1) > 1 ? 2 : 1;

  useEffect(() => {
    if (!currentFile) {
      setPreviewThumb(null);
      return;
    }
    const load = async () => {
      try {
        const bytes = currentFile.data || new Uint8Array(await currentFile.file.arrayBuffer());
        const thumb = await renderPageThumbnail(bytes, previewPageNum, 300);
        setPreviewThumb(thumb);
      } catch (err) {
        console.warn('Failed preview thumbnail:', err);
      }
    };
    load();
  }, [currentFile, previewPageNum]);

  // Render preview canvas with simulated page number
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

      // Determine text based on format
      const pageNum = previewPageNum + config.startNumber - 1;
      const totalPages = currentFile?.pageCount || 1;
      let text = String(pageNum);
      if (config.format === 'page-x') text = `Page ${pageNum}`;
      else if (config.format === 'page-x-of-y') text = `Page ${pageNum} of ${totalPages}`;
      else if (config.format === 'x-slash-y') text = `${pageNum} / ${totalPages}`;
      else if (config.format === 'dash-x-dash') text = `- ${pageNum} -`;

      ctx.save();
      ctx.fillStyle = config.color;
      ctx.font = `${config.fontSize * (img.width / 450)}px sans-serif`;

      let x = canvas.width / 2;
      ctx.textAlign = 'center';
      if (config.position.includes('left')) {
        x = 20;
        ctx.textAlign = 'left';
      } else if (config.position.includes('right')) {
        x = canvas.width - 20;
        ctx.textAlign = 'right';
      }

      let y = canvas.height - 18;
      if (config.position.includes('top')) {
        y = 24;
      }

      ctx.fillText(text, x, y);
      ctx.restore();
    };
    img.src = previewThumb;
  }, [previewThumb, config, previewPageNum, currentFile]);

  const handleApplyNumbers = async () => {
    if (!currentFile) return;
    setIsProcessing(true);

    try {
      const bytes = currentFile.data || new Uint8Array(await currentFile.file.arrayBuffer());
      const numberedBytes = await addPageNumbers(bytes, config);
      const cleanBase = currentFile.name.replace(/\.pdf$/i, '');
      downloadFile(numberedBytes, `${cleanBase}_numbered.pdf`);
    } catch (err: any) {
      alert(`Page number error: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  if (!currentFile) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-8 text-center">
        <Hash className="mx-auto h-8 w-8 text-slate-500 mb-2" />
        <h4 className="text-sm font-semibold text-slate-200">No PDF Loaded</h4>
        <p className="mt-1 text-xs text-slate-400">
          Drop or upload a PDF above to add header or footer page numbers.
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
              <Hash className="h-4 w-4 text-orange-500" />
              Add Page Numbers
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Insert pagination into PDF headers or footers with customizable formats and margins.
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
            {/* Format Presets */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-300">Numbering Format</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  { id: 'page-x-of-y', label: 'Page 1 of 20' },
                  { id: 'x-slash-y', label: '1 / 20' },
                  { id: 'number', label: '1' },
                  { id: 'page-x', label: 'Page 1' },
                  { id: 'dash-x-dash', label: '- 1 -' },
                ].map((fmt) => (
                  <button
                    key={fmt.id}
                    type="button"
                    onClick={() =>
                      setConfig((prev) => ({ ...prev, format: fmt.id as any }))
                    }
                    className={`rounded-xl border p-2.5 text-left text-xs font-mono transition ${
                      config.format === fmt.id
                        ? 'border-orange-500 bg-orange-500/10 text-white font-semibold'
                        : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-white'
                    }`}
                  >
                    {fmt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Position Selector */}
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
                  <option value="bottom-center">Bottom Center (Footer)</option>
                  <option value="bottom-right">Bottom Right (Footer)</option>
                  <option value="bottom-left">Bottom Left (Footer)</option>
                  <option value="top-center">Top Center (Header)</option>
                  <option value="top-right">Top Right (Header)</option>
                  <option value="top-left">Top Left (Header)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-medium text-slate-400">Start Number</label>
                <input
                  type="number"
                  min={1}
                  value={config.startNumber}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, startNumber: parseInt(e.target.value) || 1 }))
                  }
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
              </div>
            </div>

            {/* Skip First Page Checkbox */}
            <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
              <input
                type="checkbox"
                checked={config.skipFirstPage}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, skipFirstPage: e.target.checked }))
                }
                className="rounded border-slate-700 bg-slate-800 text-orange-600 focus:ring-0"
              />
              <span>Skip first page (recommended for cover / title sheets)</span>
            </label>

            {/* Margins & Font Size */}
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] text-slate-300">
                  <span>Font Size:</span>
                  <span className="font-mono text-orange-400 font-semibold">{config.fontSize} pt</span>
                </div>
                <input
                  type="range"
                  min={8}
                  max={18}
                  step={1}
                  value={config.fontSize}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, fontSize: parseInt(e.target.value) }))
                  }
                  className="w-full accent-orange-500 cursor-pointer"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-[11px] text-slate-300">
                  <span>Page Margin:</span>
                  <span className="font-mono text-orange-400 font-semibold">{config.margin} pt</span>
                </div>
                <input
                  type="range"
                  min={15}
                  max={60}
                  step={5}
                  value={config.margin}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, margin: parseInt(e.target.value) }))
                  }
                  className="w-full accent-orange-500 cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Live Preview */}
          <div className="flex flex-col items-center justify-center rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-center">
            <span className="text-[10px] uppercase font-semibold text-slate-400 mb-2">
              Preview on Page {previewPageNum}
            </span>
            <div className="aspect-[3/4] w-48 max-w-full overflow-hidden rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center">
              <canvas ref={canvasRef} className="max-h-full max-w-full object-contain" />
            </div>
          </div>
        </div>

        {/* Action Button */}
        <div className="pt-3 border-t border-slate-800 flex justify-end">
          <button
            onClick={handleApplyNumbers}
            disabled={isProcessing}
            className="inline-flex items-center gap-2 rounded-xl bg-orange-600 hover:bg-orange-500 active:bg-orange-700 disabled:opacity-40 text-white px-5 py-2 text-xs font-semibold shadow-md shadow-orange-600/20 transition"
          >
            {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            <span>Add Numbers & Download PDF</span>
          </button>
        </div>
      </div>
    </div>
  );
};
