/// <reference path="../pb_data/types.d.ts" />

function applyCompletionStatus(e, dateField, isUpdate) {
  const record = e.record;
  const date = record.getString(dateField);
  const status = record.getString('status');
  if (
    e.context.value('organized_glitter_archive_restore') !== true &&
    date &&
    (!isUpdate || date !== record.original().getString(dateField)) &&
    status !== 'archived' &&
    status !== 'destashed'
  ) {
    record.set('status', 'completed');
  }
}

module.exports = { applyCompletionStatus };
