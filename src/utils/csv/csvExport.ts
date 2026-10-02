import { formatLocalDate } from '@/utils/date/timezoneUtils';
import { Project, Tag } from '@/types/shared';
import { logger } from '@/utils/logger';
import { neutralizeCsvFormulaField } from '@/utils/csv/csvFormulaSafety';

export const COLORING_BOOK_METADATA_EXPAND =
  'publisher,illustrator,coloring_book_tags_via_book.tag';

type NamedTag = {
  name: string;
};

export interface ColoringBookCsvRecord {
  title: string;
  publisherName?: string;
  illustratorName?: string;
  series?: string;
  theme?: string;
  isbn?: string;
  totalPages?: number;
  status?: string;
  datePurchased?: string;
  dateStarted?: string;
  dateCompleted?: string;
  tags?: NamedTag[];
}

export interface ColoringPageCsvBookRecord {
  id: string;
  title: string;
  publisherName?: string;
  illustratorName?: string;
}

export interface ColoringPageCsvPageRecord {
  id: string;
  bookId: string;
  pageNumber: number;
  status?: string;
  mediumIds?: string[];
  revealedSubject?: string;
  revealedAt?: string;
  startedAt?: string;
  completedAt?: string;
  photos?: string[];
}

export interface ColoringPageCsvMediumRecord {
  id: string;
  name: string;
}

export interface ColoringPageCsvProgressNoteRecord {
  pageId: string;
}

export interface ColoringPageCsvRow {
  bookTitle: string;
  publisherName?: string;
  illustratorName?: string;
  pageNumber: number;
  status?: string;
  mediumNames: string[];
  revealedSubject?: string;
  revealedAt?: string;
  startedAt?: string;
  completedAt?: string;
  photoCount: number;
  progressNoteCount: number;
}

/**
 * Converts an array of projects to CSV format
 * @param projects Array of projects to convert
 * @returns CSV string with headers
 */
export const projectsToCsv = (projects: Project[]): string => {
  if (!projects || projects.length === 0) {
    return '';
  }

  // Define headers for CSV
  const headers = [
    'Title',
    'Status',
    'Company',
    'Artist',
    'Width',
    'Height',
    'Drill Shape',
    'Canvas Type',
    'Drill Type',
    'Total Diamonds',
    '# of Colors',
    'Type of Kit',
    'Source URL',
    'Date Purchased',
    'Date Received',
    'Date Started',
    'Date Completed',
    'General Notes',
    'Tags',
  ];

  const rows = projects.map(project => [
    project.title,
    project.status,
    project.company,
    project.artist,
    project.width,
    project.height,
    project.drillShape,
    project.canvasType,
    project.drillType,
    project.totalDiamonds,
    project.colorCount,
    project.kitCategory,
    project.sourceUrl,
    formatDate(project.datePurchased),
    formatDate(project.dateReceived),
    formatDate(project.dateStarted),
    formatDate(project.dateCompleted),
    project.generalNotes,
    formatTags(project.tags),
  ]);

  // Combine headers and rows
  const csvContent = stringifyCsv(headers, rows);

  return csvContent;
};

export function coloringBooksToCsv(books: ColoringBookCsvRecord[]): string {
  const headers = [
    'Title',
    'Publisher',
    'Illustrator',
    'Series',
    'Theme',
    'ISBN',
    'Total Pages',
    'Status',
    'Date Purchased',
    'Date Started',
    'Date Completed',
    'Tags',
  ];

  return stringifyCsv(
    headers,
    books.map(book => [
      book.title,
      book.publisherName,
      book.illustratorName,
      book.series,
      book.theme,
      book.isbn,
      book.totalPages,
      book.status,
      formatDate(book.datePurchased),
      formatDate(book.dateStarted),
      formatDate(book.dateCompleted),
      book.tags?.map(tag => tag.name).join('; '),
    ])
  );
}

export function buildColoringPageCsvRows({
  books,
  pagesByBookId,
  coloringMediums,
  coloringPageProgressNotes,
}: {
  books: ColoringPageCsvBookRecord[];
  pagesByBookId: Record<string, ColoringPageCsvPageRecord[]>;
  coloringMediums: ColoringPageCsvMediumRecord[];
  coloringPageProgressNotes: ColoringPageCsvProgressNoteRecord[];
}): ColoringPageCsvRow[] {
  const mediumNamesById = new Map(coloringMediums.map(medium => [medium.id, medium.name]));
  const progressNoteCountsByPageId = coloringPageProgressNotes.reduce<Map<string, number>>(
    (counts, note) => counts.set(note.pageId, (counts.get(note.pageId) ?? 0) + 1),
    new Map()
  );

  return books.flatMap(book =>
    (pagesByBookId[book.id] ?? []).map(page => ({
      bookTitle: book.title,
      publisherName: book.publisherName,
      illustratorName: book.illustratorName,
      pageNumber: page.pageNumber,
      status: page.status,
      mediumNames: (page.mediumIds ?? [])
        .map(mediumId => mediumNamesById.get(mediumId) ?? mediumId)
        .filter(Boolean),
      revealedSubject: page.revealedSubject,
      revealedAt: page.revealedAt,
      startedAt: page.startedAt,
      completedAt: page.completedAt,
      photoCount: page.photos?.length ?? 0,
      progressNoteCount: progressNoteCountsByPageId.get(page.id) ?? 0,
    }))
  );
}

export function coloringPagesToCsv(pages: ColoringPageCsvRow[]): string {
  const headers = [
    'Book Title',
    'Publisher',
    'Illustrator',
    'Page Number',
    'Status',
    'Mediums',
    'Revealed Subject',
    'Revealed At',
    'Started At',
    'Completed At',
    'Photo Count',
    'Progress Note Count',
  ];

  return stringifyCsv(
    headers,
    pages.map(page => [
      page.bookTitle,
      page.publisherName,
      page.illustratorName,
      page.pageNumber,
      page.status,
      page.mediumNames.join('; '),
      page.revealedSubject,
      formatDate(page.revealedAt),
      formatDate(page.startedAt),
      formatDate(page.completedAt),
      page.photoCount,
      page.progressNoteCount,
    ])
  );
}

/**
 * Download data as a CSV file
 * @param csvData CSV data as string
 * @param filename Name for the downloaded file
 */
export const downloadCsv = (csvData: string, filename: string = 'projects-export.csv'): void => {
  if (!csvData) {
    logger.error('No CSV data to download');
    return;
  }

  // Create a blob from the CSV data
  const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  // Create a link and trigger the download
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Clean up the URL
  URL.revokeObjectURL(url);
};

/**
 * Escapes a field for CSV format
 * @param field The field value to escape (can be any type, will be converted to string)
 * @returns The escaped field value as a string
 */
export const escapeCsvField = (field: unknown): string => {
  // Convert to string, handling null/undefined
  const rawField = field === null || field === undefined ? '' : String(field);
  const strField = neutralizeCsvFormulaField(rawField);

  // If the field contains quotes, commas, or newlines, wrap it in quotes and escape internal quotes
  const needsQuotes = /[",\n\r]/.test(strField);

  if (needsQuotes) {
    // Replace any quotes with double quotes (CSV standard for escaping quotes)
    return `"${strField.replace(/"/g, '""')}"`;
  }

  return strField;
};

const stringifyCsv = (headers: string[], rows: unknown[][]): string => {
  return [headers.join(','), ...rows.map(row => row.map(escapeCsvField).join(','))].join('\n');
};

/**
 * Format a date string for CSV (or return empty string if no date)
 * @param dateString Date string to format
 * @returns Formatted date or empty string
 */
const formatDate = (dateString: string | undefined): string => {
  if (!dateString) {
    return '';
  }

  try {
    // If the date string is already in YYYY-MM-DD format, return it as-is
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      return dateString;
    }

    // For ISO strings or other formats, parse and format to avoid timezone issues
    const date = new Date(dateString);

    // Check if the date is valid
    if (isNaN(date.getTime())) {
      return dateString; // Return original if invalid
    }

    return formatLocalDate(date, 'yyyy-MM-dd');
  } catch (error) {
    logger.error('Error formatting date:', error);
    return dateString;
  }
};

/**
 * Format tags array for CSV (semicolon-separated tag names)
 * @param tags Array of tags to format
 * @returns Semicolon-separated tag names or empty string
 */
const formatTags = (tags: Tag[] | undefined): string => {
  if (!tags || tags.length === 0) {
    return '';
  }

  return tags.map(tag => tag.name).join('; ');
};
