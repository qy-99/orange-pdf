/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import {
  Scissors,
  FileSpreadsheet,
  FileText,
  Clipboard,
  FolderDown,
  Download,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  Search,
  Eye,
  Edit2,
  Loader2,
  ScanText,
  ChevronDown,
  ChevronUp,
  FileCheck,
  ArrowRight,
  Sliders,
} from 'lucide-react';
import type { QueuedFile, DrawingRow } from '../../types';
import {
  DEFAULT_PATTERN,
  PATTERN_PRESETS,
  isReservedFilename,
  cleanOutputFilename,
  createManualRowsForPageCount,
  buildFilename,
  evaluateRows,
  validateRowsForExport,
  parseDelimitedText,
  formatListNo,
  sanitizeFilename,
  generateManifestCsv,
} from '../../utils/splitRename';
import { splitSinglePage } from '../../utils/pdfOperations';
import { downloadFile, extractPdfPageTexts, renderPageThumbnail, renderPageToCanvas } from '../../utils/pdfHelper';

interface SplitRenameToolProps {
  files: QueuedFile[];
  activeFileId: string | null;
  onPreviewPdfPage?: (fileBytes: Uint8Array, pageNum: number, title?: string) => void;
}

export const SplitRenameTool: React.FC<SplitRenameToolProps> = ({
  files,
  activeFileId,
  onPreviewPdfPage,
}) => {
  // Input PDF selection
  const pdfFiles = useMemo(() => files.filter((f) => f.type === 'pdf'), [files]);
  const [selectedPdfId, setSelectedPdfId] = useState<string>(activeFileId || pdfFiles[0]?.id || '');

  useEffect(() => {
    if (!selectedPdfId && pdfFiles.length > 0) {
      setSelectedPdfId(pdfFiles[0].id);
    }
  }, [pdfFiles, selectedPdfId]);

  const selectedPdf = useMemo(
    () => pdfFiles.find((f) => f.id === selectedPdfId),
    [pdfFiles, selectedPdfId]
  );

  const totalPdfPages = selectedPdf?.pageCount || 0;

  // Mode: default is 'manual' per requirements
  const [mode, setMode] = useState<'manual' | 'drawing-list'>('manual');

  // Drawing rows state
  const [rows, setRows] = useState<DrawingRow[]>([]);
  const [pattern, setPattern] = useState<string>(DEFAULT_PATTERN);
  const [startPageOffset, setStartPageOffset] = useState<number>(1);

  // Optional drawing-list panel visibility
  const [showImportPanel, setShowImportPanel] = useState<boolean>(false);
  const [activeImportTab, setActiveImportTab] = useState<'upload' | 'paste' | 'pdf-extract' | 'ocr'>('upload');
  const [pastedText, setPastedText] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Processing state
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progress, setProgress] = useState<{ current: number; total: number; status: string }>({
    current: 0,
    total: 0,
    status: '',
  });
  const [ocrLoading, setOcrLoading] = useState<boolean>(false);
  const [thumbnailCache, setThumbnailCache] = useState<Record<number, string>>({});

  // Input refs to auto-focus missing fields on export error
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Track the ID and page count of the PDF for which rows were generated in manual mode
  const lastGeneratedKeyRef = useRef<string>('');

  // Automatically generate one row per page when in manual mode
  useEffect(() => {
    if (mode === 'manual' && selectedPdfId && totalPdfPages > 0) {
      const key = `${selectedPdfId}:${totalPdfPages}`;
      if (lastGeneratedKeyRef.current !== key) {
        lastGeneratedKeyRef.current = key;
        setRows(createManualRowsForPageCount(totalPdfPages));
      }
    }
  }, [mode, selectedPdfId, totalPdfPages]);

  // Evaluate rows live against pattern and PDF page count
  const { rows: evaluatedRows, counters } = useMemo(() => {
    return evaluateRows(rows, pattern, totalPdfPages, mode);
  }, [rows, pattern, totalPdfPages, mode]);

  // Handle switching back to manual filenames
  const handleSwitchToManual = () => {
    if (
      rows.length > 0 &&
      !window.confirm(
        'Switch to manual filename entry? This will replace the imported drawing list with blank filename rows for each page of the current PDF.'
      )
    ) {
      return;
    }
    setMode('manual');
    lastGeneratedKeyRef.current = `${selectedPdfId}:${totalPdfPages}`;
    setRows(createManualRowsForPageCount(totalPdfPages));
    setShowImportPanel(false);
  };

  // Row update handlers
  const handleToggleRow = (id: string) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, isIncluded: !r.isIncluded } : r))
    );
  };

  const handleSelectAll = (checked: boolean) => {
    setRows((prev) => prev.map((r) => ({ ...r, isIncluded: checked })));
  };

  const handleUpdateFilename = (id: string, value: string) => {
    setRows((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              manualFilename: value,
              isManuallyEdited: true,
            }
          : r
      )
    );
  };

  const handleUpdateField = (id: string, field: keyof DrawingRow, val: any) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: val } : r))
    );
  };

  // Adjust start page offset in drawing-list mode
  const handleUpdateStartPage = (newOffset: number) => {
    setStartPageOffset(newOffset);
    setRows((prev) =>
      prev.map((r, i) => ({
        ...r,
        sourcePage: i + newOffset,
      }))
    );
  };

  // Parse Excel / CSV file
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawData = XLSX.utils.sheet_to_json<any[]>(firstSheet, { header: 1 });

      if (rawData.length === 0) {
        alert('The uploaded file contains no data rows.');
        return;
      }

      // Find header row or infer columns
      let colNo = 0;
      let colDwg = 1;
      let colRev = 2;
      let colTitle = 3;
      let startRowIdx = 0;

      const firstRow = rawData[0] || [];
      const isHeader = firstRow.some((c: any) =>
        /no\.?|drawing|number|rev|revision|title|sheet/i.test(String(c || ''))
      );

      if (isHeader) {
        startRowIdx = 1;
        firstRow.forEach((col: any, idx: number) => {
          const lower = String(col || '').toLowerCase().trim();
          if (/title|description/i.test(lower)) {
            colTitle = idx;
          } else if (/rev|revision/i.test(lower)) {
            colRev = idx;
          } else if (/^no\.?$|^item|^item\s*no|^#$|^list\s*no/i.test(lower)) {
            colNo = idx;
          } else if (/drawing|dwg|number|sheet/i.test(lower)) {
            colDwg = idx;
          }
        });
      }

      const parsed: DrawingRow[] = [];
      let rowCounter = 1;

      for (let i = startRowIdx; i < rawData.length; i++) {
        const row = rawData[i];
        if (!row || row.length === 0) continue;

        const listNo = String(row[colNo] !== undefined ? row[colNo] : rowCounter);
        const drawingNo = String(row[colDwg] || '').trim();
        const revision = String(row[colRev] || '').trim();
        const title = String(row[colTitle] || '').trim();

        if (drawingNo || listNo) {
          parsed.push({
            id: `row-${rowCounter}`,
            listNo,
            drawingNo,
            revision,
            title,
            sourcePage: rowCounter + startPageOffset - 1,
            isIncluded: true,
            isManuallyEdited: false,
            matchStatus: 'matched',
            warnings: [],
          });
          rowCounter++;
        }
      }

      if (parsed.length > 0) {
        setRows(parsed);
        setMode('drawing-list');
        setShowImportPanel(false);
      } else {
        alert('Could not detect drawing rows in the uploaded spreadsheet. Your current table remains intact.');
      }
    } catch (err: any) {
      alert(`Failed to parse file: ${err.message}. Your current table remains intact.`);
    } finally {
      e.target.value = '';
    }
  };

  // Apply pasted table text
  const handleApplyPastedText = () => {
    if (!pastedText.trim()) return;
    const parsed = parseDelimitedText(pastedText);
    if (parsed.length === 0) {
      alert('Could not detect drawing rows from the pasted text. Your current table remains intact.');
      return;
    }

    const newRows: DrawingRow[] = parsed.map((item, idx) => ({
      id: `row-${idx + 1}`,
      listNo: item.listNo,
      drawingNo: item.drawingNo,
      revision: item.revision,
      title: item.title,
      sourcePage: idx + startPageOffset,
      isIncluded: true,
      isManuallyEdited: false,
      matchStatus: 'matched',
      warnings: [],
    }));

    setRows(newRows);
    setMode('drawing-list');
    setShowImportPanel(false);
  };

  // Extract from selectable PDF text
  const handleExtractFromPdf = async () => {
    if (!selectedPdf) {
      alert('Please select a PDF document first.');
      return;
    }
    setIsProcessing(true);
    try {
      const fileBytes = selectedPdf.data || new Uint8Array(await selectedPdf.file.arrayBuffer());
      const pageTexts = await extractPdfPageTexts(fileBytes);

      const parsed: DrawingRow[] = [];
      let rowIdx = 1;

      pageTexts.forEach((text, pageNum) => {
        const lines = text.split('\n');
        lines.forEach((line) => {
          const match = line.match(/([A-Z0-9\-_]{5,35})\s+([A-Z0-9]{1,3})/);
          if (match) {
            parsed.push({
              id: `row-${rowIdx++}`,
              listNo: String(rowIdx),
              drawingNo: match[1],
              revision: match[2],
              title: line.replace(match[0], '').trim(),
              sourcePage: pageNum + 1,
              isIncluded: true,
              isManuallyEdited: false,
              matchStatus: 'matched',
              warnings: [],
            });
          }
        });
      });

      if (parsed.length > 0) {
        setRows(parsed);
        setMode('drawing-list');
        setShowImportPanel(false);
      } else {
        alert(
          'No tabular drawing numbers detected in selectable PDF text. You can use the Paste Table or Upload Excel tab, or enter filenames directly.'
        );
      }
    } catch (err: any) {
      alert(`Notice while scanning PDF text: ${err.message}. Your current table remains intact.`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Local OCR via Tesseract.js
  const handleRunOcr = async () => {
    if (!selectedPdf) {
      alert('Please select a PDF first.');
      return;
    }
    setOcrLoading(true);
    try {
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker('eng');

      const fileBytes = selectedPdf.data || new Uint8Array(await selectedPdf.file.arrayBuffer());
      const canvas = await renderPageToCanvas(fileBytes, 1, 1.5);

      const ret = await worker.recognize(canvas);
      await worker.terminate();

      if (ret.data.text) {
        const parsed = parseDelimitedText(ret.data.text);
        if (parsed.length > 0) {
          const newRows: DrawingRow[] = parsed.map((item, idx) => ({
            id: `row-${idx + 1}`,
            listNo: item.listNo,
            drawingNo: item.drawingNo,
            revision: item.revision,
            title: item.title,
            sourcePage: idx + startPageOffset,
            isIncluded: true,
            isManuallyEdited: false,
            matchStatus: 'matched',
            warnings: ['Parsed via client-side OCR; please review fields carefully'],
          }));
          setRows(newRows);
          setMode('drawing-list');
          setShowImportPanel(false);
        } else {
          setPastedText(ret.data.text);
          setActiveImportTab('paste');
          alert('OCR recognized text from Page 1! Review and edit the recognized table lines below.');
        }
      }
    } catch (err: any) {
      alert(`Client-side OCR notice: ${err.message}. Your current table remains intact.`);
    } finally {
      setOcrLoading(false);
    }
  };

  // Optional: Load sample package demo
  const handleLoadSample = () => {
    const sampleItems = [
      { listNo: '01', drawingNo: 'CR115-SKSPL-CR10-B2-S-STR-DR-ZZZ-8720', revision: 'A', title: 'CONCOURSE B2 LEVEL PERMANENT STRUCTURE DRAWING LIST ENTRANCE 1' },
      { listNo: '02', drawingNo: 'CR115-SKSPL-CR10-B2-S-STR-DR-LPL-8721', revision: 'A', title: 'CONCOURSE B2 SLAB LEVEL TOP REINFORCEMENT T1 LAYOUT PLAN ENTRANCE 1 SHEET 1' },
      { listNo: '03', drawingNo: 'CR115-SKSPL-CR10-B2-S-STR-DR-LPL-8722', revision: 'A', title: 'CONCOURSE B2 SLAB LEVEL TOP REINFORCEMENT T1 LAYOUT PLAN ENTRANCE 1 SHEET 2' },
      { listNo: '04', drawingNo: 'CR115-SKSPL-CR10-B2-S-STR-DR-LPL-8723', revision: 'A', title: 'CONCOURSE B2 SLAB LEVEL TOP REINFORCEMENT T2 LAYOUT PLAN ENTRANCE 1 SHEET 1' },
      { listNo: '05', drawingNo: 'CR115-SKSPL-CR10-B2-S-STR-DR-LPL-8724', revision: 'A', title: 'CONCOURSE B2 SLAB LEVEL TOP REINFORCEMENT T2 LAYOUT PLAN ENTRANCE 1 SHEET 2' },
      { listNo: '06', drawingNo: 'CR115-SKSPL-CR10-B2-S-STR-DR-LPL-8725', revision: 'A', title: 'CONCOURSE B2 SLAB LEVEL TOP REINFORCEMENT T3 LAYOUT PLAN ENTRANCE 1 SHEET 1' },
      { listNo: '07', drawingNo: 'CR115-SKSPL-CR10-B2-S-STR-DR-LPL-8726', revision: 'A', title: 'CONCOURSE B2 SLAB LEVEL TOP REINFORCEMENT T3 LAYOUT PLAN ENTRANCE 1 SHEET 2' },
      { listNo: '08', drawingNo: 'CR115-SKSPL-CR10-B2-S-STR-DR-LPL-8727', revision: 'A', title: 'CONCOURSE B2 SLAB LEVEL TOP REINFORCEMENT T4 & T6 LAYOUT PLAN ENTRANCE 1 SHEET 1' },
      { listNo: '09', drawingNo: 'CR115-SKSPL-CR10-B2-S-STR-DR-LPL-8728', revision: 'A', title: 'CONCOURSE B2 SLAB LEVEL BOTTOM REINFORCEMENT B1 LAYOUT PLAN ENTRANCE 1 SHEET 1' },
      { listNo: '10', drawingNo: 'CR115-SKSPL-CR10-B2-S-STR-DR-LPL-8729', revision: 'A', title: 'CONCOURSE B2 SLAB LEVEL BOTTOM REINFORCEMENT B1 LAYOUT PLAN ENTRANCE 1 SHEET 2' },
      { listNo: '11', drawingNo: 'CR115-SKSPL-CR10-B2-S-STR-DR-LPL-8730', revision: 'A', title: 'CONCOURSE B2 SLAB LEVEL BOTTOM REINFORCEMENT B2 LAYOUT PLAN ENTRANCE 1 SHEET 1' },
      { listNo: '12', drawingNo: 'CR115-SKSPL-CR10-B2-S-STR-DR-LPL-8731', revision: 'A', title: 'CONCOURSE B2 SLAB LEVEL BOTTOM REINFORCEMENT B2 LAYOUT PLAN ENTRANCE 1 SHEET 2' },
      { listNo: '13', drawingNo: 'CR115-SKSPL-CR10-B2-S-STR-DR-LPL-8732', revision: 'A', title: 'CONCOURSE B2 SLAB LEVEL BOTTOM REINFORCEMENT B3 LAYOUT PLAN ENTRANCE 1 SHEET 1' },
      { listNo: '14', drawingNo: 'CR115-SKSPL-CR10-B2-S-STR-DR-LPL-8733', revision: 'A', title: 'CONCOURSE B2 SLAB LEVEL BOTTOM REINFORCEMENT B3 LAYOUT PLAN ENTRANCE 1 SHEET 2' },
      { listNo: '15', drawingNo: 'CR115-SKSPL-CR10-B2-S-STR-DR-LPL-8734', revision: 'A', title: 'CONCOURSE B2 SLAB LEVEL BOTTOM REINFORCEMENT B4 LAYOUT PLAN ENTRANCE 1' },
      { listNo: '16', drawingNo: 'CR115-SKSPL-CR10-B2-S-STR-DR-LPL-8735', revision: 'A', title: 'CONCOURSE B2 SLAB LEVEL SHEAR REINFORCEMENT LAYOUT PLAN ENTRANCE 1' },
      { listNo: '17', drawingNo: 'CR115-SKSPL-CR10-B2-S-STR-DR-LPL-8736', revision: 'A', title: 'CONCOURSE B2 SLAB LEVEL STARTER BAR LAYOUT PLAN ENTRANCE 1 SHEET 1' },
      { listNo: '18', drawingNo: 'CR115-SKSPL-CR10-B2-S-STR-DR-LPL-8737', revision: 'A', title: 'CONCOURSE B2 SLAB LEVEL STARTER BAR LAYOUT PLAN ENTRANCE 1 SHEET 2' },
      { listNo: '19', drawingNo: 'CR115-SKSPL-CR10-B2-S-STR-DR-SEC-8738', revision: 'A', title: 'CONCOURSE B2 SLAB LEVEL SECTIONS ENTRANCE 1' },
      { listNo: '20', drawingNo: 'CR115-SKSPL-CR10-B2-S-STR-DR-SEC-8739', revision: 'A', title: 'CONCOURSE B2 SLAB LEVEL SECTION 5 & CD DOOR DETAILS ENTRANCE 1' },
      { listNo: '21', drawingNo: 'CR115-SKSPL-CR10-B2-S-STR-STD-8462', revision: 'D', title: 'STATION STRUCTURE KINGPOST TYPICAL DETAILS' },
    ];

    const newRows: DrawingRow[] = sampleItems.map((item, idx) => ({
      id: `row-${idx + 1}`,
      listNo: item.listNo,
      drawingNo: item.drawingNo,
      revision: item.revision,
      title: item.title,
      sourcePage: idx + startPageOffset,
      isIncluded: true,
      isManuallyEdited: false,
      matchStatus: 'matched',
      warnings: [],
    }));

    setRows(newRows);
    setMode('drawing-list');
    setShowImportPanel(false);
  };

  // Execution: Split and Save into Folder or ZIP
  const handleSplitAndSave = async (exportMode: 'folder' | 'zip') => {
    if (!selectedPdf) {
      alert('Please select a combined drawing PDF first.');
      return;
    }

    if (totalPdfPages === 0) {
      alert('The selected PDF has no readable pages. Please check the document.');
      return;
    }

    // Comprehensive validation before export
    const validation = validateRowsForExport(rows, totalPdfPages, mode, pattern);
    if (!validation.isValid) {
      alert(validation.errorMessage || 'Export blocked due to validation errors.');
      // Focus the first missing row if any
      if (validation.missingPages.length > 0) {
        const firstMissing = validation.missingPages[0];
        const missingRow = rows.find((r) => r.sourcePage === firstMissing);
        if (missingRow && inputRefs.current[missingRow.id]) {
          inputRefs.current[missingRow.id]?.focus();
          inputRefs.current[missingRow.id]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
      return;
    }

    const includedRows = evaluatedRows.filter((r) => r.isIncluded);
    const outputFilenames = includedRows.map((row) => {
      if (mode === 'manual' || row.isManuallyEdited) {
        return cleanOutputFilename(row.manualFilename);
      }
      return buildFilename(row, pattern).filename;
    });

    setIsProcessing(true);
    setProgress({ current: 0, total: includedRows.length, status: 'Preparing documents...' });

    const executionResults: Array<{ rowId: string; filename: string; status: 'success' | 'failed'; error?: string }> = [];

    try {
      const fileBytes = selectedPdf.data || new Uint8Array(await selectedPdf.file.arrayBuffer());

      if (exportMode === 'folder' && 'showDirectoryPicker' in window) {
        let dirHandle: any = null;
        try {
          dirHandle = await (window as any).showDirectoryPicker({
            mode: 'readwrite',
          });
        } catch (err: any) {
          if (err.name === 'AbortError') {
            setIsProcessing(false);
            return;
          }
          console.warn('Directory picker unavailable or dismissed, falling back to ZIP');
        }

        if (dirHandle) {
          const requestedNames = [...new Set([...outputFilenames, 'manifest.csv'])];
          const existingNames: string[] = [];
          for (const filename of requestedNames) {
            try {
              await dirHandle.getFileHandle(filename);
              existingNames.push(filename);
            } catch (lookupError: any) {
              if (lookupError?.name !== 'NotFoundError') throw lookupError;
            }
          }
          if (
            existingNames.length > 0 &&
            !confirm(`These files already exist in the selected folder:\n\n${existingNames.join('\n')}\n\nReplace them?`)
          ) {
            setIsProcessing(false);
            return;
          }

          // Write files directly into chosen directory
          for (let i = 0; i < includedRows.length; i++) {
            const row = includedRows[i];
            const filename = outputFilenames[i];
            setProgress({
              current: i + 1,
              total: includedRows.length,
              status: `Writing ${filename} (${i + 1}/${includedRows.length})...`,
            });

            try {
              const singlePdfBytes = await splitSinglePage(fileBytes, row.sourcePage);
              const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
              const writable = await fileHandle.createWritable();
              await writable.write(singlePdfBytes);
              await writable.close();
              executionResults.push({ rowId: row.id, filename, status: 'success' });
            } catch (err: any) {
              executionResults.push({ rowId: row.id, filename, status: 'failed', error: err.message });
            }
          }

          // Write manifest.csv
          const manifestContent = generateManifestCsv(evaluatedRows, executionResults);
          const manifestHandle = await dirHandle.getFileHandle('manifest.csv', { create: true });
          const mWritable = await manifestHandle.createWritable();
          await mWritable.write(manifestContent);
          await mWritable.close();

          alert(
            `Successfully saved ${executionResults.filter((r) => r.status === 'success').length} files and manifest.csv to your chosen folder!`
          );
          setIsProcessing(false);
          return;
        }
      }

      // ZIP Fallback
      const zip = new JSZip();
      for (let i = 0; i < includedRows.length; i++) {
        const row = includedRows[i];
        const filename = outputFilenames[i];
        setProgress({
          current: i + 1,
          total: includedRows.length,
          status: `Splitting page ${row.sourcePage} for ${filename}...`,
        });

        try {
          const singlePdfBytes = await splitSinglePage(fileBytes, row.sourcePage);
          zip.file(filename, singlePdfBytes);
          executionResults.push({ rowId: row.id, filename, status: 'success' });
        } catch (err: any) {
          executionResults.push({ rowId: row.id, filename, status: 'failed', error: err.message });
        }
      }

      // Add manifest.csv to ZIP
      const manifestCsv = generateManifestCsv(evaluatedRows, executionResults);
      zip.file('manifest.csv', manifestCsv);

      setProgress({
        current: includedRows.length,
        total: includedRows.length,
        status: 'Compressing ZIP archive...',
      });

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const baseName = selectedPdf.name.replace(/\.pdf$/i, '');
      downloadFile(zipBlob, `${baseName}_split_drawings.zip`, 'application/zip');
    } catch (err: any) {
      alert(`Split operation error: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Filtered rows for search query
  const filteredRows = useMemo(() => {
    if (!searchQuery.trim()) return evaluatedRows;
    const q = searchQuery.toLowerCase();
    return evaluatedRows.filter(
      (r) =>
        r.drawingNo.toLowerCase().includes(q) ||
        r.title.toLowerCase().includes(q) ||
        r.listNo.toLowerCase().includes(q) ||
        (r.manualFilename && r.manualFilename.toLowerCase().includes(q))
    );
  }, [evaluatedRows, searchQuery]);

  // Preview page helper
  const handlePreviewPage = (sourcePage: number) => {
    if (!selectedPdf) return;
    if (selectedPdf.data) {
      onPreviewPdfPage?.(selectedPdf.data, sourcePage, `${selectedPdf.name} - Page ${sourcePage}`);
    } else {
      selectedPdf.file.arrayBuffer().then((b) => {
        onPreviewPdfPage?.(new Uint8Array(b), sourcePage, `${selectedPdf.name} - Page ${sourcePage}`);
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Mode Controls */}
      <div className="rounded-2xl border border-slate-800/80 bg-slate-900/50 p-5 shadow-sm backdrop-blur-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <Scissors className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-white">
                  Split & Rename PDF Pages
                </h3>
                <span className="text-xs text-amber-400/90 font-medium">
                  {mode === 'manual' ? 'Manual filename entry · default' : 'Drawing-list mode'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {mode === 'manual'
                  ? 'Enter output filenames directly for each page. Importing an engineering drawing list is completely optional.'
                  : 'Pages are automatically mapped and named according to your imported drawing list template.'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {mode === 'drawing-list' ? (
              <button
                onClick={handleSwitchToManual}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-700 px-3 py-2 text-xs font-medium text-slate-200 transition"
                title="Return to manual per-page filename entry"
              >
                <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                <span>Switch to Manual Filenames</span>
              </button>
            ) : (
              <button
                onClick={() => setShowImportPanel((prev) => !prev)}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition ${
                  showImportPanel
                    ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                    : 'border-slate-800 bg-slate-800/60 hover:bg-slate-800 hover:border-slate-700 text-slate-300'
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-amber-400" />
                <span>Import Drawing List (Optional)</span>
                {showImportPanel ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>
        </div>

        {/* Selected PDF Target Row */}
        <div className="mt-4 pt-4 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-400">Target PDF:</span>
            {pdfFiles.length > 0 ? (
              <select
                value={selectedPdfId}
                onChange={(e) => setSelectedPdfId(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
              >
                {pdfFiles.map((pdf) => (
                  <option key={pdf.id} value={pdf.id}>
                    {pdf.name} ({pdf.pageCount || '?'} pages)
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-amber-400 font-medium">
                No PDF loaded yet — drop your drawing package PDF above!
              </span>
            )}
          </div>

          {selectedPdf && (
            <div className="flex items-center gap-3 text-slate-400 text-[11px]">
              <span>
                Total PDF Pages: <strong className="text-slate-200">{totalPdfPages}</strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Document: <strong className="text-slate-200">{selectedPdf.name}</strong>
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Optional Import Drawing List Shortcuts Drawer */}
      {showImportPanel && (
        <div className="rounded-2xl border border-slate-800/90 bg-slate-900/60 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h4 className="text-xs font-semibold text-slate-200">
                Optional: Import Drawing List
              </h4>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Quickly import table rows from Excel, CSV, clipboard, or PDF text. If parsing fails, your manual table stays untouched.
              </p>
            </div>

            <button
              onClick={handleLoadSample}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700/80 bg-slate-800/50 hover:bg-slate-800 px-2.5 py-1 text-[11px] font-medium text-slate-300 transition"
              title="Load standard 21-drawing test package"
            >
              <span>Load Sample Package (21 items)</span>
            </button>
          </div>

          {/* Import Tabs */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveImportTab('upload')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                activeImportTab === 'upload'
                  ? 'bg-amber-600 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Excel / CSV File</span>
            </button>
            <button
              onClick={() => setActiveImportTab('paste')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                activeImportTab === 'paste'
                  ? 'bg-amber-600 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Clipboard className="w-3.5 h-3.5" />
              <span>Paste Table</span>
            </button>
            <button
              onClick={() => setActiveImportTab('pdf-extract')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                activeImportTab === 'pdf-extract'
                  ? 'bg-amber-600 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Extract from PDF Text</span>
            </button>
            <button
              onClick={() => setActiveImportTab('ocr')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                activeImportTab === 'ocr'
                  ? 'bg-amber-600 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <ScanText className="w-3.5 h-3.5" />
              <span>Local OCR</span>
            </button>
          </div>

          {/* Tab contents */}
          {activeImportTab === 'upload' && (
            <div className="flex flex-col sm:flex-row items-center gap-4 rounded-xl border border-dashed border-slate-800 bg-slate-950/40 p-4">
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileUpload}
                className="text-xs text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-amber-600 file:text-white hover:file:bg-amber-500 cursor-pointer"
              />
              <p className="text-[11px] text-slate-400">
                Upload an Excel (.xlsx, .xls) or CSV file with columns: <strong>NO.</strong>, <strong>DRAWING NO.</strong>, <strong>REV.</strong>, <strong>TITLE</strong>.
              </p>
            </div>
          )}

          {activeImportTab === 'paste' && (
            <div className="space-y-3">
              <textarea
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                placeholder="Paste rows copied from Excel or CSV here (tab-separated or comma-separated)...&#10;Example:&#10;01	CR115-SKSPL-8720	A	General Arrangement&#10;02	CR115-SKSPL-8721	A	Lower Ground Plan"
                rows={4}
                className="w-full rounded-xl border border-slate-800 bg-slate-950 p-3 font-mono text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
              <button
                onClick={handleApplyPastedText}
                disabled={!pastedText.trim()}
                className="rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white px-3.5 py-1.5 text-xs font-medium transition"
              >
                Parse Pasted Rows
              </button>
            </div>
          )}

          {activeImportTab === 'pdf-extract' && (
            <div className="space-y-2">
              <p className="text-xs text-slate-400">
                Extract selectable text directly from the current PDF to detect drawing numbers and revisions without leaving the browser.
              </p>
              <button
                onClick={handleExtractFromPdf}
                disabled={!selectedPdf || isProcessing}
                className="inline-flex items-center gap-2 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white px-4 py-2 text-xs font-medium transition"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Scan PDF Pages for Drawing Numbers</span>
              </button>
            </div>
          )}

          {activeImportTab === 'ocr' && (
            <div className="space-y-2">
              <p className="text-xs text-slate-400">
                Run optical character recognition on scanned drawing index sheets.
              </p>
              <button
                onClick={handleRunOcr}
                disabled={ocrLoading || !selectedPdf}
                className="inline-flex items-center gap-2 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white px-4 py-2 text-xs font-medium transition"
              >
                {ocrLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ScanText className="w-3.5 h-3.5" />}
                <span>{ocrLoading ? 'Recognizing Page 1...' : 'Run Local OCR on Page 1'}</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Pattern Template Settings (Only in Drawing-List Mode) */}
      {mode === 'drawing-list' && rows.length > 0 && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Drawing-List Filename Pattern & Mapping
            </h4>
            <span className="text-[11px] text-slate-400 font-mono">
              Pattern: <code className="text-amber-400">{pattern}</code>
            </span>
          </div>

          {/* Pattern Presets */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-400 mr-1">Presets:</span>
            {PATTERN_PRESETS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPattern(p.value)}
                className={`rounded-lg px-2.5 py-1 text-xs font-mono transition ${
                  pattern === p.value
                    ? 'bg-amber-600 text-white font-semibold'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Custom pattern editor */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2 space-y-1">
              <label className="text-[11px] font-medium text-slate-400">
                Pattern Template (Tokens: {'{list_no}'}, {'{drawing_no}'}, {'{revision}'}, {'{title}'}, {'{page}'})
              </label>
              <input
                type="text"
                value={pattern}
                onChange={(e) => setPattern(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-medium text-slate-400">
                First Drawing Source Page (Skip cover/blank)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={totalPdfPages || 999}
                  value={startPageOffset}
                  onChange={(e) => handleUpdateStartPage(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-24 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
                <span className="text-[11px] text-slate-400">
                  {startPageOffset > 1 ? `Skips first ${startPageOffset - 1} pages` : 'Starts on Page 1'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Table / Empty State */}
      {!selectedPdf || totalPdfPages === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 p-10 text-center space-y-3">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
            <Scissors className="h-6 w-6" />
          </div>
          <h4 className="text-sm font-semibold text-white">No PDF Document Loaded</h4>
          <p className="mx-auto max-w-md text-xs text-slate-400">
            Please add or select a multi-page drawing package PDF above. Once loaded, a page-by-page table with blank filename inputs will appear automatically.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                {mode === 'manual' ? 'Page-by-Page Filename Table' : 'Review & Validate Drawing Mappings'}
              </h4>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {mode === 'manual'
                  ? 'Each included row splits one single-page PDF named as entered. .pdf is appended automatically.'
                  : 'Review drawing metadata, check proposed filenames, or edit filenames individually.'}
              </p>
            </div>

            {/* Search filter */}
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-500" />
              <input
                type="text"
                placeholder="Filter pages or filenames..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>
          </div>

          {/* Counters Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-xs">
            <div className="rounded-xl bg-slate-950/60 p-2.5 border border-slate-800">
              <div className="text-[10px] uppercase text-slate-400 font-medium">Source Pages</div>
              <div className="mt-0.5 text-base font-bold text-white">{counters.totalPages}</div>
            </div>
            <div className="rounded-xl bg-slate-950/60 p-2.5 border border-slate-800">
              <div className="text-[10px] uppercase text-emerald-400 font-medium">Included / Ready</div>
              <div className="mt-0.5 text-base font-bold text-emerald-400">{counters.matched}</div>
            </div>
            <div className="rounded-xl bg-slate-950/60 p-2.5 border border-slate-800">
              <div className="text-[10px] uppercase text-slate-400 font-medium">Excluded</div>
              <div className="mt-0.5 text-base font-bold text-slate-400">{counters.unmatched}</div>
            </div>
            <div className="rounded-xl bg-slate-950/60 p-2.5 border border-slate-800">
              <div className="text-[10px] uppercase text-amber-400 font-medium">Duplicates</div>
              <div className={`mt-0.5 text-base font-bold ${counters.duplicates > 0 ? 'text-amber-400' : 'text-slate-400'}`}>
                {counters.duplicates}
              </div>
            </div>
            <div className="rounded-xl bg-slate-950/60 p-2.5 border border-slate-800">
              <div className="text-[10px] uppercase text-red-400 font-medium">Missing Names</div>
              <div className={`mt-0.5 text-base font-bold ${counters.invalid > 0 ? 'text-red-400' : 'text-slate-400'}`}>
                {counters.invalid}
              </div>
            </div>
          </div>

          {/* Table: Manual Mode */}
          {mode === 'manual' ? (
            <div className="overflow-x-auto rounded-xl border border-slate-800">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/80 text-[11px] text-slate-400 uppercase font-semibold">
                    <th className="py-2.5 px-3 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={evaluatedRows.length > 0 && evaluatedRows.every((r) => r.isIncluded)}
                        onChange={(e) => handleSelectAll(e.target.checked)}
                        className="rounded border-slate-700 bg-slate-800 text-amber-600 focus:ring-0"
                        title="Include or exclude all pages"
                      />
                    </th>
                    <th className="py-2.5 px-3 w-28">SOURCE PAGE</th>
                    <th className="py-2.5 px-3 min-w-[340px]">OUTPUT FILENAME</th>
                    <th className="py-2.5 px-3 w-36">STATUS</th>
                    <th className="py-2.5 px-3 w-20 text-right">PREVIEW</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                  {filteredRows.map((row) => {
                    const rawVal = row.manualFilename || '';
                    const cleanedPreview = cleanOutputFilename(rawVal);
                    const isReserved = isReservedFilename(rawVal) || isReservedFilename(cleanedPreview);
                    const isBlank = !cleanedPreview;

                    return (
                      <tr
                        key={row.id}
                        className={`hover:bg-slate-900/60 transition-colors ${
                          !row.isIncluded ? 'opacity-40 bg-slate-950/80' : ''
                        }`}
                      >
                        {/* Checkbox */}
                        <td className="py-2.5 px-3 text-center">
                          <input
                            type="checkbox"
                            checked={row.isIncluded}
                            onChange={() => handleToggleRow(row.id)}
                            className="rounded border-slate-700 bg-slate-800 text-amber-600 focus:ring-0"
                          />
                        </td>

                        {/* Source Page */}
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-1.5 font-medium text-slate-200">
                            <span>Page {row.sourcePage}</span>
                            <span className="text-[11px] text-slate-500">/ {totalPdfPages}</span>
                          </div>
                        </td>

                        {/* Output Filename Input & Live Preview */}
                        <td className="py-2.5 px-3">
                          <div className="space-y-1">
                            <input
                              ref={(el) => {
                                inputRefs.current[row.id] = el;
                              }}
                              type="text"
                              value={rawVal}
                              onChange={(e) => handleUpdateFilename(row.id, e.target.value)}
                              placeholder={`Enter filename for page ${row.sourcePage}`}
                              disabled={!row.isIncluded}
                              className={`w-full rounded-lg border px-3 py-1.5 text-xs font-mono transition focus:outline-none ${
                                !row.isIncluded
                                  ? 'bg-slate-900/50 border-slate-800/80 text-slate-500'
                                  : isReserved
                                  ? 'bg-red-950/30 border-red-500/60 text-red-200 focus:border-red-400'
                                  : isBlank
                                  ? 'bg-slate-900 border-slate-700/80 text-slate-100 placeholder-slate-600 focus:border-amber-500'
                                  : 'bg-slate-900 border-slate-700 text-slate-100 focus:border-amber-500'
                              }`}
                            />
                            {/* Sanitized Live Preview */}
                            <div className="flex items-center gap-1.5 text-[11px]">
                              {cleanedPreview ? (
                                <div className="flex items-center gap-1 font-mono text-amber-400/90 truncate">
                                  <ArrowRight className="w-3 h-3 shrink-0 text-slate-500" />
                                  <span className="font-semibold truncate">{cleanedPreview}</span>
                                </div>
                              ) : row.isIncluded ? (
                                <span className="text-slate-500 italic">
                                  No filename entered (required for export)
                                </span>
                              ) : (
                                <span className="text-slate-600 italic">Page excluded from export</span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Status */}
                        <td className="py-2.5 px-3">
                          {!row.isIncluded ? (
                            <span className="text-[11px] text-slate-500">Excluded</span>
                          ) : isReserved ? (
                            <span
                              className="inline-flex items-center gap-1 text-[11px] text-red-400 font-medium cursor-help"
                              title="manifest.csv is reserved for the export manifest"
                            >
                              <AlertCircle className="w-3.5 h-3.5 shrink-0" /> Reserved name
                            </span>
                          ) : isBlank ? (
                            <span
                              className="inline-flex items-center gap-1 text-[11px] text-amber-400 cursor-help"
                              title={`Please enter an output filename for page ${row.sourcePage}`}
                            >
                              <AlertCircle className="w-3.5 h-3.5 shrink-0" /> Missing filename
                            </span>
                          ) : row.warnings.some((w) => w.toLowerCase().includes('duplicate')) ? (
                            <span
                              className="inline-flex items-center gap-1 text-[11px] text-amber-400 font-medium cursor-help"
                              title="Multiple pages share this output filename"
                            >
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> Duplicate name
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400">
                              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> Ready
                            </span>
                          )}
                        </td>

                        {/* Preview Action */}
                        <td className="py-2.5 px-3 text-right">
                          <button
                            onClick={() => handlePreviewPage(row.sourcePage)}
                            className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-amber-400 transition"
                            title={`Preview source page ${row.sourcePage}`}
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            /* Table: Drawing-List Mode */
            <div className="overflow-x-auto rounded-xl border border-slate-800">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/80 text-[11px] text-slate-400 uppercase font-semibold">
                    <th className="py-2.5 px-3 w-8">
                      <input
                        type="checkbox"
                        checked={evaluatedRows.every((r) => r.isIncluded)}
                        onChange={(e) => handleSelectAll(e.target.checked)}
                        className="rounded border-slate-700 bg-slate-800 text-amber-600 focus:ring-0"
                      />
                    </th>
                    <th className="py-2.5 px-3 w-14">NO.</th>
                    <th className="py-2.5 px-3 min-w-[200px]">DRAWING NO.</th>
                    <th className="py-2.5 px-3 w-16">REV.</th>
                    <th className="py-2.5 px-3 min-w-[180px]">DRAWING TITLE</th>
                    <th className="py-2.5 px-3 w-28">SOURCE PAGE</th>
                    <th className="py-2.5 px-3 w-24">STATUS</th>
                    <th className="py-2.5 px-3 min-w-[250px]">PROPOSED FILENAME</th>
                    <th className="py-2.5 px-3 w-16 text-right">ACTION</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 bg-slate-950/40 font-mono">
                  {filteredRows.map((row) => (
                    <tr
                      key={row.id}
                      className={`hover:bg-slate-900/60 transition-colors ${
                        !row.isIncluded ? 'opacity-40 bg-slate-950/80' : ''
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="py-2 px-3">
                        <input
                          type="checkbox"
                          checked={row.isIncluded}
                          onChange={() => handleToggleRow(row.id)}
                          className="rounded border-slate-700 bg-slate-800 text-amber-600 focus:ring-0"
                        />
                      </td>

                      {/* List No. */}
                      <td className="py-2 px-3">
                        <input
                          type="text"
                          value={row.listNo}
                          onChange={(e) => handleUpdateField(row.id, 'listNo', e.target.value)}
                          className="w-12 rounded bg-slate-900 px-1.5 py-1 text-slate-200 border border-slate-800 focus:outline-none focus:border-amber-500"
                        />
                      </td>

                      {/* Drawing No. */}
                      <td className="py-2 px-3">
                        <input
                          type="text"
                          value={row.drawingNo}
                          onChange={(e) => handleUpdateField(row.id, 'drawingNo', e.target.value)}
                          className="w-full rounded bg-slate-900 px-1.5 py-1 text-slate-200 border border-slate-800 focus:outline-none focus:border-amber-500 font-mono font-medium"
                        />
                      </td>

                      {/* Revision */}
                      <td className="py-2 px-3">
                        <input
                          type="text"
                          value={row.revision}
                          onChange={(e) => handleUpdateField(row.id, 'revision', e.target.value)}
                          className="w-12 rounded bg-slate-900 px-1.5 py-1 text-slate-200 border border-slate-800 focus:outline-none focus:border-amber-500 font-bold text-center"
                        />
                      </td>

                      {/* Title */}
                      <td className="py-2 px-3 font-sans">
                        <input
                          type="text"
                          value={row.title}
                          onChange={(e) => handleUpdateField(row.id, 'title', e.target.value)}
                          className="w-full rounded bg-slate-900 px-1.5 py-1 text-slate-300 border border-slate-800 focus:outline-none focus:border-amber-500 text-xs"
                        />
                      </td>

                      {/* Source Page */}
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min={1}
                            max={totalPdfPages || 999}
                            value={row.sourcePage}
                            onChange={(e) =>
                              handleUpdateField(row.id, 'sourcePage', parseInt(e.target.value) || 1)
                            }
                            className={`w-16 rounded px-1.5 py-1 text-center border focus:outline-none ${
                              totalPdfPages > 0 && (row.sourcePage < 1 || row.sourcePage > totalPdfPages)
                                ? 'bg-red-500/20 border-red-500/50 text-red-300'
                                : 'bg-slate-900 border-slate-800 text-slate-200 focus:border-amber-500'
                            }`}
                          />
                          {totalPdfPages > 0 && (
                            <span className="text-[10px] text-slate-500 font-sans">/ {totalPdfPages}</span>
                          )}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-2 px-3 font-sans">
                        {row.matchStatus === 'matched' && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400">
                            <CheckCircle2 className="w-3 h-3" /> Matched
                          </span>
                        )}
                        {row.matchStatus === 'warning' && (
                          <span
                            className="inline-flex items-center gap-1 text-[11px] text-amber-400 cursor-help"
                            title={row.warnings.join('\n')}
                          >
                            <AlertCircle className="w-3 h-3" /> Flagged
                          </span>
                        )}
                        {row.matchStatus === 'page-missing' && (
                          <span
                            className="inline-flex items-center gap-1 text-[11px] text-red-400 cursor-help"
                            title={row.warnings.join('\n')}
                          >
                            <AlertTriangle className="w-3 h-3" /> Invalid Page
                          </span>
                        )}
                        {row.matchStatus === 'unmatched' && (
                          <span className="text-[11px] text-slate-500">Excluded</span>
                        )}
                      </td>

                      {/* Proposed Filename */}
                      <td className="py-2 px-3">
                        <div className="space-y-1">
                          <input
                            type="text"
                            value={row.manualFilename || ''}
                            onChange={(e) => handleUpdateFilename(row.id, e.target.value)}
                            placeholder="Automatic pattern name"
                            className="w-full rounded bg-slate-900 px-2 py-1 text-xs text-slate-200 border border-slate-800 focus:outline-none focus:border-amber-500 font-mono"
                          />
                          <div className="text-[10px] text-amber-400/90 truncate">
                            → {cleanOutputFilename(row.manualFilename) || buildFilename(row, pattern).filename}
                          </div>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-2 px-3 text-right">
                        <button
                          onClick={() => handlePreviewPage(row.sourcePage)}
                          className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-amber-400 transition"
                          title={`Preview source page ${row.sourcePage}`}
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Action Bar: Export Folder or ZIP */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-800">
            <div className="text-xs text-slate-400">
              Selected <strong className="text-white">{counters.matched}</strong> of{' '}
              <strong className="text-white">{evaluatedRows.length}</strong> pages for export +{' '}
              <strong className="text-white">manifest.csv</strong>
            </div>

            <div className="flex items-center gap-3">
              {'showDirectoryPicker' in window && (
                <button
                  disabled={isProcessing || counters.matched === 0}
                  onClick={() => handleSplitAndSave('folder')}
                  className="inline-flex items-center gap-2 rounded-xl bg-amber-600 hover:bg-amber-500 active:bg-amber-700 disabled:opacity-40 text-white px-4 py-2 text-xs font-semibold shadow-md shadow-amber-600/20 transition"
                >
                  <FolderDown className="w-4 h-4" />
                  <span>Choose Output Folder & Split</span>
                </button>
              )}

              <button
                disabled={isProcessing || counters.matched === 0}
                onClick={() => handleSplitAndSave('zip')}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/90 hover:bg-slate-700 disabled:opacity-40 text-slate-200 px-4 py-2 text-xs font-medium transition"
              >
                <Download className="w-4 h-4 text-amber-400" />
                <span>Download as ZIP Archive</span>
              </button>
            </div>
          </div>

          {/* Progress state */}
          {isProcessing && (
            <div className="rounded-xl bg-slate-950 p-4 border border-amber-500/30 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300 font-medium">{progress.status}</span>
                <span className="text-amber-400 font-bold">
                  {progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0}%
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full bg-amber-500 transition-all duration-200"
                  style={{
                    width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
