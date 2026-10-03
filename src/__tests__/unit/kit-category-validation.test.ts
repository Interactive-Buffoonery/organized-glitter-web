/**
 * Tests for kit category validation and CSV import parsing.
 * Covers the consolidated validateKitCategoryValue function
 * and end-to-end CSV parsing of kit_category values.
 */

import { describe, it, expect } from 'vitest';
import { validateKitCategoryValue, normalizeKitCategory } from '@/utils/csv/csvValidation';
import { parseCsvToProjects } from '@/utils/csv/csvImport';
import { projectsToCsv } from '@/utils/csv/csvExport';

// ─── validateKitCategoryValue (unit) ───────────────────────────────

describe('validateKitCategoryValue', () => {
  it('returns exact matches for "full" and "mini"', () => {
    expect(validateKitCategoryValue('full')).toBe('full');
    expect(validateKitCategoryValue('mini')).toBe('mini');
  });

  it('normalizes full and mini case variations to their lowercase canonical values', () => {
    expect(validateKitCategoryValue('Full')).toBe('full');
    expect(validateKitCategoryValue('FULL')).toBe('full');
    expect(validateKitCategoryValue('Mini')).toBe('mini');
    expect(validateKitCategoryValue('MINI')).toBe('mini');
  });

  it('maps full-kit aliases to "full"', () => {
    const fullAliases = [
      'full drill',
      'full-drill',
      'full sized',
      'full sized kit',
      'full_sized_kit',
      'full coverage',
      'full size',
      'large',
      'big',
    ];

    for (const alias of fullAliases) {
      expect(validateKitCategoryValue(alias)).toBe('full');
    }
  });

  it('maps full-kit aliases with mixed case to "full"', () => {
    expect(validateKitCategoryValue('Full Sized Kit')).toBe('full');
    expect(validateKitCategoryValue('LARGE')).toBe('full');
    expect(validateKitCategoryValue('Full Coverage')).toBe('full');
  });

  it('maps mini-kit aliases to "mini"', () => {
    const miniAliases = ['mini kit', 'mini_kit', 'partial', 'small', 'tiny'];

    for (const alias of miniAliases) {
      expect(validateKitCategoryValue(alias)).toBe('mini');
    }
  });

  it('maps mini-kit aliases with mixed case to "mini"', () => {
    expect(validateKitCategoryValue('Partial')).toBe('mini');
    expect(validateKitCategoryValue('SMALL')).toBe('mini');
    expect(validateKitCategoryValue('Tiny')).toBe('mini');
  });

  it('returns undefined for null, undefined, and empty string', () => {
    expect(validateKitCategoryValue(null)).toBeUndefined();
    expect(validateKitCategoryValue(undefined)).toBeUndefined();
    expect(validateKitCategoryValue('')).toBeUndefined();
  });

  it('returns undefined for unrecognized values', () => {
    expect(validateKitCategoryValue('gobbledygook')).toBeUndefined();
    expect(validateKitCategoryValue('extra large')).toBeUndefined();
    expect(validateKitCategoryValue('medium')).toBeUndefined();
  });

  it('trims whitespace before matching', () => {
    expect(validateKitCategoryValue('  full  ')).toBe('full');
    expect(validateKitCategoryValue(' mini ')).toBe('mini');
    expect(validateKitCategoryValue('  large ')).toBe('full');
  });
});

// ─── normalizeKitCategory (validation pipeline) ────────────────────

describe('normalizeKitCategory', () => {
  it('defaults to "full" when value is null or undefined', () => {
    expect(normalizeKitCategory(null).normalized).toBe('full');
    expect(normalizeKitCategory(undefined).normalized).toBe('full');
  });

  it('returns no issue when value is already the canonical form', () => {
    const result = normalizeKitCategory('full');
    expect(result.normalized).toBe('full');
    expect(result.issue).toBeUndefined();
  });

  it('returns an issue when value was normalized from an alias', () => {
    const result = normalizeKitCategory('Full Sized Kit');
    expect(result.normalized).toBe('full');
    expect(result.issue).toBeDefined();
    expect(result.issue!.field).toBe('kit_category');
    expect(result.issue!.originalValue).toBe('Full Sized Kit');
    expect(result.issue!.correctedValue).toBe('full');
  });

  it('returns "full" with a warning issue for unrecognized values', () => {
    const result = normalizeKitCategory('gobbledygook');
    expect(result.normalized).toBe('full');
    expect(result.issue).toBeDefined();
    expect(result.issue!.severity).toBe('warning');
  });
});

// ─── parseCsvToProjects (end-to-end CSV import) ────────────────────

describe('parseCsvToProjects – kit category handling', () => {
  const testCsv = [
    'Title,Status,Company,Width,Height,Drill Shape,Total Diamonds,Type of Kit,Tags',
    'Exact Full,stash,TestCo,40,50,round,45000,full,',
    'Exact Mini,wishlist,TestCo,30,30,square,20000,mini,',
    'Capitalized Full,progress,TestCo,60,80,round,120000,Full,',
    'All Caps Mini,purchased,TestCo,40,55,square,50000,MINI,',
    'Full Sized Alias,stash,TestCo,50,70,round,80000,full sized,',
    'Large Alias,wishlist,TestCo,80,100,square,200000,large,',
    'Small Alias,wishlist,TestCo,20,20,round,10000,small,',
    'Partial Alias,purchased,TestCo,45,60,round,60000,partial,',
    'Tiny Alias,progress,TestCo,40,50,round,45000,tiny,',
    'Full Drill Alias,wishlist,TestCo,30,40,round,28000,full-drill,',
    'Mini Kit Alias,stash,TestCo,35,50,round,40000,mini kit,',
    'Underscore Alias,purchased,TestCo,50,65,square,75000,full_sized_kit,',
    'Full Coverage Alias,wishlist,TestCo,25,35,round,20000,full coverage,',
    'Empty Category,stash,TestCo,60,80,round,110000,,',
    'Invalid Category,wishlist,TestCo,70,90,square,150000,gobbledygook,',
  ].join('\n');

  it('parses all rows successfully', async () => {
    const result = await parseCsvToProjects(testCsv);
    expect(result.projects).toHaveLength(15);
  });

  it('maps exact "full" and "mini" values correctly', async () => {
    const { projects } = await parseCsvToProjects(testCsv);
    const byTitle = (t: string) => projects.find(p => p.title === t);

    expect(byTitle('Exact Full')?.kitCategory).toBe('full');
    expect(byTitle('Exact Mini')?.kitCategory).toBe('mini');
  });

  it('normalizes case variations', async () => {
    const { projects } = await parseCsvToProjects(testCsv);
    const byTitle = (t: string) => projects.find(p => p.title === t);

    expect(byTitle('Capitalized Full')?.kitCategory).toBe('full');
    expect(byTitle('All Caps Mini')?.kitCategory).toBe('mini');
  });

  it('resolves all full-kit aliases to "full"', async () => {
    const { projects } = await parseCsvToProjects(testCsv);
    const byTitle = (t: string) => projects.find(p => p.title === t);

    expect(byTitle('Full Sized Alias')?.kitCategory).toBe('full');
    expect(byTitle('Large Alias')?.kitCategory).toBe('full');
    expect(byTitle('Full Drill Alias')?.kitCategory).toBe('full');
    expect(byTitle('Underscore Alias')?.kitCategory).toBe('full');
    expect(byTitle('Full Coverage Alias')?.kitCategory).toBe('full');
  });

  it('resolves all mini-kit aliases to "mini"', async () => {
    const { projects } = await parseCsvToProjects(testCsv);
    const byTitle = (t: string) => projects.find(p => p.title === t);

    expect(byTitle('Small Alias')?.kitCategory).toBe('mini');
    expect(byTitle('Partial Alias')?.kitCategory).toBe('mini');
    expect(byTitle('Tiny Alias')?.kitCategory).toBe('mini');
    expect(byTitle('Mini Kit Alias')?.kitCategory).toBe('mini');
  });

  it('leaves kitCategory undefined when the column is empty', async () => {
    const { projects } = await parseCsvToProjects(testCsv);
    const emptyProject = projects.find(p => p.title === 'Empty Category');

    expect(emptyProject).toBeDefined();
    expect(emptyProject?.kitCategory).toBeUndefined();
  });

  it('leaves kitCategory undefined for unrecognized values', async () => {
    const { projects } = await parseCsvToProjects(testCsv);
    const invalidProject = projects.find(p => p.title === 'Invalid Category');

    expect(invalidProject).toBeDefined();
    expect(invalidProject?.kitCategory).toBeUndefined();
  });

  it('accepts alternate header names for kit category', async () => {
    const csvWithAltHeader = [
      'Title,Status,kit_category',
      'Snake Case Header,wishlist,full',
      'Snake Mini,wishlist,mini',
    ].join('\n');

    const { projects } = await parseCsvToProjects(csvWithAltHeader);
    expect(projects[0]?.kitCategory).toBe('full');
    expect(projects[1]?.kitCategory).toBe('mini');
  });

  it('accepts "Kit Category" as a header name', async () => {
    const csvWithSpacedHeader = [
      'Title,Status,Kit Category',
      'Spaced Header Full,wishlist,full',
    ].join('\n');

    const { projects } = await parseCsvToProjects(csvWithSpacedHeader);
    expect(projects[0]?.kitCategory).toBe('full');
  });

  it('accepts "Category" as a header name', async () => {
    const csvWithCategoryHeader = [
      'Title,Status,Category',
      'Category Header Full,wishlist,full',
    ].join('\n');

    const { projects } = await parseCsvToProjects(csvWithCategoryHeader);
    expect(projects[0]?.kitCategory).toBe('full');
  });

  it('preserves "onhold" status aliases during import', async () => {
    const csvWithOnHoldStatuses = [
      'Title,Status',
      'Paused Project,on hold',
      'Waiting Project,waiting',
      'Suspended Project,suspended',
    ].join('\n');

    const { projects } = await parseCsvToProjects(csvWithOnHoldStatuses);

    expect(projects[0]?.status).toBe('onhold');
    expect(projects[1]?.status).toBe('onhold');
    expect(projects[2]?.status).toBe('onhold');
  });

  it('accepts "Project URL" as an import header alias for sourceUrl', async () => {
    const csvWithProjectUrlHeader = [
      'Title,Project URL',
      'URL Alias Test,https://example.com/project-url-alias',
    ].join('\n');

    const { projects } = await parseCsvToProjects(csvWithProjectUrlHeader);
    expect(projects[0]?.sourceUrl).toBe('https://example.com/project-url-alias');
  });

  it('accepts underscore source URL header aliases during import', async () => {
    const csvWithProjectUrlHeader = [
      'Title,project_url',
      'URL Alias Test,https://example.com/project-url-alias',
    ].join('\n');

    const { projects } = await parseCsvToProjects(csvWithProjectUrlHeader);
    expect(projects[0]?.sourceUrl).toBe('https://example.com/project-url-alias');
  });
});

describe('projectsToCsv – export column coverage', () => {
  it('exports canvas/drill type columns and uses source/general notes headers', () => {
    const csv = projectsToCsv([
      {
        id: 'p1',
        userId: 'u1',
        title: 'Export Coverage Test',
        status: 'kitted',
        company: 'Test Co',
        artist: 'Test Artist',
        drillShape: 'round',
        canvasType: 'velvet',
        drillType: 'AB',
        width: 30,
        height: 40,
        totalDiamonds: 12000,
        colorCount: 48,
        kitCategory: 'full',
        sourceUrl: 'https://example.com/source',
        generalNotes: 'General note text',
        tags: [{ id: 't1', name: 'landscape', createdAt: '', updatedAt: '' }],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ]);

    const [headerRow, dataRow] = csv.split('\n');
    expect(headerRow).toContain('Canvas Type');
    expect(headerRow).toContain('Drill Type');
    expect(headerRow).toContain('# of Colors');
    expect(headerRow).toContain('Source URL');
    expect(headerRow).toContain('General Notes');
    expect(headerRow).not.toContain('Project URL');
    expect(headerRow).not.toContain(',Notes,');
    expect(dataRow).toContain('velvet');
    expect(dataRow).toContain('AB');
    expect(dataRow).toContain('48');
  });

  it('imports recognized color count headers', async () => {
    const aliases = ['# of Colors', 'Number of Colors', 'Color Count', 'Colors'];

    for (const header of aliases) {
      const { projects } = await parseCsvToProjects(
        ['Title,' + header, 'Color Test,48'].join('\n')
      );
      expect(projects[0]?.colorCount).toBe(48);
    }
  });

  it('ignores decimal color counts during import', async () => {
    const { projects } = await parseCsvToProjects(
      ['Title,# of Colors', 'Decimal Color Test,48.5'].join('\n')
    );

    expect(projects[0]?.colorCount).toBeUndefined();
  });
});
