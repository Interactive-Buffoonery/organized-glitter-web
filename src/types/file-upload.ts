/**
 * Type definitions for file upload and project update operations
 * Provides type safety for image uploads and project mutations
 */

/**
 * Project update data in snake_case format for PocketBase
 * Maps from camelCase frontend fields to snake_case backend fields
 */
export interface ProjectUpdateData {
  title?: string;
  company?: string | null;
  artist?: string | null;
  status?: string;
  kit_category?: string;
  drill_shape?: string | null;
  date_purchased?: string | null;
  date_started?: string | null;
  date_completed?: string | null;
  date_received?: string | null;
  width?: number | null;
  height?: number | null;
  total_diamonds?: number | null;
  color_count?: number | null;
  general_notes?: string | null;
  source_url?: string | null;
  // Image field - will be handled separately in file upload
  image?: string | File;
}
