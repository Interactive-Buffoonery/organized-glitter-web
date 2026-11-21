/// <reference path="../pb_data/types.d.ts" />

migrate(
  app => {
    const dateFields = ['date_purchased', 'date_received', 'date_started', 'date_completed'];
    const sentinels = dateFields.map(field => ({
      column: `${field}_has_value`,
      value: `CASE WHEN COALESCE(${field}, '') = '' THEN 1 ELSE 0 END`,
    }));
    const assignments = sentinels.map(({ column, value }) => `${column} = ${value}`).join(', ');
    const mismatches = sentinels
      .map(({ column, value }) => `${column} IS NOT ${value}`)
      .join(' OR ');
    app.db().newQuery(`UPDATE projects SET ${assignments} WHERE ${mismatches}`).execute();
  },
  // Keep the corrected derived values on rollback.
  () => {}
);
