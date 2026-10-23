import { describe, expect, it } from 'vitest';

import { escapeCsvField } from '@/utils/csv/csvExport';

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

  it('doubles leading apostrophes so text values round-trip through import', () => {
    expect(escapeCsvField("'=SUM(A1:A2)")).toBe("''=SUM(A1:A2)");
    expect(escapeCsvField("'Plain")).toBe("''Plain");
  });
});
