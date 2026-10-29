/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { FileText, Image as ImageIcon, Trash2, ArrowUp, ArrowDown, CheckCircle, Eye } from 'lucide-react';
import type { QueuedFile } from '../types';
import { formatBytes } from '../utils/pdfHelper';

interface FileQueueProps {
  files: QueuedFile[];
  activeFileId: string | null;
  onSelectFile: (id: string) => void;
  onRemoveFile: (id: string) => void;
  onMoveFile: (index: number, direction: 'up' | 'down') => void;
  onPreviewFile?: (file: QueuedFile) => void;
}

export const FileQueue: React.FC<FileQueueProps> = ({
  files,
  activeFileId,
  onSelectFile,
  onRemoveFile,
  onMoveFile,
  onPreviewFile,
}) => {
  if (files.length === 0) return null;

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-sm backdrop-blur-xs">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
            Loaded Files Queue
          </h3>
          <span className="rounded-full bg-orange-500/10 px-2 py-0.5 text-[11px] font-semibold text-orange-400 border border-orange-500/20">
            {files.length} {files.length === 1 ? 'file' : 'files'}
          </span>
        </div>
        <span className="text-[11px] text-slate-400">
          Total: {formatBytes(files.reduce((acc, f) => acc + f.size, 0))}
        </span>
      </div>

      <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
        {files.map((file, idx) => {
          const isActive = file.id === activeFileId;
          return (
            <div
              key={file.id}
              onClick={() => onSelectFile(file.id)}
              className={`group flex items-center justify-between gap-3 rounded-xl border p-2.5 cursor-pointer transition-all ${
                isActive
                  ? 'border-orange-500/80 bg-orange-500/10 shadow-xs'
                  : 'border-slate-800/80 bg-slate-950/60 hover:border-slate-700 hover:bg-slate-900'
              }`}
            >
              {/* Left icon & name */}
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                    file.type === 'pdf'
                      ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                      : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                  }`}
                >
                  {file.type === 'pdf' ? (
                    <FileText className="h-4 w-4" />
                  ) : (
                    <ImageIcon className="h-4 w-4" />
                  )}
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-xs font-medium text-slate-200">
                      {file.name}
                    </p>
                    {isActive && (
                      <span className="rounded-md bg-orange-500/20 px-1.5 py-0.2 text-[10px] font-semibold text-orange-400">
                        Selected
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-slate-400">
                    <span>{formatBytes(file.size)}</span>
                    {file.pageCount !== undefined && (
                      <>
                        <span>•</span>
                        <span className="text-slate-300">
                          {file.pageCount} {file.pageCount === 1 ? 'page' : 'pages'}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Right controls */}
              <div
                className="flex items-center gap-1 shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                {onPreviewFile && (
                  <button
                    onClick={() => onPreviewFile(file)}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition"
                    title="Quick preview"
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </button>
                )}

                {/* Reordering */}
                {files.length > 1 && (
                  <div className="flex items-center">
                    <button
                      disabled={idx === 0}
                      onClick={() => onMoveFile(idx, 'up')}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200 disabled:opacity-20 transition"
                      title="Move up in queue"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      disabled={idx === files.length - 1}
                      onClick={() => onMoveFile(idx, 'down')}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200 disabled:opacity-20 transition"
                      title="Move down in queue"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}

                <button
                  onClick={() => onRemoveFile(file.id)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition"
                  title="Remove from queue"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
