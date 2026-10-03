/// <reference path="../pb_data/types.d.ts" />
migrate(
  app => {
    const collection = new Collection({
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
          id: 'relation2375276105',
          maxSelect: 1,
          minSelect: 0,
          name: 'user',
          presentable: false,
          required: true,
          system: false,
          type: 'relation',
        },
        {
          help: '',
          hidden: false,
          id: 'date3888362359',
          max: '',
          min: '',
          name: 'window_started',
          presentable: false,
          required: true,
          system: false,
          type: 'date',
        },
        {
          help: '',
          hidden: false,
          id: 'number3241891149',
          max: 5,
          min: 0,
          name: 'failure_count',
          onlyInt: true,
          presentable: false,
          required: true,
          system: false,
          type: 'number',
        },
      ],
      id: 'pbc_799946844',
      indexes: [
        'CREATE UNIQUE INDEX idx_auth_step_up_attempt_user ON auth_step_up_attempts (user)',
      ],
      listRule: null,
      name: 'auth_step_up_attempts',
      system: false,
      type: 'base',
      updateRule: null,
      viewRule: null,
    });

    return app.save(collection);
  },
  () => {
    throw new Error('Refusing destructive rollback: step-up attempt state may be active.');
  }
);
