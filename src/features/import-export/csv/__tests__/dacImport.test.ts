import { describe, expect, it } from 'vitest';

import { parseCsvToProjects } from '@/utils/csv/csvImport';
import {
  hasDacCsvHeaders,
  markDacDuplicateProjects,
  parseDacCsvContent,
} from '@/features/import-export/csv/dacImport';

describe('DAC CSV import', () => {
  it('parses a DAC CSV with Products and Date headers', () => {
    const preview = parseDacCsvContent('Date,Products\n2024-05-10,Starry Fox\n');

    expect(preview.projectCount).toBe(1);
    expect(preview.projects[0]).toMatchObject({
      title: 'Starry Fox',
      company: 'Diamond Art Club',
      status: 'purchased',
      datePurchased: '2024-05-10',
    });
    expect(preview.note).toMatch(/does not include photo files/i);
  });

  it('splits multiple products in one DAC row without splitting comma-space titles', () => {
    const preview = parseDacCsvContent(
      'Date,Products\n2024-05-10,"First Kit,Second Kit, A Title With Comma"\n'
    );

    expect(preview.projects.map(project => project.title)).toEqual([
      'First Kit',
      'Second Kit, A Title With Comma',
    ]);
  });

  it('reports invalid DAC dates without dropping the product', () => {
    const preview = parseDacCsvContent('Date,Products\nnot-a-date,Starry Fox\n');

    expect(preview.projectCount).toBe(1);
    expect(preview.projects[0].datePurchased).toBeUndefined();
    expect(preview.warnings).toEqual([
      {
        row: 2,
        message: 'Could not parse "not-a-date" as an order date.',
      },
    ]);
  });

  it('marks duplicate DAC rows from the same file while keeping the first copy importable', () => {
    const preview = parseDacCsvContent(
      'Date,Products\n2024-05-10,Starry Fox\n2024-05-10,Starry Fox\n'
    );

    expect(preview.duplicateProjectCount).toBe(1);
    const projects = markDacDuplicateProjects(preview.projects, []);
    expect(projects[0].duplicateReason).toBeUndefined();
    expect(projects[1]).toMatchObject({
      title: 'Starry Fox',
      duplicateReason: 'same-file',
    });
  });

  it('marks DAC rows already present in the library as existing duplicates', () => {
    const preview = parseDacCsvContent('Date,Products\n2024-05-10,Starry Fox\n');

    expect(
      markDacDuplicateProjects(preview.projects, [
        {
          title: 'Starry Fox',
          company: 'Diamond Art Club',
          datePurchased: '2024-05-10',
        },
      ])
    ).toEqual([expect.objectContaining({ duplicateReason: 'existing-library' })]);
  });

  it('skips implausible one-letter DAC product values', () => {
    const preview = parseDacCsvContent('Date,Products\n2026/05/10,"S,S,S,S,S"\n');

    expect(preview.projectCount).toBe(0);
    expect(preview.skippedRowCount).toBe(1);
    expect(preview.warnings).toEqual([
      {
        row: 2,
        message: 'Ignored 5 invalid product values.',
      },
    ]);
  });

  it('rejects missing DAC headers', () => {
    expect(hasDacCsvHeaders(['Date', 'Name'])).toBe(false);
    expect(() => parseDacCsvContent('Date,Name\n2024-05-10,Starry Fox\n')).toThrow(
      /requires Products and Date columns/i
    );
  });

  it('does not break the existing Organized Glitter CSV parser', async () => {
    const result = await parseCsvToProjects(
      'Title,Company,Status,Tags\nPurple Sunset,Diamond Art Club,progress,"Fantasy; Nature"\n'
    );

    expect(result.projects).toHaveLength(1);
    expect(result.projects[0]).toMatchObject({
      title: 'Purple Sunset',
      company: 'Diamond Art Club',
      status: 'progress',
      tagNames: ['Fantasy', 'Nature'],
    });
  });
});
