/// <reference path="../pb_data/types.d.ts" />

migrate(
  app => {
    const projects = app.findCollectionByNameOrId('projects');
    const colorCount = projects.fields.getByName('color_count');
    if (!colorCount || colorCount.min == null || Number(colorCount.min) !== 1) return;
    colorCount.min = 0;
    app.save(projects);
  },
  () => {
    // Raising the minimum again could reject existing projects with no colors.
  }
);
