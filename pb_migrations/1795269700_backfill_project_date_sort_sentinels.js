/// <reference path="../pb_data/types.d.ts" />

migrate(
  app => {
    const dateFields = ['date_purchased', 'date_received', 'date_started', 'date_completed'];
    const sentinels = [...dateFields.map(field => `${field}_has_value`), 'width_has_value'];
    const assignments = sentinels.map(field => `${field} = {:${field}}`).join(', ');
    const update = app
      .db()
      .newQuery(`UPDATE projects SET ${assignments} WHERE id = {:id}`)
      .prepare();
    const batchSize = 250;
    let cursor = '';
    let records;
    try {
      do {
        records = arrayOf(new Record());
        app
          .recordQuery('projects')
          .select('id', ...dateFields, 'width', ...sentinels)
          .andWhere($dbx.exp('id > {:cursor}', { cursor }))
          .orderBy('id')
          .limit(batchSize)
          .all(records);

        for (const record of records) {
          cursor = record.id;
          // PocketBase's date parser matches the hook for raw restored values.
          const values = { id: record.id, width_has_value: record.getFloat('width') > 0 ? 0 : 1 };
          for (const field of dateFields) {
            values[`${field}_has_value`] = record.getString(field) ? 0 : 1;
          }
          if (sentinels.some(field => record.getFloat(field) !== values[field])) {
            update.bind(values).execute();
          }
        }
      } while (records.length === batchSize);
    } finally {
      update.close();
    }
  },
  // Keep the corrected derived values on rollback.
  () => {}
);
