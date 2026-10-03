export const sessionDraftKeys = {
  feedback: 'feedback-dialog',
  newProject: '/projects/new:diamond',
  newColoringBook: '/projects/new:coloring',
  projectEdit: (id: string, layout: 'page' | 'drawer') => `project-edit:${id}:${layout}`,
  projectNotes: (id: string) => `project-notes:${id}`,
  coloringBookEdit: (id: string, layout: 'page' | 'drawer') => `coloring-book-edit:${id}:${layout}`,
  coloringBookNotes: (id: string) => `coloring-book-notes:${id}`,
} as const;
