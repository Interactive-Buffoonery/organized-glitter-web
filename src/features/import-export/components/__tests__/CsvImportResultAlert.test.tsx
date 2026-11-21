import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { CsvImportResultAlert } from '../DataImportExportSections';

const validationIssues = [2, 3, 4, 5, 6, 7].map(row => ({
  row,
  field: 'datePurchased',
  originalValue: '2026-02-30',
  severity: 'error' as const,
  message: `Invalid date "2026-02-30" on line ${row}. Date cleared.`,
}));

describe('CsvImportResultAlert', () => {
  it('lets people reveal every validation note beyond the first four', async () => {
    render(
      <CsvImportResultAlert
        importStats={{
          total: 6,
          successful: 6,
          failed: 0,
          skipped: 0,
          errors: [],
          tagWarnings: [],
          validationIssues,
        }}
      />
    );

    expect(screen.getByText(/validation issues 6/)).toBeVisible();
    expect(screen.getAllByText(/Row 5, datePurchased/)[0]).toBeVisible();
    expect(screen.getByText(/Row 7, datePurchased/)).not.toBeVisible();

    await userEvent.setup().click(screen.getByText('Show all 6 validation notes'));

    expect(screen.getByText(/Row 7, datePurchased/)).toBeVisible();
  });
});
