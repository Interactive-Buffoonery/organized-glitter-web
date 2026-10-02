/**
 * Secure PocketBase filter builder.
 *
 * Wraps pb.filter() (which parameterizes *values*) with a field-name whitelist
 * so that neither values nor field names can be injected.
 *
 * @security Do NOT modify COLLECTION_FIELDS without security review.
 *           Do NOT bypass validateFieldName in any code path.
 */

import {
  pbFilter,
  toPocketBaseFilter,
  type PocketBaseFilter,
  type PocketBaseFilterParams as FilterParams,
} from '@/services/pocketbase/base/filtering';
import { createLogger } from '@/utils/logger';

const logger = createLogger('FilterBuilder');

function isDev(): boolean {
  return import.meta.env.DEV;
}

// ---------------------------------------------------------------------------
// Field allowlist: only these names may appear in filter expressions.
// @security Never modify without review.
// ---------------------------------------------------------------------------

const COLLECTION_FIELDS = {
  system: new Set(['id', 'created', 'updated', 'collectionId', 'collectionName']),

  projects: new Set([
    'id',
    'created',
    'updated',
    'collectionId',
    'collectionName',
    'user',
    'title',
    'status',
    'kit_category',
    'drill_shape',
    'artist',
    'company',
    'date_purchased',
    'date_received',
    'date_started',
    'date_completed',
    'width',
    'height',
    'total_diamonds',
    'source_url',
    'general_notes',
    'image',
  ]),

  progress_notes: new Set([
    'id',
    'created',
    'updated',
    'collectionId',
    'collectionName',
    'project',
    'date',
    'content',
    'image',
  ]),

  tags: new Set([
    'id',
    'created',
    'updated',
    'collectionId',
    'collectionName',
    'user',
    'name',
    'slug',
    'color',
  ]),

  project_tags: new Set([
    'id',
    'created',
    'updated',
    'collectionId',
    'collectionName',
    'project',
    'tag',
  ]),

  artists: new Set(['id', 'created', 'updated', 'collectionId', 'collectionName', 'user', 'name']),

  companies: new Set([
    'id',
    'created',
    'updated',
    'collectionId',
    'collectionName',
    'user',
    'name',
    'website_url',
  ]),

  user_yearly_stats: new Set([
    'id',
    'created',
    'updated',
    'collectionId',
    'collectionName',
    'user',
    'year',
    'stats_type',
    'completed_count',
    'in_progress_count',
    'started_count',
    'total_diamonds',
    'estimated_drills',
    'projects_included',
    'status_breakdown',
    'last_calculated',
    'calculation_duration_ms',
    'cache_version',
  ]),

  randomizer_spins: new Set([
    'id',
    'created',
    'updated',
    'collectionId',
    'collectionName',
    'user',
    'project',
    'project_title',
    'project_company',
    'project_artist',
    'selected_count',
    'selected_projects',
    'spun_at',
  ]),

  users: new Set([
    'id',
    'created',
    'updated',
    'collectionId',
    'collectionName',
    'username',
    'email',
    'emailVisibility',
    'verified',
    'avatar',
    'beta_tester',
  ]),

  coloring_books: new Set([
    'id',
    'created',
    'updated',
    'collectionId',
    'collectionName',
    'user',
    'title',
    'publisher',
    'illustrator',
    'series',
    'theme',
    'isbn',
    'publication_year',
    'edition',
    'language',
    'source_url',
    'date_purchased',
    'date_received',
    'date_started',
    'date_completed',
    'book_format',
    'notes',
    'cover_image',
    'is_mystery',
    'status',
    'total_pages',
    'completed_pages',
    'completion_percentage',
    'last_activity_at',
  ]),

  coloring_pages: new Set([
    'id',
    'created',
    'updated',
    'collectionId',
    'collectionName',
    'book',
    'page_number',
    'status',
    'photos',
    'revealed_subject',
    'revealed_at',
    'started_at',
    'completed_at',
  ]),

  book_publishers: new Set([
    'id',
    'created',
    'updated',
    'collectionId',
    'collectionName',
    'user',
    'name',
  ]),

  account_deletions: new Set([
    'id',
    'created',
    'updated',
    'collectionId',
    'collectionName',
    'user_id',
    'user_email',
    'signup_method',
    'notes',
  ]),

  relations: new Set([
    'project_tags_via_project.tag',
    'tags_via_project_tags.name',
    'artist.name',
    'company.name',
    'illustrator.name',
    'publisher.name',
    'coloring_book_tags_via_book.tag',
    'book.user',
    'book.title',
    'book.publisher',
    'book.illustrator',
    'book.is_mystery',
    'book.coloring_book_tags_via_book.tag',
  ]),
} as const;

// ---------------------------------------------------------------------------
// Field validation
// ---------------------------------------------------------------------------

/**
 * Validate a field name against the whitelist.
 * Throws in dev; returns false in prod (fail-closed, the filter is skipped).
 */
function validateFieldName(field: string, context?: string): boolean {
  if (!field || typeof field !== 'string') {
    logger.error('Invalid field name: must be a non-empty string', { field, context });
    return false;
  }

  const isValid = Object.values(COLLECTION_FIELDS).some(set => set.has(field));

  if (!isValid) {
    const msg = `Security violation: field "${field}" not in whitelist`;
    logger.error(msg, { field, context });
    if (isDev()) throw new Error(`${msg}. Context: ${context ?? 'unknown'}`);
    return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DateRangeOptions {
  year?: number;
  startDate?: string;
  endDate?: string;
  includeTime?: boolean;
}

export interface SearchOptions {
  fields: string[];
  term: string;
  caseSensitive?: boolean;
}

const getParamKey = (field: string, suffix = ''): string =>
  `${field.replace(/[^A-Za-z0-9_]/g, '_')}${suffix}`;

// ---------------------------------------------------------------------------
// FilterBuilder
// ---------------------------------------------------------------------------

export class FilterBuilder {
  private filters: string[] = [];

  /** Add a raw pb.filter() expression. */
  add(filterExpression: string, params: FilterParams = {}): FilterBuilder {
    if (filterExpression.trim()) {
      this.filters.push(pbFilter(filterExpression, params));
    }
    return this;
  }

  /** Scope to a single user (data isolation). */
  userScope(userId: string | undefined): FilterBuilder {
    if (userId) {
      this.filters.push(pbFilter('user = {:userId}', { userId }));
    }
    return this;
  }

  /** Filter by date range on a whitelisted field. */
  dateRange(field: string, options: DateRangeOptions): FilterBuilder {
    if (!validateFieldName(field, 'dateRange')) return this;

    if (options.year) {
      const t0 = options.includeTime ? ' 00:00:00' : '';
      const t1 = options.includeTime ? ' 23:59:59' : '';
      this.filters.push(
        pbFilter(`${field} >= {:startDate} && ${field} <= {:endDate}`, {
          startDate: `${options.year}-01-01${t0}`,
          endDate: `${options.year}-12-31${t1}`,
        })
      );
    } else if (options.startDate && options.endDate) {
      this.filters.push(
        pbFilter(`${field} >= {:startDate} && ${field} <= {:endDate}`, {
          startDate: options.startDate,
          endDate: options.endDate,
        })
      );
    } else if (options.startDate) {
      this.filters.push(pbFilter(`${field} >= {:startDate}`, { startDate: options.startDate }));
    } else if (options.endDate) {
      this.filters.push(pbFilter(`${field} <= {:endDate}`, { endDate: options.endDate }));
    }
    return this;
  }

  /** Search across multiple whitelisted fields with `~` (contains). */
  search(options: SearchOptions): FilterBuilder {
    if (!options.term?.trim()) return this;

    const validFields = options.fields.filter(f => validateFieldName(f, 'search'));
    if (validFields.length === 0) {
      logger.error('Search skipped: no valid fields', { fields: options.fields });
      return this;
    }

    const conditions = validFields.map((f, i) => `${f} ~ {:term${i}}`).join(' || ');
    const params: FilterParams = {};
    validFields.forEach((_, i) => {
      params[`term${i}`] = options.term.trim();
    });

    this.filters.push(pbFilter(`(${conditions})`, params));
    return this;
  }

  /** Equality check on a whitelisted field. */
  equals(field: string, value: string | number | boolean): FilterBuilder {
    if (!validateFieldName(field, 'equals')) return this;
    const key = getParamKey(field);
    this.filters.push(pbFilter(`${field} = {:${key}}`, { [key]: value }));
    return this;
  }

  /** Not-equal check on a whitelisted field. */
  notEquals(field: string, value: string | number | boolean): FilterBuilder {
    if (!validateFieldName(field, 'notEquals')) return this;
    const key = getParamKey(field);
    this.filters.push(pbFilter(`${field} != {:${key}}`, { [key]: value }));
    return this;
  }

  /** Match any of the provided values on a whitelisted field. */
  in(field: string, values: (string | number)[]): FilterBuilder {
    if (!validateFieldName(field, 'in') || !values?.length) return this;

    const parts = values.map((value, i) => {
      const key = getParamKey(field, `_${i}`);
      return pbFilter(`${field} = {:${key}}`, { [key]: value });
    });

    this.filters.push(`(${parts.join(' || ')})`);
    return this;
  }

  /** Match any selected value inside a PocketBase multi-select or relation list. */
  any(field: string, values: (string | number)[]): FilterBuilder {
    if (!validateFieldName(field, 'any') || !values?.length) return this;

    const parts = values.map((value, i) => {
      const key = getParamKey(field, `_${i}`);
      return pbFilter(`${field} ?= {:${key}}`, { [key]: value });
    });

    this.filters.push(`(${parts.join(' || ')})`);
    return this;
  }

  /** Contains (~) check on a whitelisted field. */
  like(field: string, value: string): FilterBuilder {
    if (!validateFieldName(field, 'like') || !value?.trim()) return this;
    const key = getParamKey(field);
    this.filters.push(pbFilter(`${field} ~ {:${key}}`, { [key]: value.trim() }));
    return this;
  }

  /** Greater-than on a whitelisted field. */
  greaterThan(field: string, value: string | number): FilterBuilder {
    if (!validateFieldName(field, 'greaterThan')) return this;
    const key = getParamKey(field);
    this.filters.push(pbFilter(`${field} > {:${key}}`, { [key]: value }));
    return this;
  }

  /** Less-than on a whitelisted field. */
  lessThan(field: string, value: string | number): FilterBuilder {
    if (!validateFieldName(field, 'lessThan')) return this;
    const key = getParamKey(field);
    this.filters.push(pbFilter(`${field} < {:${key}}`, { [key]: value }));
    return this;
  }

  /** Null check on a whitelisted field. */
  isNull(field: string): FilterBuilder {
    if (!validateFieldName(field, 'isNull')) return this;
    this.filters.push(`${field} = null`);
    return this;
  }

  /** Not-null check on a whitelisted field. */
  isNotNull(field: string): FilterBuilder {
    if (!validateFieldName(field, 'isNotNull')) return this;
    this.filters.push(`${field} != null`);
    return this;
  }

  /** Combine with another builder via AND. */
  and(builder: FilterBuilder): FilterBuilder {
    const sub = builder.build();
    if (sub) this.filters.push(`(${sub})`);
    return this;
  }

  /** Combine with another builder via OR. */
  or(builder: FilterBuilder): FilterBuilder {
    const sub = builder.build();
    if (sub && this.filters.length > 0) {
      const existing = this.filters.join(' && ');
      this.filters = [`(${existing}) || (${sub})`];
    } else if (sub) {
      this.filters.push(sub);
    }
    return this;
  }

  /** Join all filters with && and return the expression string. */
  build(): PocketBaseFilter {
    return toPocketBaseFilter(this.filters.join(' && '));
  }

  /** Clear all filters. */
  reset(): FilterBuilder {
    this.filters = [];
    return this;
  }

  /** Number of filter clauses added so far. */
  count(): number {
    return this.filters.length;
  }
}

// ---------------------------------------------------------------------------
// Convenience factories
// ---------------------------------------------------------------------------

/** Create a new FilterBuilder. */
export function createFilter(): FilterBuilder {
  return new FilterBuilder();
}
