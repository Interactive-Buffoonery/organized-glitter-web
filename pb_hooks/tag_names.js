// Request hooks only, so archive restores and existing case-duplicate tags keep working.
function rejectDuplicateTagName(e) {
  if (e.hasSuperuserAuth()) return;
  // Request hooks run before API rules, so only answer for the caller's own tags.
  const owner = e.record.getString('user');
  if (!e.auth || e.auth.id !== owner) return;
  if (!e.record.isNew() && e.record.original().getString('user') !== owner) return;

  const name = e.record.getString('name').trim();
  if (!name) return;
  if (!e.record.isNew()) {
    const previousName = e.record.original().getString('name').trim();
    if (previousName.toLowerCase() === name.toLowerCase()) return;
  }

  // ponytail: SQLite lower() folds ASCII only; non-ASCII case variants still pass.
  const matches = arrayOf(new DynamicModel({ name: '' }));
  e.app
    .db()
    .newQuery(
      `SELECT name FROM ${e.collection.name} WHERE user = {:user} AND lower(trim(name)) = lower({:name}) AND id != {:id} LIMIT 1`
    )
    .bind({ user: owner, name, id: e.record.id || '' })
    .all(matches);
  if (matches.length === 0) return;

  throw new BadRequestError(`A tag named "${matches[0].name}" already exists.`, {
    name: new ValidationError('validation_not_unique', 'Tag name already exists.'),
  });
}

module.exports = { rejectDuplicateTagName };
