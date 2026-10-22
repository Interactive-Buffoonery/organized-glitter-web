/// <reference path="../pb_data/types.d.ts" />

// 1778600000 and 1778700000 never ran in production, which applied the same
// changes under other filenames. Deploying them would replace the verified
// rules below, so restore the canonical rule wherever their weakened value
// landed and leave every other value alone.
const PROGRESS_NOTE_RULE =
  '@request.auth.verified = true && (user = @request.auth.id && page.book.user = @request.auth.id)';
const SPIN_UPDATE_RULE =
  '@request.auth.verified = true && (user = @request.auth.id && (project = "" || project.user = @request.auth.id))';

const REPAIRS = [
  {
    collection: 'pbc_4218181872',
    fields: ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule'],
    weakened: 'user = @request.auth.id && page.book.user = @request.auth.id',
    canonical: PROGRESS_NOTE_RULE,
  },
  {
    collection: 'pbc_4013924363',
    fields: ['updateRule'],
    weakened: 'user = @request.auth.id',
    canonical: SPIN_UPDATE_RULE,
  },
];

migrate(
  app => {
    REPAIRS.forEach(({ collection: id, fields, weakened, canonical }) => {
      const collection = app.findCollectionByNameOrId(id);
      // JSVM exposes nullable rules as *string objects, so compare their text.
      const weakFields = fields.filter(
        field => collection[field] != null && String(collection[field]) === weakened
      );
      if (weakFields.length === 0) return;
      weakFields.forEach(field => {
        collection[field] = canonical;
      });
      app.save(collection);
    });
  },
  () => {
    // Rolling back must not reintroduce the weakened rules.
  }
);
