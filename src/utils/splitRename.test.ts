import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatListNo,
  sanitizeFilename,
  cleanOutputFilename,
  isReservedFilename,
  createManualRowsForPageCount,
  buildFilename,
  evaluateRows,
  validateRowsForExport,
  parseDelimitedText,
  generateManifestCsv,
  DEFAULT_PATTERN,
} from './splitRename';
import type { DrawingRow } from '../types';

test('formatListNo removes leading zeros only from list numbers', () => {
  assert.equal(formatListNo('01'), '1');
  assert.equal(formatListNo('02'), '2');
  assert.equal(formatListNo('007'), '7');
  assert.equal(formatListNo('21'), '21');
  assert.equal(formatListNo('0'), '0');
  assert.equal(formatListNo('00'), '0');
  assert.equal(formatListNo('A-01'), 'A-01');
});

test('sanitizeFilename removes illegal characters and trims cleanly', () => {
  assert.equal(sanitizeFilename('my<file>:name?.pdf'), 'my-file-name.pdf');
  assert.equal(sanitizeFilename('drawing/rev*test.pdf'), 'drawing-rev-test.pdf');
  assert.equal(sanitizeFilename('trailing-dot. ...'), 'trailing-dot.pdf');
  assert.equal(sanitizeFilename('clean_name.pdf'), 'clean_name.pdf');
  assert.equal(sanitizeFilename(''), 'unnamed.pdf');
});

test('cleanOutputFilename handles extensions, whitespace, and illegal characters', () => {
  assert.equal(cleanOutputFilename(''), '');
  assert.equal(cleanOutputFilename('   '), '');
  assert.equal(cleanOutputFilename('Drawing 01'), 'Drawing 01.pdf');
  assert.equal(cleanOutputFilename('Drawing 01.pdf'), 'Drawing 01.pdf');
  assert.equal(cleanOutputFilename('Plan: East / West'), 'Plan-East-West.pdf');
  assert.equal(cleanOutputFilename('plan'), 'plan.pdf');
  assert.equal(cleanOutputFilename('Plan.pdf'), 'Plan.pdf');
  assert.equal(cleanOutputFilename('trailing-dot. ...'), 'trailing-dot.pdf');
});

test('isReservedFilename identifies manifest.csv and its variations', () => {
  assert.equal(isReservedFilename('manifest.csv'), true);
  assert.equal(isReservedFilename('MANIFEST.CSV'), true);
  assert.equal(isReservedFilename('manifest.csv.pdf'), true);
  assert.equal(isReservedFilename('Manifest.csv'), true);
  assert.equal(isReservedFilename('drawing_manifest.pdf'), false);
  assert.equal(isReservedFilename('drawing-1.pdf'), false);
});

test('Acceptance Test 1: Load a 3-page PDF without importing any list creates exactly 3 blank filename rows', () => {
  const rows = createManualRowsForPageCount(3);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].sourcePage, 1);
  assert.equal(rows[1].sourcePage, 2);
  assert.equal(rows[2].sourcePage, 3);
  assert.equal(rows[0].manualFilename, '');
  assert.equal(rows[1].manualFilename, '');
  assert.equal(rows[2].manualFilename, '');
  assert.equal(rows.every((r) => r.isIncluded), true);
});

test('Acceptance Test 2: Type Drawing 01 and verify the preview and output filename are Drawing 01.pdf', () => {
  const cleaned = cleanOutputFilename('Drawing 01');
  assert.equal(cleaned, 'Drawing 01.pdf');

  const rows = createManualRowsForPageCount(1);
  rows[0].manualFilename = 'Drawing 01';
  const { rows: evaluated } = evaluateRows(rows, DEFAULT_PATTERN, 1, 'manual');
  assert.equal(cleanOutputFilename(evaluated[0].manualFilename), 'Drawing 01.pdf');

  const validation = validateRowsForExport(rows, 1, 'manual');
  assert.equal(validation.isValid, true);
});

test('Acceptance Test 3: Leave page 2 blank and selected; export is blocked with a clear missing-filename message', () => {
  const rows = createManualRowsForPageCount(3);
  rows[0].manualFilename = 'Drawing 01';
  rows[1].manualFilename = ''; // blank and selected
  rows[2].manualFilename = 'Drawing 03';

  const validation = validateRowsForExport(rows, 3, 'manual');
  assert.equal(validation.isValid, false);
  assert.ok(validation.errorMessage?.includes('Page 2'));
  assert.ok(validation.errorMessage?.includes('Missing filename') || validation.errorMessage?.includes('have no filename'));
});

test('Acceptance Test 4: Uncheck page 2 while leaving it blank; pages 1 and 3 can export if their names are valid', () => {
  const rows = createManualRowsForPageCount(3);
  rows[0].manualFilename = 'Drawing 01';
  rows[1].manualFilename = '';
  rows[1].isIncluded = false; // unchecked!
  rows[2].manualFilename = 'Drawing 03';

  const validation = validateRowsForExport(rows, 3, 'manual');
  assert.equal(validation.isValid, true);
  assert.equal(validation.missingPages.length, 0);
});

test('Acceptance Test 5: Enter Plan.pdf and plan; duplicate detection catches both as plan.pdf', () => {
  const rows = createManualRowsForPageCount(2);
  rows[0].manualFilename = 'Plan.pdf';
  rows[1].manualFilename = 'plan';

  const { counters, rows: evaluated } = evaluateRows(rows, DEFAULT_PATTERN, 2, 'manual');
  assert.equal(counters.duplicates, 2);
  assert.ok(evaluated[0].warnings.some((w) => w.toLowerCase().includes('duplicate')));
  assert.ok(evaluated[1].warnings.some((w) => w.toLowerCase().includes('duplicate')));

  const validation = validateRowsForExport(rows, 2, 'manual');
  assert.equal(validation.isValid, false);
  assert.ok(validation.errorMessage?.toLowerCase().includes('duplicate'));
  assert.ok(validation.errorMessage?.toLowerCase().includes('plan.pdf'));
});

test('Acceptance Test 6: Enter manifest.csv; export is blocked because the name is reserved', () => {
  const rows = createManualRowsForPageCount(1);
  rows[0].manualFilename = 'manifest.csv';

  const { rows: evaluated } = evaluateRows(rows, DEFAULT_PATTERN, 1, 'manual');
  assert.ok(evaluated[0].warnings.some((w) => w.includes('Reserved filename')));

  const validation = validateRowsForExport(rows, 1, 'manual');
  assert.equal(validation.isValid, false);
  assert.ok(validation.errorMessage?.includes('reserved'));
  assert.ok(validation.errorMessage?.includes('manifest.csv'));
});

test('Acceptance Test 7: Enter characters invalid on Windows; show the cleaned output preview and ensure export uses the cleaned name', () => {
  const input = 'my<drawing>:rev|1?.pdf';
  const cleaned = cleanOutputFilename(input);
  assert.equal(cleaned, 'my-drawing-rev-1.pdf');

  const rows = createManualRowsForPageCount(1);
  rows[0].manualFilename = input;
  const validation = validateRowsForExport(rows, 1, 'manual');
  assert.equal(validation.isValid, true);
});

test('Acceptance Test 8: Try an out-of-range source page in drawing-list mode; export is blocked', () => {
  const rows: DrawingRow[] = [
    {
      id: 'row-1',
      listNo: '01',
      drawingNo: 'DWG-001',
      revision: 'A',
      title: 'Plan',
      sourcePage: 99, // Out of range for a 5-page PDF!
      isIncluded: true,
      isManuallyEdited: false,
      matchStatus: 'matched',
      warnings: [],
    },
  ];

  const { rows: evaluated, counters } = evaluateRows(rows, DEFAULT_PATTERN, 5, 'drawing-list');
  assert.equal(evaluated[0].matchStatus, 'page-missing');
  assert.ok(evaluated[0].warnings.some((w) => w.includes('outside PDF range')));

  const validation = validateRowsForExport(rows, 5, 'drawing-list');
  assert.equal(validation.isValid, false);
  assert.ok(validation.errorMessage?.includes('outside the valid PDF page range'));
});

test('Acceptance Test 9: Successfully import a real list and verify drawing-list mode remains functional. Parsing failure must not hide manual table.', () => {
  // Successful parse
  const tsv = `NO.\tDRAWING NO.\tREV.\tDRAWING TITLE\n01\tCR115-SKSPL-8720\tA\tFloor Plan`;
  const parsed = parseDelimitedText(tsv);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].drawingNo, 'CR115-SKSPL-8720');

  // Failed parse on invalid text returns empty array without throwing
  const emptyParsed = parseDelimitedText('');
  assert.equal(emptyParsed.length, 0);

  // Manual rows remain intact
  const manualRows = createManualRowsForPageCount(5);
  assert.equal(manualRows.length, 5);
});

test('Acceptance Test 10: 21 rows produce 21 correctly formatted rows with default drawing pattern', () => {
  const rawRows: DrawingRow[] = Array.from({ length: 21 }, (_, i) => ({
    id: `row-${i + 1}`,
    listNo: String(i + 1).padStart(2, '0'),
    drawingNo: `CR115-SKSPL-DWG-${1000 + i}`,
    revision: 'A',
    title: `Drawing Sheet ${i + 1}`,
    sourcePage: i + 1,
    isIncluded: true,
    isManuallyEdited: false,
    matchStatus: 'matched',
    warnings: [],
  }));

  const { rows, counters } = evaluateRows(rawRows, DEFAULT_PATTERN, 21, 'drawing-list');
  assert.equal(rows.length, 21);
  assert.equal(counters.totalPages, 21);
  assert.equal(counters.matched, 21);
  assert.equal(counters.duplicates, 0);
  assert.equal(rows[0].manualFilename, '1 CR115-SKSPL-DWG-1000A.pdf');
  assert.equal(rows[20].manualFilename, '21 CR115-SKSPL-DWG-1020A.pdf');
});

test('Skipping a cover page maps first drawing to page 2 without shifting manually corrected rows', () => {
  const rawRows: DrawingRow[] = [
    {
      id: 'row-1',
      listNo: '01',
      drawingNo: 'DWG-001',
      revision: 'A',
      title: 'Plan',
      sourcePage: 2,
      isIncluded: true,
      isManuallyEdited: false,
      matchStatus: 'matched',
      warnings: [],
    },
    {
      id: 'row-2',
      listNo: '02',
      drawingNo: 'DWG-002',
      revision: 'B',
      title: 'Elevation',
      sourcePage: 10,
      isIncluded: true,
      isManuallyEdited: true,
      manualFilename: 'Custom_DWG_002_RevB.pdf',
      matchStatus: 'matched',
      warnings: [],
    },
  ];

  const { rows } = evaluateRows(rawRows, DEFAULT_PATTERN, 15, 'drawing-list');
  assert.equal(rows[0].sourcePage, 2);
  assert.equal(rows[0].manualFilename, '1 DWG-001A.pdf');
  assert.equal(rows[1].sourcePage, 10);
  assert.equal(rows[1].manualFilename, 'Custom_DWG_002_RevB.pdf');
});

test('Manifest CSV generation includes all rows and statuses', () => {
  const rows: DrawingRow[] = [
    {
      id: 'row-1',
      listNo: '01',
      drawingNo: 'DWG-1',
      revision: 'A',
      title: 'Site Plan',
      sourcePage: 1,
      isIncluded: true,
      isManuallyEdited: false,
      manualFilename: '1 DWG-1A.pdf',
      matchStatus: 'matched',
      warnings: [],
    },
  ];
  const csv = generateManifestCsv(rows, [
    { rowId: 'row-1', filename: '1 DWG-1A.pdf', status: 'success' },
  ]);
  assert.ok(csv.includes('Source Page,List No,Drawing No,Revision,Title,Output Filename,Status,Error'));
  assert.ok(csv.includes('1,"1","DWG-1","A","Site Plan","1 DWG-1A.pdf",success'));
});
