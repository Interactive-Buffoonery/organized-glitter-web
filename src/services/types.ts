/**
 * Service layer types: domain DTOs and error contracts.
 *
 * These types define the stable shapes that services return and hooks consume.
 * They are decoupled from PocketBase SDK types and use camelCase conventions.
 *
 * Rules (see CONTRACTS.md):
 * - camelCase field names
 * - Dates as ISO strings
 * - IDs as strings
 * - No file URLs (raw filename fields only)
 * - No React Query concerns
 */

import type { AppTheme } from '@/lib/theme';

// ---------------------------------------------------------------------------
// Error contract
// ---------------------------------------------------------------------------

export const SERVICE_ERROR_TYPES = [
  'network',
  'validation',
  'auth',
  'permission',
  'not_found',
  'server',
  'cancelled',
] as const;

type ServiceErrorType = (typeof SERVICE_ERROR_TYPES)[number];

export interface ServiceError {
  type: ServiceErrorType;
  message: string;
  status?: number;
  fieldErrors?: Record<string, string>;
  retryable: boolean;
  /** Opaque original error, NOT ClientResponseError in the public contract */
  cause?: unknown;
}

// ---------------------------------------------------------------------------
// List options (SDK-agnostic version)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Domain DTOs
// ---------------------------------------------------------------------------

/** User profile as returned by the user service */
export interface UserDTO {
  id: string;
  email: string;
  username: string;
  /** Raw avatar filename; resolve URL via resolveFileUrl() */
  avatar: string;
  timezone: string;
  themePreference: AppTheme;
  betaTester: boolean;
  verified: boolean;
  emailVisibility: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Company as returned by the company service */
export interface CompanyDTO {
  id: string;
  userId: string;
  name: string;
  websiteUrl: string;
  createdAt: string;
  updatedAt: string;
}

/** Project as returned by simple CRUD operations (no expand/relation data) */
export interface ProjectDTO {
  id: string;
  userId: string;
  title: string;
  /** Foreign-key ID, not the company name */
  companyId: string;
  /** Foreign-key ID, not the artist name */
  artistId: string;
  status: string;
  kitCategory: string;
  drillShape: string;
  datePurchased: string;
  dateReceived: string;
  dateStarted: string;
  dateCompleted: string;
  width: number | undefined;
  height: number | undefined;
  totalDiamonds: number | undefined;
  colorCount: number | undefined;
  generalNotes: string;
  /** Raw image filename; resolve URL via resolveFileUrl() */
  image: string;
  sourceUrl: string;
  createdAt: string;
  updatedAt: string;
  revision?: number;
}

/** Artist as returned by the artist service */
export interface ArtistDTO {
  id: string;
  userId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Auth types
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Type guard
// ---------------------------------------------------------------------------

export function isServiceError(error: unknown): error is ServiceError {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as Record<string, unknown>;
  return (
    typeof candidate.type === 'string' &&
    (SERVICE_ERROR_TYPES as readonly string[]).includes(candidate.type) &&
    typeof candidate.message === 'string' &&
    typeof candidate.retryable === 'boolean'
  );
}
