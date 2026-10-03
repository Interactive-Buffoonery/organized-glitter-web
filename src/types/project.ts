// Re-export shared types for backward compatibility
export type {
  ProjectStatus,
  ProjectFilterStatus,
  Project,
  ProjectFormValues,
  ProgressNote,
  Project as ProjectType, // Alias for backward compatibility
} from './shared';

// Export additional types that might be used in the application
export * from './shared';
