/// <reference path="../pb_data/types.d.ts" />
migrate(
  app => {
    return app.save(
      new Collection({
        createRule: null,
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
            cascadeDelete: true,
            collectionId: '_pb_users_auth_',
            help: '',
            hidden: false,
            id: 'relation4060000001',
            maxSelect: 1,
            minSelect: 0,
            name: 'user',
            presentable: false,
            required: true,
            system: false,
            type: 'relation',
          },
          {
            autogeneratePattern: '',
            help: '',
            hidden: false,
            id: 'text4060000003',
            max: 100,
            min: 8,
            name: 'operation_id',
            pattern: '^[A-Za-z0-9_-]{8,100}$',
            presentable: false,
            primaryKey: false,
            required: true,
            system: false,
            type: 'text',
          },
          {
            autogeneratePattern: '',
            help: '',
            hidden: false,
            id: 'text4060000002',
            max: 64,
            min: 0,
            name: 'request_hash',
            pattern: '^[a-f0-9]{64}$',
            presentable: false,
            primaryKey: false,
            required: true,
            system: false,
            type: 'text',
          },
        ],
        id: 'pbc_4060000000',
        indexes: [
          'CREATE UNIQUE INDEX `idx_mobile_sync_receipts_user_operation` ON `mobile_sync_receipts` (`user`, `operation_id`)',
        ],
        listRule: null,
        name: 'mobile_sync_receipts',
        system: false,
        type: 'base',
        updateRule: null,
        viewRule: null,
      })
    );
  },
  app => {
    const receipts = app.findRecordsByFilter('mobile_sync_receipts', "id != ''", '', 1, 0);
    if (receipts.length) throw new Error('Refusing rollback while mobile sync receipts exist.');
    return app.delete(app.findCollectionByNameOrId('pbc_4060000000'));
  }
);
