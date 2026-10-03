/// <reference path="../pb_data/types.d.ts" />

const USERS_COLLECTION_ID = '_pb_users_auth_';
const VERIFIED_AUTH_RULE = 'verified = true';
const VERIFIED_REQUEST_RULE = '@request.auth.verified = true';
const RULE_FIELDS = ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule'];
const BUSINESS_COLLECTIONS = [
  'account_deletions',
  'artists',
  'book_illustrators',
  'book_publishers',
  'coloring_book_tags',
  'coloring_books',
  'coloring_mediums',
  'coloring_page_progress_notes',
  'coloring_pages',
  'coloring_tags',
  'companies',
  'progress_notes',
  'project_tags',
  'projects',
  'randomizer_spins',
  'tags',
  'user_dashboard_settings',
  'user_dashboard_stats',
  'user_yearly_stats',
  'coloring_page_color_references',
];

function addVerifiedRequestRule(rule) {
  if (rule === null) return null;
  if (rule === '') return VERIFIED_REQUEST_RULE;
  return `${VERIFIED_REQUEST_RULE} && (${rule})`;
}

function removeVerifiedRequestRule(rule) {
  if (rule === VERIFIED_REQUEST_RULE) return '';

  const prefix = `${VERIFIED_REQUEST_RULE} && (`;
  if (typeof rule === 'string' && rule.startsWith(prefix) && rule.endsWith(')')) {
    return rule.slice(prefix.length, -1);
  }

  return rule;
}

function updateCollectionRules(app, collectionName, transform) {
  const collection = app.findCollectionByNameOrId(collectionName);

  RULE_FIELDS.forEach(field => {
    collection[field] = transform(collection[field]);
  });

  app.save(collection);
}

migrate(
  app => {
    app
      .db()
      .newQuery(
        `
          UPDATE users
          SET verified = TRUE
          WHERE verified = FALSE
            AND id IN (
              SELECT recordRef
              FROM _externalAuths
              WHERE collectionRef = {:collectionId}
            )
        `
      )
      .bind({ collectionId: USERS_COLLECTION_ID })
      .execute();

    const users = app.findCollectionByNameOrId(USERS_COLLECTION_ID);
    users.authRule = VERIFIED_AUTH_RULE;
    users.listRule = addVerifiedRequestRule(users.listRule);
    users.viewRule = addVerifiedRequestRule(users.viewRule);
    users.updateRule = addVerifiedRequestRule(users.updateRule);
    users.deleteRule = addVerifiedRequestRule(users.deleteRule);
    // authRule is evaluated only during authentication. Rotate the collection
    // secret so already-issued JWTs cannot keep using protected APIs.
    users.authToken.secret = $security.randomString(50);
    app.save(users);

    BUSINESS_COLLECTIONS.forEach(name => {
      updateCollectionRules(app, name, addVerifiedRequestRule);
    });
  },
  app => {
    const users = app.findCollectionByNameOrId(USERS_COLLECTION_ID);
    users.authRule = '';
    users.listRule = removeVerifiedRequestRule(users.listRule);
    users.viewRule = removeVerifiedRequestRule(users.viewRule);
    users.updateRule = removeVerifiedRequestRule(users.updateRule);
    users.deleteRule = removeVerifiedRequestRule(users.deleteRule);
    app.save(users);

    BUSINESS_COLLECTIONS.forEach(name => {
      updateCollectionRules(app, name, removeVerifiedRequestRule);
    });
  }
);
