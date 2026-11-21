import { describe, expect, it } from 'vitest';
import { parseCsvFileToProjects, parseCsvToProjects } from '@/utils/csv/csvImport';

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
  ])('keeps the written calendar day of %s', async (cell, expected) => {
    const { projects } = await parseCsvToProjects(`Title,Date Purchased\nKit,${cell}`);

    expect(projects[0].datePurchased).toBe(expected);
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
