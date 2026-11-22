// Request hooks only, so archive restores and existing case-duplicate tags keep working.
// Keep tagNameKey in step with src/utils/tagNames.ts.
const tagNameKey = name => name.normalize('NFC').trim().toLowerCase();

function rejectDuplicateTagName(e) {
  if (e.hasSuperuserAuth()) return;
  // Request hooks run before API rules, so only answer for the caller's own tags.
  const owner = e.record.getString('user');
  if (!e.auth || e.auth.id !== owner) return;
  if (!e.record.isNew() && e.record.original().getString('user') !== owner) return;

  const key = tagNameKey(e.record.getString('name'));
  if (!key) return;
  if (!e.record.isNew() && tagNameKey(e.record.original().getString('name')) === key) return;

  // ponytail: scans every tag the owner has, fine for hundreds; add a normalized key column if lists reach many thousands.
  const rows = arrayOf(new DynamicModel({ name: '' }));
  e.app
    .db()
    .newQuery(
      `SELECT name FROM ${e.collection.name} WHERE user = {:user} AND id != {:id} ORDER BY created, id`
    )
    .bind({ user: owner, id: e.record.id || '' })
    .all(rows);
  const match = rows.find(row => tagNameKey(row.name) === key);
  if (!match) return;

  throw new BadRequestError(`A tag named "${match.name}" already exists.`, {
    name: new ValidationError('validation_not_unique', 'Tag name already exists.'),
  });
}

module.exports = { rejectDuplicateTagName };
