// @ts-nocheck

migrate(
  app => {
    app.save(
      new Collection({
        id: 'pbc_apple_grants',
        name: 'apple_oauth_grants',
        type: 'base',
        system: false,
        listRule: null,
        viewRule: null,
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          {
            id: 'text3208210256', name: 'id', type: 'text', system: true,
            required: true, primaryKey: true, min: 15, max: 15,
            pattern: '^[a-z0-9]+$', autogeneratePattern: '[a-z0-9]{15}',
          },
          { id: 'grant_user_id', name: 'user_id', type: 'text', required: true, min: 15, max: 15 },
          { id: 'grant_identity', name: 'provider_id_hash', type: 'text', required: true, min: 64, max: 64 },
          { id: 'grant_client', name: 'client_id', type: 'text', required: true, min: 1, max: 200 },
          { id: 'grant_cipher', name: 'ciphertext', type: 'text', required: true, min: 1, max: 10000, hidden: true },
          { id: 'grant_key', name: 'key_version', type: 'text', required: true, min: 1, max: 20 },
          {
            id: 'grant_state', name: 'state', type: 'select', required: true,
            maxSelect: 1, values: ['active', 'revocation_pending'],
          },
          { id: 'grant_created', name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { id: 'grant_updated', name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX `idx_apple_grant_identity_client` ON `apple_oauth_grants` (`provider_id_hash`, `client_id`)',
          'CREATE INDEX `idx_apple_grant_user_state` ON `apple_oauth_grants` (`user_id`, `state`)',
        ],
      })
    );

    const settings = app.settings();
    const rules = [
      {
        label: 'POST /api/auth/apple/native',
        audience: '@guest',
        duration: 60,
        maxRequests: 5,
      },
      {
        label: 'GET /api/auth/apple/native/readiness',
        audience: '',
        duration: 60,
        maxRequests: 12,
      },
    ];
    settings.rateLimits.rules = settings.rateLimits.rules.filter(
      item => !rules.some(rule => item.label === rule.label)
    );
    settings.rateLimits.rules.push(...rules);
    app.save(settings);
  },
  app => {
    const grants = app.findCollectionByNameOrId('apple_oauth_grants');
    if (app.countRecords('apple_oauth_grants') > 0) {
      throw new Error('Refusing to remove stored Apple revocation grants.');
    }
    app.delete(grants);
    const settings = app.settings();
    settings.rateLimits.rules = settings.rateLimits.rules.filter(
      item =>
        item.label !== 'POST /api/auth/apple/native' &&
        item.label !== 'GET /api/auth/apple/native/readiness'
    );
    app.save(settings);
  }
);
