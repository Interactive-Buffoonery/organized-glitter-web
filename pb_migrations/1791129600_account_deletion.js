/// <reference path="../pb_data/types.d.ts" />
migrate(
  app => {
    const proofs = app.findCollectionByNameOrId('auth_step_up_proofs');
    proofs.fields.getByName('action').values = ['link', 'unlink', 'delete_account'];
    proofs.fields.getByName('target_provider').values = ['apple', 'google', 'discord', 'account'];
    app.save(proofs);
    const settings = app.settings();
    settings.rateLimits.rules = settings.rateLimits.rules.filter(
      rule => rule.label !== 'POST /api/account/delete'
    );
    settings.rateLimits.rules.push({
      label: 'POST /api/account/delete',
      audience: '',
      duration: 60,
      maxRequests: 20,
    });
    app.save(settings);
    app.save(
      new Collection({
        id: 'pbc_4070000000',
        name: 'account_deletion_jobs',
        type: 'base',
        system: false,
        listRule: null,
        viewRule: null,
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          {
            autogeneratePattern: '[a-z0-9]{15}',
            help: '',
            hidden: false,
            id: 'text3208210256',
            max: 15,
            min: 15,
            name: 'id',
            pattern: '^[a-z0-9]+$',
            presentable: false,
            primaryKey: true,
            required: true,
            system: true,
            type: 'text',
          },
          {
            autogeneratePattern: '',
            help: '',
            hidden: false,
            id: 'text2809058197',
            max: 0,
            min: 0,
            name: 'user_id',
            pattern: '',
            presentable: false,
            primaryKey: false,
            required: true,
            system: false,
            type: 'text',
          },
          {
            hidden: false,
            id: 'autodate2990389176',
            name: 'created',
            onCreate: true,
            onUpdate: false,
            presentable: false,
            system: false,
            type: 'autodate',
          },
          {
            hidden: false,
            id: 'autodate3332085495',
            name: 'updated',
            onCreate: true,
            onUpdate: true,
            presentable: false,
            system: false,
            type: 'autodate',
          },
          {
            autogeneratePattern: '',
            help: '',
            hidden: false,
            id: 'text733053279',
            max: 64,
            min: 0,
            name: 'proof_hash',
            pattern: '^[a-f0-9]{64}$',
            presentable: false,
            primaryKey: false,
            required: true,
            system: false,
            type: 'text',
          },
          {
            help: '',
            hidden: false,
            id: 'select4070000001',
            maxSelect: 1,
            name: 'posthog_status',
            presentable: false,
            required: true,
            system: false,
            type: 'select',
            values: ['pending', 'completed'],
          },
          {
            help: '',
            hidden: false,
            id: 'select4070000002',
            maxSelect: 1,
            name: 'revenuecat_status',
            presentable: false,
            required: true,
            system: false,
            type: 'select',
            values: ['pending', 'completed'],
          },
          {
            help: '',
            hidden: false,
            id: 'date4070000003',
            max: '',
            min: '',
            name: 'cleanup_completed',
            presentable: false,
            required: false,
            system: false,
            type: 'date',
          },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_account_deletion_proof ON account_deletion_jobs (proof_hash)',
          'CREATE INDEX idx_account_deletion_cleanup ON account_deletion_jobs (cleanup_completed)',
        ],
      })
    );
  },
  () => {
    throw new Error('Refusing destructive rollback: deletion jobs and proofs may be active.');
  }
);
