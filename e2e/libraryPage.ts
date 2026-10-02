import type { Page } from '@playwright/test';

export const libraryPageHeading = (page: Page) =>
  page
    .getByRole('main')
    .getByRole('heading', { level: 1 })
    .and(page.getByTestId('library-page-heading'));
