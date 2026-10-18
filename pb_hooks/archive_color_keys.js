function saveKey(app, record, metadata, context) {
  require(`${__hooks}/color_keys.js`).prepareKeyCreate(metadata);
  const fields = [
    'position',
    'symbol',
    'code',
    'color_name',
    'swatch',
    'tried',
    'note',
    'created',
    'updated',
  ];
  if (
    !metadata ||
    typeof metadata !== 'object' ||
    Array.isArray(metadata) ||
    Object.keys(metadata).some(key => !fields.includes(key))
  ) {
    throw new BadRequestError('Invalid color key metadata.');
  }
  for (const field of fields) {
    if (field !== 'position' && field !== 'tried' && typeof metadata[field] !== 'string')
      throw new BadRequestError('Invalid color key text.');
    record.set(field, metadata[field]);
  }
  for (const field of ['created', 'updated']) {
    if (
      !metadata[field] ||
      metadata[field].length > 40 ||
      !Number.isFinite(Date.parse(metadata[field]))
    )
      throw new BadRequestError('Invalid color key date.');
  }
  const created = new Date(metadata.created).toISOString().replace('T', ' ');
  const updated = new Date(metadata.updated).toISOString().replace('T', ' ');
  app.saveWithContext(context, record);
  // Autodate fields overwrite supplied dates during save, after validation hooks.
  app
    .db()
    .newQuery(
      'UPDATE coloring_page_color_keys SET created = {:created}, updated = {:updated} WHERE id = {:id}'
    )
    .bind({ created, updated, id: record.id })
    .execute();
  record.set('created', created);
  record.set('updated', updated);
}
module.exports = { saveKey };
