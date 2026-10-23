import { describe, expect, it } from 'vitest';

import {
  hasDacCsvHeaders,
  markDacDuplicateProjects,
  parseDacCsvContent,
} from '@/features/import-export/csv/dacImport';
import { parseCsvToProjects } from '@/utils/csv/csvImport';

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
