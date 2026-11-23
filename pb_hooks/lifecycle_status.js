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

function setColoringPageCompletionIntent(record, patch, mobileStatusOnly = false) {
  if (mobileStatusOnly) {
    record.setRaw('coloringCompletionIntent', 'mobileStatusOnly');
  } else if (
    Object.prototype.hasOwnProperty.call(patch, 'completed_at') &&
    !record.getString('completed_at')
  ) {
    record.setRaw('coloringCompletionIntent', 'clear');
  }
}

function applyColoringPageCompletion(e, isUpdate) {
  applyCompletionStatus(e, 'completed_at', isUpdate);

  const record = e.record;
  const intent = record.getString('coloringCompletionIntent');
  const previous = isUpdate ? record.original() : null;
  record.set('mobile_completion_date_generated', false);
  if (
    e.context.value('organized_glitter_archive_restore') === true ||
    intent === 'clear' ||
    record.getString('status') !== 'completed' ||
    previous?.getString('status') === 'completed' ||
    record.getString('completed_at')
  ) {
    return;
  }

  const book = e.app.findRecordById('coloring_books', record.getString('book'));
  const owner = e.app.findRecordById('users', book.getString('user'));
  const timezone = owner.getString('timezone');
  const today = new DateTime()
    .time()
    .in(new Timezone(timezone === 'Local' ? 'UTC' : timezone))
    .format('2006-01-02');
  record.set('completed_at', today);
  record.set('mobile_completion_date_generated', intent === 'mobileStatusOnly');
}

module.exports = {
  applyCompletionStatus,
  applyColoringPageCompletion,
  setColoringPageCompletionIntent,
};
