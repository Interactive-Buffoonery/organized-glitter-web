/// <reference path="../pb_data/types.d.ts" />

// Keeps the sort-proxy columns on `projects` in sync with the canonical
// fields they derive from. See pb_migrations/1777100000_add_sort_proxy_columns_to_projects.js
// for the column definitions and the initial backfill.
//
// Four hooks:
//   1. onRecordCreate / onRecordUpdate on `projects`
//      Populate proxy columns directly on the in-memory record
//      before it's persisted. No second write, no recursion risk.
//   2. onRecordUpdate on `companies`
//      When a company name changes, re-sync company_name_sort on every
//      project that references that company.
//   3. onRecordUpdate on `artists`
//      Same, for artist renames.

onRecordCreate(e => {
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
      incomingStatus !== 'archived' &&
      incomingStatus !== 'destashed'
    ) {
      record.set('status', 'completed');
    }
    const title = record.get('title') || '';
    const company = record.get('company') || '';
    const artist = record.get('artist') || '';
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

    let companyName = '';
    if (company) {
      try {
        const companyRecord = $app.findRecordById('companies', company);
        companyName = (companyRecord.get('name') || '').toLowerCase();
      } catch (e) {
        companyName = '';
      }
    }

    let artistName = '';
    if (artist) {
      try {
        const artistRecord = $app.findRecordById('artists', artist);
        artistName = (artistRecord.get('name') || '').toLowerCase();
      } catch (e) {
        artistName = '';
      }
    }

    record.set('title_sort', stripLeading(title).toLowerCase());
    record.set('company_name_sort', companyName);
    record.set('artist_name_sort', artistName);
    record.set('company_sort_order', company ? 0 : 1);
    record.set('artist_sort_order', artist ? 0 : 1);
    record.set('status_order', statusOrderByStatus[status] || 0);
    record.set('date_purchased_has_value', datePurchased ? 0 : 1);
    record.set('date_received_has_value', dateReceived ? 0 : 1);
    record.set('date_started_has_value', dateStarted ? 0 : 1);
    record.set('date_completed_has_value', dateCompleted ? 0 : 1);
    record.set('width_has_value', width === null || width === undefined ? 1 : 0);
  } catch (err) {
    $app.logger().error('sort_proxy_sync: failed to compute on create', { error: String(err) });
  }
  e.next();
}, 'projects');

onRecordUpdate(e => {
  try {
    const stripLeading = function (s) {
      if (!s) return '';
      let i = 0;
      while (i < s.length && (s[i] === ' ' || s[i] === "'")) i += 1;
      return s.slice(i);
    };

    const record = e.record;
    const completionDate = record.getString('date_completed');
    const previousCompletionDate = record.original().getString('date_completed');
    const incomingStatus = record.getString('status');
    if (
      e.context.value('organized_glitter_archive_restore') !== true &&
      completionDate &&
      completionDate !== previousCompletionDate &&
      incomingStatus !== 'archived' &&
      incomingStatus !== 'destashed'
    ) {
      record.set('status', 'completed');
    }
    const title = record.get('title') || '';
    const company = record.get('company') || '';
    const artist = record.get('artist') || '';
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

    let companyName = '';
    if (company) {
      try {
        const companyRecord = $app.findRecordById('companies', company);
        companyName = (companyRecord.get('name') || '').toLowerCase();
      } catch (e) {
        companyName = '';
      }
    }

    let artistName = '';
    if (artist) {
      try {
        const artistRecord = $app.findRecordById('artists', artist);
        artistName = (artistRecord.get('name') || '').toLowerCase();
      } catch (e) {
        artistName = '';
      }
    }

    record.set('title_sort', stripLeading(title).toLowerCase());
    record.set('company_name_sort', companyName);
    record.set('artist_name_sort', artistName);
    record.set('company_sort_order', company ? 0 : 1);
    record.set('artist_sort_order', artist ? 0 : 1);
    record.set('status_order', statusOrderByStatus[status] || 0);
    record.set('date_purchased_has_value', datePurchased ? 0 : 1);
    record.set('date_received_has_value', dateReceived ? 0 : 1);
    record.set('date_started_has_value', dateStarted ? 0 : 1);
    record.set('date_completed_has_value', dateCompleted ? 0 : 1);
    record.set('width_has_value', width === null || width === undefined ? 1 : 0);
  } catch (err) {
    $app.logger().error('sort_proxy_sync: failed to compute on update', { error: String(err) });
  }
  e.next();
}, 'projects');

// When a company record is updated, if the name changed, re-sync
// company_name_sort on every project that references this company.
onRecordUpdate(e => {
  try {
    const newName = e.record.get('name') || '';
    const oldName = e.record.original().get('name') || '';
    if (newName !== oldName) {
      $app
        .db()
        .newQuery(`UPDATE projects SET company_name_sort = {:name} WHERE company = {:id}`)
        .bind({ name: newName.toLowerCase(), id: e.record.id })
        .execute();
    }
  } catch (err) {
    $app.logger().error('sort_proxy_sync: company rename re-sync failed', { error: String(err) });
  }
  e.next();
}, 'companies');

onRecordUpdate(e => {
  try {
    const newName = e.record.get('name') || '';
    const oldName = e.record.original().get('name') || '';
    if (newName !== oldName) {
      $app
        .db()
        .newQuery(`UPDATE projects SET artist_name_sort = {:name} WHERE artist = {:id}`)
        .bind({ name: newName.toLowerCase(), id: e.record.id })
        .execute();
    }
  } catch (err) {
    $app.logger().error('sort_proxy_sync: artist rename re-sync failed', { error: String(err) });
  }
  e.next();
}, 'artists');
