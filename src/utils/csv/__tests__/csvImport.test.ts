import { describe, expect, it, vi } from 'vitest';

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
    '30.5.2 x 40.5',
    '30.5 x 40.5.2',
    '-30 x 40',
    '30 x -40',
    '+30 x 40',
    '30 x 40 cm',
    'canvas 30 x 40',
    '30 x 40 x 50',
    '30. x 40',
    '30 x 40.',
    '30 xx 40',
    '30 x',
    'x 40',
  ])('leaves malformed dimensions unset for %s', async dimensions => {
    const { projects } = await parse(`Title,Dimensions\nMalformed canvas,${dimensions}`);

    expect(projects).toHaveLength(1);
    expect(projects[0].width).toBeUndefined();
    expect(projects[0].height).toBeUndefined();
  });

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
  it('restores app-exported formula guards for text fields', async () => {
    const csv = [
      'Title,Company,Artist,Drill Shape,Canvas Type,Drill Type,General Notes,Source URL,Tags',
      '"\'=HYPERLINK(""http://evil"",""x"")",\'+Company,\'@Artist,\'＝Round,\'＋Canvas,\'－Drill,\'@note,\'=https://example.test,\'=first; @second',
    ].join('\n');

    const { projects, allUniqueTagNames } = await parseCsvToProjects(csv);

    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({
      title: '=HYPERLINK("http://evil","x")',
      company: '+Company',
      artist: '@Artist',
      drillShape: '＝Round',
      canvasType: '＋Canvas',
      drillType: '－Drill',
      generalNotes: '@note',
      sourceUrl: '=https://example.test',
      tagNames: ['=first', '@second'],
    });
    expect(allUniqueTagNames).toEqual(['=first', '@second']);
  });

  it('restores doubled apostrophes as a literal leading apostrophe', async () => {
    const csv = ['Title,General Notes', "''=literal,''Plain"].join('\n');

    const { projects } = await parseCsvToProjects(csv);

    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({
      title: "'=literal",
      generalNotes: "'Plain",
    });
  });

  it('does not restore formula guards before numeric parsing', async () => {
    const csv = [
      'Title,Width,Height,Total Diamonds,# of Colors',
      "Numeric Guard,'-10,'-20,'-5,'-3",
    ].join('\n');

    const { projects } = await parseCsvToProjects(csv);

    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({ title: 'Numeric Guard' });
    expect(projects[0].width).toBeUndefined();
    expect(projects[0].height).toBeUndefined();
    expect(projects[0].totalDiamonds).toBeUndefined();
    expect(projects[0].colorCount).toBeUndefined();
  });
});

describe.each([
  { name: 'CSV content', parse: parseCsvToProjects },
  {
    name: 'CSV file',
    parse: (csv: string, onProgress?: (progress: number) => void) =>
      parseCsvFileToProjects(new File([csv], 'projects.csv', { type: 'text/csv' }), onProgress),
  },
])('CSV normalization and progress from $name', ({ parse }) => {
  it.each([
    ['done', 'completed'],
    ['finished', 'completed'],
    ['complete', 'completed'],
    ['bought', 'purchased'],
    ['owned', 'stash'],
    ['in_progress', 'progress'],
    ['  DONE  ', 'completed'],
  ])('normalizes the supported status alias %s', async (alias, status) => {
    const { projects } = await parse(`Title,Status\nProject,${alias}`);
    expect(projects[0].status).toBe(status);
  });

  it('preserves every project and tag while reporting real Papa Parse progress', async () => {
    const csv = [
      'Title,Status,Tags',
      ...Array.from({ length: 101 }, (_, index) => `Project ${index},stash,Tag ${index % 3}`),
    ].join('\n');
    const onProgress = vi.fn();
    const expected = await parse(csv);
    const actual = await parse(csv, onProgress);

    expect(actual).toEqual(expected);
    expect(actual.projects).toHaveLength(101);
    expect(actual.allUniqueTagNames).toEqual(['Tag 0', 'Tag 1', 'Tag 2']);
    const progress = onProgress.mock.calls.map(([value]) => value as number);
    expect(progress.length).toBeGreaterThan(1);
    expect(progress.at(-1)).toBe(100);
    expect(progress.every(value => value >= 0 && value <= 100)).toBe(true);
    expect(progress.every((value, index) => index === 0 || value >= progress[index - 1])).toBe(
      true
    );
  });
});
