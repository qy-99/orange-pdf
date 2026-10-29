/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { DrawingRow } from '../types';

export const DEFAULT_PATTERN = '{list_no} {drawing_no}{revision}';

export const PATTERN_PRESETS = [
  { label: 'Standard (No. + Drawing + Rev)', value: '{list_no} {drawing_no}{revision}' },
  { label: 'Drawing + Rev only', value: '{drawing_no}{revision}' },
  { label: 'Full (No. + Drawing + Rev + Title)', value: '{list_no} {drawing_no}{revision} {title}' },
  { label: 'Page + Drawing + Rev', value: 'Page {page} - {drawing_no}{revision}' },
];

export const RESERVED_FILENAMES = new Set(['manifest.csv']);

/**
 * Checks if a filename (typed by user or sanitized) collides with the reserved export manifest.
 * Handles case-insensitivity and variations like 'manifest.csv.pdf'.
 */
export function isReservedFilename(filename: string | undefined | null): boolean {
  if (!filename) return false;
  const raw = filename.trim().toLowerCase();
  if (raw === 'manifest.csv' || raw === 'manifest.csv.pdf') return true;
  if (raw.endsWith('.pdf')) {
    const withoutPdf = raw.slice(0, -4).trim();
    if (withoutPdf === 'manifest.csv' || withoutPdf === 'manifest') return true;
  }
  return false;
}

/**
 * Strips leading zeros ONLY from the start of list numbers:
 * 01 -> 1
 * 02 -> 2
 * 007 -> 7
 * 21 -> 21
 * 0 -> 0
 * 00 -> 0
 */
export function formatListNo(noStr: string | number | undefined | null): string {
  if (noStr === undefined || noStr === null) return '';
  const str = String(noStr).trim();
  if (!str) return '';
  
  // If it's a numeric string with leading zeros
  const numMatch = str.match(/^0+(\d+)$/);
  if (numMatch) {
    return numMatch[1];
  }
  return str;
}

/**
 * Sanitizes user-entered filename for output.
 * If user omits .pdf, automatically appends .pdf.
 * Does NOT force default placeholder like 'unnamed.pdf' if empty.
 * Returns empty string if input is blank or whitespace-only.
 * Cleans Windows/Unix illegal characters: < > : " / \ | ? *
 * Collapses multiple spaces and dashes.
 * Trims leading/trailing whitespace, dots, and dashes.
 */
export function cleanOutputFilename(input: string | undefined | null): string {
  if (!input || !input.trim()) return '';

  let base = input.trim();
  if (base.toLowerCase().endsWith('.pdf')) {
    base = base.slice(0, -4);
  }

  // Replace illegal Windows & Unix characters: < > : " / \ | ? * and ASCII 0-31
  base = base.replace(/[<>:"/\\|?*\x00-\x1F]/g, '-');

  // Collapse multiple dashes/spaces and spaces around dashes
  base = base.replace(/[\s\t]+/g, ' ');
  base = base.replace(/\s*-\s*/g, '-');
  base = base.replace(/-+/g, '-');

  // Remove leading and trailing spaces, dashes, or dots
  base = base.replace(/^[.\-\s]+|[.\-\s]+$/g, '').trim();

  if (!base) return '';
  return `${base}.pdf`;
}

/**
 * Sanitizes Windows & Unix illegal characters: < > : " / \ | ? *
 * Trims outer whitespace and trailing dots/spaces
 * Ensures valid .pdf extension.
 * Defaults empty input to 'unnamed.pdf' for backward compatibility.
 */
export function sanitizeFilename(filename: string, fallback: string = 'unnamed'): string {
  if (!filename) return `${fallback}.pdf`;
  
  // Strip .pdf from end if already present to work on basename
  let base = filename.trim();
  if (base.toLowerCase().endsWith('.pdf')) {
    base = base.slice(0, -4);
  }
  
  // Replace illegal characters with underscore or dash
  base = base.replace(/[<>:"/\\|?*\x00-\x1F]/g, '-');
  
  // Collapse multiple dashes/spaces
  base = base.replace(/[\s\t]+/g, ' ');
  base = base.replace(/-+/g, '-');
  
  // Remove leading and trailing spaces, dashes, or dots
  base = base.replace(/^[.\-\s]+|[.\-\s]+$/g, '').trim();
  
  if (!base) {
    base = fallback;
  }
  
  return `${base}.pdf`;
}

/**
 * Checks if drawing number visibly already ends with the revision
 * e.g. drawingNo "CR115...-8720A" and revision "A"
 */
export function checkRevisionAlreadyAppended(drawingNo: string, revision: string): boolean {
  if (!drawingNo || !revision) return false;
  const cleanDrawing = drawingNo.trim();
  const cleanRev = revision.trim();
  if (!cleanRev) return false;
  
  // Exact end match case-insensitive
  if (cleanDrawing.toLowerCase().endsWith(cleanRev.toLowerCase())) {
    return true;
  }
  return false;
}

/**
 * Builds the output filename from tokens:
 * {list_no}, {drawing_no}, {revision}, {title}, {page}
 */
export function buildFilename(
  row: { listNo: string; drawingNo: string; revision: string; title: string; sourcePage?: number },
  pattern: string = DEFAULT_PATTERN
): { filename: string; warnings: string[] } {
  const warnings: string[] = [];
  const listNo = formatListNo(row.listNo);
  const drawingNo = (row.drawingNo || '').trim();
  const revision = (row.revision || '').trim();
  const title = (row.title || '').trim();
  const page = row.sourcePage ? String(row.sourcePage) : '';

  if (checkRevisionAlreadyAppended(drawingNo, revision)) {
    warnings.push(`Drawing No. "${drawingNo}" already ends with revision "${revision}"`);
  }

  // Replace tokens
  let name = pattern
    .replace(/\{list_no\}/gi, listNo)
    .replace(/\{drawing_no\}/gi, drawingNo)
    .replace(/\{revision\}/gi, revision)
    .replace(/\{title\}/gi, title)
    .replace(/\{page\}/gi, page);

  // If pattern didn't have revision token and revision exists, ensure it's not lost
  if (!pattern.includes('{revision}') && revision) {
    name = `${name}${revision}`;
  }

  const sanitized = sanitizeFilename(name);
  return { filename: sanitized, warnings };
}

/**
 * Generates one blank editable row for each page of the loaded PDF.
 * Default manual mode starts with clean, empty filenames (no synthetic names).
 */
export function createManualRowsForPageCount(pageCount: number): DrawingRow[] {
  if (pageCount <= 0) return [];
  return Array.from({ length: pageCount }, (_, i) => {
    const pageNum = i + 1;
    return {
      id: `manual-page-${pageNum}`,
      listNo: String(pageNum),
      drawingNo: '',
      revision: '',
      title: '',
      sourcePage: pageNum,
      isIncluded: true,
      isManuallyEdited: true,
      manualFilename: '',
      matchStatus: 'warning',
      warnings: [`Missing filename for page ${pageNum}`],
    };
  });
}

/**
 * Evaluates drawing rows live against the given pattern and PDF page count.
 * Supports both 'manual' mode and 'drawing-list' mode.
 */
export function evaluateRows(
  rows: DrawingRow[],
  pattern: string,
  totalPdfPages: number,
  mode: 'manual' | 'drawing-list' = 'drawing-list'
): {
  rows: DrawingRow[];
  counters: {
    totalPages: number;
    totalRows: number;
    matched: number;
    unmatched: number;
    duplicates: number;
    invalid: number;
    missingNames: number;
  };
} {
  const filenameCounts = new Map<string, number>();

  // Pass 1: compute output filename and basic validity for each row
  const processed = rows.map((row) => {
    let filename = '';
    const rowWarnings: string[] = [];

    if (mode === 'manual') {
      const raw = row.manualFilename || '';
      const clean = cleanOutputFilename(raw);

      if (isReservedFilename(raw) || isReservedFilename(clean)) {
        rowWarnings.push('Reserved filename: "manifest.csv" is reserved for the export manifest');
      }

      if (clean) {
        filename = clean;
        if (raw.trim() && clean !== raw.trim() && !raw.trim().endsWith('.pdf')) {
          // If cleaned changed characters other than just appending .pdf
          if (clean !== `${raw.trim()}.pdf`) {
            rowWarnings.push('Filename had invalid characters cleaned');
          }
        }
      } else {
        filename = '';
        if (row.isIncluded) {
          rowWarnings.push(`Missing filename for page ${row.sourcePage}`);
        }
      }
    } else {
      // Drawing list mode
      if (row.isManuallyEdited && row.manualFilename) {
        const clean = cleanOutputFilename(row.manualFilename);
        if (isReservedFilename(row.manualFilename) || isReservedFilename(clean)) {
          rowWarnings.push('Reserved filename: "manifest.csv" is reserved for the export manifest');
        }
        filename = clean;
        if (filename && filename !== row.manualFilename) {
          rowWarnings.push('Manual filename had invalid characters cleaned');
        }
      } else {
        const generated = buildFilename(
          {
            listNo: row.listNo,
            drawingNo: row.drawingNo,
            revision: row.revision,
            title: row.title,
            sourcePage: row.sourcePage,
          },
          pattern
        );
        filename = generated.filename;
        if (isReservedFilename(filename)) {
          rowWarnings.push('Reserved filename: "manifest.csv" is reserved for the export manifest');
        }
        rowWarnings.push(...generated.warnings);
      }
    }

    // Page match status check
    let matchStatus: DrawingRow['matchStatus'] = 'matched';
    if (!row.isIncluded) {
      matchStatus = 'unmatched';
    } else if (totalPdfPages > 0 && (row.sourcePage < 1 || row.sourcePage > totalPdfPages)) {
      matchStatus = 'page-missing';
      rowWarnings.push(`Page ${row.sourcePage} is outside PDF range (1-${totalPdfPages})`);
    } else if (rowWarnings.length > 0) {
      matchStatus = 'warning';
    }

    // Case-insensitive duplicate tracking for included rows with non-empty filenames
    if (row.isIncluded && filename) {
      const key = filename.toLowerCase();
      const current = filenameCounts.get(key) || 0;
      filenameCounts.set(key, current + 1);
    }

    return {
      ...row,
      manualFilename: mode === 'manual' ? (row.manualFilename ?? '') : (row.isManuallyEdited ? row.manualFilename : filename),
      matchStatus,
      warnings: rowWarnings,
      _evaluatedFilename: filename,
    };
  });

  // Pass 2: mark duplicates & tally counters
  let duplicateCount = 0;
  let invalidCount = 0;
  let missingNamesCount = 0;
  let matchedCount = 0;
  let unmatchedCount = 0;

  const finalRows = processed.map((row) => {
    const rowWarnings = [...row.warnings];
    const evaluatedName = row._evaluatedFilename || (mode === 'manual' ? cleanOutputFilename(row.manualFilename) : row.manualFilename || '');

    if (row.isIncluded) {
      if (evaluatedName) {
        const count = filenameCounts.get(evaluatedName.toLowerCase()) || 0;
        if (count > 1) {
          duplicateCount++;
          rowWarnings.push(`Duplicate filename: ${evaluatedName} is used by multiple rows`);
        }
      } else {
        missingNamesCount++;
        invalidCount++;
        if (!rowWarnings.some((w) => w.includes('Missing filename'))) {
          rowWarnings.push(`Missing filename for page ${row.sourcePage}`);
        }
      }

      if (isReservedFilename(evaluatedName) || isReservedFilename(row.manualFilename)) {
        invalidCount++;
      }

      if (totalPdfPages > 0 && (row.sourcePage < 1 || row.sourcePage > totalPdfPages)) {
        invalidCount++;
      }

      if (row.matchStatus === 'matched' && rowWarnings.length === 0) {
        matchedCount++;
      } else {
        unmatchedCount++;
      }
    } else {
      unmatchedCount++;
    }

    const hasWarnings = rowWarnings.length > 0;
    const finalMatchStatus: DrawingRow['matchStatus'] = !row.isIncluded
      ? 'unmatched'
      : row.matchStatus === 'page-missing'
      ? 'page-missing'
      : hasWarnings
      ? 'warning'
      : 'matched';

    const { _evaluatedFilename, ...cleanRow } = row as any;
    return {
      ...cleanRow,
      matchStatus: finalMatchStatus,
      warnings: rowWarnings,
    };
  });

  return {
    rows: finalRows,
    counters: {
      totalPages: totalPdfPages,
      totalRows: rows.length,
      matched: matchedCount,
      unmatched: unmatchedCount,
      duplicates: duplicateCount,
      invalid: invalidCount,
      missingNames: missingNamesCount,
    },
  };
}

/**
 * Validates rows before export and returns a clear, actionable blocker message if any issue exists.
 */
export function validateRowsForExport(
  rows: DrawingRow[],
  totalPdfPages: number,
  mode: 'manual' | 'drawing-list' = 'manual',
  pattern: string = DEFAULT_PATTERN
): {
  isValid: boolean;
  errorMessage?: string;
  missingPages: number[];
  duplicateNames: string[];
  reservedNames: string[];
  outOfRangePages: number[];
} {
  const included = rows.filter((r) => r.isIncluded);
  if (included.length === 0) {
    return {
      isValid: false,
      errorMessage: 'No pages selected for export. Please select at least one page to export.',
      missingPages: [],
      duplicateNames: [],
      reservedNames: [],
      outOfRangePages: [],
    };
  }

  const missingPages: number[] = [];
  const reservedNames: string[] = [];
  const outOfRangePages: number[] = [];
  const resolvedFilenames: Array<{ row: DrawingRow; filename: string }> = [];

  for (const row of included) {
    // Validate source page number
    if (totalPdfPages > 0 && (row.sourcePage < 1 || row.sourcePage > totalPdfPages)) {
      outOfRangePages.push(row.sourcePage);
    }

    let fn = '';
    if (mode === 'manual' || row.isManuallyEdited) {
      const raw = (row.manualFilename || '').trim();
      if (isReservedFilename(raw)) {
        if (!reservedNames.includes(raw)) reservedNames.push(raw);
      }
      fn = cleanOutputFilename(raw);
    } else {
      const built = buildFilename(row, pattern);
      fn = built.filename;
    }

    if (!fn) {
      missingPages.push(row.sourcePage);
    } else {
      if (isReservedFilename(fn)) {
        if (!reservedNames.includes(fn)) reservedNames.push(fn);
      }
      resolvedFilenames.push({ row, filename: fn });
    }
  }

  // 1. Missing filenames check (blocks export)
  if (missingPages.length > 0) {
    return {
      isValid: false,
      errorMessage: `Export stopped: ${missingPages.length} included page(s) have no filename (Page ${missingPages.join(', ')}). Please enter a filename for all selected pages before exporting.`,
      missingPages,
      duplicateNames: [],
      reservedNames,
      outOfRangePages,
    };
  }

  // 2. Reserved filename check (manifest.csv)
  if (reservedNames.length > 0) {
    return {
      isValid: false,
      errorMessage: `Export stopped: "manifest.csv" is reserved for the export manifest and cannot be used as a drawing filename.`,
      missingPages: [],
      duplicateNames: [],
      reservedNames,
      outOfRangePages,
    };
  }

  // 3. Out-of-range source pages check
  if (outOfRangePages.length > 0) {
    return {
      isValid: false,
      errorMessage: `Export stopped: Page ${outOfRangePages.join(', ')} is outside the valid PDF page range (1-${totalPdfPages}).`,
      missingPages: [],
      duplicateNames: [],
      reservedNames,
      outOfRangePages,
    };
  }

  // 4. Duplicate filenames check (case-insensitive)
  const nameMap = new Map<string, number>();
  resolvedFilenames.forEach(({ filename }) => {
    const key = filename.toLowerCase();
    nameMap.set(key, (nameMap.get(key) || 0) + 1);
  });

  const duplicateNames = [...nameMap.entries()]
    .filter(([, count]) => count > 1)
    .map(([name]) => name);

  if (duplicateNames.length > 0) {
    return {
      isValid: false,
      errorMessage: `Export stopped: Duplicate filename(s) detected (${duplicateNames.join(', ')}). Each output file must have a unique name.`,
      missingPages: [],
      duplicateNames,
      reservedNames,
      outOfRangePages,
    };
  }

  return {
    isValid: true,
    missingPages: [],
    duplicateNames: [],
    reservedNames: [],
    outOfRangePages: [],
  };
}

/**
 * Parses raw pasted CSV or TSV drawing lists
 */
export function parseDelimitedText(
  text: string
): Array<{ listNo: string; drawingNo: string; revision: string; title: string }> {
  if (!text || !text.trim()) return [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  const delimiter = lines[0].includes('\t') ? '\t' : ',';

  // Check if first line is a header
  const firstRowCols = lines[0].split(delimiter).map((c) => c.trim().replace(/^["']|["']$/g, ''));
  const hasHeader = firstRowCols.some((col) =>
    /no\.?|drawing|number|rev|revision|title|sheet/i.test(col)
  );

  let colMap = { no: 0, drawing: 1, rev: 2, title: 3 };

  if (hasHeader) {
    firstRowCols.forEach((col, idx) => {
      const lower = col.toLowerCase().trim();
      if (/title|description/i.test(lower)) {
        colMap.title = idx;
      } else if (/rev|revision/i.test(lower)) {
        colMap.rev = idx;
      } else if (/^no\.?$|^item|^item\s*no|^#$|^list\s*no/i.test(lower)) {
        colMap.no = idx;
      } else if (/drawing|dwg|number|sheet/i.test(lower)) {
        colMap.drawing = idx;
      }
    });
  }

  const dataLines = hasHeader ? lines.slice(1) : lines;
  const result: Array<{ listNo: string; drawingNo: string; revision: string; title: string }> = [];

  for (let i = 0; i < dataLines.length; i++) {
    const rawCols = dataLines[i].split(delimiter).map((c) => c.trim().replace(/^["']|["']$/g, ''));
    if (rawCols.length === 0 || (rawCols.length === 1 && !rawCols[0])) continue;

    const listNo = rawCols[colMap.no] ?? String(i + 1);
    const drawingNo = rawCols[colMap.drawing] ?? '';
    const revision = rawCols[colMap.rev] ?? '';
    const title = rawCols[colMap.title] ?? '';

    if (drawingNo || listNo) {
      result.push({ listNo, drawingNo, revision, title });
    }
  }

  return result;
}

/**
 * Generates manifest.csv content
 */
export function generateManifestCsv(
  rows: DrawingRow[],
  results: Array<{ rowId: string; filename: string; status: 'success' | 'failed'; error?: string }>
): string {
  const resultMap = new Map(results.map((r) => [r.rowId, r]));
  const headers = ['Source Page', 'List No', 'Drawing No', 'Revision', 'Title', 'Output Filename', 'Status', 'Error'];

  const lines = [headers.join(',')];

  rows.forEach((row) => {
    const res = resultMap.get(row.id);
    const status = res ? res.status : row.isIncluded ? 'pending' : 'skipped';
    const err = res?.error || (row.warnings.length > 0 ? row.warnings.join('; ') : '');
    const filename = res?.filename || row.manualFilename || '';

    const cols = [
      String(row.sourcePage),
      `"${formatListNo(row.listNo)}"`,
      `"${(row.drawingNo || '').replace(/"/g, '""')}"`,
      `"${(row.revision || '').replace(/"/g, '""')}"`,
      `"${(row.title || '').replace(/"/g, '""')}"`,
      `"${filename.replace(/"/g, '""')}"`,
      status,
      `"${err.replace(/"/g, '""')}"`,
    ];
    lines.push(cols.join(','));
  });

  return lines.join('\n');
}
