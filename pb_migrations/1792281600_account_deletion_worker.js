/// <reference path="../pb_data/types.d.ts" />

migrate(
  app => {
    const jobs = app.findCollectionByNameOrId('account_deletion_jobs');
    jobs.fields.removeByName('revenuecat_status');
    jobs.fields.getByName('proof_hash').required = false;
    jobs.fields.getByName('posthog_status').values = [
      'pending',
      'requested',
      'blocked',
      'completed',
    ];
    const fields = [
      {
        hidden: false,
        id: 'date4070000020',
        name: 'next_alert',
        presentable: false,
        required: false,
        system: false,
        type: 'date',
        help: '',
        max: '',
        min: '',
      },
      {
        hidden: false,
        id: 'select4070000010',
        name: 'source_kind',
        presentable: false,
        required: true,
        system: false,
        type: 'select',
        help: '',
        maxSelect: 1,
        values: ['guarded', 'legacy'],
      },
      {
        hidden: false,
        id: 'json4070000011',
        name: 'posthog_target',
        presentable: false,
        required: false,
        system: false,
        type: 'json',
        maxSize: 250000,
      },
      {
        hidden: false,
        id: 'number4070000012',
        name: 'attempts',
        presentable: false,
        required: false,
        system: false,
        type: 'number',
        max: null,
        min: 0,
        onlyInt: true,
      },
      {
        hidden: false,
        id: 'date4070000013',
        name: 'next_attempt',
        presentable: false,
        required: false,
        system: false,
        type: 'date',
        help: '',
        max: '',
        min: '',
      },
      {
        hidden: false,
        id: 'date4070000014',
        name: 'lease_until',
        presentable: false,
        required: false,
        system: false,
        type: 'date',
        help: '',
        max: '',
        min: '',
      },
      {
        hidden: false,
        id: 'date4070000015',
        name: 'posthog_requested_at',
        presentable: false,
        required: false,
        system: false,
        type: 'date',
        help: '',
        max: '',
        min: '',
      },
      {
        hidden: false,
        id: 'date4070000016',
        name: 'posthog_verified_at',
        presentable: false,
        required: false,
        system: false,
        type: 'date',
        help: '',
        max: '',
        min: '',
      },
      {
        hidden: false,
        id: 'date4070000017',
        name: 'alerted_at',
        presentable: false,
        required: false,
        system: false,
        type: 'date',
        help: '',
        max: '',
        min: '',
      },
      {
        hidden: false,
        id: 'text4070000018',
        name: 'lease_token',
        presentable: false,
        required: false,
        system: false,
        type: 'text',
        help: '',
        autogeneratePattern: '',
        max: 64,
        min: 0,
        pattern: '',
        primaryKey: false,
      },
      {
        hidden: false,
        id: 'text4070000019',
        name: 'last_error',
        presentable: false,
        required: false,
        system: false,
        type: 'text',
        help: '',
        autogeneratePattern: '',
        max: 64,
        min: 0,
        pattern: '',
        primaryKey: false,
      },
    ];
    for (const field of fields) jobs.fields.add(new Field(field));
    jobs.indexes = [
      "CREATE UNIQUE INDEX idx_account_deletion_proof ON account_deletion_jobs (proof_hash) WHERE proof_hash != ''",
      'CREATE INDEX idx_account_deletion_cleanup ON account_deletion_jobs (cleanup_completed)',
      'CREATE UNIQUE INDEX idx_account_deletion_user ON account_deletion_jobs (user_id)',
      "CREATE INDEX idx_account_deletion_work ON account_deletion_jobs (next_attempt, created, id) WHERE posthog_status != 'completed'",
      "CREATE INDEX idx_account_deletion_alert ON account_deletion_jobs (next_alert, created, id) WHERE posthog_status != 'completed'",
    ];
    app.save(jobs);
    const audits = app.findCollectionByNameOrId('account_deletions');
    audits.indexes = [
      ...audits.indexes,
      'CREATE INDEX idx_account_deletions_created ON account_deletions (created)',
    ];
    app.save(audits);
    // Earlier manual flags contain no verification evidence. Keep the receipts
    // but require the worker to establish erasure before retention can expire.
    app
      .db()
      .newQuery(
        `UPDATE account_deletion_jobs
      SET source_kind = 'guarded', posthog_status = 'pending', cleanup_completed = '',
        next_alert = coalesce(strftime('%Y-%m-%d %H:%M:%fZ', created, '+14 days'), strftime('%Y-%m-%d %H:%M:%fZ', 'now', '+14 days'))`
      )
      .execute();
  },
  () => {
    throw new Error('Refusing destructive rollback: durable erasure targets may be active.');
  }
);
