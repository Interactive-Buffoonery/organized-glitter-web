/**
 * Shared type definitions used across the application
 * These types should be used to ensure consistency between the frontend and backend
 */

// Import project status types from dedicated file
import type { ProjectStatus, ProjectFilterStatus } from './project-status';
import type { Tag } from './tag';
import type { MarkdownString } from './markdown';

// Re-export for use elsewhere
export type { ProjectStatus, ProjectFilterStatus, Tag }; // Added Tag here

/**
 * Project interface for the frontend application
 * Uses camelCase for JavaScript/TypeScript conventions
 */
export interface Project {
  id: string;
  userId: string;
  title: string;
  company?: string;
  artist?: string;
  drillShape?: string;
  drillType?: string;
  canvasType?: string;
  width?: number;
  height?: number;
  status: ProjectStatus;
  datePurchased?: string;
  dateReceived?: string;
  dateStarted?: string;
  dateCompleted?: string;
  generalNotes?: string;
  imageUrl?: string;
  sourceUrl?: string;
  totalDiamonds?: number;
  colorCount?: number;
  kitCategory?: 'full' | 'mini';
  progressNotes?: ProgressNote[];
  progressImages?: string[];
  tags?: Tag[];
  tagNames?: string[]; // For CSV import compatibility
  createdAt: string;
  updatedAt: string;
  revision?: number;
}

export interface ProgressNote {
  id: string;
  projectId: string;
  content: MarkdownString;
  date: string;
  imageUrl?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Type for form values when creating/editing a project
 */
export interface ProjectFormValues extends Omit<
  Project,
  | 'id'
  | 'createdAt'
  | 'updatedAt'
  | 'revision'
  | 'progressNotes'
  | 'progressImages'
  | 'width'
  | 'height'
  | 'totalDiamonds'
  | 'colorCount'
  | 'drillShape'
> {
  id?: string;
  imageFile?: File | null;
  imageRemoved?: boolean;
  width?: string; // Keep as string for form input
  height?: string; // Keep as string for form input
  totalDiamonds?: string | number; // Allow both string (from form) and number (converted)
  colorCount?: string | number;
  kitCategory?: 'full' | 'mini';
  // null expresses "clear drill shape" (distinct from undefined = don't touch),
  // so a "Not set" picker option can flow through to the update adapter.
  drillShape?: string | null;
  tagIds?: string[]; // Add tagIds for form compatibility
}

/**
 * Type for project creation DTO
 */
export interface ProjectCreateDTO {
  userId: string;
  title: string;
  company?: string;
  artist?: string;
  drillShape?: string;
  width?: number; // Change to number for DTO
  height?: number; // Change to number for DTO
  status?: ProjectStatus;
  datePurchased?: string;
  dateReceived?: string;
  dateStarted?: string;
  dateCompleted?: string;
  notes?: string;
  generalNotes?: string;
  imageUrl?: string;
  sourceUrl?: string;
  totalDiamonds?: number;
  colorCount?: number;
  // Optional fields that exist in database but not commonly used in imports yet:
  drillType?: string;
  canvasType?: string;
  kitCategory?: 'full' | 'mini';
  tagIds?: string[]; // Changed from tagNames to tagIds for import optimization
}

/**
 * Service response types
 */
export type ServiceResponseSuccess<T> = {
  data: T;
  error: null;
  status: 'success';
};

export type ServiceResponseError = {
  data: null;
  error: Error;
  status: 'error';
};

export type ServiceResponse<T> = ServiceResponseSuccess<T> | ServiceResponseError;

// Type guards
export function isServiceResponseError<T>(
  response: ServiceResponse<T>
): response is ServiceResponseError {
  return response.status === 'error' && response.error !== null;
}

// Helper functions to create responses
export function createSuccessResponse<T>(data: T): ServiceResponseSuccess<T> {
  return {
    data,
    error: null,
    status: 'success',
  };
}

export function createErrorResponse(error: Error): ServiceResponseError {
  return {
    data: null,
    error,
    status: 'error',
  };
}
