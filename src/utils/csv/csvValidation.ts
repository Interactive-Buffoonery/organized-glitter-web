/**
 * @fileoverview CSV import validation and normalization utilities
 *
 * Provides validation and data cleaning functions for CSV import to ensure
 * data meets PocketBase schema constraints and validation rules.
 *
 * @version 1.0.0
 * @since 2025-07-01
 */

import {
  ProjectsDrillShapeOptions,
  ProjectsStatusOptions,
  ProjectsKitCategoryOptions,
} from '@/types/pocketbase.types';
import { createLogger } from '@/utils/logger';

const logger = createLogger('CSVValidation');

// Maximum field lengths (based on PocketBase database schema constraints)
const FIELD_LIMITS = {
  TAG_NAME_MAX_LENGTH: 100,
  PROJECT_TITLE_MAX_LENGTH: 200,
  GENERAL_NOTES_MAX_LENGTH: 1000,
  SOURCE_URL_MAX_LENGTH: 500,
} as const;

// Validation error types
export interface ValidationIssue {
  field: string;
  originalValue: string;
  correctedValue?: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
}

interface CorrectedProjectData {
  title: string;
  drillShape: ProjectsDrillShapeOptions | null;
  status: ProjectsStatusOptions;
  kitCategory: ProjectsKitCategoryOptions;
  datePurchased: string | null;
  dateReceived: string | null;
  dateStarted: string | null;
  dateCompleted: string | null;
  generalNotes: string | null;
  sourceUrl: string | null;
  [key: string]: unknown; // For other fields that pass through unchanged
}

interface ValidationResult {
  isValid: boolean;
  correctedData: CorrectedProjectData;
  issues: ValidationIssue[];
}

/**
 * Lowercase-keyed mapping for drill shape values.
 * Input is lowercased before lookup, so only lowercase keys are needed.
 */
const DRILL_SHAPE_MAPPING: Record<string, ProjectsDrillShapeOptions> = {
  round: ProjectsDrillShapeOptions.round,
  square: ProjectsDrillShapeOptions.square,
  r: ProjectsDrillShapeOptions.round,
  s: ProjectsDrillShapeOptions.square,
};

/**
 * Lowercase-keyed mapping for project status values.
 * Input is lowercased before lookup, so only lowercase keys are needed.
 */
const STATUS_MAPPING: Record<string, ProjectsStatusOptions> = {
  wishlist: ProjectsStatusOptions.wishlist,
  purchased: ProjectsStatusOptions.purchased,
  stash: ProjectsStatusOptions.stash,
  kitted: ProjectsStatusOptions.kitted,
  progress: ProjectsStatusOptions.progress,
  onhold: ProjectsStatusOptions.onhold,
  completed: ProjectsStatusOptions.completed,
  archived: ProjectsStatusOptions.archived,
  destashed: ProjectsStatusOptions.destashed,
  // Common variations
  'wish list': ProjectsStatusOptions.wishlist,
  'kitted up': ProjectsStatusOptions.kitted,
  'kitted up, not started': ProjectsStatusOptions.kitted,
  'ready to start': ProjectsStatusOptions.kitted,
  'in progress': ProjectsStatusOptions.progress,
  in_progress: ProjectsStatusOptions.progress,
  'on hold': ProjectsStatusOptions.onhold,
  on_hold: ProjectsStatusOptions.onhold,
  paused: ProjectsStatusOptions.onhold,
  waiting: ProjectsStatusOptions.onhold,
  suspended: ProjectsStatusOptions.onhold,
  done: ProjectsStatusOptions.completed,
  finished: ProjectsStatusOptions.completed,
  complete: ProjectsStatusOptions.completed,
  bought: ProjectsStatusOptions.purchased,
  owned: ProjectsStatusOptions.stash,
};

/**
 * Lowercase-keyed mapping for kit category values.
 * Input is lowercased before lookup, so only lowercase keys are needed.
 */
const KIT_CATEGORY_MAPPING: Record<string, ProjectsKitCategoryOptions> = {
  full: ProjectsKitCategoryOptions.full,
  mini: ProjectsKitCategoryOptions.mini,
  // Full kit variations
  'full drill': ProjectsKitCategoryOptions.full,
  'full-drill': ProjectsKitCategoryOptions.full,
  'full sized': ProjectsKitCategoryOptions.full,
  'full sized kit': ProjectsKitCategoryOptions.full,
  full_sized_kit: ProjectsKitCategoryOptions.full,
  'full coverage': ProjectsKitCategoryOptions.full,
  'full size': ProjectsKitCategoryOptions.full,
  large: ProjectsKitCategoryOptions.full,
  big: ProjectsKitCategoryOptions.full,
  // Mini kit variations
  'mini kit': ProjectsKitCategoryOptions.mini,
  mini_kit: ProjectsKitCategoryOptions.mini,
  partial: ProjectsKitCategoryOptions.mini,
  small: ProjectsKitCategoryOptions.mini,
  tiny: ProjectsKitCategoryOptions.mini,
};

/**
 * Normalize an input drill shape string to a canonical ProjectsDrillShapeOptions value.
 *
 * @param value - Input drill shape (may be null or undefined)
 * @returns An object with `normalized` set to the canonical drill shape or `null`; includes a `ValidationIssue` when the input was corrected (`severity: "info"`) or when the input was unrecognized and left empty (`severity: "warning"`).
 */
function normalizeDrillShape(value: string | null | undefined): {
  normalized: ProjectsDrillShapeOptions | null;
  issue?: ValidationIssue;
} {
  if (!value || typeof value !== 'string') {
    return { normalized: null };
  }

  const trimmed = value.trim();
  const normalized = DRILL_SHAPE_MAPPING[trimmed.toLowerCase()];

  if (normalized) {
    const issue =
      trimmed !== normalized
        ? {
            field: 'drill_shape',
            originalValue: value,
            correctedValue: normalized,
            severity: 'info' as const,
            message: `Normalized "${value}" to "${normalized}"`,
          }
        : undefined;

    return { normalized, issue };
  }

  return {
    normalized: null,
    issue: {
      field: 'drill_shape',
      originalValue: value,
      severity: 'warning' as const,
      message: `Invalid drill shape "${value}". Valid options: round, square. Leaving empty.`,
    },
  };
}

/**
 * Normalize a project status string to a canonical ProjectsStatusOptions value.
 *
 * @param value - The input status string (may be null or undefined)
 * @returns An object with `normalized` set to the canonical ProjectsStatusOptions value (defaults to `wishlist` when the input is missing or unrecognized). If the input was changed or invalid, `issue` contains a ValidationIssue describing the correction or warning.
 */
export function normalizeStatus(value: string | null | undefined): {
  normalized: ProjectsStatusOptions;
  issue?: ValidationIssue;
} {
  if (!value || typeof value !== 'string') {
    return { normalized: ProjectsStatusOptions.wishlist };
  }

  const trimmed = value.trim();
  const normalized = STATUS_MAPPING[trimmed.toLowerCase()];

  if (normalized) {
    const issue =
      trimmed !== normalized
        ? {
            field: 'status',
            originalValue: value,
            correctedValue: normalized,
            severity: 'info' as const,
            message: `Normalized "${value}" to "${normalized}"`,
          }
        : undefined;

    return { normalized, issue };
  }

  return {
    normalized: ProjectsStatusOptions.wishlist,
    issue: {
      field: 'status',
      originalValue: value,
      correctedValue: ProjectsStatusOptions.wishlist,
      severity: 'warning' as const,
      message: `Invalid status "${value}". Defaulting to "wishlist". Valid options: ${Object.values(ProjectsStatusOptions).join(', ')}`,
    },
  };
}

/**
 * Normalize a kit category input to either `full` or `mini` based on known aliases.
 *
 * @param value - The raw kit category string to normalize (may be null or undefined)
 * @returns `full` if the input maps to the full kit category, `mini` if it maps to the mini kit category, or `undefined` if the input is empty or unrecognized
 */
export function validateKitCategoryValue(
  value: string | null | undefined
): 'full' | 'mini' | undefined {
  if (!value) return undefined;
  const mapped = KIT_CATEGORY_MAPPING[value.trim().toLowerCase()];
  return mapped || undefined;
}

/**
 * Normalize a kit category string to a canonical `ProjectsKitCategoryOptions` value.
 *
 * Returns `ProjectsKitCategoryOptions.full` when the input is missing or unrecognized.
 *
 * @returns An object with `normalized` set to the canonical kit category (`full` or `mini`). If the input was transformed or defaulted, `issue` contains a `ValidationIssue` describing the normalization or warning.
 */
export function normalizeKitCategory(value: string | null | undefined): {
  normalized: ProjectsKitCategoryOptions;
  issue?: ValidationIssue;
} {
  if (!value || typeof value !== 'string') {
    return { normalized: ProjectsKitCategoryOptions.full };
  }

  const normalized = validateKitCategoryValue(value);

  if (normalized) {
    const issue =
      value.trim() !== normalized
        ? {
            field: 'kit_category',
            originalValue: value,
            correctedValue: normalized,
            severity: 'info' as const,
            message: `Normalized "${value}" to "${normalized}"`,
          }
        : undefined;

    return { normalized: normalized as ProjectsKitCategoryOptions, issue };
  }

  return {
    normalized: ProjectsKitCategoryOptions.full,
    issue: {
      field: 'kit_category',
      originalValue: value,
      correctedValue: ProjectsKitCategoryOptions.full,
      severity: 'warning' as const,
      message: `Invalid kit category "${value}". Defaulting to "full". Valid options: full, mini`,
    },
  };
}

/**
 * Validate and potentially truncate tag name
 */
function validateTagName(value: string | null | undefined): {
  normalized: string;
  issue?: ValidationIssue;
} {
  if (!value || typeof value !== 'string') {
    return { normalized: '' };
  }

  const trimmed = value.trim();

  if (trimmed.length <= FIELD_LIMITS.TAG_NAME_MAX_LENGTH) {
    return { normalized: trimmed };
  }

  // Truncate at word boundary if possible
  const truncated = truncateAtWordBoundary(trimmed, FIELD_LIMITS.TAG_NAME_MAX_LENGTH);

  return {
    normalized: truncated,
    issue: {
      field: 'tag_name',
      originalValue: value,
      correctedValue: truncated,
      severity: 'warning' as const,
      message: `Tag name too long (${trimmed.length} chars). Truncated to: "${truncated}"`,
    },
  };
}

/**
 * Validate and potentially truncate project title
 */
function validateProjectTitle(value: string | null | undefined): {
  normalized: string;
  issue?: ValidationIssue;
} {
  if (!value || typeof value !== 'string') {
    return { normalized: 'Untitled Project' };
  }

  const trimmed = value.trim();

  if (trimmed.length <= FIELD_LIMITS.PROJECT_TITLE_MAX_LENGTH) {
    return { normalized: trimmed };
  }

  const truncated = truncateAtWordBoundary(trimmed, FIELD_LIMITS.PROJECT_TITLE_MAX_LENGTH);

  return {
    normalized: truncated,
    issue: {
      field: 'title',
      originalValue: value,
      correctedValue: truncated,
      severity: 'warning' as const,
      message: `Project title too long (${trimmed.length} chars). Truncated to: "${truncated}"`,
    },
  };
}

/**
 * Validate and correct date format
 */
function validateDate(
  value: string | null | undefined,
  fieldName: string
): {
  normalized: string | null;
  issue?: ValidationIssue;
} {
  if (!value || typeof value !== 'string') {
    return { normalized: null };
  }

  const trimmed = value.trim();

  // Handle common date format issues
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    // Check for invalid years like "0242"
    const year = parseInt(trimmed.substring(0, 4));
    if (year < 1900 || year > 2100) {
      // Try to fix obvious typos like 0242 -> 2024
      const correctedYear = fixCommonYearTypos(year);
      if (correctedYear) {
        const correctedDate = `${correctedYear}${trimmed.substring(4)}`;
        return {
          normalized: correctedDate,
          issue: {
            field: fieldName,
            originalValue: value,
            correctedValue: correctedDate,
            severity: 'warning' as const,
            message: `Invalid year ${year} corrected to ${correctedYear}`,
          },
        };
      }
    } else {
      // Valid date format
      return { normalized: trimmed };
    }
  }

  // Invalid date format
  return {
    normalized: null,
    issue: {
      field: fieldName,
      originalValue: value,
      severity: 'error' as const,
      message: `Invalid date format "${value}". Expected YYYY-MM-DD format. Date cleared.`,
    },
  };
}

/**
 * Helper function to truncate text at word boundary
 */
function truncateAtWordBoundary(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;

  // Try to find last space before the limit
  const truncated = text.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');

  if (lastSpace > maxLength * 0.7) {
    // If we can find a good word boundary (not too far back), use it
    return truncated.substring(0, lastSpace).trim();
  }

  // Otherwise, hard truncate with ellipsis, ensuring we don't end mid-word
  const hardTruncated = text.substring(0, maxLength - 3);
  const lastSpaceInHard = hardTruncated.lastIndexOf(' ');

  if (lastSpaceInHard > (maxLength - 3) * 0.8) {
    // Use word boundary if close enough
    return hardTruncated.substring(0, lastSpaceInHard).trim() + '...';
  }

  // Otherwise just add ellipsis
  return hardTruncated + '...';
}

/**
 * Configuration for year correction logic
 */
interface YearCorrectionOptions {
  minValidYear?: number;
  maxValidYear?: number;
  currentYear?: number;
  maxYearDeviation?: number; // How many years from current to consider valid
}

/**
 * Fix common year typos using dynamic correction logic
 */
function fixCommonYearTypos(year: number, options: YearCorrectionOptions = {}): number | null {
  const currentYear = options.currentYear ?? new Date().getFullYear();
  const minValidYear = options.minValidYear ?? Math.max(1900, currentYear - 50); // Default: 50 years back
  const maxValidYear = options.maxValidYear ?? currentYear + 10; // Default: 10 years forward
  const maxDeviation = options.maxYearDeviation ?? 20; // Years from current considered reasonable

  const yearStr = year.toString();

  // Helper function to check if a year is within reasonable bounds
  const isReasonableYear = (candidate: number): boolean => {
    return (
      candidate >= minValidYear &&
      candidate <= maxValidYear &&
      Math.abs(candidate - currentYear) <= maxDeviation
    );
  };

  // Helper function to find the closest reasonable year to current year
  const findClosestReasonableYear = (candidates: number[]): number | null => {
    const validCandidates = candidates.filter(isReasonableYear);
    if (validCandidates.length === 0) return null;

    return validCandidates.reduce((closest, candidate) => {
      return Math.abs(candidate - currentYear) < Math.abs(closest - currentYear)
        ? candidate
        : closest;
    });
  };

  // Handle 3-digit years (likely missing century)
  if (yearStr.length === 3) {
    const candidates = [
      1900 + year, // 19XX
      2000 + year, // 20XX
    ];
    return findClosestReasonableYear(candidates);
  }

  // Handle 4-digit years starting with 0 (likely typo in first digit)
  if (yearStr.length === 4 && yearStr.startsWith('0')) {
    const lastThreeDigits = yearStr.substring(1);
    const candidates = [
      parseInt(`1${lastThreeDigits}`), // 1XXX
      parseInt(`2${lastThreeDigits}`), // 2XXX
    ];
    return findClosestReasonableYear(candidates);
  }

  // Handle potential digit transposition in 4-digit years
  if (yearStr.length === 4) {
    const digits = yearStr.split('').map(Number);
    const candidates: number[] = [];

    // Try swapping adjacent digits
    for (let i = 0; i < digits.length - 1; i++) {
      const swapped = [...digits];
      [swapped[i], swapped[i + 1]] = [swapped[i + 1], swapped[i]];
      const candidate = parseInt(swapped.join(''));
      if (candidate !== year) {
        candidates.push(candidate);
      }
    }

    // For years starting with 20, also try common digit inversions
    if (yearStr.startsWith('20')) {
      const lastTwoDigits = yearStr.substring(2);
      const reversed = lastTwoDigits.split('').reverse().join('');
      candidates.push(parseInt(`20${reversed}`));
    }

    return findClosestReasonableYear(candidates);
  }

  // Handle 2-digit years (assume they're in the current century or previous)
  if (yearStr.length === 2) {
    const currentCentury = Math.floor(currentYear / 100) * 100;
    const previousCentury = currentCentury - 100;

    const candidates = [currentCentury + year, previousCentury + year];
    return findClosestReasonableYear(candidates);
  }

  return null;
}

/**
 * Validate and normalize a CSV row into a project-shaped object, collecting any issues found.
 *
 * @param data - Input CSV row (arbitrary key/value map) whose fields will be validated and normalized into the returned corrected data
 * @returns A ValidationResult containing `isValid` (false if any error-level issues were found), `correctedData` with normalized/trimmed fields, and an array of `issues` describing warnings or errors encountered during validation
 */
export function validateProjectData(data: Record<string, unknown>): ValidationResult {
  const issues: ValidationIssue[] = [];
  const correctedData: CorrectedProjectData = { ...data } as CorrectedProjectData;

  // Validate title
  const titleResult = validateProjectTitle(data.title as string);
  correctedData.title = titleResult.normalized;
  if (titleResult.issue) issues.push(titleResult.issue);

  // Validate drill shape
  const drillShapeResult = normalizeDrillShape((data.drillShape || data.drill_shape) as string);
  correctedData.drillShape = drillShapeResult.normalized;
  if (drillShapeResult.issue) issues.push(drillShapeResult.issue);

  // Validate status
  const statusResult = normalizeStatus(data.status as string);
  correctedData.status = statusResult.normalized;
  if (statusResult.issue) issues.push(statusResult.issue);

  // Validate kit category
  const kitCategoryResult = normalizeKitCategory((data.kitCategory ?? data.kit_category) as string);
  correctedData.kitCategory = kitCategoryResult.normalized;
  if (kitCategoryResult.issue) issues.push(kitCategoryResult.issue);

  // Validate dates
  const dateFields = ['datePurchased', 'dateReceived', 'dateStarted', 'dateCompleted'] as const;
  for (const field of dateFields) {
    const dateResult = validateDate(data[field] as string, field);
    correctedData[field] = dateResult.normalized;
    if (dateResult.issue) issues.push(dateResult.issue);
  }

  // Validate general notes length
  const generalNotes = data.generalNotes as string;
  if (generalNotes && typeof generalNotes === 'string') {
    if (generalNotes.length > FIELD_LIMITS.GENERAL_NOTES_MAX_LENGTH) {
      const truncated = truncateAtWordBoundary(generalNotes, FIELD_LIMITS.GENERAL_NOTES_MAX_LENGTH);
      correctedData.generalNotes = truncated;
      issues.push({
        field: 'generalNotes',
        originalValue: generalNotes,
        correctedValue: truncated,
        severity: 'warning',
        message: `General notes too long (${generalNotes.length} chars). Truncated.`,
      });
    } else {
      correctedData.generalNotes = generalNotes;
    }
  } else {
    correctedData.generalNotes = null;
  }

  // Validate source URL length
  const sourceUrl = data.sourceUrl as string;
  if (sourceUrl && typeof sourceUrl === 'string') {
    if (sourceUrl.length > FIELD_LIMITS.SOURCE_URL_MAX_LENGTH) {
      const truncated = sourceUrl.substring(0, FIELD_LIMITS.SOURCE_URL_MAX_LENGTH);
      correctedData.sourceUrl = truncated;
      issues.push({
        field: 'sourceUrl',
        originalValue: sourceUrl,
        correctedValue: truncated,
        severity: 'warning',
        message: `Source URL too long. Truncated to ${FIELD_LIMITS.SOURCE_URL_MAX_LENGTH} characters.`,
      });
    } else {
      correctedData.sourceUrl = sourceUrl;
    }
  } else {
    correctedData.sourceUrl = null;
  }

  const hasErrors = issues.some(issue => issue.severity === 'error');

  logger.debug('Project validation completed', {
    originalTitle: data.title,
    correctedTitle: correctedData.title,
    issueCount: issues.length,
    hasErrors,
  });

  return {
    isValid: !hasErrors,
    correctedData,
    issues,
  };
}

/**
 * Validate tag names from CSV and return normalized versions
 */
export function validateTagNames(tagNames: string[]): {
  validatedTags: Array<{ original: string; normalized: string }>;
  issues: ValidationIssue[];
} {
  const validatedTags: Array<{ original: string; normalized: string }> = [];
  const issues: ValidationIssue[] = [];

  for (const tagName of tagNames) {
    const result = validateTagName(tagName);
    validatedTags.push({
      original: tagName,
      normalized: result.normalized,
    });
    if (result.issue) {
      issues.push(result.issue);
    }
  }

  return { validatedTags, issues };
}
