/// <reference path="../pb_data/types.d.ts" />
const CRAFTING_OWNER_RULE = '@request.auth.verified = true && user = @request.auth.id';

function craftingIdField(id) {
  return {
    autogeneratePattern: '[a-z0-9]{15}',
    help: '',
    hidden: false,
    id,
    max: 15,
    min: 15,
    name: 'id',
    pattern: '^[a-z0-9]+$',
    presentable: false,
    primaryKey: true,
    required: true,
    system: true,
    type: 'text',
  };
}

function craftingUserField(id) {
  return {
    name: 'user',
    type: 'relation',
    id,
    hidden: false,
    presentable: false,
    system: false,
    required: true,
    help: '',
    minSelect: 0,
    maxSelect: 1,
    cascadeDelete: true,
    collectionId: '_pb_users_auth_',
  };
}

function craftingAutodates(createdId, updatedId) {
  return [
    {
      hidden: false,
      id: createdId,
      name: 'created',
      onCreate: true,
      onUpdate: false,
      presentable: false,
      system: false,
      type: 'autodate',
    },
    {
      hidden: false,
      id: updatedId,
      name: 'updated',
      onCreate: true,
      onUpdate: true,
      presentable: false,
      system: false,
      type: 'autodate',
    },
  ];
}

migrate(
  app => {
    const activity = new Collection({
      name: 'crafting_activity',
      id: 'pbc_3829104471',
      type: 'base',
      system: false,
      fields: [
        craftingIdField('text3829104401'),
        craftingUserField('relation3829104402'),
        {
          name: 'slot',
          type: 'date',
          id: 'date3829104403',
          hidden: false,
          presentable: false,
          system: false,
          required: true,
          help: '',
          min: '',
          max: '',
        },
        ...craftingAutodates('autodate3829104404', 'autodate3829104405'),
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_crafting_activity_user_slot ON crafting_activity (user, slot)',
      ],
      listRule: CRAFTING_OWNER_RULE,
      viewRule: CRAFTING_OWNER_RULE,
      createRule: null,
      updateRule: null,
      deleteRule: null,
    });
    app.save(activity);

    const marks = new Collection({
      name: 'crafting_day_marks',
      id: 'pbc_3829104472',
      type: 'base',
      system: false,
      fields: [
        craftingIdField('text3829104411'),
        craftingUserField('relation3829104412'),
        {
          name: 'day',
          type: 'text',
          id: 'text3829104413',
          hidden: false,
          presentable: false,
          system: false,
          required: true,
          help: '',
          autogeneratePattern: '',
          min: 10,
          max: 10,
          pattern: '^\\d{4}-\\d{2}-\\d{2}$',
          primaryKey: false,
        },
        ...craftingAutodates('autodate3829104414', 'autodate3829104415'),
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_crafting_day_marks_user_day ON crafting_day_marks (user, day)',
      ],
      listRule: CRAFTING_OWNER_RULE,
      viewRule: CRAFTING_OWNER_RULE,
      createRule: CRAFTING_OWNER_RULE,
      updateRule: null,
      deleteRule: CRAFTING_OWNER_RULE,
    });
    return app.save(marks);
  },
  app => {
    const marks = app.findCollectionByNameOrId('crafting_day_marks');
    if (app.countRecords(marks) > 0)
      throw new Error(
        'Refusing destructive rollback: crafting_day_marks contains saved user work.'
      );
    app.delete(marks);
    return app.delete(app.findCollectionByNameOrId('crafting_activity'));
  }
);
