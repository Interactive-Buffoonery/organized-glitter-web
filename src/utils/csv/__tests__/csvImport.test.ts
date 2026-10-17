import { describe, expect, it, vi } from 'vitest';

import { analyzeCSVFile } from '@/utils/csv/csvColumnAnalysis';
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

describe.each([
  { name: 'content', parse: parseCsvToProjects },
  {
    name: 'File',
    parse: (csv: string) =>
      parseCsvFileToProjects(new File([csv], 'aliases.csv', { type: 'text/csv' })),
  },
])('advertised aliases via $name', ({ parse }) => {
  const fields = [
    [
      'title',
      ['title', 'name', 'project name', 'project title', 'project_name', 'project_title'],
      'Canvas',
      'Canvas',
    ],
    ['status', ['status', 'state', 'project status', 'project_status'], 'completed', 'completed'],
    ['company', ['company', 'manufacturer', 'brand'], 'Brand', 'Brand'],
    ['artist', ['artist', 'creator', 'designer'], 'Artist', 'Artist'],
    ['width', ['width'], '30.5', 30.5],
    ['height', ['height', 'length'], '40.5', 40.5],
    ['drillShape', ['drill shape', 'shape', 'drill_shape'], 'square', 'square'],
    ['canvasType', ['canvas type', 'canvas', 'canvas_type'], 'full', 'full'],
    ['drillType', ['drill type', 'drilltype', 'drill_type'], 'resin', 'resin'],
    ['kitCategory', ['type of kit', 'kit category', 'category', 'kit_category'], 'mini', 'mini'],
    [
      'datePurchased',
      ['date purchased', 'date_purchased', 'purchase date', 'purchased'],
      '2025-01-02',
      '2025-01-02',
    ],
    [
      'dateReceived',
      ['date received', 'date_received', 'received date', 'received'],
      '2025-02-03',
      '2025-02-03',
    ],
    [
      'dateStarted',
      ['date started', 'date_started', 'start date', 'started'],
      '2025-03-04',
      '2025-03-04',
    ],
    [
      'dateCompleted',
      ['date completed', 'date_completed', 'completion date', 'completed'],
      '2025-04-05',
      '2025-04-05',
    ],
    ['generalNotes', ['notes', 'general notes', 'general_notes', 'description'], "'=note", '=note'],
    [
      'sourceUrl',
      ['source url', 'project url', 'url', 'source', 'link', 'source_url', 'project_url'],
      'https://example.test',
      'https://example.test',
    ],
    [
      'totalDiamonds',
      ['total diamonds', 'diamond count', 'diamonds', 'count', 'total_diamonds'],
      '12000',
      12000,
    ],
    [
      'colorCount',
      ['# of colors', 'number of colors', 'color count', 'colors', 'color_count'],
      '42',
      42,
    ],
    ['tagNames', ['tags', 'tag', 'labels'], 'first; second', ['first', 'second']],
  ] as const;

  for (const [field, aliases, value, expected] of fields) {
    it.each([...aliases])(`imports ${field} using %s`, async header => {
      const csv = field === 'title' ? `${header}\n${value}` : `Title,${header}\nCanvas,${value}`;
      const { projects } = await parse(csv);
      expect(projects).toHaveLength(1);
      expect(projects[0][field]).toEqual(expected);
    });
  }

  it('falls back from empty primary aliases and restores text formula guards', async () => {
    const { projects } = await parse("Title,project_name,Notes,description\n,Canvas,,'=note");
    expect(projects[0]).toMatchObject({ title: 'Canvas', generalNotes: '=note' });
  });

  it('agrees with analysis on competing source URL aliases', async () => {
    const csv = 'Title,url,source_url\nCanvas,https://other.test,https://preferred.test';
    const analysis = await analyzeCSVFile(new File([csv], 'urls.csv', { type: 'text/csv' }));
    const { projects } = await parse(csv);

    expect(
      analysis.duplicateMappings.find(mapping => mapping.field === 'sourceUrl')?.selectedHeader
    ).toBe('source_url');
    expect(projects[0].sourceUrl).toBe('https://preferred.test');
  });

  it('preserves fractional diamond count truncation', async () => {
    const { projects } = await parse('Title,Total Diamonds\nCanvas,12.5');
    expect(projects[0].totalDiamonds).toBe(12);
  });
});
