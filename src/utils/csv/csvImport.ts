import { ProjectType } from '@/types/project';
import Papa from 'papaparse';
import { EXPECTED_COLUMNS } from '@/utils/csv/csvColumns';
import { logger } from '@/utils/logger';
import { formatLocalDate } from '@/utils/date/timezoneUtils';
import { normalizeStatus, validateKitCategoryValue } from '@/utils/csv/csvValidation';
import { restoreCsvFormulaTextField } from '@/utils/csv/csvFormulaSafety';

export type ParsedCsvProject = Partial<ProjectType> & { csvRow: number };

const countLineBreaks = (text: string) => text.match(/\r\n|\r|\n/g)?.length ?? 0;

const withoutTrailingNewline = (text: string, end: number) => {
  if (text[end - 1] === '\n') end--;
  if (text[end - 1] === '\r') end--;
  return end;
};

export interface ParsedCsvData {
  projects: ParsedCsvProject[];
  allUniqueTagNames: string[];
}

/**
 * Parse a single CSV row into a project object
 * @param row The CSV row data
 * @returns Partial project object or null if invalid
 */
const parseProjectFromRow = (row: Record<string, string>): Partial<ProjectType> | null => {
  const project: Partial<ProjectType> = {};

  // Map values to project object using flexible header matching
  const title = getTextFieldValue(row, EXPECTED_COLUMNS.title.aliases);
  if (!title) {
    // Skip projects without a title (required field)
    return null;
  }
  project.title = title;

  const status = getTextFieldValue(row, EXPECTED_COLUMNS.status.aliases);
  if (status) {
    project.status = normalizeStatus(status).normalized;
  }

  const company = getTextFieldValue(row, EXPECTED_COLUMNS.company.aliases);
  if (company) {
    project.company = company;
  }

  const artist = getTextFieldValue(row, EXPECTED_COLUMNS.artist.aliases);
  if (artist) {
    project.artist = artist;
  }

  // Handle dimensions - support both separate width/height and combined dimensions
  // Also support legacy "Length" header for backward compatibility
  const width = getFieldValue(row, EXPECTED_COLUMNS.width.aliases);
  if (width) {
    const widthValue = parseFloat(width);
    if (!isNaN(widthValue)) {
      project.width = widthValue;
    }
  }

  const height = getFieldValue(row, EXPECTED_COLUMNS.height.aliases); // Support legacy "Length" header
  if (height) {
    const heightValue = parseFloat(height);
    if (!isNaN(heightValue)) {
      project.height = heightValue;
    }
  }

  // Backwards compatibility: if dimensions column exists but width/height don't
  const dimensions = getFieldValue(row, EXPECTED_COLUMNS.dimensions.aliases);
  if (dimensions && !project.width && !project.height) {
    // Match the complete pair so malformed values cannot supply partial dimensions.
    const match = dimensions.match(/^(\d+(?:\.\d+)?)\s*[xX]\s*(\d+(?:\.\d+)?)$/);
    if (match) {
      const widthValue = parseFloat(match[1]);
      const heightValue = parseFloat(match[2]);
      if (!isNaN(widthValue)) {
        project.width = widthValue;
      }
      if (!isNaN(heightValue)) {
        project.height = heightValue;
      }
    }
  }

  const drillShape = getTextFieldValue(row, EXPECTED_COLUMNS.drillShape.aliases);
  if (drillShape) {
    project.drillShape = drillShape;
  }

  const canvasType = getTextFieldValue(row, EXPECTED_COLUMNS.canvasType.aliases);
  if (canvasType) {
    project.canvasType = canvasType;
  }

  const drillType = getTextFieldValue(row, EXPECTED_COLUMNS.drillType.aliases);
  if (drillType) {
    project.drillType = drillType;
  }

  const kitCategory = getTextFieldValue(row, EXPECTED_COLUMNS.kitCategory.aliases);
  if (kitCategory) {
    const validatedCategory = validateKitCategoryValue(kitCategory);
    if (validatedCategory) {
      project.kitCategory = validatedCategory;
    }
  }

  const datePurchased = getFieldValue(row, EXPECTED_COLUMNS.datePurchased.aliases);
  if (datePurchased) {
    project.datePurchased = validateDate(datePurchased);
  }

  const dateStarted = getFieldValue(row, EXPECTED_COLUMNS.dateStarted.aliases);
  if (dateStarted) {
    project.dateStarted = validateDate(dateStarted);
  }

  const dateCompleted = getFieldValue(row, EXPECTED_COLUMNS.dateCompleted.aliases);
  if (dateCompleted) {
    project.dateCompleted = validateDate(dateCompleted);
  }

  const notes = getTextFieldValue(row, EXPECTED_COLUMNS.generalNotes.aliases);
  if (notes) {
    project.generalNotes = notes;
  }

  const sourceUrl = getTextFieldValue(row, EXPECTED_COLUMNS.sourceUrl.aliases);
  if (sourceUrl) {
    project.sourceUrl = sourceUrl;
  }

  const totalDiamonds = getFieldValue(row, EXPECTED_COLUMNS.totalDiamonds.aliases);
  if (totalDiamonds) {
    // Remove commas and other formatting characters, then parse as integer.
    // Only accept strictly positive integers; the create-time zod schema
    // rejects 0 with `.positive()`, so coerce 0/negative to "unset" here
    // rather than letting the row fail on submit.
    const cleanedValue = totalDiamonds.replace(/[,\s]/g, '');
    const diamondCount = parseInt(cleanedValue, 10);
    if (!isNaN(diamondCount) && diamondCount > 0) {
      project.totalDiamonds = diamondCount;
    }
  }

  const colorCount = getFieldValue(row, EXPECTED_COLUMNS.colorCount.aliases);
  if (colorCount) {
    const cleanedValue = colorCount.replace(/[,\s]/g, '');
    if (/^\d+$/.test(cleanedValue)) {
      const parsedColorCount = parseInt(cleanedValue, 10);
      if (parsedColorCount > 0) {
        project.colorCount = parsedColorCount;
      }
    }
  }

  const dateReceived = getFieldValue(row, EXPECTED_COLUMNS.dateReceived.aliases);
  if (dateReceived) {
    project.dateReceived = validateDate(dateReceived);
  }

  // Handle tags - parse semicolon-separated tag names
  const tagsString = getTextFieldValue(row, EXPECTED_COLUMNS.tags.aliases);
  if (tagsString) {
    // Split by semicolon and clean up tag names
    const tagNames = tagsString
      .split(';')
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0);

    project.tagNames = tagNames;
  } else {
    // Ensure consistent behavior: always include tagNames as empty array when no tags
    project.tagNames = [];
  }

  return project;
};

/**
 * Parse CSV data into an array of project objects using Papa Parse
 * @param csvContent The CSV content as a string
 * @param onProgress Optional progress callback for large files
 * @returns Promise that resolves to an object containing projects and all unique tag names
 */
export const parseCsvToProjects = (
  csvContent: string,
  onProgress?: (progress: number) => void
): Promise<ParsedCsvData> => {
  return new Promise((resolve, reject) => {
    if (!csvContent.trim()) {
      reject(new Error('CSV content is empty'));
      return;
    }

    const content = csvContent.replace(/^\uFEFF/, '');
    const projects: ParsedCsvProject[] = [];
    const parsingWarnings: Papa.ParseError[] = [];
    let scannedTo = 0;
    let newlinesBeforeScan = 0;

    Papa.parse(content, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header: string) => header.toLowerCase().trim(),
      step: results => {
        parsingWarnings.push(...results.errors);
        const row = results.data as Record<string, string>;
        const recordEnd = withoutTrailingNewline(content, results.meta.cursor);
        newlinesBeforeScan += countLineBreaks(content.slice(scannedTo, recordEnd));
        scannedTo = recordEnd;
        const csvRow = newlinesBeforeScan + 1 - countLineBreaks(Object.values(row).join('\0'));

        try {
          const project = parseProjectFromRow(row);
          if (project) projects.push({ ...project, csvRow });
        } catch (error) {
          logger.warn('Error processing CSV row:', error, row);
        }
        if (onProgress) {
          const progress = Math.round((results.meta.cursor / content.length) * 100);
          onProgress(Math.min(progress, 99));
        }
      },
      complete: () => {
        try {
          if (parsingWarnings.length > 0) {
            logger.warn('CSV parsing warnings:', parsingWarnings);
          }
          onProgress?.(100);

          const allTagNamesArrays = projects.map(p => p.tagNames || []);
          const allUniqueTagNames = Array.from(new Set(allTagNamesArrays.flat()));

          resolve({ projects, allUniqueTagNames });
        } catch (error) {
          reject(error);
        }
      },
      error: (error: unknown) => {
        const errorMessage = error instanceof Error ? error.message : String(error);
        reject(new Error(`CSV parsing failed: ${errorMessage}`));
      },
    });
  });
};

/** Decode like FileReader.readAsText: a UTF-16 byte order mark picks the encoding, otherwise UTF-8. */
const readCsvText = async (file: File) => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const encoding =
    bytes[0] === 0xff && bytes[1] === 0xfe
      ? 'utf-16le'
      : bytes[0] === 0xfe && bytes[1] === 0xff
        ? 'utf-16be'
        : 'utf-8';
  return new TextDecoder(encoding).decode(bytes);
};

/**
 * Parse a CSV file. Import files are size-capped, so the text is read whole and
 * shares one parser that knows each record's line.
 */
export const parseCsvFileToProjects = async (
  file: File,
  onProgress?: (progress: number) => void
): Promise<ParsedCsvData> => {
  const csvContent = await readCsvText(file);
  if (!csvContent.trim()) {
    onProgress?.(100);
    return { projects: [], allUniqueTagNames: [] };
  }
  return parseCsvToProjects(csvContent, onProgress);
};

/**
 * Get field value using flexible header matching
 */
const getFieldValue = (
  row: Record<string, string>,
  possibleHeaders: readonly string[]
): string | undefined => {
  for (const header of possibleHeaders) {
    const value = row[header];
    if (value && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
};

const getTextFieldValue = (
  row: Record<string, string>,
  possibleHeaders: readonly string[]
): string | undefined => {
  const value = getFieldValue(row, possibleHeaders);
  return value ? restoreCsvFormulaTextField(value) : undefined;
};

const TIME = String.raw`(?:[01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?`;
const ISO_DATE = new RegExp(
  String.raw`^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ]${TIME}(?:Z|[+-](?:[01]\d|2[0-3]):?[0-5]\d)?)?$`,
  'i'
);
const US_DATE = new RegExp(
  String.raw`^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})(?:,?\s+(?:(?:0?[1-9]|1[0-2]):[0-5]\d(?::[0-5]\d)?\s*[ap]m|${TIME}))?$`,
  'i'
);
const MONTH_DAY_YEAR = /^([a-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/i;
const DAY_MONTH_YEAR = /^(\d{1,2})[-\s]([a-z]{3,9})\.?[-\s](\d{2}|\d{4})$/i;
const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

const monthNumber = (name: string) => {
  const index = MONTHS.findIndex(month => month.startsWith(name.toLowerCase()));
  return index < 0 ? undefined : String(index + 1);
};

const fullYear = (year: string) =>
  year.length === 4 ? year : String(Number(year) + (Number(year) < 50 ? 2000 : 1900));

const toDateOnly = (year: string, month: string, day: string) =>
  `${fullYear(year)}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;

// ponytail: formats without an explicit parser only pass when the parsed day and month
// appear in the text, which catches rollover; add a parser if a real export trips it.
const writesSameDay = (text: string, date: Date) => {
  const numbers = text.match(/\d+/g)?.map(Number) ?? [];
  const month = date.getMonth();
  return (
    numbers.includes(date.getDate()) &&
    (numbers.includes(month + 1) || text.toLowerCase().includes(MONTHS[month].slice(0, 3)))
  );
};

/**
 * Keep the calendar day as written, so validation can reject impossible dates
 * and no timezone moves the day. Text that cannot be read safely is returned
 * as is, so validation reports it.
 */
const validateDate = (dateStr: string): string | undefined => {
  if (!dateStr) return undefined;

  const iso = dateStr.match(ISO_DATE);
  if (iso) return toDateOnly(iso[1], iso[2], iso[3]);
  if (/^\d{4}-\d{1,2}-\d{1,2}/.test(dateStr)) return dateStr;

  const us = dateStr.match(US_DATE);
  if (us) return toDateOnly(us[3], us[1], us[2]);

  const monthFirst = dateStr.match(MONTH_DAY_YEAR);
  const dayFirst = dateStr.match(DAY_MONTH_YEAR);
  const named = monthFirst
    ? { day: monthFirst[2], month: monthNumber(monthFirst[1]), year: monthFirst[3] }
    : dayFirst && { day: dayFirst[1], month: monthNumber(dayFirst[2]), year: dayFirst[3] };
  if (named) return named.month ? toDateOnly(named.year, named.month, named.day) : dateStr;

  const parsed = new Date(dateStr);
  return Number.isNaN(parsed.getTime()) || !writesSameDay(dateStr, parsed)
    ? dateStr
    : formatLocalDate(parsed, 'yyyy-MM-dd');
};
