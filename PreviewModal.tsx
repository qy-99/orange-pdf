/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { X, ZoomIn, ZoomOut, RotateCw, Loader2 } from 'lucide-react';
import { renderPageThumbnail } from '../utils/pdfHelper';

interface PreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  pdfBytes?: Uint8Array | null;
  pageNum: number;
  title?: string;
}

export const PreviewModal: React.FC<PreviewModalProps> = ({
  isOpen,
  onClose,
  pdfBytes,
  pageNum,
  title,
}) => {
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [scale, setScale] = useState<number>(1.0);
  const [rotation, setRotation] = useState<number>(0);

  useEffect(() => {
    if (!isOpen || !pdfBytes) {
      setImgUrl(null);
      setScale(1.0);
      setRotation(0);
      return;
    }

    let isMounted = true;
    setLoading(true);

    renderPageThumbnail(pdfBytes, pageNum, 1200)
      .then((url) => {
        if (isMounted) {
          setImgUrl(url);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error('Preview error:', err);
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, pdfBytes, pageNum]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-fade-in">
      <div className="relative flex h-[90vh] w-[90vw] max-w-5xl flex-col rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-white">
              {title || `Page ${pageNum} Preview`}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setScale((s) => Math.max(0.5, s - 0.25))}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
              title="Zoom out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-xs font-mono text-slate-400 min-w-[45px] text-center">
              {Math.round(scale * 100)}%
            </span>
            <button
              onClick={() => setScale((s) => Math.min(3.0, s + 0.25))}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
              title="Zoom in"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={() => setRotation((r) => (r + 90) % 360)}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
              title="Rotate view"
            >
              <RotateCw className="w-4 h-4" />
            </button>

            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white ml-2"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-slate-900/50">
          {loading ? (
            <div className="flex flex-col items-center gap-2 text-slate-400 text-xs">
              <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
              <span>Rendering preview...</span>
            </div>
          ) : imgUrl ? (
            <img
              src={imgUrl}
              alt={`Page ${pageNum}`}
              style={{
                transform: `scale(${scale}) rotate(${rotation}deg)`,
                transition: 'transform 0.15s ease-out',
              }}
              className="max-h-full max-w-full object-contain rounded shadow-lg bg-white"
            />
          ) : (
            <span className="text-xs text-slate-500">Failed to render page preview.</span>
          )}
        </div>
      </div>
    </div>
  );
};
