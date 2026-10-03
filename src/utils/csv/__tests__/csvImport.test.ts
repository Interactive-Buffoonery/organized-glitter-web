import { describe, expect, it } from 'vitest';

import { parseCsvToProjects } from '@/utils/csv/csvImport';

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
