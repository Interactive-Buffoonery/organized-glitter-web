/// <reference path="../pb_data/types.d.ts" />

routerAdd(
  'POST',
  '/api/notes/latest',
  e => {
    if (!e.auth.getBool('verified')) {
      throw new ForbiddenError('Email verification is required.');
    }

    const data = e.requestInfo().body;
    const userId = e.auth.getString('id');
    if (data.userId !== userId) throw new ForbiddenError('User mismatch.');
    if (data.craft !== 'diamond' && data.craft !== 'coloring') {
      throw new BadRequestError('Invalid craft.');
    }
    if (!Array.isArray(data.targetIds)) throw new BadRequestError('Invalid targets.');
    if (data.targetIds.length > 100) throw new BadRequestError('Too many targets.');
    const ids = [];
    for (const id of data.targetIds) {
      if (typeof id !== 'string' || !/^[a-zA-Z0-9_]{1,100}$/.test(id)) {
        throw new BadRequestError('Invalid target.');
      }
      if (!ids.includes(id)) ids.push(id);
    }
    if (!ids.length) return e.json(200, { items: [] });
    const params = { userId };
    const placeholders = ids
      .map((id, index) => {
        params['id' + index] = id;
        return '{:id' + index + '}';
      })
      .join(',');
    const diamond = data.craft === 'diamond';
    const targets = diamond ? 'projects' : 'coloring_pages';
    const notes = diamond ? 'progress_notes' : 'coloring_page_progress_notes';
    const relation = diamond ? 'project' : 'page';
    const ownerJoin = diamond ? '' : 'JOIN coloring_books b ON b.id = t.book';
    const ownerFilter = diamond ? 't.user = {:userId}' : 'b.user = {:userId}';
    const noteOwnerFilter = diamond ? '' : 'AND candidate.user = {:userId}';
    const rows = arrayOf(new DynamicModel({ id: '', targetId: '', date: '', created: '' }));
    $app
      .db()
      .newQuery(
        `
      SELECT n.id, t.id AS targetId, n.date, n.created
      FROM ${targets} t ${ownerJoin}
      JOIN ${notes} n ON n.id = (
        SELECT candidate.id FROM ${notes} candidate
        WHERE candidate.${relation} = t.id ${noteOwnerFilter}
        ORDER BY candidate.date DESC, candidate.created DESC, candidate.id DESC LIMIT 1
      )
      WHERE ${ownerFilter} AND t.id IN (${placeholders})
    `
      )
      .bind(params)
      .all(rows);
    return e.json(200, { items: rows });
  },
  $apis.requireAuth('users')
);
