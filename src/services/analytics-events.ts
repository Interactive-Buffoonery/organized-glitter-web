/**
 * Standardised analytics event names.
 * Kept in a standalone module so every caller can import them
 * without pulling in the PostHog SDK.
 */
export const AnalyticsEvent = {
  // PostHog reserved events
  PAGE_VIEW: '$pageview',
  // EXCEPTION is intentionally omitted — always use captureException() instead of
  // capture(AnalyticsEvent.EXCEPTION, ...) so PostHog Cymbal receives the structured
  // $exception_list payload.  See fatalErrorHandler.ts and analytics-escape-hatch.ts.

  // Projects
  PROJECT_CREATED: 'project_created',
  PROJECT_UPDATED: 'project_updated',
  PROJECT_DELETED: 'project_deleted',
  PROJECT_ARCHIVED: 'project_archived',
  PROJECT_STATUS_CHANGED: 'project_status_changed',

  // Companies / Artists / Tags
  COMPANY_CREATED: 'company_created',
  COMPANY_UPDATED: 'company_updated',
  COMPANY_DELETED: 'company_deleted',
  ARTIST_CREATED: 'artist_created',
  ARTIST_UPDATED: 'artist_updated',
  ARTIST_DELETED: 'artist_deleted',
  TAG_UPDATED: 'tag_updated',
  TAG_DELETED: 'tag_deleted',

  // Randomizer
  RANDOMIZER_SPIN: 'randomizer_spin',

  // Session context
  SESSION_CONTEXT: 'session_context',

  // Bootstrap / pre-React shell (also fired from public/js/bootstrap-analytics.js)
  BOOTSTRAP_FAILURE_SHOWN: 'bootstrap_failure_shown',
  BOOTSTRAP_RECOVERED: 'bootstrap_recovered',

  // API health
  API_RATE_LIMITED: 'api_rate_limited',

  // Auth
  REGISTRATION_STARTED: 'registration_started',
  AUTH_LOGIN_SUCCEEDED: 'auth_login_succeeded',
  AUTH_REGISTRATION_SUCCEEDED: 'auth_registration_succeeded',

  // Growth funnel

  // Dashboard
  DASHBOARD_SORT_CHANGED: 'dashboard_sort_changed',
  DASHBOARD_SORT_SHEET_OPENED: 'dashboard_sort_sheet_opened',
  DASHBOARD_FILTER_DRAWER_OPENED: 'dashboard_filter_drawer_opened',
  DASHBOARD_VIEW_TOGGLED: 'dashboard_view_toggled',
  DASHBOARD_SEARCH_PERFORMED: 'dashboard_search_performed',
  DASHBOARD_PROJECT_OPENED: 'dashboard_project_opened',
  DASHBOARD_STATUS_SEGMENT_CLICKED: 'dashboard_status_segment_clicked',
  DASHBOARD_PRESET_CHIP_CLICKED: 'dashboard_preset_chip_clicked',
  DASHBOARD_MODE_CHANGED: 'dashboard_mode_changed',
  DASHBOARD_LOADED: 'dashboard_loaded',

  // Coloring books
  COLORING_BOOK_CREATED: 'coloring_book_created',
  COLORING_BOOK_UPDATED: 'coloring_book_updated',
  COLORING_BOOK_DELETED: 'coloring_book_deleted',
  COLORING_BOOK_STATUS_CHANGED: 'coloring_book_status_changed',
  COLORING_BOOKS_SEARCH_PERFORMED: 'coloring_books_search_performed',
  COLORING_BOOKS_SORT_CHANGED: 'coloring_books_sort_changed',
  COLORING_BOOKS_VIEW_TOGGLED: 'coloring_books_view_toggled',
  COLORING_BOOKS_FILTER_DRAWER_OPENED: 'coloring_books_filter_drawer_opened',
  COLORING_BOOKS_FILTER_CHANGED: 'coloring_books_filter_changed',
  COLORING_BOOKS_FILTERS_CLEARED: 'coloring_books_filters_cleared',

  // Coloring pages
  COLORING_PAGE_STATUS_CHANGED: 'coloring_page_status_changed',
  COLORING_PAGE_PHOTO_ADDED: 'coloring_page_photo_added',
  COLORING_PAGE_PHOTO_DELETED: 'coloring_page_photo_deleted',
  COLORING_PAGE_PROGRESS_NOTE_ADDED: 'coloring_page_progress_note_added',
  COLORING_PAGE_PROGRESS_NOTE_UPDATED: 'coloring_page_progress_note_updated',
  COLORING_PAGE_PROGRESS_NOTE_DELETED: 'coloring_page_progress_note_deleted',
  COLORING_MYSTERY_PAGE_REVEALED: 'coloring_mystery_page_revealed',

  // Coloring taxonomy
  BOOK_PUBLISHER_CREATED: 'book_publisher_created',
  BOOK_ILLUSTRATOR_CREATED: 'book_illustrator_created',
  COLORING_MEDIUM_CREATED: 'coloring_medium_created',
  COLORING_MEDIUM_UPDATED: 'coloring_medium_updated',
  COLORING_MEDIUM_DELETED: 'coloring_medium_deleted',

  // Overview / profile
  OVERVIEW_CRAFT_FILTER_CHANGED: 'overview_craft_filter_changed',
  OVERVIEW_SORT_CHANGED: 'overview_sort_changed',
  VERTICAL_PREFERENCES_UPDATED: 'vertical_preferences_updated',

  // Support page
  TIP_LINK_CLICKED: 'tip_link_clicked',
  SUPPORT_ALTERNATIVE_CLICKED: 'support_alternative_clicked',

  // Import / Export
  IMPORT_COMPLETED: 'import_completed',
  EXPORT_COMPLETED: 'export_completed',
  ARCHIVE_IMPORT_STARTED: 'archive_import_started',
  ARCHIVE_IMPORT_COMPLETED: 'archive_import_completed',
  ARCHIVE_EXPORT_STARTED: 'archive_export_started',
  ARCHIVE_EXPORT_COMPLETED: 'archive_export_completed',
  BULK_PHOTO_IMPORT_STARTED: 'bulk_photo_import_started',
  BULK_PHOTO_IMPORT_COMPLETED: 'bulk_photo_import_completed',
  DAC_IMPORT_PREVIEWED: 'dac_import_previewed',
  DAC_IMPORT_COMPLETED: 'dac_import_completed',
  CSV_EXPORT_COMPLETED: 'csv_export_completed',

  // Progress notes
  PROGRESS_NOTE_ADDED: 'progress_note_added',
} as const;
