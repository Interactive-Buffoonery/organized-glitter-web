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
