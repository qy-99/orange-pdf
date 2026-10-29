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
 * Sanitizes Windows & Unix illegal characters: < > : " / \ | ? *
 * Trims outer whitespace and trailing dots/spaces
 * Ensures valid .pdf extension
 */
export function sanitizeFilename(filename: string): string {
  if (!filename) return 'unnamed.pdf';
  
  // Strip .pdf from end if already present to work on basename
  let base = filename.trim();
  if (base.toLowerCase().endsWith('.pdf')) {
    base = base.slice(0, -4);
  }
  
  // Replace illegal characters with underscore or dash
  // Illegal: < > : " / \ | ? * and ASCII 0-31
  base = base.replace(/[<>:"/\\|?*\x00-\x1F]/g, '-');
  
  // Collapse multiple dashes/spaces
  base = base.replace(/[\s\t]+/g, ' ');
  base = base.replace(/-+/g, '-');
  
  // Remove leading and trailing spaces, dashes, or dots
  base = base.replace(/^[.\-\s]+|[.\-\s]+$/g, '').trim();
  
  if (!base) {
    base = 'drawing';
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
    // Check if preceded by a letter, digit, or hyphen
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
 * Updates filenames, match statuses, and detects duplicate/invalid names
 */
export function evaluateRows(
  rows: DrawingRow[],
  pattern: string,
  totalPdfPages: number
): {
  rows: DrawingRow[];
  counters: {
    totalPages: number;
    totalRows: number;
    matched: number;
    unmatched: number;
    duplicates: number;
    invalid: number;
  };
} {
  const filenameCounts = new Map<string, number>();

  // Pass 1: compute filename and basic validity
  const processed = rows.map((row) => {
    let filename = '';
    const rowWarnings: string[] = [];

    if (row.isManuallyEdited && row.manualFilename) {
      filename = sanitizeFilename(row.manualFilename);
      if (filename !== row.manualFilename) {
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
      rowWarnings.push(...generated.warnings);
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

    if (row.isIncluded) {
      const current = filenameCounts.get(filename) || 0;
      filenameCounts.set(filename, current + 1);
    }

    return {
      ...row,
      manualFilename: row.isManuallyEdited ? row.manualFilename : filename,
      matchStatus,
      warnings: rowWarnings,
    };
  });

  // Pass 2: mark duplicates
  let duplicateCount = 0;
  let invalidCount = 0;
  let matchedCount = 0;
  let unmatchedCount = 0;

  const finalRows = processed.map((row) => {
    const rowWarnings = [...row.warnings];
    const filename = row.isManuallyEdited && row.manualFilename ? row.manualFilename : row.manualFilename || '';
    
    if (row.isIncluded) {
      const count = filenameCounts.get(filename) || 0;
      if (count > 1) {
        duplicateCount++;
        rowWarnings.push(`Duplicate filename: ${filename} is used by multiple rows`);
      }
      if (!filename || filename === '.pdf' || filename === 'unnamed.pdf') {
        invalidCount++;
        rowWarnings.push('Invalid or empty filename generated');
      }
      if (row.matchStatus === 'matched') {
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

    return {
      ...row,
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
    },
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
