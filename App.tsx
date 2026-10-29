/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback } from 'react';
import type { ToolId, QueuedFile } from './types';
import { Header } from './components/Header';
import { TrustBanner } from './components/TrustBanner';
import { DropZone } from './components/DropZone';
import { FileQueue } from './components/FileQueue';
import { ToolNavigation } from './components/ToolNavigation';
import { SplitRenameTool } from './components/tools/SplitRenameTool';
import { OrganizePagesTool } from './components/tools/OrganizePagesTool';
import { CompressTool } from './components/tools/CompressTool';
import { PdfToImagesTool } from './components/tools/PdfToImagesTool';
import { ImagesToPdfTool } from './components/tools/ImagesToPdfTool';
import { WatermarkTool } from './components/tools/WatermarkTool';
import { PageNumbersTool } from './components/tools/PageNumbersTool';
import { PasswordProtectTool } from './components/tools/PasswordProtectTool';
import { PreviewModal } from './components/PreviewModal';
import { OfflineIndicator } from './components/OfflineIndicator';
import { getPdfPageCount } from './utils/pdfHelper';

export default function App() {
  const [files, setFiles] = useState<QueuedFile[]>([]);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<ToolId>('split-rename');

  // Preview Modal state
  const [previewState, setPreviewState] = useState<{
    isOpen: boolean;
    bytes: Uint8Array | null;
    pageNum: number;
    title?: string;
  }>({
    isOpen: false,
    bytes: null,
    pageNum: 1,
  });

  // Handle file addition
  const handleAddFiles = useCallback(async (newFiles: File[]) => {
    const queueItems: QueuedFile[] = [];

    for (const f of newFiles) {
      const isPdf = f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf');
      const isImage = f.type.startsWith('image/') || /\.(jpe?g|png|webp)$/i.test(f.name);

      if (!isPdf && !isImage) continue;

      const id = `file-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
      let pageCount: number | undefined;
      let previewUrl: string | undefined;
      let data: Uint8Array | undefined;

      try {
        const buffer = await f.arrayBuffer();
        data = new Uint8Array(buffer);

        if (isPdf) {
          pageCount = await getPdfPageCount(data);
        } else if (isImage) {
          previewUrl = URL.createObjectURL(f);
        }
      } catch (err) {
        console.warn('File inspection notice:', err);
      }

      queueItems.push({
        id,
        file: f,
        name: f.name,
        size: f.size,
        type: isPdf ? 'pdf' : 'image',
        pageCount,
        previewUrl,
        data,
      });
    }

    setFiles((prev) => {
      const updated = [...prev, ...queueItems];
      return updated;
    });

    if (!activeFileId && queueItems.length > 0) {
      setActiveFileId(queueItems[0].id);
    }
  }, [activeFileId]);

  // Remove single file
  const handleRemoveFile = useCallback((id: string) => {
    setFiles((prev) => {
      const fileToRemove = prev.find((f) => f.id === id);
      if (fileToRemove?.previewUrl) {
        URL.revokeObjectURL(fileToRemove.previewUrl);
      }
      const next = prev.filter((f) => f.id !== id);
      return next;
    });

    if (activeFileId === id) {
      setActiveFileId(null);
    }
  }, [activeFileId]);

  // Clear all files
  const handleClearFiles = useCallback(() => {
    files.forEach((f) => {
      if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
    });
    setFiles([]);
    setActiveFileId(null);
  }, [files]);

  // Reorder files
  const handleMoveFile = useCallback((index: number, direction: 'up' | 'down') => {
    setFiles((prev) => {
      const targetIdx = direction === 'up' ? index - 1 : index + 1;
      if (targetIdx < 0 || targetIdx >= prev.length) return prev;
      const next = [...prev];
      const temp = next[index];
      next[index] = next[targetIdx];
      next[targetIdx] = temp;
      return next;
    });
  }, []);

  // Quick preview modal trigger
  const handlePreviewPage = useCallback((pdfBytes: Uint8Array, pageNum: number, title?: string) => {
    setPreviewState({
      isOpen: true,
      bytes: pdfBytes,
      pageNum,
      title,
    });
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-orange-500/30 selection:text-orange-200">
      {/* Header */}
      <Header
        hasFiles={files.length > 0}
        onClearFiles={handleClearFiles}
        fileCount={files.length}
      />

      {/* Main Workspace */}
      <main className="flex-1 mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 space-y-6">
        {/* Trust Guarantee Banner */}
        <TrustBanner />

        {/* Drop Zone & File Queue */}
        <section aria-label="File Upload & Queue" className="space-y-4">
          <DropZone
            onFilesSelected={handleAddFiles}
            isCompact={files.length > 0}
          />

          <FileQueue
            files={files}
            activeFileId={activeFileId}
            onSelectFile={setActiveFileId}
            onRemoveFile={handleRemoveFile}
            onMoveFile={handleMoveFile}
            onPreviewFile={(f) => {
              if (f.type === 'pdf' && f.data) {
                handlePreviewPage(f.data, 1, f.name);
              }
            }}
          />
        </section>

        {/* Tool Navigation Grid */}
        <section aria-label="PDF Tools">
          <ToolNavigation
            activeTool={activeTool}
            onSelectTool={setActiveTool}
          />
        </section>

        {/* Active Tool Workspace */}
        <section aria-label="Tool Workspace" className="pt-2">
          {activeTool === 'split-rename' && (
            <SplitRenameTool
              files={files}
              activeFileId={activeFileId}
              onPreviewPdfPage={handlePreviewPage}
            />
          )}

          {activeTool === 'organize' && (
            <OrganizePagesTool
              files={files}
              activeFileId={activeFileId}
              onPreviewPage={handlePreviewPage}
            />
          )}

          {activeTool === 'compress' && (
            <CompressTool
              files={files}
              activeFileId={activeFileId}
            />
          )}

          {activeTool === 'pdf-to-images' && (
            <PdfToImagesTool
              files={files}
              activeFileId={activeFileId}
            />
          )}

          {activeTool === 'images-to-pdf' && (
            <ImagesToPdfTool
              files={files}
              onAddFiles={handleAddFiles}
            />
          )}

          {activeTool === 'watermark' && (
            <WatermarkTool
              files={files}
              activeFileId={activeFileId}
            />
          )}

          {activeTool === 'page-numbers' && (
            <PageNumbersTool
              files={files}
              activeFileId={activeFileId}
            />
          )}

          {activeTool === 'protect' && (
            <PasswordProtectTool
              files={files}
              activeFileId={activeFileId}
            />
          )}
        </section>
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-900 bg-slate-950 py-6 text-center text-xs text-slate-500">
        <div className="mx-auto max-w-7xl px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-300">orange PDF</span>
            <span>—</span>
            <span>Private, Offline PDF Workspace</span>
          </div>
          <div className="text-[11px] text-slate-500">
            100% Client-Side In-Memory Processing • No accounts • No cloud telemetry
          </div>
        </div>
      </footer>

      {/* Page Zoom Preview Modal */}
      <PreviewModal
        isOpen={previewState.isOpen}
        onClose={() => setPreviewState((prev) => ({ ...prev, isOpen: false }))}
        pdfBytes={previewState.bytes}
        pageNum={previewState.pageNum}
        title={previewState.title}
      />

      {/* Offline Status Toast */}
      <OfflineIndicator />
    </div>
  );
}
