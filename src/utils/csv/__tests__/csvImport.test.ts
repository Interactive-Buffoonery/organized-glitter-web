import { describe, expect, it } from 'vitest';
import {
  findLibraryMatches,
  parseCsvFileToProjects,
  parseCsvToProjects,
} from '@/utils/csv/csvImport';

describe.each([
  { name: 'CSV content', parse: parseCsvToProjects },
  {
    name: 'CSV file',
    parse: (csv: string) =>
      parseCsvFileToProjects(new File([csv], 'dimensions.csv', { type: 'text/csv' })),
  },
])('combined dimensions from $name', ({ parse }) => {
  it.each([
    ['30.5 x 40.5', 30.5, 40.5],
    ['30.25X40.75', 30.25, 40.75],
    ['30x40.5', 30, 40.5],
    ['30.5 x 40', 30.5, 40],
  ])('preserves complete decimal values in %s', async (dimensions, width, height) => {
    const { projects } = await parse(`Title,Dimensions\nDecimal canvas,${dimensions}`);

    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({ width, height });
  });

  it.each(['30x40', '30 x 40', '30X40', '  30  X  40  '])(
    'preserves the supported integer format %s',
    async dimensions => {
      const { projects } = await parse(`Title,Dimensions\nInteger canvas,${dimensions}`);

      expect(projects).toHaveLength(1);
      expect(projects[0]).toMatchObject({ width: 30, height: 40 });
    }
  );

  it.each([
    ['30.25,40.75', { width: 30.25, height: 40.75 }],
    ['30.25,', { width: 30.25 }],
    [',40.75', { height: 40.75 }],
  ])('preserves separate dimension columns %s', async (columns, dimensions) => {
    const { projects } = await parse(
      `Title,Width,Height,Dimensions\nSeparate canvas,${columns},50.5 x 60.5`
    );

    expect(projects).toHaveLength(1);
    expect(projects[0].width).toBe(dimensions.width);
    expect(projects[0].height).toBe(dimensions.height);
  });
});

describe('CSV import serializers', () => {
  it('restores doubled apostrophes as a literal leading apostrophe', async () => {
    const csv = ['Title,General Notes', "''=literal,''Plain"].join('\n');

    const { projects } = await parseCsvToProjects(csv);

    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({
      title: "'=literal",
      generalNotes: "'Plain",
    });
  });
});

describe.each([
  { name: 'CSV content', parse: parseCsvToProjects },
  {
    name: 'CSV file',
    parse: (csv: string) =>
      parseCsvFileToProjects(new File([csv], 'dates.csv', { type: 'text/csv' })),
  },
])('invalid dates from $name', ({ parse }) => {
  it('keeps unparseable date cells and the CSV row for validation', async () => {
    const csv = [
      'Title,Date Purchased,Date Received,Date Started,Date Completed',
      ',2025-01-01,,,',
      'Good kit,2025-10-26,,,',
      'Bad kit,2026-02-30,not a date,2026-13-01,2025-04-31',
    ].join('\n');

    const { projects } = await parse(csv);

    expect(projects).toHaveLength(2);
    expect(projects[0]).toMatchObject({ csvRow: 3, datePurchased: '2025-10-26' });
    expect(projects[1]).toMatchObject({
      csvRow: 4,
      title: 'Bad kit',
      datePurchased: '2026-02-30',
      dateReceived: 'not a date',
      dateStarted: '2026-13-01',
      dateCompleted: '2025-04-31',
    });
  });
});

describe.each([
  { name: 'CSV content', parse: parseCsvToProjects },
  {
    name: 'CSV file',
    parse: (csv: string) =>
      parseCsvFileToProjects(new File([csv], 'lines.csv', { type: 'text/csv' })),
  },
])('CSV record lines from $name', ({ parse }) => {
  it.each(['\n', '\r\n', '\r'])(
    'reports the physical start line of each record (%j)',
    async newline => {
      const csv = [
        'Title,Notes,Date Purchased',
        'Kit A,,2026-02-30',
        '',
        'Kit B,"first line',
        'second line",2026-02-30',
        'Kit C,,2026-02-30',
      ].join(newline);

      const { projects } = await parse(csv);

      expect(projects.map(project => [project.title, project.csvRow])).toEqual([
        ['Kit A', 2],
        ['Kit B', 4],
        ['Kit C', 6],
      ]);
    }
  );
});

describe('CSV calendar dates', () => {
  it.each([
    ['2/30/26', '2026-02-30'],
    ['2026-02-30T00:00:00.000Z', '2026-02-30'],
    ['2/29/24', '2024-02-29'],
    ['2024-02-29T00:00:00.000Z', '2024-02-29'],
    ['12/5/2025', '2025-12-05'],
    ['2024-02-29T23:30:00-05:00', '2024-02-29'],
    ['2/30/2026 12:00 AM', '2026-02-30'],
    ['2/29/2024 11:59 PM', '2024-02-29'],
    ['Feb 29, 2024', '2024-02-29'],
    ['February 29, 2024', '2024-02-29'],
    ['29-Feb-24', '2024-02-29'],
    ['Feb 30, 2026', '2026-02-30'],
    ['30-Feb-26', '2026-02-30'],
    ['2024/02/29', '2024-02-29'],
    ['2026/02/30', '2026-02-30'],
    ['2024-02-29T24:00:00Z', '2024-02-29'],
    ['Feb 29, 2024 23:59:00 GMT', '2024-02-29'],
    ['Feb 30, 2026 3:02 PM', '2026-02-30'],
    ['2026/02/30 03:02:00', '2026-02-30'],
  ])('keeps the written calendar day of %s', async (cell, expected) => {
    const { projects } = await parseCsvToProjects(`Title,Date Purchased\nKit,"${cell}"`);

    expect(projects[0].datePurchased).toBe(expected);
  });
});

describe('CSV dates that cannot be read safely', () => {
  it.each([
    '2024-02-29Tgarbage',
    '2024-02-29T25:00:00Z',
    '2024-02-29T1:00:00Z',
    '2024-02-29T24:00:01Z',
    '2/29/2024 13:00 PM',
    'Febtober 3, 2024',
  ])('keeps %s for a validation note', async cell => {
    const { projects } = await parseCsvToProjects(`Title,Date Purchased\nKit,"${cell}"`);

    expect(projects[0].datePurchased).toBe(cell);
  });
});

describe('UTF-16 CSV files', () => {
  const encode = (text: string, bigEndian: boolean) => {
    const bytes = [bigEndian ? 0xfe : 0xff, bigEndian ? 0xff : 0xfe];
    for (const char of text) {
      const code = char.charCodeAt(0);
      bytes.push(...(bigEndian ? [code >> 8, code & 0xff] : [code & 0xff, code >> 8]));
    }
    return new Uint8Array(bytes);
  };

  it.each([false, true])('reads a byte order mark (big endian: %s)', async bigEndian => {
    const file = new File(
      [encode('Title,Date Purchased\r\nKit é,2024-02-29\r\n', bigEndian)],
      'utf16.csv'
    );

    const { projects } = await parseCsvFileToProjects(file);

    expect(projects).toEqual([
      expect.objectContaining({ title: 'Kit é', datePurchased: '2024-02-29', csvRow: 2 }),
    ]);
  });
});

describe('library matching', () => {
  const kit = { title: 'Galaxy Cat', company: 'Acme' };

  it.each([
    ['width', { width: 30 }, { width: 40 }],
    ['height', { height: 30 }, { height: 40 }],
    ['drill shape', { drillShape: 'round' }, { drillShape: 'square' }],
    ['product URL', { sourceUrl: 'https://a.test/1' }, { sourceUrl: 'https://a.test/2' }],
    ['purchase date', { datePurchased: '2024-01-05' }, { datePurchased: '2025-03-09' }],
  ])('treats a conflicting %s as a different kit', (_, row, library) => {
    expect(findLibraryMatches([{ ...kit, ...row }], [{ ...kit, ...library }])).toEqual([false]);
  });

  it('ignores a field that is blank on either side', () => {
    const detailed = { width: 30, drillShape: 'round', datePurchased: '2024-01-05' };
    expect(
      findLibraryMatches(
        [{ ...kit, ...detailed }, kit],
        [kit, { ...kit, ...detailed, datePurchased: '2024-01-05 00:00:00.000Z' }]
      )
    ).toEqual([true, true]);
  });

  it('gives each library kit to the row whose details fit it', () => {
    const library = [
      { ...kit, datePurchased: '2024-01-05' },
      { ...kit, datePurchased: '2025-03-09' },
    ];
    expect(findLibraryMatches([kit, { ...kit, datePurchased: '2024-01-05' }], library)).toEqual([
      true,
      true,
    ]);
  });

  it('keeps one library kit to one row', () => {
    expect(findLibraryMatches([kit, kit, kit], [kit])).toEqual([true, false, false]);
  });

  it('does not merge title and company across a pipe', () => {
    expect(
      findLibraryMatches(
        [{ title: 'Moon|Fox', company: 'Acme' }],
        [{ title: 'Moon', company: 'Fox|Acme' }]
      )
    ).toEqual([false]);
  });

  it('checks the original title before the shortened one, using one kit per row', () => {
    const fullTitle = 'x'.repeat(220);
    const shortTitle = `${'x'.repeat(197)}...`;
    const row = { title: shortTitle, originalTitle: fullTitle };

    expect(findLibraryMatches([row, row], [{ title: fullTitle }, { title: shortTitle }])).toEqual([
      true,
      true,
    ]);
    expect(
      findLibraryMatches(
        [row, { title: shortTitle, originalTitle: shortTitle }],
        [{ title: fullTitle }, { title: shortTitle }]
      )
    ).toEqual([true, true]);
    expect(
      findLibraryMatches([row, row, row], [{ title: fullTitle }, { title: shortTitle }])
    ).toEqual([true, true, false]);
  });

  it('compares a stored purchase timestamp by its day', () => {
    const library = [{ ...kit, datePurchased: '2024-01-05 00:00:00.000Z' }];
    expect(findLibraryMatches([{ ...kit, datePurchased: '2024-01-05' }], library)).toEqual([true]);
    expect(findLibraryMatches([{ ...kit, datePurchased: '2024-01-06' }], library)).toEqual([false]);
  });

  it('allows a tenth of a centimeter between sizes', () => {
    const library = [{ ...kit, width: 25.4, height: 50.8 }];
    expect(findLibraryMatches([{ ...kit, width: 25.45, height: 50.8 }], library)).toEqual([true]);
    expect(findLibraryMatches([{ ...kit, width: 25.6, height: 50.8 }], library)).toEqual([false]);
  });

  it.each([
    ['HTTPS://Shop.Example.com:443/kits/cat/', 'https://shop.example.com/kits/cat'],
    ['https://shop.example.com/kits/cat?size=30', 'https://shop.example.com/kits/cat?size=30'],
  ])('treats %s as the same product URL as %s', (rowUrl, libraryUrl) => {
    expect(
      findLibraryMatches([{ ...kit, sourceUrl: rowUrl }], [{ ...kit, sourceUrl: libraryUrl }])
    ).toEqual([true]);
  });

  it.each([
    ['https://shop.example.com/kits/cat', 'https://shop.example.com/kits/dog'],
    ['https://shop.example.com/kits/cat?size=30', 'https://shop.example.com/kits/cat?size=40'],
    ['https://shop.example.com/Kits/cat', 'https://shop.example.com/kits/cat'],
    ['not a url', 'Not A URL'],
  ])('keeps %s and %s as different product URLs', (rowUrl, libraryUrl) => {
    expect(
      findLibraryMatches([{ ...kit, sourceUrl: rowUrl }], [{ ...kit, sourceUrl: libraryUrl }])
    ).toEqual([false]);
  });
});

describe('dimension units', () => {
  it.each([
    ['Title,Dimensions\nKit,30x40 in\n', 76.2, 101.6],
    ['Title,Dimensions\nKit,10 x 20 inches\n', 25.4, 50.8],
    ['Title,Dimensions\nKit,10" x 20"\n', 25.4, 50.8],
    ['Title,Dimensions\nKit,30x40 cm\n', 30, 40],
    ['Title,Dimensions\nKit,30x40\n', 30, 40],
    ['Title,Width,Height\nKit,10 inch,20 in\n', 25.4, 50.8],
    ['Title,Width,Height\nKit,30,40\n', 30, 40],
  ])('reads %j as centimeters', async (csv, width, height) => {
    const {
      projects: [project],
    } = await parseCsvToProjects(csv);
    expect(project.width).toBeCloseTo(width, 5);
    expect(project.height).toBeCloseTo(height, 5);
  });

  it('keeps inch sizes apart from the same numbers in centimeters', async () => {
    const {
      projects: [inches],
    } = await parseCsvToProjects('Title,Dimensions\nKit,30x40 in\n');
    const {
      projects: [converted],
    } = await parseCsvToProjects('Title,Dimensions\nKit,10x20 in\n');

    expect(findLibraryMatches([inches], [{ title: 'Kit', width: 30, height: 40 }])).toEqual([
      false,
    ]);
    expect(findLibraryMatches([converted], [{ title: 'Kit', width: 25.4, height: 50.8 }])).toEqual([
      true,
    ]);
  });
});
