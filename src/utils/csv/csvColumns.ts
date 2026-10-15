/**
 * Expected CSV column mappings with possible header variations
 */
export const EXPECTED_COLUMNS = {
  // Required fields
  title: {
    aliases: ['title', 'name', 'project name', 'project title', 'project_name', 'project_title'],
    required: true,
    description: 'Project title or name',
  },

  // Core project fields
  status: {
    aliases: ['status', 'state', 'project status', 'project_status'],
    required: false,
    description: 'Project status (wishlist, purchased, progress, completed, etc.)',
    defaultValue: 'wishlist',
  },

  company: {
    aliases: ['company', 'manufacturer', 'brand'],
    required: false,
    description: 'Company or manufacturer name',
  },

  artist: {
    aliases: ['artist', 'creator', 'designer'],
    required: false,
    description: 'Artist or designer name',
  },

  // Dimensions
  width: {
    aliases: ['width'],
    required: false,
    description: 'Canvas width (in cm or inches)',
  },

  height: {
    aliases: ['height', 'length'],
    required: false,
    description: 'Canvas height (in cm or inches)',
  },

  dimensions: {
    aliases: ['dimensions'],
    required: false,
    description: 'Combined dimensions (e.g., "30x40")',
  },

  // Project details
  drillShape: {
    aliases: ['drill shape', 'shape', 'drill_shape'],
    required: false,
    description: 'Drill shape (round or square)',
  },

  kitCategory: {
    aliases: ['type of kit', 'kit category', 'category', 'kit_category'],
    required: false,
    description: 'Kit category (full or mini)',
    defaultValue: 'full',
  },

  canvasType: {
    aliases: ['canvas type', 'canvas', 'canvas_type'],
    required: false,
    description: 'Canvas type',
  },

  drillType: {
    aliases: ['drill type', 'drilltype', 'drill_type'],
    required: false,
    description: 'Drill type',
  },

  // Dates
  datePurchased: {
    aliases: ['date purchased', 'date_purchased', 'purchase date', 'purchased'],
    required: false,
    description: 'Date when project was purchased (YYYY-MM-DD)',
  },

  dateReceived: {
    aliases: ['date received', 'date_received', 'received date', 'received'],
    required: false,
    description: 'Date when project was received (YYYY-MM-DD)',
  },

  dateStarted: {
    aliases: ['date started', 'date_started', 'start date', 'started'],
    required: false,
    description: 'Date when project was started (YYYY-MM-DD)',
  },

  dateCompleted: {
    aliases: ['date completed', 'date_completed', 'completion date', 'completed'],
    required: false,
    description: 'Date when project was completed (YYYY-MM-DD)',
  },

  // Additional fields
  generalNotes: {
    aliases: ['notes', 'general notes', 'general_notes', 'description'],
    required: false,
    description: 'General notes or description',
  },

  sourceUrl: {
    aliases: ['source url', 'project url', 'source_url', 'project_url', 'url', 'source', 'link'],
    required: false,
    description: 'Source URL or link',
  },

  totalDiamonds: {
    aliases: ['total diamonds', 'diamond count', 'diamonds', 'count', 'total_diamonds'],
    required: false,
    description: 'Total number of diamonds',
  },

  colorCount: {
    aliases: ['# of colors', 'number of colors', 'color count', 'colors', 'color_count'],
    required: false,
    description: 'Number of colors',
  },

  tags: {
    aliases: ['tags', 'tag', 'labels'],
    required: false,
    description: 'Tags separated by semicolons (;)',
  },
} as const;
