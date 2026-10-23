/// <reference path="../pb_data/types.d.ts" />

function ownedTaxonomyName(app, record, field, collection) {
  const id = record.getString(field);
  if (!id) return '';
  try {
    const related = app.findRecordById(collection, id);
    return related.getString('user') === record.getString('user')
      ? related.getString('name').toLowerCase()
      : '';
  } catch {
    return '';
  }
}

function syncProject(e, isUpdate) {
  try {
    const stripLeading = function (s) {
      if (!s) return '';
      let i = 0;
      while (i < s.length && (s[i] === ' ' || s[i] === "'")) i += 1;
      return s.slice(i);
    };

    const record = e.record;
    const completionDate = record.getString('date_completed');
    const incomingStatus = record.getString('status');
    if (
      e.context.value('organized_glitter_archive_restore') !== true &&
      completionDate &&
      (!isUpdate || completionDate !== record.original().getString('date_completed')) &&
      incomingStatus !== 'archived' &&
      incomingStatus !== 'destashed'
    ) {
      record.set('status', 'completed');
    }
    const title = record.get('title') || '';
    const status = record.get('status') || '';
    const datePurchased = record.get('date_purchased') || '';
    const dateReceived = record.get('date_received') || '';
    const dateStarted = record.get('date_started') || '';
    const dateCompleted = record.get('date_completed') || '';
    const width = record.get('width');
    const statusOrderByStatus = {
      wishlist: 1,
      purchased: 2,
      stash: 3,
      kitted: 4,
      progress: 5,
      onhold: 6,
      completed: 7,
      archived: 8,
      destashed: 9,
    };

    const companyName = ownedTaxonomyName(e.app, record, 'company', 'companies');
    const artistName = ownedTaxonomyName(e.app, record, 'artist', 'artists');

    record.set('title_sort', stripLeading(title).toLowerCase());
    record.set('company_name_sort', companyName);
    record.set('artist_name_sort', artistName);
    record.set('company_sort_order', companyName ? 0 : 1);
    record.set('artist_sort_order', artistName ? 0 : 1);
    record.set('status_order', statusOrderByStatus[status] || 0);
    record.set('date_purchased_has_value', datePurchased ? 0 : 1);
    record.set('date_received_has_value', dateReceived ? 0 : 1);
    record.set('date_started_has_value', dateStarted ? 0 : 1);
    record.set('date_completed_has_value', dateCompleted ? 0 : 1);
    record.set('width_has_value', width === null || width === undefined ? 1 : 0);
  } catch (err) {
    e.app.logger().error('sort_proxy_sync: failed to compute', { error: String(err) });
  }
  e.next();
}

function syncTaxonomyRename(e, field) {
  try {
    const newName = e.record.getString('name');
    if (newName !== e.record.original().getString('name')) {
      e.app
        .db()
        .newQuery(
          `UPDATE projects SET ${field}_name_sort = {:name}, ${field}_sort_order = CASE WHEN {:name} = '' THEN 1 ELSE 0 END WHERE ${field} = {:id} AND user = {:owner}`
        )
        .bind({ name: newName.toLowerCase(), id: e.record.id, owner: e.record.getString('user') })
        .execute();
    }
  } catch (err) {
    e.app.logger().error('sort_proxy_sync: taxonomy rename re-sync failed', { error: String(err) });
  }
  e.next();
}

module.exports = { syncProject, syncTaxonomyRename };
