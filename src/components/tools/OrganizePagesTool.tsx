/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Multi-source page organizer for orange PDF.
 * Pages are represented as source-file/page references; the original PDFs are
 * never modified. The ordered output can contain pages from several PDFs.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import JSZip from 'jszip';
import {
  Layers,
  RotateCw,
  Trash2,
  Download,
  ArrowLeft,
  ArrowRight,
  CheckSquare,
  Square,
  Split,
  Eye,
  Loader2,
  GripVertical,
  Undo2,
  Redo2,
  RotateCcw,
  FolderOpen,
  FilePlus2,
  CheckCircle2,
  AlertCircle,
  FileStack,
  X,
} from 'lucide-react';
import type { QueuedFile } from '../../types';
import { organizePagesAcrossPdfs, type OrderedPdfPage } from '../../utils/pdfOperations';
import { downloadFile, formatBytes, renderPageThumbnail } from '../../utils/pdfHelper';

interface OrganizePagesToolProps {
  files: QueuedFile[];
  activeFileId: string | null;
  onPreviewPage?: (pdfBytes: Uint8Array, pageNum: number, title?: string) => void;
}

interface PageRef {
  id: string;
  fileId: string;
  pageNumber: number;
  rotation: number;
}

interface DirectoryHandleLike {
  name: string;
  getFileHandle: (name: string, options?: { create?: boolean }) => Promise<{
    createWritable: () => Promise<{ write: (data: Blob | Uint8Array) => Promise<void>; close: () => Promise<void> }>;
  }>;
}

const SOURCE_COLORS = [
  { name: 'Orange', hex: '#fb923c' },
  { name: 'Sky', hex: '#38bdf8' },
  { name: 'Violet', hex: '#a78bfa' },
  { name: 'Emerald', hex: '#34d399' },
  { name: 'Pink', hex: '#f472b6' },
  { name: 'Amber', hex: '#fbbf24' },
  { name: 'Teal', hex: '#2dd4bf' },
  { name: 'Rose', hex: '#fb7185' },
  { name: 'Indigo', hex: '#818cf8' },
  { name: 'Lime', hex: '#a3e635' },
];

const pageKey = (fileId: string, pageNumber: number) => `${fileId}::${pageNumber}`;

function safePdfFilename(name: string) {
  const cleaned = name
    .replace(/(?:\.pdf)+$/i, '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/[. ]+$/g, '')
    .trim();
  return `${cleaned || 'organized_document'}.pdf`;
}

function makePageRefs(pdfFiles: QueuedFile[]): PageRef[] {
  return pdfFiles.flatMap((file) =>
    Array.from({ length: Math.max(0, file.pageCount ?? 0) }, (_, index) => ({
      id: pageKey(file.id, index + 1),
      fileId: file.id,
      pageNumber: index + 1,
      rotation: 0,
    }))
  );
}

function parseRanges(input: string, total: number): Array<{ label: string; start: number; end: number }> {
  const chunks = input.split(',').map((part) => part.trim()).filter(Boolean);
  if (!chunks.length) throw new Error('Enter one or more page ranges, such as 1-3, 4-7, 8.');

  return chunks.map((part) => {
    const rangeMatch = part.match(/^(\d+)\s*-\s*(\d+)$/);
    const singleMatch = part.match(/^(\d+)$/);
    const start = rangeMatch ? Number(rangeMatch[1]) : singleMatch ? Number(singleMatch[1]) : NaN;
    const end = rangeMatch ? Number(rangeMatch[2]) : start;
    if (!Number.isInteger(start) || !Number.isInteger(end)) {
      throw new Error(`"${part}" is not a valid range. Use numbers like 2 or 2-5.`);
    }
    if (start < 1 || end < 1 || start > total || end > total) {
      throw new Error(`Range "${part}" must be between page 1 and page ${total}.`);
    }
    if (end < start) throw new Error(`Range "${part}" ends before it starts.`);
    return { label: part, start, end };
  });
}

interface LazyThumbnailProps {
  file: QueuedFile;
  pageNumber: number;
  rotation: number;
}

const LazyThumbnail: React.FC<LazyThumbnailProps> = ({ file, pageNumber, rotation }) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [isNearViewport, setIsNearViewport] = useState(false);
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (!('IntersectionObserver' in window)) {
      setIsNearViewport(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setIsNearViewport(true);
          observer.disconnect();
        }
      },
      { rootMargin: '360px 0px' }
    );
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isNearViewport || thumbnail || failed) return;
    let cancelled = false;
    (async () => {
      try {
        const bytes = file.data || new Uint8Array(await file.file.arrayBuffer());
        const result = await renderPageThumbnail(bytes, pageNumber, 220);
        if (!cancelled) setThumbnail(result);
      } catch (error) {
        console.warn(`Could not render ${file.name}, page ${pageNumber}:`, error);
        if (!cancelled) setFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, [failed, file, isNearViewport, pageNumber, thumbnail]);

  return (
    <div ref={hostRef} className="relative flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-lg border border-slate-200/10 bg-slate-950">
      {thumbnail ? (
        <img
          src={thumbnail}
          alt={`${file.name}, original page ${pageNumber}`}
          loading="lazy"
          draggable={false}
          style={{ transform: `rotate(${rotation}deg)` }}
          className="max-h-full max-w-full object-contain transition-transform duration-200"
        />
      ) : failed ? (
        <div className="px-2 text-center text-[10px] leading-relaxed text-slate-500">Preview unavailable<br />Page {pageNumber}</div>
      ) : (
        <div className="flex flex-col items-center gap-1.5 text-[10px] text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>{isNearViewport ? 'Rendering…' : `Page ${pageNumber}`}</span>
        </div>
      )}
    </div>
  );
};

export const OrganizePagesTool: React.FC<OrganizePagesToolProps> = ({
  files,
  activeFileId,
  onPreviewPage,
}) => {
  const pdfFiles = useMemo(() => files.filter((file) => file.type === 'pdf'), [files]);
  const fileById = useMemo(() => new Map<string, QueuedFile>(pdfFiles.map((file) => [file.id, file] as const)), [pdfFiles]);
  const [pageOrder, setPageOrder] = useState<PageRef[]>([]);
  const pageOrderRef = useRef<PageRef[]>([]);
  const knownPdfIdsRef = useRef<Set<string>>(new Set());
  const [selectedPages, setSelectedPages] = useState<Set<string>>(new Set());
  const [undoStack, setUndoStack] = useState<PageRef[][]>([]);
  const [redoStack, setRedoStack] = useState<PageRef[][]>([]);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const touchDragIdRef = useRef<string | null>(null);
  const [touchDragId, setTouchDragId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [splitRanges, setSplitRanges] = useState('');
  const [outputName, setOutputName] = useState('');
  const [directoryHandle, setDirectoryHandle] = useState<DirectoryHandleLike | null>(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => { pageOrderRef.current = pageOrder; }, [pageOrder]);

  // Reconcile files when users add/remove PDFs in the main queue. Existing page
  // positions are preserved; pages from newly added PDFs are appended at the end.
  useEffect(() => {
    const currentIds = new Set(pdfFiles.map((file) => file.id));
    const firstLoad = knownPdfIdsRef.current.size === 0;
    const newlyAdded = pdfFiles.filter((file) => firstLoad || !knownPdfIdsRef.current.has(file.id));
    const validFiles = new Map(pdfFiles.map((file) => [file.id, file]));

    setPageOrder((previous) => {
      const retained = previous.filter((page) => {
        const source = validFiles.get(page.fileId);
        return source && page.pageNumber >= 1 && page.pageNumber <= (source.pageCount ?? 0);
      });
      const present = new Set(retained.map((page) => page.id));
      const appended = makePageRefs(newlyAdded).filter((page) => !present.has(page.id));
      return [...retained, ...appended];
    });
    knownPdfIdsRef.current = currentIds;
    setSelectedPages(new Set());
    setUndoStack([]);
    setRedoStack([]);
    setStatusMessage('');
    setErrorMessage('');
  }, [pdfFiles]);

  // Selected IDs are kept in sync after deletions, resets, and removed source PDFs.
  useEffect(() => {
    const visibleIds = new Set(pageOrder.map((page) => page.id));
    setSelectedPages((previous) => new Set([...previous].filter((id) => visibleIds.has(id))));
  }, [pageOrder]);

  const getBytes = useCallback(async (file: QueuedFile) => {
    if (file.data) return file.data;
    return new Uint8Array(await file.file.arrayBuffer());
  }, []);

  const recordPageChange = useCallback((next: PageRef[]) => {
    const current = pageOrderRef.current;
    setUndoStack((previous) => [...previous.slice(-49), current.map((page) => ({ ...page }))]);
    setRedoStack([]);
    setPageOrder(next);
    pageOrderRef.current = next;
    setStatusMessage('');
    setErrorMessage('');
  }, []);

  const reorderPages = useCallback((fromId: string, toId: string) => {
    if (!fromId || !toId || fromId === toId) return;
    const current = pageOrderRef.current;
    const from = current.findIndex((page) => page.id === fromId);
    const to = current.findIndex((page) => page.id === toId);
    if (from < 0 || to < 0) return;
    const next = [...current];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    recordPageChange(next);
  }, [recordPageChange]);

  // Pointer-based dragging adds a touch-friendly path for installed mobile PWAs;
  // desktop mouse dragging uses the native drag-and-drop events below.
  useEffect(() => {
    if (!touchDragId) return;
    const onPointerMove = (event: PointerEvent) => {
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-page-id]');
      const nextId = target?.dataset.pageId ?? null;
      setDragOverId((current) => current === nextId ? current : nextId);
    };
    const onPointerUp = (event: PointerEvent) => {
      const sourceId = touchDragIdRef.current;
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-page-id]')?.dataset.pageId;
      if (sourceId && target) reorderPages(sourceId, target);
      touchDragIdRef.current = null;
      setTouchDragId(null);
      setDraggingId(null);
      setDragOverId(null);
    };
    const onPointerCancel = () => {
      touchDragIdRef.current = null;
      setTouchDragId(null);
      setDraggingId(null);
      setDragOverId(null);
    };
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerup', onPointerUp, { passive: true });
    window.addEventListener('pointercancel', onPointerCancel, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
    };
  }, [reorderPages, touchDragId]);

  const rotateSelected = (all = false) => {
    const ids = all ? new Set(pageOrder.map((page) => page.id)) : selectedPages;
    if (!ids.size) return;
    recordPageChange(pageOrder.map((page) => ids.has(page.id) ? { ...page, rotation: (page.rotation + 90) % 360 } : page));
  };

  const undo = () => {
    if (!undoStack.length) return;
    const previous = undoStack[undoStack.length - 1];
    setRedoStack((stack) => [...stack, pageOrder.map((page) => ({ ...page }))]);
    setUndoStack((stack) => stack.slice(0, -1));
    setPageOrder(previous);
    pageOrderRef.current = previous;
    setStatusMessage('');
  };

  const redo = () => {
    if (!redoStack.length) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack((stack) => [...stack, pageOrder.map((page) => ({ ...page }))]);
    setRedoStack((stack) => stack.slice(0, -1));
    setPageOrder(next);
    pageOrderRef.current = next;
    setStatusMessage('');
  };

  const resetOrder = () => {
    const initial = makePageRefs(pdfFiles);
    recordPageChange(initial);
    setSelectedPages(new Set());
  };

  const deleteSelected = () => {
    if (!selectedPages.size) return;
    recordPageChange(pageOrder.filter((page) => !selectedPages.has(page.id)));
    setSelectedPages(new Set());
  };

  const toggleSelected = (id: string) => {
    setSelectedPages((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedPages(selectedPages.size === pageOrder.length ? new Set() : new Set(pageOrder.map((page) => page.id)));
  };

  const getSourcePayload = useCallback(async (pages: PageRef[]) => {
    const usedIds = new Set(pages.map((page) => page.fileId));
    const sources: Array<{ id: string; bytes: Uint8Array }> = [];
    for (const file of pdfFiles) {
      if (usedIds.has(file.id)) sources.push({ id: file.id, bytes: await getBytes(file) });
    }
    return sources;
  }, [getBytes, pdfFiles]);

  const saveBlob = useCallback(async (filename: string, blob: Blob) => {
    if (directoryHandle) {
      try {
        let alreadyExists = false;
        try {
          await directoryHandle.getFileHandle(filename);
          alreadyExists = true;
        } catch (lookupError) {
          if (!(lookupError instanceof DOMException && lookupError.name === 'NotFoundError')) throw lookupError;
        }
        if (alreadyExists && !window.confirm(`“${filename}” already exists in “${directoryHandle.name}”. Replace it?`)) {
          setStatusMessage(`Save cancelled. The existing ${filename} was left unchanged.`);
          return;
        }
        const fileHandle = await directoryHandle.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        setStatusMessage(`Saved ${filename} to “${directoryHandle.name}”.`);
        return;
      } catch (error) {
        console.warn('Folder save failed; falling back to browser download.', error);
        downloadFile(blob, filename, blob.type || 'application/octet-stream');
        setStatusMessage(`Folder save failed, so ${filename} was downloaded instead.`);
        return;
      }
    }
    downloadFile(blob, filename, blob.type || 'application/octet-stream');
    setStatusMessage(`Downloaded ${filename}.`);
  }, [directoryHandle]);

  const chooseOutputFolder = async () => {
    setErrorMessage('');
    setStatusMessage('');
    const windowWithPicker = window as any;
    if (typeof windowWithPicker.showDirectoryPicker !== 'function') {
      setErrorMessage('Folder selection is not supported in this browser. Use Chrome or Edge on HTTPS, or download the PDF/ZIP instead.');
      return;
    }
    try {
      const handle = await windowWithPicker.showDirectoryPicker({ mode: 'readwrite' });
      setDirectoryHandle(handle);
      setStatusMessage(`Output folder set to “${handle.name}”.`);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setErrorMessage(error instanceof Error ? error.message : 'Could not select this folder.');
    }
  };

  const createOutputPdf = async (pages: PageRef[]) => {
    if (!pages.length) throw new Error('There are no pages to export. Add or restore pages first.');
    const sources = await getSourcePayload(pages);
    const ordered: OrderedPdfPage[] = pages.map((page) => ({
      fileId: page.fileId,
      pageNumber: page.pageNumber,
      rotation: page.rotation,
    }));
    return organizePagesAcrossPdfs(sources, ordered);
  };

  const handleSaveOrganized = async () => {
    if (!pageOrder.length || isProcessing) return;
    setIsProcessing(true);
    setErrorMessage('');
    setStatusMessage('Preparing your organized PDF…');
    try {
      const bytes = await createOutputPdf(pageOrder);
      const defaultName = pdfFiles.length === 1
        ? `${pdfFiles[0].name.replace(/\.pdf$/i, '')}_organized.pdf`
        : 'organized_merged.pdf';
      const filename = safePdfFilename(outputName.trim() || defaultName);
      await saveBlob(filename, new Blob([new Uint8Array(bytes).buffer as ArrayBuffer], { type: 'application/pdf' }));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not export the organized PDF.');
      setStatusMessage('');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExtractSelected = async () => {
    if (!selectedPages.size || isProcessing) return;
    const pages = pageOrder.filter((page) => selectedPages.has(page.id));
    setIsProcessing(true);
    setErrorMessage('');
    setStatusMessage('Extracting selected pages…');
    try {
      const bytes = await createOutputPdf(pages);
      const name = safePdfFilename(`selected_${pages.length}_pages.pdf`);
      await saveBlob(name, new Blob([new Uint8Array(bytes).buffer as ArrayBuffer], { type: 'application/pdf' }));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not extract the selected pages.');
      setStatusMessage('');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSplitByRanges = async () => {
    if (!splitRanges.trim() || isProcessing) return;
    setIsProcessing(true);
    setErrorMessage('');
    setStatusMessage('Preparing split PDFs…');
    try {
      const ranges = parseRanges(splitRanges, pageOrder.length);
      const zip = new JSZip();
      const usedNames = new Set<string>();
      for (let index = 0; index < ranges.length; index++) {
        const range = ranges[index];
        const pages = pageOrder.slice(range.start - 1, range.end);
        const bytes = await createOutputPdf(pages);
        const filename = `part_${String(index + 1).padStart(2, '0')}_pages_${range.label.replace(/\s+/g, '')}.pdf`;
        if (usedNames.has(filename.toLowerCase())) throw new Error(`Duplicate output filename for range ${range.label}.`);
        usedNames.add(filename.toLowerCase());
        zip.file(filename, bytes);
      }
      const archive = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 4 } });
      await saveBlob('organized_split_files.zip', archive);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not split the organized pages.');
      setStatusMessage('');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleMoveByButton = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= pageOrder.length) return;
    reorderPages(pageOrder[index].id, pageOrder[targetIndex].id);
  };

  // Assign distinct colors in current file-queue order so simultaneously loaded PDFs are easy to tell apart.
  const pageColors = useMemo(() => {
    const colors = new Map<string, (typeof SOURCE_COLORS)[number]>();
    pdfFiles.forEach((file, index) => colors.set(file.id, SOURCE_COLORS[index % SOURCE_COLORS.length]));
    return colors;
  }, [pdfFiles]);
  const totalSourcePages = pdfFiles.reduce((sum, file) => sum + (file.pageCount ?? 0), 0);
  const activeSource = pdfFiles.find((file) => file.id === activeFileId);

  if (!pdfFiles.length) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-8 text-center">
        <Layers className="mx-auto mb-2 h-8 w-8 text-slate-500" />
        <h4 className="text-sm font-semibold text-slate-200">No PDF Loaded</h4>
        <p className="mt-1 text-xs text-slate-400">Upload one or more PDFs above, then drag pages into any order. Pages from different PDFs can be mixed together.</p>
      </div>
    );
  }

  const defaultOutputName = pdfFiles.length === 1
    ? `${pdfFiles[0].name.replace(/\.pdf$/i, '')}_organized.pdf`
    : 'organized_merged.pdf';
  const allSelected = pageOrder.length > 0 && selectedPages.size === pageOrder.length;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/10 text-orange-400">
                <FileStack className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-white">Organize pages</h2>
                <p className="text-xs text-slate-400">Drag any page to reorder it, including pages from different PDFs.</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
              <span className="rounded-full border border-slate-700 bg-slate-950/70 px-2.5 py-1">{pageOrder.length} pages in output</span>
              <span className="rounded-full border border-slate-700 bg-slate-950/70 px-2.5 py-1">{totalSourcePages} original pages</span>
              <span className="rounded-full border border-slate-700 bg-slate-950/70 px-2.5 py-1">{pdfFiles.length} source {pdfFiles.length === 1 ? 'PDF' : 'PDFs'}</span>
              <span className="rounded-full border border-slate-700 bg-slate-950/70 px-2.5 py-1">{formatBytes(pdfFiles.reduce((sum, file) => sum + file.size, 0))} loaded</span>
              {activeSource && <span className="text-slate-500">Active queue item: {activeSource.name}</span>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={undo} disabled={!undoStack.length || isProcessing} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-medium text-slate-300 transition hover:bg-slate-700 disabled:opacity-40" title="Undo last page change">
              <Undo2 className="h-3.5 w-3.5" /> Undo
            </button>
            <button onClick={redo} disabled={!redoStack.length || isProcessing} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-medium text-slate-300 transition hover:bg-slate-700 disabled:opacity-40" title="Redo page change">
              <Redo2 className="h-3.5 w-3.5" /> Redo
            </button>
            <button onClick={resetOrder} disabled={isProcessing} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-medium text-slate-300 transition hover:bg-slate-700 disabled:opacity-40" title="Restore all pages in original source-file order">
              <RotateCcw className="h-3.5 w-3.5" /> Reset
            </button>
            <button onClick={chooseOutputFolder} disabled={isProcessing} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-medium text-slate-300 transition hover:bg-slate-700 disabled:opacity-40" title="Choose a folder for output files">
              <FolderOpen className="h-3.5 w-3.5 text-orange-400" /> {directoryHandle ? `Folder: ${directoryHandle.name}` : 'Choose save folder'}
            </button>
            {directoryHandle && <button onClick={() => { setDirectoryHandle(null); setStatusMessage('Output will use browser downloads.'); }} className="rounded-lg border border-slate-700 bg-slate-800 p-2 text-slate-400 transition hover:text-white" title="Use browser downloads instead" aria-label="Clear selected output folder"><X className="h-3.5 w-3.5" /></button>}
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/70 p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Source PDF color key</div>
            <div className="text-[11px] text-slate-500">The colored left edge identifies the original PDF for every page.</div>
          </div>
          <div className="flex flex-wrap gap-2">
            {pdfFiles.map((file) => {
              const color = pageColors.get(file.id)!;
              const included = pageOrder.filter((page) => page.fileId === file.id).length;
              return (
                <div key={file.id} className="flex max-w-full min-w-0 items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1.5" title={file.name}>
                  <span className="h-4 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color.hex }} />
                  <span className="max-w-[220px] truncate text-xs text-slate-200">{file.name}</span>
                  <span className="shrink-0 text-[10px] text-slate-500">{included}/{file.pageCount ?? 0}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 border-t border-slate-800 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={selectAll} disabled={!pageOrder.length || isProcessing} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-medium text-slate-300 transition hover:bg-slate-700 disabled:opacity-40">
              {allSelected ? <CheckSquare className="h-3.5 w-3.5 text-orange-400" /> : <Square className="h-3.5 w-3.5" />}
              {allSelected ? 'Deselect all' : 'Select all'}
            </button>
            <button onClick={() => rotateSelected(false)} disabled={!selectedPages.size || isProcessing} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-medium text-slate-300 transition hover:bg-slate-700 disabled:opacity-40">
              <RotateCw className="h-3.5 w-3.5 text-orange-400" /> Rotate selected
            </button>
            <button onClick={() => rotateSelected(true)} disabled={!pageOrder.length || isProcessing} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-medium text-slate-300 transition hover:bg-slate-700 disabled:opacity-40">
              <RotateCw className="h-3.5 w-3.5 text-orange-400" /> Rotate all
            </button>
            <button onClick={deleteSelected} disabled={!selectedPages.size || isProcessing} className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-300 transition hover:bg-red-500/20 disabled:opacity-40">
              <Trash2 className="h-3.5 w-3.5" /> Remove selected ({selectedPages.size})
            </button>
            <button onClick={handleExtractSelected} disabled={!selectedPages.size || isProcessing} className="inline-flex items-center gap-1.5 rounded-lg border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-xs font-medium text-orange-300 transition hover:bg-orange-500/20 disabled:opacity-40">
              {isProcessing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Split className="h-3.5 w-3.5" />} Extract selected ({selectedPages.size})
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <label className="block min-w-0">
              <span className="mb-1.5 block text-xs font-medium text-slate-300">Output filename</span>
              <input type="text" value={outputName} onChange={(event) => setOutputName(event.target.value)} placeholder={defaultOutputName} disabled={isProcessing} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 disabled:opacity-50" />
            </label>
            <button onClick={handleSaveOrganized} disabled={isProcessing || !pageOrder.length} className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-500 active:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-40">
              {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Save organized PDF
            </button>
          </div>

          <div className="flex flex-col gap-2 border-t border-slate-800 pt-3 sm:flex-row sm:items-center">
            <label className="flex min-w-0 flex-1 items-center gap-2 text-xs text-slate-400">
              <span className="shrink-0">Split final order into ranges</span>
              <input type="text" value={splitRanges} onChange={(event) => setSplitRanges(event.target.value)} placeholder="e.g. 1-3, 4-7, 8" disabled={isProcessing} className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-2 text-xs text-white outline-none focus:border-orange-500 disabled:opacity-50" />
            </label>
            <button onClick={handleSplitByRanges} disabled={!splitRanges.trim() || !pageOrder.length || isProcessing} className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-medium text-slate-200 transition hover:bg-slate-700 disabled:opacity-40">
              <FilePlus2 className="h-3.5 w-3.5" /> Create ZIP of parts
            </button>
          </div>
          <div className="text-[11px] text-slate-500">Range numbers refer to the current output order, not the original source page numbers. The original PDFs are never modified.</div>
        </div>
      </div>

      {statusMessage && <div role="status" className="flex items-start gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3.5 py-3 text-xs text-emerald-300"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /><span>{statusMessage}</span></div>}
      {errorMessage && <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/10 px-3.5 py-3 text-xs text-red-300"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{errorMessage}</span></div>}

      {pdfFiles.some((file) => !file.pageCount) && <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-3.5 py-3 text-xs text-amber-200">At least one PDF could not be inspected and has no page thumbnails. Try re-importing that PDF or check whether it is password-protected or damaged.</div>}

      {pageOrder.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/30 p-10 text-center">
          <Layers className="mx-auto mb-3 h-8 w-8 text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-200">No pages in the output</h3>
          <p className="mt-1 text-xs text-slate-400">Reset the order to restore source pages, or add another PDF above.</p>
          <button onClick={resetOrder} className="mt-4 rounded-lg bg-orange-600 px-3 py-2 text-xs font-semibold text-white hover:bg-orange-500">Restore all source pages</button>
        </div>
      ) : (
        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-200">Output sequence</h3>
              <p className="mt-0.5 text-xs text-slate-500">Drag with the grip on desktop or touch devices. Use arrows for precise moves. Tap a card to select it.</p>
            </div>
            <span className="text-xs text-slate-500">{selectedPages.size} selected · {pageOrder.length} pages</span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
            {pageOrder.map((page, index) => {
              const file = fileById.get(page.fileId);
              if (!file) return null;
              const color = pageColors.get(page.fileId) ?? SOURCE_COLORS[0];
              const isSelected = selectedPages.has(page.id);
              const isDragging = draggingId === page.id;
              const isDragOver = dragOverId === page.id && draggingId !== page.id;
              return (
                <article
                  key={page.id}
                  data-page-id={page.id}
                  onClick={() => toggleSelected(page.id)}
                  onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDragOverId(page.id); }}
                  onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragOverId((id) => id === page.id ? null : id); }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const fromId = event.dataTransfer.getData('text/plain') || draggingId;
                    if (fromId) reorderPages(fromId, page.id);
                    setDraggingId(null);
                    setDragOverId(null);
                  }}
                  style={{ borderLeftColor: color.hex, borderLeftWidth: 5 }}
                  className={`group relative min-w-0 overflow-hidden rounded-xl border border-slate-800 bg-slate-900/80 p-2.5 shadow-sm transition-all ${isSelected ? 'ring-2 ring-orange-500/70 bg-orange-500/[0.07]' : 'hover:border-slate-700'} ${isDragging ? 'scale-[0.98] opacity-45' : ''} ${isDragOver ? 'ring-2 ring-sky-400/80 -translate-y-0.5' : ''}`}
                >
                  <div className="mb-2 flex items-center justify-between gap-1.5">
                    <span className="rounded-md bg-slate-800 px-2 py-1 text-[11px] font-bold tabular-nums text-white">#{index + 1}</span>
                    <div className="flex min-w-0 items-center gap-1">
                      <span className="max-w-[70px] truncate rounded-md px-1.5 py-1 text-[9px] font-semibold" style={{ color: color.hex, backgroundColor: `${color.hex}18` }} title={file.name}>{file.name.replace(/\.pdf$/i, '')}</span>
                      <button
                        type="button"
                        draggable
                        onClick={(event) => event.stopPropagation()}
                        onDragStart={(event) => {
                          event.dataTransfer.effectAllowed = 'move';
                          event.dataTransfer.setData('text/plain', page.id);
                          setDraggingId(page.id);
                          setDragOverId(null);
                        }}
                        onDragEnd={() => { setDraggingId(null); setDragOverId(null); }}
                        onPointerDown={(event) => {
                          if (event.pointerType === 'mouse') return;
                          event.preventDefault();
                          touchDragIdRef.current = page.id;
                          setTouchDragId(page.id);
                          setDraggingId(page.id);
                        }}
                        className="shrink-0 touch-none rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-white active:text-orange-300"
                        title="Drag to move this page"
                        aria-label={`Drag page ${index + 1} to reorder`}
                      ><GripVertical className="h-4 w-4" /></button>
                    </div>
                  </div>

                  <LazyThumbnail file={file} pageNumber={page.pageNumber} rotation={page.rotation} />

                  <div className="mt-2 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-200">Original page {page.pageNumber}</div>
                      <div className="mt-0.5 truncate text-[10px] text-slate-500" title={file.name}>{file.name}</div>
                      {page.rotation !== 0 && <div className="mt-1 text-[10px] text-orange-300">Rotated {page.rotation}°</div>}
                    </div>
                    <button onClick={(event) => { event.stopPropagation(); getBytes(file).then((bytes) => onPreviewPage?.(bytes, page.pageNumber, file.name)).catch((error) => setErrorMessage(error instanceof Error ? error.message : 'Could not open this page preview.')); }} className="shrink-0 rounded-lg border border-slate-700 bg-slate-800 p-1.5 text-slate-400 transition hover:text-orange-300" title="Preview full page" aria-label={`Preview ${file.name}, page ${page.pageNumber}`}>
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="mt-2 flex items-center justify-between border-t border-slate-800 pt-1.5" onClick={(event) => event.stopPropagation()}>
                    <button type="button" disabled={index === 0 || isProcessing} onClick={() => handleMoveByButton(index, -1)} className="rounded-md p-1.5 text-slate-500 transition hover:bg-slate-800 hover:text-slate-100 disabled:opacity-20" title="Move one position left/up" aria-label={`Move page ${index + 1} earlier`}><ArrowLeft className="h-3.5 w-3.5" /></button>
                    <button type="button" disabled={isProcessing} onClick={() => recordPageChange(pageOrder.filter((item) => item.id !== page.id))} className="rounded-md p-1.5 text-slate-500 transition hover:bg-red-500/10 hover:text-red-300 disabled:opacity-30" title="Remove page from output" aria-label={`Remove page ${index + 1}`}><Trash2 className="h-3.5 w-3.5" /></button>
                    <button type="button" disabled={index === pageOrder.length - 1 || isProcessing} onClick={() => handleMoveByButton(index, 1)} className="rounded-md p-1.5 text-slate-500 transition hover:bg-slate-800 hover:text-slate-100 disabled:opacity-20" title="Move one position right/down" aria-label={`Move page ${index + 1} later`}><ArrowRight className="h-3.5 w-3.5" /></button>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex items-start gap-2 rounded-xl border border-slate-800 bg-slate-900/40 p-3 text-[11px] leading-relaxed text-slate-500">
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
        <p>Processing happens locally in your browser. Large or complex PDFs can require substantial memory. For very large files, organize in smaller batches. Encrypted or damaged PDFs may need to be unlocked or repaired before editing.</p>
      </div>
    </div>
  );
};
