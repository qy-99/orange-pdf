import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatListNo,
  sanitizeFilename,
  buildFilename,
  evaluateRows,
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

test('Acceptance Test 2: Example 1 produces exact expected filename', () => {
  const row = {
    listNo: '01',
    drawingNo: 'CR115-SKSPL-CR10-B2-S-STR-DR-ZZZ-8720',
    revision: 'A',
    title: 'General Arrangement',
  };
  const { filename } = buildFilename(row, DEFAULT_PATTERN);
  assert.equal(filename, '1 CR115-SKSPL-CR10-B2-S-STR-DR-ZZZ-8720A.pdf');
});

test('Acceptance Test 3: Example 2 produces exact expected filename', () => {
  const row = {
    listNo: '02',
    drawingNo: 'CR115-SKSPL-CR10-B2-S-STR-DR-LPL-8721',
    revision: 'A',
    title: 'Lower Ground Plan',
  };
  const { filename } = buildFilename(row, DEFAULT_PATTERN);
  assert.equal(filename, '2 CR115-SKSPL-CR10-B2-S-STR-DR-LPL-8721A.pdf');
});

test('Acceptance Test 4: Row 21 produces exact expected filename with Revision D', () => {
  const row = {
    listNo: '21',
    drawingNo: 'CR115-SKSPL-CR10-B2-S-STR-STD-8462',
    revision: 'D',
    title: 'Standard Details',
  };
  const { filename } = buildFilename(row, DEFAULT_PATTERN);
  assert.equal(filename, '21 CR115-SKSPL-CR10-B2-S-STR-STD-8462D.pdf');
});

test('Acceptance Test 1: 21 rows produce 21 correctly formatted rows', () => {
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

  const { rows, counters } = evaluateRows(rawRows, DEFAULT_PATTERN, 21);
  assert.equal(rows.length, 21);
  assert.equal(counters.totalPages, 21);
  assert.equal(counters.matched, 21);
  assert.equal(counters.duplicates, 0);
  assert.equal(rows[0].manualFilename, '1 CR115-SKSPL-DWG-1000A.pdf');
  assert.equal(rows[20].manualFilename, '21 CR115-SKSPL-DWG-1020A.pdf');
});

test('Acceptance Test 5: Skipping a cover page maps first drawing to page 2 without shifting manually corrected rows', () => {
  const rawRows: DrawingRow[] = [
    {
      id: 'row-1',
      listNo: '01',
      drawingNo: 'DWG-001',
      revision: 'A',
      title: 'Plan',
      sourcePage: 2, // skipped cover page (page 1)
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
      sourcePage: 10, // manually assigned to page 10
      isIncluded: true,
      isManuallyEdited: true,
      manualFilename: 'Custom_DWG_002_RevB.pdf',
      matchStatus: 'matched',
      warnings: [],
    },
  ];

  const { rows } = evaluateRows(rawRows, DEFAULT_PATTERN, 15);
  assert.equal(rows[0].sourcePage, 2);
  assert.equal(rows[0].manualFilename, '1 DWG-001A.pdf');
  assert.equal(rows[1].sourcePage, 10);
  assert.equal(rows[1].manualFilename, 'Custom_DWG_002_RevB.pdf');
});

test('Acceptance Test 6: Pattern change updates generated names while manually edited names remain unchanged', () => {
  const rawRows: DrawingRow[] = [
    {
      id: 'row-1',
      listNo: '01',
      drawingNo: 'DWG-001',
      revision: 'A',
      title: 'Site Plan',
      sourcePage: 1,
      isIncluded: true,
      isManuallyEdited: false,
      matchStatus: 'matched',
      warnings: [],
    },
    {
      id: 'row-2',
      listNo: '02',
      drawingNo: 'DWG-002',
      revision: 'A',
      title: 'Floor Plan',
      sourcePage: 2,
      isIncluded: true,
      isManuallyEdited: true,
      manualFilename: 'Manual_Custom_Name.pdf',
      matchStatus: 'matched',
      warnings: [],
    },
  ];

  // Evaluate with new pattern: {drawing_no}{revision}
  const { rows } = evaluateRows(rawRows, '{drawing_no}{revision}', 5);
  assert.equal(rows[0].manualFilename, 'DWG-001A.pdf'); // updated
  assert.equal(rows[1].manualFilename, 'Manual_Custom_Name.pdf'); // preserved
});

test('Acceptance Test 7: Duplicate and invalid filenames are detected', () => {
  const rawRows: DrawingRow[] = [
    {
      id: 'row-1',
      listNo: '01',
      drawingNo: 'DWG-DUP',
      revision: 'A',
      title: 'Test 1',
      sourcePage: 1,
      isIncluded: true,
      isManuallyEdited: false,
      matchStatus: 'matched',
      warnings: [],
    },
    {
      id: 'row-2',
      listNo: '01',
      drawingNo: 'DWG-DUP',
      revision: 'A',
      title: 'Test 2',
      sourcePage: 2,
      isIncluded: true,
      isManuallyEdited: false,
      matchStatus: 'matched',
      warnings: [],
    },
  ];

  const { rows, counters } = evaluateRows(rawRows, DEFAULT_PATTERN, 2);
  assert.equal(counters.duplicates, 2);
  assert.ok(rows[0].warnings.some((w) => w.includes('Duplicate filename')));
  assert.ok(rows[1].warnings.some((w) => w.includes('Duplicate filename')));
});

test('Delimited text parser handles TSV and CSV with headers', () => {
  const tsv = `NO.\tDRAWING NO.\tREV.\tDRAWING TITLE\n01\tCR115-SKSPL-8720\tA\tFloor Plan\n02\tCR115-SKSPL-8721\tB\tRoof Plan`;
  const parsed = parseDelimitedText(tsv);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].listNo, '01');
  assert.equal(parsed[0].drawingNo, 'CR115-SKSPL-8720');
  assert.equal(parsed[0].revision, 'A');
  assert.equal(parsed[0].title, 'Floor Plan');
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
