/// <reference path="../../pb_data/types.d.ts" />

onRecordCreate(e => {
  e.next();
  const itemId = e.record.getString('item_id');
  if (itemId === 'asset:rollback-new-file' || itemId === 'asset:rollback-gallery') {
    throw new Error('forced rollback after archive target and receipt save');
  }
}, 'archive_restore_items');
