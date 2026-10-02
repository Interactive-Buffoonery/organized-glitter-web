import { describe, expect, it } from 'vitest';

import {
  buildColoringPageCsvRows,
  coloringBooksToCsv,
  coloringPagesToCsv,
  escapeCsvField,
} from '@/utils/csv/csvExport';

describe('CSV export serializers', () => {
  it('escapes commas, quotes, and newlines consistently', () => {
    expect(escapeCsvField('Plain value')).toBe('Plain value');
    expect(escapeCsvField('Publisher, Inc.')).toBe('"Publisher, Inc."');
    expect(escapeCsvField('The "Best" Book')).toBe('"The ""Best"" Book"');
    expect(escapeCsvField('Line one\nLine two')).toBe('"Line one\nLine two"');
  });

  it('neutralizes spreadsheet formula injection with a leading apostrophe', () => {
    expect(escapeCsvField('=HYPERLINK("http://evil","x")')).toBe(
      '"\'=HYPERLINK(""http://evil"",""x"")"'
    );
    expect(escapeCsvField('+1234')).toBe("'+1234");
    expect(escapeCsvField('@SUM(A1:A9)')).toBe("'@SUM(A1:A9)");
    expect(escapeCsvField('\tleading tab')).toBe("'\tleading tab");
    expect(escapeCsvField('\rleading cr')).toBe('"\'\rleading cr"');
    expect(escapeCsvField('\nleading lf')).toBe('"\'\nleading lf"');
    expect(escapeCsvField('＝SUM(A1:A9)')).toBe("'＝SUM(A1:A9)");
    expect(escapeCsvField('＋SUM(A1:A9)')).toBe("'＋SUM(A1:A9)");
    expect(escapeCsvField('－SUM(A1:A9)')).toBe("'－SUM(A1:A9)");
    expect(escapeCsvField('＠SUM(A1:A9)')).toBe("'＠SUM(A1:A9)");
  });

  it('applies both apostrophe and quoting when a formula trigger needs escaping', () => {
    expect(escapeCsvField('=a,b')).toBe('"\'=a,b"');
  });

  it('prefixes negative numbers since numeric columns never import as negatives', () => {
    expect(escapeCsvField('-5')).toBe("'-5");
    expect(escapeCsvField('-2+3')).toBe("'-2+3");
    expect(escapeCsvField(-5)).toBe("'-5");
  });

  it('doubles leading apostrophes so text values round-trip through import', () => {
    expect(escapeCsvField("'=SUM(A1:A2)")).toBe("''=SUM(A1:A2)");
    expect(escapeCsvField("'Plain")).toBe("''Plain");
  });

  it('leaves safe values and null/undefined untouched', () => {
    expect(escapeCsvField('Plain value')).toBe('Plain value');
    expect(escapeCsvField('user@example.com is fine mid-string')).toBe(
      'user@example.com is fine mid-string'
    );
    expect(escapeCsvField(42)).toBe('42');
    expect(escapeCsvField(null)).toBe('');
    expect(escapeCsvField(undefined)).toBe('');
  });

  it('serializes coloring books with tags and empty optional fields', () => {
    const csv = coloringBooksToCsv([
      {
        title: 'Botanical Worlds',
        publisherName: 'Press, Inc.',
        illustratorName: 'Avery "Ink" Lane',
        series: 'Volume 1',
        theme: 'Flowers',
        isbn: '9780000000000',
        totalPages: 42,
        status: 'in_progress',
        datePurchased: '2026-05-01',
        dateStarted: '2026-05-02',
        dateCompleted: '',
        tags: [{ name: 'botanical' }, { name: 'mystery, reveal' }],
      },
      {
        title: 'Minimal Book',
      },
    ]);

    expect(csv).toContain(
      '"Press, Inc.","Avery ""Ink"" Lane",Volume 1,Flowers,9780000000000,42,in_progress'
    );
    expect(csv).toContain('"botanical; mystery, reveal"');
    expect(csv.split('\n').at(-1)).toBe(`Minimal Book${','.repeat(11)}`);
  });

  it('builds coloring page rows with medium names, photo counts, and progress note counts', () => {
    const rows = buildColoringPageCsvRows({
      books: [
        {
          id: 'book-1',
          title: 'Botanical Worlds',
          publisherName: 'Press House',
          illustratorName: 'Avery Lane',
        },
      ],
      pagesByBookId: {
        'book-1': [
          {
            id: 'page-1',
            bookId: 'book-1',
            pageNumber: 7,
            status: 'completed',
            mediumIds: ['medium-1', 'missing-medium'],
            photos: ['front.jpg', 'detail.jpg'],
            revealedSubject: 'Rose garden',
            revealedAt: '2026-05-17T16:20:00.000Z',
            startedAt: '2026-05-01',
            completedAt: '2026-05-03',
          },
        ],
      },
      coloringMediums: [{ id: 'medium-1', name: 'Prismacolor Premier' }],
      coloringPageProgressNotes: [{ pageId: 'page-1' }, { pageId: 'page-1' }],
    });

    expect(rows).toEqual([
      {
        bookTitle: 'Botanical Worlds',
        publisherName: 'Press House',
        illustratorName: 'Avery Lane',
        pageNumber: 7,
        status: 'completed',
        mediumNames: ['Prismacolor Premier', 'missing-medium'],
        revealedSubject: 'Rose garden',
        revealedAt: '2026-05-17T16:20:00.000Z',
        startedAt: '2026-05-01',
        completedAt: '2026-05-03',
        photoCount: 2,
        progressNoteCount: 2,
      },
    ]);
  });

  it('serializes coloring pages with escaping and count columns', () => {
    const csv = coloringPagesToCsv([
      {
        bookTitle: 'Book, "One"',
        publisherName: 'Press House',
        illustratorName: 'Avery Lane',
        pageNumber: 12,
        status: 'in_progress',
        mediumNames: ['Marker, red', 'Gel "Pen"'],
        revealedSubject: 'Dragon\nMoon',
        revealedAt: '2026-05-17T16:20:00.000Z',
        startedAt: '',
        completedAt: '',
        photoCount: 3,
        progressNoteCount: 2,
      },
    ]);

    expect(csv).toContain(
      'Book Title,Publisher,Illustrator,Page Number,Status,Mediums,Revealed Subject,Revealed At,Started At,Completed At,Photo Count,Progress Note Count'
    );
    expect(csv).toContain('"Book, ""One"""');
    expect(csv).toContain('"Marker, red; Gel ""Pen"""');
    expect(csv).toContain('"Dragon\nMoon"');
    expect(csv).toContain(',2026-05-17,,,3,2');
  });
});
