/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  ImagePlus,
  ArrowUp,
  ArrowDown,
  Trash2,
  Download,
  Loader2,
  FileCheck,
  Plus,
} from 'lucide-react';
import type { QueuedFile, ImagesToPdfConfig } from '../../types';
import { imagesToPdf } from '../../utils/pdfOperations';
import { downloadFile, formatBytes } from '../../utils/pdfHelper';

interface ImagesToPdfToolProps {
  files: QueuedFile[];
  onAddFiles: (files: File[]) => void;
}

export const ImagesToPdfTool: React.FC<ImagesToPdfToolProps> = ({ files, onAddFiles }) => {
  const imageFiles = useMemo(() => files.filter((f) => f.type === 'image'), [files]);
  const [orderedImages, setOrderedImages] = useState<QueuedFile[]>([]);

  // Keep orderedImages in sync with imageFiles
  React.useEffect(() => {
    setOrderedImages(imageFiles);
  }, [imageFiles]);

  const [config, setConfig] = useState<ImagesToPdfConfig>({
    pageSize: 'a4',
    orientation: 'auto',
    fit: 'contain',
    margin: 'normal',
    bgColor: 'white',
  });

  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  const handleMoveImage = (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= orderedImages.length) return;
    const next = [...orderedImages];
    const temp = next[index];
    next[index] = next[targetIdx];
    next[targetIdx] = temp;
    setOrderedImages(next);
  };

  const handleRemoveImage = (id: string) => {
    setOrderedImages((prev) => prev.filter((img) => img.id !== id));
  };

  const handleGeneratePdf = async () => {
    if (orderedImages.length === 0) return;
    setIsProcessing(true);

    try {
      const items = orderedImages.map((img) => ({
        file: img.file,
        name: img.name,
      }));
      const pdfBytes = await imagesToPdf(items, config);
      downloadFile(pdfBytes, 'converted_images.pdf');
    } catch (err: any) {
      alert(`Error generating PDF: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <ImagePlus className="h-4 w-4 text-orange-500" />
              Convert Images to PDF
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Combine JPG, PNG, and WebP images into a single multi-page PDF document.
            </p>
          </div>

          <label className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 text-xs font-medium cursor-pointer transition">
            <Plus className="w-3.5 h-3.5 text-orange-400" />
            <span>Add Images</span>
            <input
              type="file"
              multiple
              accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
              className="hidden"
              onChange={(e) => {
                if (e.target.files) {
                  onAddFiles(Array.from(e.target.files));
                }
              }}
            />
          </label>
        </div>

        {/* Configuration settings */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          {/* Page Size */}
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-slate-400">Page Size</label>
            <select
              value={config.pageSize}
              onChange={(e) =>
                setConfig((prev) => ({ ...prev, pageSize: e.target.value as any }))
              }
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-orange-500"
            >
              <option value="fit">Original Image Size</option>
              <option value="a4">A4 (210 × 297 mm)</option>
              <option value="letter">US Letter (8.5 × 11 in)</option>
            </select>
          </div>

          {/* Orientation */}
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-slate-400">Orientation</label>
            <select
              value={config.orientation}
              onChange={(e) =>
                setConfig((prev) => ({ ...prev, orientation: e.target.value as any }))
              }
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-orange-500"
            >
              <option value="auto">Auto (Match Image)</option>
              <option value="portrait">Portrait</option>
              <option value="landscape">Landscape</option>
            </select>
          </div>

          {/* Fit Mode */}
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-slate-400">Image Fit</label>
            <select
              value={config.fit}
              onChange={(e) =>
                setConfig((prev) => ({ ...prev, fit: e.target.value as any }))
              }
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-orange-500"
            >
              <option value="contain">Contain (No Crop)</option>
              <option value="cover">Fill Page (Cover)</option>
            </select>
          </div>

          {/* Margins */}
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-slate-400">Margins</label>
            <select
              value={config.margin}
              onChange={(e) =>
                setConfig((prev) => ({ ...prev, margin: e.target.value as any }))
              }
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-orange-500"
            >
              <option value="none">None (0 px)</option>
              <option value="small">Small (20 px)</option>
              <option value="normal">Normal (36 px)</option>
              <option value="large">Large (54 px)</option>
            </select>
          </div>
        </div>

        {/* Image Queue / Grid */}
        {orderedImages.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-800 bg-slate-950/40 p-8 text-center text-xs text-slate-400">
            No images loaded yet. Drop or select JPG, PNG or WebP images to convert them to a PDF document.
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>{orderedImages.length} images will be compiled into pages</span>
              <span>Reorder using arrows</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3 max-h-[360px] overflow-y-auto p-1">
              {orderedImages.map((img, idx) => (
                <div
                  key={img.id}
                  className="group relative flex flex-col rounded-xl border border-slate-800 bg-slate-950/80 p-2 text-xs"
                >
                  <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                    <span className="font-bold text-orange-400">#{idx + 1}</span>
                    <span className="truncate max-w-[80px]">{formatBytes(img.size)}</span>
                  </div>

                  <div className="relative aspect-[3/4] w-full overflow-hidden rounded-lg bg-slate-900 flex items-center justify-center">
                    {img.previewUrl && (
                      <img
                        src={img.previewUrl}
                        alt={img.name}
                        className="max-h-full max-w-full object-contain"
                      />
                    )}
                  </div>

                  <p className="mt-1 truncate text-[11px] text-slate-300 font-medium">
                    {img.name}
                  </p>

                  <div className="mt-1 flex items-center justify-between pt-1 border-t border-slate-800/80">
                    <button
                      disabled={idx === 0}
                      onClick={() => handleMoveImage(idx, 'up')}
                      className="p-1 text-slate-500 hover:text-white disabled:opacity-20"
                    >
                      <ArrowUp className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => handleRemoveImage(img.id)}
                      className="p-1 text-slate-500 hover:text-red-400"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                    <button
                      disabled={idx === orderedImages.length - 1}
                      onClick={() => handleMoveImage(idx, 'down')}
                      className="p-1 text-slate-500 hover:text-white disabled:opacity-20"
                    >
                      <ArrowDown className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action Button */}
        <div className="pt-3 border-t border-slate-800 flex justify-end">
          <button
            onClick={handleGeneratePdf}
            disabled={isProcessing || orderedImages.length === 0}
            className="inline-flex items-center gap-2 rounded-xl bg-orange-600 hover:bg-orange-500 active:bg-orange-700 disabled:opacity-40 text-white px-5 py-2 text-xs font-semibold shadow-md shadow-orange-600/20 transition"
          >
            {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            <span>Compile {orderedImages.length} Images into PDF</span>
          </button>
        </div>
      </div>
    </div>
  );
};
