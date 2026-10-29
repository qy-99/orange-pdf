/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState, useEffect } from 'react';
import { UploadCloud, FileType, Plus } from 'lucide-react';

interface DropZoneProps {
  onFilesSelected: (files: File[]) => void;
  isCompact?: boolean;
}

export const DropZone: React.FC<DropZoneProps> = ({ onFilesSelected, isCompact = false }) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Clipboard paste support
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const pastedFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].kind === 'file') {
          const file = items[i].getAsFile();
          if (file && (file.type.includes('pdf') || file.type.startsWith('image/'))) {
            pastedFiles.push(file);
          }
        }
      }

      if (pastedFiles.length > 0) {
        onFilesSelected(pastedFiles);
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [onFilesSelected]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFiles = Array.from(e.dataTransfer.files).filter(
        (f) =>
          f.type === 'application/pdf' ||
          f.type.startsWith('image/') ||
          /\.(pdf|jpe?g|png|webp)$/i.test(f.name)
      );
      if (droppedFiles.length > 0) {
        onFilesSelected(droppedFiles);
      }
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selected = Array.from(e.target.files);
      onFilesSelected(selected);
      // Reset input value so same file can be re-added if desired
      e.target.value = '';
    }
  };

  if (isCompact) {
    return (
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`group flex items-center justify-center gap-2 cursor-pointer rounded-xl border border-dashed px-4 py-2.5 text-xs font-medium transition-all ${
          isDragOver
            ? 'border-orange-500 bg-orange-500/10 text-orange-400'
            : 'border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700 hover:bg-slate-900'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/*"
          className="hidden"
          onChange={handleInputChange}
        />
        <Plus className="w-3.5 h-3.5 text-orange-400 group-hover:scale-110 transition-transform" />
        <span>Add files (PDF, JPG, PNG, WebP)</span>
      </div>
    );
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => fileInputRef.current?.click()}
      className={`group relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center cursor-pointer transition-all duration-200 ${
        isDragOver
          ? 'border-orange-500 bg-orange-500/10 shadow-lg shadow-orange-500/5'
          : 'border-slate-800 bg-slate-900/40 hover:border-orange-500/40 hover:bg-slate-900/70'
      }`}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/*"
        className="hidden"
        onChange={handleInputChange}
      />

      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-800 border border-slate-700 text-orange-400 group-hover:scale-105 group-hover:bg-orange-500/10 group-hover:border-orange-500/30 group-hover:text-orange-400 transition-all">
        <UploadCloud className="h-7 w-7" />
      </div>

      <h3 className="mt-4 text-sm font-semibold text-slate-100">
        Drop PDF, JPG, PNG or WebP files here
      </h3>
      <p className="mt-1 text-xs text-slate-400 max-w-sm">
        Drag and drop files, click to browse from this computer, or press <kbd className="rounded border border-slate-700 bg-slate-800 px-1 py-0.5 text-[10px] text-slate-300">Ctrl+V</kbd> to paste.
      </p>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-[11px] text-slate-400">
        <span className="flex items-center gap-1 rounded-md bg-slate-800/80 px-2 py-0.5 border border-slate-700/60">
          <FileType className="w-3 h-3 text-orange-400" /> PDF
        </span>
        <span className="flex items-center gap-1 rounded-md bg-slate-800/80 px-2 py-0.5 border border-slate-700/60">
          <FileType className="w-3 h-3 text-orange-400" /> JPG / JPEG
        </span>
        <span className="flex items-center gap-1 rounded-md bg-slate-800/80 px-2 py-0.5 border border-slate-700/60">
          <FileType className="w-3 h-3 text-orange-400" /> PNG
        </span>
        <span className="flex items-center gap-1 rounded-md bg-slate-800/80 px-2 py-0.5 border border-slate-700/60">
          <FileType className="w-3 h-3 text-orange-400" /> WebP
        </span>
      </div>
    </div>
  );
};
