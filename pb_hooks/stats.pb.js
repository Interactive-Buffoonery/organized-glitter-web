/// <reference path="../pb_data/types.d.ts" />

routerAdd(
  'GET',
  '/api/stats/summary',
  e => {
    if (!e.auth.getBool('verified')) {
      throw new ForbiddenError('Email verification is required.');
    }

    const userId = e.auth.getString('id');
    const requestedYear = Number(e.request.url.query().get('year'));
    const year =
      Number.isInteger(requestedYear) && requestedYear >= 1900 && requestedYear <= 2100
        ? requestedYear
        : new Date().getFullYear();
    const yearStart = `${year}-01-01`;
    const nextYearStart = `${year + 1}-01-01`;
    const statuses = [
      'wishlist',
      'purchased',
      'stash',
      'kitted',
      'progress',
      'onhold',
      'completed',
      'archived',
      'destashed',
    ];

    const summary = new DynamicModel({
      totalKits: 0,
      completedThisYear: 0,
      allTimeCompleted: 0,
    });

    $app
      .db()
      .newQuery(
        `
      SELECT
        COUNT(*) AS totalKits,
        COALESCE(SUM(CASE
          WHEN date_completed IS NOT NULL
            AND date_completed != ''
            AND date_completed >= {:yearStart}
            AND date_completed < {:nextYearStart}
          THEN 1 ELSE 0 END), 0) AS completedThisYear,
        COALESCE(SUM(CASE
          WHEN date_completed IS NOT NULL
            AND date_completed != ''
          THEN 1 ELSE 0 END), 0) AS allTimeCompleted
      FROM projects
      WHERE user = {:userId}
    `
      )
      .bind({
        userId,
        yearStart,
        nextYearStart,
      })
      .one(summary);

    const statusRows = arrayOf(
      new DynamicModel({
        status: '',
        total: 0,
      })
    );

    $app
      .db()
      .newQuery(
        `
      SELECT status, COUNT(*) AS total
      FROM projects
      WHERE user = {:userId}
      GROUP BY status
    `
      )
      .bind({ userId })
      .all(statusRows);

    const statusBreakdown = {};
    for (const status of statuses) {
      statusBreakdown[status] = 0;
    }

    for (const row of statusRows) {
      if (Object.prototype.hasOwnProperty.call(statusBreakdown, row.status)) {
        statusBreakdown[row.status] = Number(row.total) || 0;
      }
    }

    const inStash = statusBreakdown.purchased + statusBreakdown.stash + statusBreakdown.kitted;

    return e.json(200, {
      generatedAt: new Date().toISOString(),
      year,
      metrics: {
        totalKits: Number(summary.totalKits) || 0,
        completedThisYear: Number(summary.completedThisYear) || 0,
        inProgress: statusBreakdown.progress,
        inStash,
        allTimeCompleted: Number(summary.allTimeCompleted) || 0,
        wishlistSize: statusBreakdown.wishlist,
      },
      statusBreakdown,
    });
  },
  $apis.requireAuth()
);

routerAdd(
  'GET',
  '/api/stats/completions',
  e => {
    if (!e.auth.getBool('verified')) {
      throw new ForbiddenError('Email verification is required.');
    }

    const userId = e.auth.getString('id');
    const requestedYear = Number(e.request.url.query().get('year'));
    const year =
      Number.isInteger(requestedYear) && requestedYear >= 1900 && requestedYear <= 2100
        ? requestedYear
        : new Date().getFullYear();
    const yearStart = `${year}-01-01`;
    const nextYearStart = `${year + 1}-01-01`;
    const previousYearStart = `${year - 1}-01-01`;
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ].map((label, index) => ({
      month: index + 1,
      label,
      count: 0,
      previousYearCount: 0,
      previousYearDelta: 0,
      averageCompletionDays: null,
    }));

    const rows = arrayOf(
      new DynamicModel({
        month: 0,
        total: 0,
        averageCompletionDays: -0,
        averageCompletionCount: 0,
      })
    );
    const previousRows = arrayOf(
      new DynamicModel({
        month: 0,
        total: 0,
      })
    );

    $app
      .db()
      .newQuery(
        `
      SELECT
        CAST(strftime('%m', date_completed) AS INTEGER) AS month,
        COUNT(*) AS total,
        COALESCE(AVG(CASE
          WHEN date_started IS NOT NULL
            AND date_started != ''
            AND julianday(date_completed) >= julianday(date_started)
          THEN julianday(date_completed) - julianday(date_started)
          ELSE NULL
        END), 0) AS averageCompletionDays,
        COALESCE(SUM(CASE
          WHEN date_started IS NOT NULL
            AND date_started != ''
            AND julianday(date_completed) >= julianday(date_started)
          THEN 1 ELSE 0 END), 0) AS averageCompletionCount
      FROM projects
      WHERE user = {:userId}
        AND date_completed IS NOT NULL
        AND date_completed != ''
        AND date_completed >= {:yearStart}
        AND date_completed < {:nextYearStart}
      GROUP BY month
      ORDER BY month ASC
    `
      )
      .bind({
        userId,
        yearStart,
        nextYearStart,
      })
      .all(rows);

    $app
      .db()
      .newQuery(
        `
      SELECT CAST(strftime('%m', date_completed) AS INTEGER) AS month, COUNT(*) AS total
      FROM projects
      WHERE user = {:userId}
        AND date_completed IS NOT NULL
        AND date_completed != ''
        AND date_completed >= {:previousYearStart}
        AND date_completed < {:yearStart}
      GROUP BY month
      ORDER BY month ASC
    `
      )
      .bind({
        userId,
        previousYearStart,
        yearStart,
      })
      .all(previousRows);

    for (const row of rows) {
      const month = Number(row.month);
      if (month >= 1 && month <= 12) {
        months[month - 1].count = Number(row.total) || 0;
        months[month - 1].averageCompletionDays =
          Number(row.averageCompletionCount) > 0
            ? Math.round(Number(row.averageCompletionDays) * 10) / 10
            : null;
      }
    }

    for (const row of previousRows) {
      const month = Number(row.month);
      if (month >= 1 && month <= 12) {
        months[month - 1].previousYearCount = Number(row.total) || 0;
      }
    }

    for (const month of months) {
      month.previousYearDelta = month.count - month.previousYearCount;
    }

    return e.json(200, {
      generatedAt: new Date().toISOString(),
      year,
      total: months.reduce((sum, month) => sum + month.count, 0),
      months,
    });
  },
  $apis.requireAuth()
);

routerAdd(
  'GET',
  '/api/stats/completions/yearly',
  e => {
    if (!e.auth.getBool('verified')) {
      throw new ForbiddenError('Email verification is required.');
    }

    const userId = e.auth.getString('id');
    const rows = arrayOf(
      new DynamicModel({
        year: 0,
        total: 0,
      })
    );

    $app
      .db()
      .newQuery(
        `
      SELECT CAST(strftime('%Y', date_completed) AS INTEGER) AS year, COUNT(*) AS total
      FROM projects
      WHERE user = {:userId}
        AND date_completed IS NOT NULL
        AND date_completed != ''
      GROUP BY year
      ORDER BY year ASC
    `
      )
      .bind({ userId })
      .all(rows);

    let cumulativeCount = 0;
    const years = [];
    for (const row of rows) {
      const count = Number(row.total) || 0;
      cumulativeCount += count;
      years.push({
        year: Number(row.year),
        count,
        cumulativeCount,
      });
    }

    return e.json(200, {
      generatedAt: new Date().toISOString(),
      total: cumulativeCount,
      years: years.reverse(),
    });
  },
  $apis.requireAuth()
);

routerAdd(
  'GET',
  '/api/stats/completion-times',
  e => {
    if (!e.auth.getBool('verified')) {
      throw new ForbiddenError('Email verification is required.');
    }

    const userId = e.auth.getString('id');
    const monthLabels = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];

    const averages = new DynamicModel({
      averageCompletionDays: -0,
      averageCompletionCount: 0,
      averageStashDwellDays: -0,
      averageStashDwellCount: 0,
      averageTimeToStartDays: -0,
      averageTimeToStartCount: 0,
    });

    $app
      .db()
      .newQuery(
        `
      SELECT
        COALESCE(AVG(CASE
          WHEN date_started IS NOT NULL
            AND date_started != ''
            AND date_completed IS NOT NULL
            AND date_completed != ''
            AND julianday(date_completed) >= julianday(date_started)
          THEN julianday(date_completed) - julianday(date_started)
          ELSE NULL
        END), 0) AS averageCompletionDays,
        COALESCE(SUM(CASE
          WHEN date_started IS NOT NULL
            AND date_started != ''
            AND date_completed IS NOT NULL
            AND date_completed != ''
            AND julianday(date_completed) >= julianday(date_started)
          THEN 1 ELSE 0 END), 0) AS averageCompletionCount,
        COALESCE(AVG(CASE
          WHEN date_received IS NOT NULL
            AND date_received != ''
            AND date_started IS NOT NULL
            AND date_started != ''
            AND julianday(date_started) >= julianday(date_received)
          THEN julianday(date_started) - julianday(date_received)
          ELSE NULL
        END), 0) AS averageStashDwellDays,
        COALESCE(SUM(CASE
          WHEN date_received IS NOT NULL
            AND date_received != ''
            AND date_started IS NOT NULL
            AND date_started != ''
            AND julianday(date_started) >= julianday(date_received)
          THEN 1 ELSE 0 END), 0) AS averageStashDwellCount,
        COALESCE(AVG(CASE
          WHEN date_purchased IS NOT NULL
            AND date_purchased != ''
            AND date_started IS NOT NULL
            AND date_started != ''
            AND julianday(date_started) >= julianday(date_purchased)
          THEN julianday(date_started) - julianday(date_purchased)
          ELSE NULL
        END), 0) AS averageTimeToStartDays,
        COALESCE(SUM(CASE
          WHEN date_purchased IS NOT NULL
            AND date_purchased != ''
            AND date_started IS NOT NULL
            AND date_started != ''
            AND julianday(date_started) >= julianday(date_purchased)
          THEN 1 ELSE 0 END), 0) AS averageTimeToStartCount
      FROM projects
      WHERE user = {:userId}
    `
      )
      .bind({ userId })
      .one(averages);

    const completionRows = arrayOf(
      new DynamicModel({
        id: '',
        title: '',
        dateStarted: '',
        dateCompleted: '',
        days: 0,
      })
    );

    $app
      .db()
      .newQuery(
        `
      SELECT
        id,
        title,
        date_started AS dateStarted,
        date_completed AS dateCompleted,
        ROUND(julianday(date_completed) - julianday(date_started)) AS days
      FROM projects
      WHERE user = {:userId}
        AND date_started IS NOT NULL
        AND date_started != ''
        AND date_completed IS NOT NULL
        AND date_completed != ''
        AND julianday(date_completed) >= julianday(date_started)
      ORDER BY days ASC, date_completed ASC, title ASC
    `
      )
      .bind({ userId })
      .all(completionRows);

    const productiveRows = arrayOf(
      new DynamicModel({
        year: 0,
        month: 0,
        total: 0,
      })
    );

    $app
      .db()
      .newQuery(
        `
      SELECT
        CAST(strftime('%Y', date_completed) AS INTEGER) AS year,
        CAST(strftime('%m', date_completed) AS INTEGER) AS month,
        COUNT(*) AS total
      FROM projects
      WHERE user = {:userId}
        AND date_completed IS NOT NULL
        AND date_completed != ''
      GROUP BY year, month
      ORDER BY total DESC, year DESC, month DESC
      LIMIT 1
    `
      )
      .bind({ userId })
      .all(productiveRows);

    const fastest = completionRows.length > 0 ? completionRows[0] : null;
    const slowest = completionRows.length > 0 ? completionRows[completionRows.length - 1] : null;
    const productive = productiveRows.length > 0 ? productiveRows[0] : null;
    const averageCompletionDays =
      Number(averages.averageCompletionCount) > 0
        ? Math.round(Number(averages.averageCompletionDays) * 10) / 10
        : null;
    const averageStashDwellDays =
      Number(averages.averageStashDwellCount) > 0
        ? Math.round(Number(averages.averageStashDwellDays) * 10) / 10
        : null;
    const averageTimeToStartDays =
      Number(averages.averageTimeToStartCount) > 0
        ? Math.round(Number(averages.averageTimeToStartDays) * 10) / 10
        : null;

    return e.json(200, {
      generatedAt: new Date().toISOString(),
      averageCompletionDays,
      averageStashDwellDays,
      averageTimeToStartDays,
      fastestCompletion: fastest
        ? {
            id: fastest.id,
            title: fastest.title,
            dateStarted: fastest.dateStarted || null,
            dateCompleted: fastest.dateCompleted || null,
            days: Number(fastest.days) || 0,
          }
        : null,
      slowestCompletion: slowest
        ? {
            id: slowest.id,
            title: slowest.title,
            dateStarted: slowest.dateStarted || null,
            dateCompleted: slowest.dateCompleted || null,
            days: Number(slowest.days) || 0,
          }
        : null,
      mostProductiveMonth: productive
        ? {
            year: Number(productive.year),
            month: Number(productive.month),
            label: `${monthLabels[Number(productive.month) - 1]} ${productive.year}`,
            count: Number(productive.total) || 0,
          }
        : null,
    });
  },
  $apis.requireAuth()
);

routerAdd(
  'GET',
  '/api/stats/company-project-counts',
  e => {
    if (!e.auth.getBool('verified')) {
      throw new ForbiddenError('Email verification is required.');
    }

    const userId = e.auth.getString('id');
    const rows = arrayOf(new DynamicModel({ id: '', total: 0 }));

    $app
      .db()
      .newQuery(
        `
      SELECT p.company AS id, COUNT(*) AS total
      FROM projects p
      JOIN companies c ON c.id = p.company
      WHERE p.user = {:userId}
        AND c.user = {:userId}
        AND p.company IS NOT NULL
        AND p.company != ''
      GROUP BY p.company
    `
      )
      .bind({ userId })
      .all(rows);

    const counts = {};
    for (const row of rows) {
      counts[row.id] = Number(row.total) || 0;
    }

    return e.json(200, { counts });
  },
  $apis.requireAuth()
);

routerAdd(
  'GET',
  '/api/stats/tag-project-counts',
  e => {
    if (!e.auth.getBool('verified')) {
      throw new ForbiddenError('Email verification is required.');
    }

    const userId = e.auth.getString('id');
    const rows = arrayOf(new DynamicModel({ id: '', total: 0 }));

    $app
      .db()
      .newQuery(
        `
      SELECT pt.tag AS id, COUNT(*) AS total
      FROM project_tags pt
      JOIN projects p ON p.id = pt.project
      JOIN tags t ON t.id = pt.tag
      WHERE p.user = {:userId}
        AND t.user = {:userId}
      GROUP BY pt.tag
    `
      )
      .bind({ userId })
      .all(rows);

    const counts = {};
    for (const row of rows) {
      counts[row.id] = Number(row.total) || 0;
    }

    return e.json(200, { counts });
  },
  $apis.requireAuth()
);

routerAdd(
  'GET',
  '/api/stats/coloring-tag-book-counts',
  e => {
    if (!e.auth.getBool('verified')) {
      throw new ForbiddenError('Email verification is required.');
    }

    const userId = e.auth.getString('id');
    const rows = arrayOf(new DynamicModel({ id: '', total: 0 }));

    $app
      .db()
      .newQuery(
        `
      SELECT cbt.tag AS id, COUNT(*) AS total
      FROM coloring_book_tags cbt
      JOIN coloring_books cb ON cb.id = cbt.book
      JOIN coloring_tags t ON t.id = cbt.tag
      WHERE cb.user = {:userId}
        AND t.user = {:userId}
      GROUP BY cbt.tag
    `
      )
      .bind({ userId })
      .all(rows);

    const counts = {};
    for (const row of rows) {
      counts[row.id] = Number(row.total) || 0;
    }

    return e.json(200, { counts });
  },
  $apis.requireAuth()
);

routerAdd(
  'GET',
  '/api/stats/collection',
  e => {
    if (!e.auth.getBool('verified')) {
      throw new ForbiddenError('Email verification is required.');
    }

    const userId = e.auth.getString('id');
    const sizeBucketDefs = [
      { key: 'mini', label: '<30 cm' },
      { key: 'small', label: '30-49.9 cm' },
      { key: 'medium', label: '50-69.9 cm' },
      { key: 'large', label: '70-109.9 cm' },
      { key: 'huge', label: '110+ cm' },
      { key: 'unknown', label: 'Unknown' },
    ];

    const topCompanies = arrayOf(new DynamicModel({ id: '', label: '', total: 0 }));
    const topArtists = arrayOf(new DynamicModel({ id: '', label: '', total: 0 }));
    const topTags = arrayOf(new DynamicModel({ id: '', label: '', total: 0 }));
    const topCompanyTotal = new DynamicModel({ total: 0 });
    const topArtistTotal = new DynamicModel({ total: 0 });
    const topTagTotal = new DynamicModel({ total: 0 });
    const drillShapeRows = arrayOf(new DynamicModel({ key: '', label: '', total: 0 }));
    const kitCategoryRows = arrayOf(new DynamicModel({ key: '', label: '', total: 0 }));
    const sizeRows = arrayOf(new DynamicModel({ width: -0, height: -0 }));

    $app
      .db()
      .newQuery(
        `
      SELECT c.id AS id, c.name AS label, COUNT(*) AS total
      FROM projects p
      JOIN companies c ON c.id = p.company
      WHERE p.user = {:userId}
        AND p.company IS NOT NULL
        AND p.company != ''
      GROUP BY c.id, c.name
      ORDER BY total DESC, c.name ASC
      LIMIT 10
    `
      )
      .bind({ userId })
      .all(topCompanies);

    $app
      .db()
      .newQuery(
        `
      SELECT COUNT(*) AS total
      FROM projects
      WHERE user = {:userId}
        AND company IS NOT NULL
        AND company != ''
    `
      )
      .bind({ userId })
      .one(topCompanyTotal);

    $app
      .db()
      .newQuery(
        `
      SELECT a.id AS id, a.name AS label, COUNT(*) AS total
      FROM projects p
      JOIN artists a ON a.id = p.artist
      WHERE p.user = {:userId}
        AND p.artist IS NOT NULL
        AND p.artist != ''
      GROUP BY a.id, a.name
      ORDER BY total DESC, a.name ASC
      LIMIT 10
    `
      )
      .bind({ userId })
      .all(topArtists);

    $app
      .db()
      .newQuery(
        `
      SELECT COUNT(*) AS total
      FROM projects
      WHERE user = {:userId}
        AND artist IS NOT NULL
        AND artist != ''
    `
      )
      .bind({ userId })
      .one(topArtistTotal);

    $app
      .db()
      .newQuery(
        `
      SELECT t.id AS id, t.name AS label, COUNT(*) AS total
      FROM projects p
      JOIN project_tags pt ON pt.project = p.id
      JOIN tags t ON t.id = pt.tag
      WHERE p.user = {:userId}
      GROUP BY t.id, t.name
      ORDER BY total DESC, t.name ASC
      LIMIT 10
    `
      )
      .bind({ userId })
      .all(topTags);

    $app
      .db()
      .newQuery(
        `
      SELECT COUNT(*) AS total
      FROM projects p
      JOIN project_tags pt ON pt.project = p.id
      WHERE p.user = {:userId}
    `
      )
      .bind({ userId })
      .one(topTagTotal);

    $app
      .db()
      .newQuery(
        `
      SELECT drill_shape AS key, drill_shape AS label, COUNT(*) AS total
      FROM projects
      WHERE user = {:userId}
        AND drill_shape IS NOT NULL
        AND drill_shape != ''
      GROUP BY drill_shape
      ORDER BY total DESC, drill_shape ASC
    `
      )
      .bind({ userId })
      .all(drillShapeRows);

    $app
      .db()
      .newQuery(
        `
      SELECT kit_category AS key, kit_category AS label, COUNT(*) AS total
      FROM projects
      WHERE user = {:userId}
        AND kit_category IS NOT NULL
        AND kit_category != ''
      GROUP BY kit_category
      ORDER BY total DESC, kit_category ASC
    `
      )
      .bind({ userId })
      .all(kitCategoryRows);

    $app
      .db()
      .newQuery('SELECT width, height FROM projects WHERE user = {:userId}')
      .bind({ userId })
      .all(sizeRows);

    const topCompanyItems = [];
    for (const row of topCompanies) {
      topCompanyItems.push({ id: row.id, label: row.label, count: Number(row.total) || 0 });
    }
    const topArtistItems = [];
    for (const row of topArtists) {
      topArtistItems.push({ id: row.id, label: row.label, count: Number(row.total) || 0 });
    }
    const topTagItems = [];
    for (const row of topTags) {
      topTagItems.push({ id: row.id, label: row.label, count: Number(row.total) || 0 });
    }
    const toTopListGroup = (items, total) => {
      const normalizedTotal = Number(total) || 0;
      const visibleTotal = items.reduce((sum, item) => sum + item.count, 0);
      return {
        total: normalizedTotal,
        items,
        otherCount: Math.max(0, normalizedTotal - visibleTotal),
      };
    };
    const drillShapeSplit = [];
    for (const row of drillShapeRows) {
      drillShapeSplit.push({ key: row.key, label: row.label, count: Number(row.total) || 0 });
    }
    const kitCategorySplit = [];
    for (const row of kitCategoryRows) {
      kitCategorySplit.push({ key: row.key, label: row.label, count: Number(row.total) || 0 });
    }

    const sizeBuckets = sizeBucketDefs.map(bucket => ({
      key: bucket.key,
      label: bucket.label,
      count: 0,
    }));
    const sizeBucketsByKey = {};
    for (const bucket of sizeBuckets) {
      sizeBucketsByKey[bucket.key] = bucket;
    }
    for (const row of sizeRows) {
      const width = typeof row.width === 'number' && row.width > 0 ? row.width : 0;
      const height = typeof row.height === 'number' && row.height > 0 ? row.height : 0;
      const size = Math.max(width, height);
      let key = 'unknown';
      if (size > 0 && size < 30) key = 'mini';
      if (size >= 30 && size < 50) key = 'small';
      if (size >= 50 && size < 70) key = 'medium';
      if (size >= 70 && size < 110) key = 'large';
      if (size >= 110) key = 'huge';
      sizeBucketsByKey[key].count++;
    }

    return e.json(200, {
      generatedAt: new Date().toISOString(),
      topCompanies: topCompanyItems,
      topCompaniesGroup: toTopListGroup(topCompanyItems, topCompanyTotal.total),
      topArtists: topArtistItems,
      topArtistsGroup: toTopListGroup(topArtistItems, topArtistTotal.total),
      topTags: topTagItems,
      topTagsGroup: toTopListGroup(topTagItems, topTagTotal.total),
      drillShapeSplit,
      kitCategorySplit,
      sizeBuckets,
    });
  },
  $apis.requireAuth()
);

routerAdd(
  'GET',
  '/api/stats/month-in-review',
  e => {
    if (!e.auth.getBool('verified')) {
      throw new ForbiddenError('Email verification is required.');
    }

    const userId = e.auth.getString('id');
    const now = new Date();
    const requestedYear = Number(e.request.url.query().get('year'));
    const requestedMonth = Number(e.request.url.query().get('month'));
    const year =
      Number.isInteger(requestedYear) && requestedYear >= 1900 && requestedYear <= 2100
        ? requestedYear
        : new Date().getFullYear();
    const month =
      Number.isInteger(requestedMonth) && requestedMonth >= 1 && requestedMonth <= 12
        ? requestedMonth
        : new Date().getMonth() + 1;
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    const monthText = String(month).padStart(2, '0');
    const nextMonthText = String(nextMonth).padStart(2, '0');
    const start = `${year}-${monthText}-01`;
    const end = `${nextYear}-${nextMonthText}-01`;
    const fullLabels = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ];

    const completedRows = arrayOf(
      new DynamicModel({ id: '', title: '', date: '', company: '', artist: '' })
    );
    const noteRows = arrayOf(
      new DynamicModel({
        id: '',
        projectId: '',
        projectTitle: '',
        date: '',
        content: '',
        hasImage: 0,
      })
    );
    const additionRows = arrayOf(
      new DynamicModel({ id: '', title: '', date: '', company: '', artist: '' })
    );

    $app
      .db()
      .newQuery(
        `
      SELECT
        p.id,
        p.title,
        p.date_completed AS date,
        c.name AS company,
        a.name AS artist
      FROM projects p
      LEFT JOIN companies c ON c.id = p.company
      LEFT JOIN artists a ON a.id = p.artist
      WHERE p.user = {:userId}
        AND p.date_completed IS NOT NULL
        AND p.date_completed != ''
        AND p.date_completed >= {:start}
        AND p.date_completed < {:end}
      ORDER BY p.date_completed DESC, p.title ASC
    `
      )
      .bind({ userId, start, end })
      .all(completedRows);

    $app
      .db()
      .newQuery(
        `
      SELECT
        pn.id,
        pn.project AS projectId,
        p.title AS projectTitle,
        pn.date,
        pn.content,
        CASE WHEN pn.image IS NOT NULL AND pn.image != '' THEN 1 ELSE 0 END AS hasImage
      FROM progress_notes pn
      JOIN projects p ON p.id = pn.project
      WHERE p.user = {:userId}
        AND pn.date IS NOT NULL
        AND pn.date != ''
        AND pn.date >= {:start}
        AND pn.date < {:end}
      ORDER BY pn.date DESC, pn.created DESC
    `
      )
      .bind({ userId, start, end })
      .all(noteRows);

    $app
      .db()
      .newQuery(
        `
      SELECT
        p.id,
        p.title,
        p.created AS date,
        c.name AS company,
        a.name AS artist
      FROM projects p
      LEFT JOIN companies c ON c.id = p.company
      LEFT JOIN artists a ON a.id = p.artist
      WHERE p.user = {:userId}
        AND p.created >= {:start}
        AND p.created < {:end}
      ORDER BY p.created DESC, p.title ASC
    `
      )
      .bind({ userId, start, end })
      .all(additionRows);

    const completedKits = [];
    for (const row of completedRows) {
      completedKits.push({
        id: row.id,
        title: row.title,
        date: row.date,
        company: row.company || null,
        artist: row.artist || null,
      });
    }
    const progressNotes = [];
    for (const row of noteRows) {
      progressNotes.push({
        id: row.id,
        projectId: row.projectId,
        projectTitle: row.projectTitle,
        date: row.date,
        content: row.content,
        hasImage: Boolean(row.hasImage),
      });
    }
    const newAdditions = [];
    for (const row of additionRows) {
      newAdditions.push({
        id: row.id,
        title: row.title,
        date: row.date,
        company: row.company || null,
        artist: row.artist || null,
      });
    }

    return e.json(200, {
      generatedAt: new Date().toISOString(),
      year,
      month,
      label: `${fullLabels[month - 1]} ${year}`,
      completedKits,
      progressNotes,
      newAdditions,
    });
  },
  $apis.requireAuth()
);

routerAdd(
  'GET',
  '/api/stats/coloring/summary',
  e => {
    if (!e.auth.getBool('verified')) {
      throw new ForbiddenError('Email verification is required.');
    }

    const userId = e.auth.getString('id');
    const requestedYear = Number(e.request.url.query().get('year'));
    const year =
      Number.isInteger(requestedYear) && requestedYear >= 1900 && requestedYear <= 2100
        ? requestedYear
        : new Date().getFullYear();
    const yearStart = `${year}-01-01`;
    const nextYearStart = `${year + 1}-01-01`;
    const bookStatusBreakdown = {
      wishlist: 0,
      purchased: 0,
      in_stash: 0,
      in_progress: 0,
      completed: 0,
      archived: 0,
      destashed: 0,
    };
    const pageStatusBreakdown = {
      not_started: 0,
      palette_chosen: 0,
      in_progress: 0,
      on_hold: 0,
      completed: 0,
    };

    const summary = new DynamicModel({
      totalBooks: 0,
      completedPagesThisYear: 0,
      allTimeCompletedPages: 0,
    });

    $app
      .db()
      .newQuery(
        `
      SELECT
        COUNT(DISTINCT cb.id) AS totalBooks,
        COALESCE(SUM(CASE
          WHEN cp.completed_at IS NOT NULL
            AND cp.completed_at != ''
            AND cp.completed_at >= {:yearStart}
            AND cp.completed_at < {:nextYearStart}
          THEN 1 ELSE 0 END), 0) AS completedPagesThisYear,
        COALESCE(SUM(CASE
          WHEN cp.completed_at IS NOT NULL
            AND cp.completed_at != ''
          THEN 1 ELSE 0 END), 0) AS allTimeCompletedPages
      FROM coloring_books cb
      LEFT JOIN coloring_pages cp ON cp.book = cb.id
      WHERE cb.user = {:userId}
    `
      )
      .bind({ userId, yearStart, nextYearStart })
      .one(summary);

    const bookRows = arrayOf(new DynamicModel({ status: '', total: 0 }));
    $app
      .db()
      .newQuery(
        `
      SELECT status, COUNT(*) AS total
      FROM coloring_books
      WHERE user = {:userId}
      GROUP BY status
    `
      )
      .bind({ userId })
      .all(bookRows);

    for (const row of bookRows) {
      if (Object.prototype.hasOwnProperty.call(bookStatusBreakdown, row.status)) {
        bookStatusBreakdown[row.status] = Number(row.total) || 0;
      }
    }

    const pageRows = arrayOf(new DynamicModel({ status: '', total: 0 }));
    $app
      .db()
      .newQuery(
        `
      SELECT cp.status AS status, COUNT(*) AS total
      FROM coloring_pages cp
      JOIN coloring_books cb ON cb.id = cp.book
      WHERE cb.user = {:userId}
      GROUP BY cp.status
    `
      )
      .bind({ userId })
      .all(pageRows);

    for (const row of pageRows) {
      if (Object.prototype.hasOwnProperty.call(pageStatusBreakdown, row.status)) {
        pageStatusBreakdown[row.status] = Number(row.total) || 0;
      }
    }

    return e.json(200, {
      generatedAt: new Date().toISOString(),
      year,
      metrics: {
        totalBooks: Number(summary.totalBooks) || 0,
        completedPagesThisYear: Number(summary.completedPagesThisYear) || 0,
        activePages: pageStatusBreakdown.in_progress,
        inStash: bookStatusBreakdown.purchased + bookStatusBreakdown.in_stash,
        allTimeCompletedPages: Number(summary.allTimeCompletedPages) || 0,
        wishlistSize: bookStatusBreakdown.wishlist,
      },
      bookStatusBreakdown,
      pageStatusBreakdown,
    });
  },
  $apis.requireAuth()
);

routerAdd(
  'GET',
  '/api/stats/coloring/completions',
  e => {
    if (!e.auth.getBool('verified')) {
      throw new ForbiddenError('Email verification is required.');
    }

    const userId = e.auth.getString('id');
    const requestedYear = Number(e.request.url.query().get('year'));
    const year =
      Number.isInteger(requestedYear) && requestedYear >= 1900 && requestedYear <= 2100
        ? requestedYear
        : new Date().getFullYear();
    const yearStart = `${year}-01-01`;
    const nextYearStart = `${year + 1}-01-01`;
    const previousYearStart = `${year - 1}-01-01`;
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ].map((label, index) => ({
      month: index + 1,
      label,
      count: 0,
      previousYearCount: 0,
      previousYearDelta: 0,
      averageCompletionDays: null,
    }));
    const rows = arrayOf(
      new DynamicModel({
        month: 0,
        total: 0,
        averageCompletionDays: -0,
        averageCompletionCount: 0,
      })
    );
    const previousRows = arrayOf(new DynamicModel({ month: 0, total: 0 }));

    $app
      .db()
      .newQuery(
        `
      SELECT
        CAST(strftime('%m', cp.completed_at) AS INTEGER) AS month,
        COUNT(*) AS total,
        COALESCE(AVG(CASE
          WHEN cp.started_at IS NOT NULL
            AND cp.started_at != ''
            AND julianday(cp.completed_at) >= julianday(cp.started_at)
          THEN julianday(cp.completed_at) - julianday(cp.started_at)
          ELSE NULL
        END), 0) AS averageCompletionDays,
        COALESCE(SUM(CASE
          WHEN cp.started_at IS NOT NULL
            AND cp.started_at != ''
            AND julianday(cp.completed_at) >= julianday(cp.started_at)
          THEN 1 ELSE 0 END), 0) AS averageCompletionCount
      FROM coloring_pages cp
      JOIN coloring_books cb ON cb.id = cp.book
      WHERE cb.user = {:userId}
        AND cp.completed_at IS NOT NULL
        AND cp.completed_at != ''
        AND cp.completed_at >= {:yearStart}
        AND cp.completed_at < {:nextYearStart}
      GROUP BY month
      ORDER BY month ASC
    `
      )
      .bind({ userId, yearStart, nextYearStart })
      .all(rows);

    $app
      .db()
      .newQuery(
        `
      SELECT CAST(strftime('%m', cp.completed_at) AS INTEGER) AS month, COUNT(*) AS total
      FROM coloring_pages cp
      JOIN coloring_books cb ON cb.id = cp.book
      WHERE cb.user = {:userId}
        AND cp.completed_at IS NOT NULL
        AND cp.completed_at != ''
        AND cp.completed_at >= {:previousYearStart}
        AND cp.completed_at < {:yearStart}
      GROUP BY month
      ORDER BY month ASC
    `
      )
      .bind({ userId, previousYearStart, yearStart })
      .all(previousRows);

    for (const row of rows) {
      const month = Number(row.month);
      if (month >= 1 && month <= 12) {
        months[month - 1].count = Number(row.total) || 0;
        months[month - 1].averageCompletionDays =
          Number(row.averageCompletionCount) > 0
            ? Math.round(Number(row.averageCompletionDays) * 10) / 10
            : null;
      }
    }

    for (const row of previousRows) {
      const month = Number(row.month);
      if (month >= 1 && month <= 12) {
        months[month - 1].previousYearCount = Number(row.total) || 0;
      }
    }

    for (const month of months) {
      month.previousYearDelta = month.count - month.previousYearCount;
    }

    return e.json(200, {
      generatedAt: new Date().toISOString(),
      year,
      total: months.reduce((sum, month) => sum + month.count, 0),
      months,
    });
  },
  $apis.requireAuth()
);

routerAdd(
  'GET',
  '/api/stats/coloring/completions/yearly',
  e => {
    if (!e.auth.getBool('verified')) {
      throw new ForbiddenError('Email verification is required.');
    }

    const userId = e.auth.getString('id');
    const rows = arrayOf(new DynamicModel({ year: 0, total: 0 }));

    $app
      .db()
      .newQuery(
        `
      SELECT CAST(strftime('%Y', cp.completed_at) AS INTEGER) AS year, COUNT(*) AS total
      FROM coloring_pages cp
      JOIN coloring_books cb ON cb.id = cp.book
      WHERE cb.user = {:userId}
        AND cp.completed_at IS NOT NULL
        AND cp.completed_at != ''
      GROUP BY year
      ORDER BY year ASC
    `
      )
      .bind({ userId })
      .all(rows);

    let cumulativeCount = 0;
    const years = [];
    for (const row of rows) {
      const count = Number(row.total) || 0;
      cumulativeCount += count;
      years.push({
        year: Number(row.year),
        count,
        cumulativeCount,
      });
    }

    return e.json(200, {
      generatedAt: new Date().toISOString(),
      total: cumulativeCount,
      years: years.reverse(),
    });
  },
  $apis.requireAuth()
);

routerAdd(
  'GET',
  '/api/stats/coloring/completion-times',
  e => {
    if (!e.auth.getBool('verified')) {
      throw new ForbiddenError('Email verification is required.');
    }

    const userId = e.auth.getString('id');

    const averages = new DynamicModel({
      averagePageCompletionDays: -0,
      averagePageCompletionCount: 0,
      averageBookDwellDays: -0,
      averageBookDwellCount: 0,
    });

    $app
      .db()
      .newQuery(
        `
      SELECT
        COALESCE(AVG(CASE
          WHEN cp.started_at IS NOT NULL
            AND cp.started_at != ''
            AND cp.completed_at IS NOT NULL
            AND cp.completed_at != ''
            AND julianday(cp.completed_at) >= julianday(cp.started_at)
          THEN julianday(cp.completed_at) - julianday(cp.started_at)
          ELSE NULL
        END), 0) AS averagePageCompletionDays,
        COALESCE(SUM(CASE
          WHEN cp.started_at IS NOT NULL
            AND cp.started_at != ''
            AND cp.completed_at IS NOT NULL
            AND cp.completed_at != ''
            AND julianday(cp.completed_at) >= julianday(cp.started_at)
          THEN 1 ELSE 0 END), 0) AS averagePageCompletionCount,
        COALESCE(AVG(CASE
          WHEN cb.date_started IS NOT NULL
            AND cb.date_started != ''
            AND COALESCE(NULLIF(cb.date_purchased, ''), NULLIF(cb.date_received, '')) IS NOT NULL
            AND julianday(cb.date_started) >= julianday(COALESCE(NULLIF(cb.date_purchased, ''), NULLIF(cb.date_received, '')))
          THEN julianday(cb.date_started) - julianday(COALESCE(NULLIF(cb.date_purchased, ''), NULLIF(cb.date_received, '')))
          ELSE NULL
        END), 0) AS averageBookDwellDays,
        COALESCE(SUM(CASE
          WHEN cb.date_started IS NOT NULL
            AND cb.date_started != ''
            AND COALESCE(NULLIF(cb.date_purchased, ''), NULLIF(cb.date_received, '')) IS NOT NULL
            AND julianday(cb.date_started) >= julianday(COALESCE(NULLIF(cb.date_purchased, ''), NULLIF(cb.date_received, '')))
          THEN 1 ELSE 0 END), 0) AS averageBookDwellCount
      FROM coloring_books cb
      LEFT JOIN coloring_pages cp ON cp.book = cb.id
      WHERE cb.user = {:userId}
    `
      )
      .bind({ userId })
      .one(averages);

    const completionRows = arrayOf(
      new DynamicModel({
        id: '',
        bookId: '',
        bookTitle: '',
        pageNumber: 0,
        startedAt: '',
        completedAt: '',
        days: 0,
      })
    );

    $app
      .db()
      .newQuery(
        `
      SELECT
        cp.id,
        cp.book AS bookId,
        cb.title AS bookTitle,
        cp.page_number AS pageNumber,
        cp.started_at AS startedAt,
        cp.completed_at AS completedAt,
        ROUND(julianday(cp.completed_at) - julianday(cp.started_at)) AS days
      FROM coloring_pages cp
      JOIN coloring_books cb ON cb.id = cp.book
      WHERE cb.user = {:userId}
        AND cp.started_at IS NOT NULL
        AND cp.started_at != ''
        AND cp.completed_at IS NOT NULL
        AND cp.completed_at != ''
        AND julianday(cp.completed_at) >= julianday(cp.started_at)
      ORDER BY days ASC, cp.completed_at ASC, cb.title ASC, cp.page_number ASC
    `
      )
      .bind({ userId })
      .all(completionRows);

    const productiveRows = arrayOf(new DynamicModel({ year: 0, month: 0, total: 0 }));
    $app
      .db()
      .newQuery(
        `
      SELECT
        CAST(strftime('%Y', cp.completed_at) AS INTEGER) AS year,
        CAST(strftime('%m', cp.completed_at) AS INTEGER) AS month,
        COUNT(*) AS total
      FROM coloring_pages cp
      JOIN coloring_books cb ON cb.id = cp.book
      WHERE cb.user = {:userId}
        AND cp.completed_at IS NOT NULL
        AND cp.completed_at != ''
      GROUP BY year, month
      ORDER BY total DESC, year DESC, month DESC
      LIMIT 1
    `
      )
      .bind({ userId })
      .all(productiveRows);

    const fastest = completionRows.length > 0 ? completionRows[0] : null;
    const slowest = completionRows.length > 0 ? completionRows[completionRows.length - 1] : null;
    const productive = productiveRows.length > 0 ? productiveRows[0] : null;
    const averagePageCompletionDays =
      Number(averages.averagePageCompletionCount) > 0
        ? Math.round(Number(averages.averagePageCompletionDays) * 10) / 10
        : null;
    const averageBookDwellDays =
      Number(averages.averageBookDwellCount) > 0
        ? Math.round(Number(averages.averageBookDwellDays) * 10) / 10
        : null;

    const toPageCompletion = row =>
      row
        ? {
            id: row.id,
            bookId: row.bookId,
            bookTitle: row.bookTitle,
            title: `${row.bookTitle} page ${row.pageNumber}`,
            pageNumber: Number(row.pageNumber),
            startedAt: row.startedAt || null,
            completedAt: row.completedAt || null,
            days: Number(row.days) || 0,
          }
        : null;

    return e.json(200, {
      generatedAt: new Date().toISOString(),
      averagePageCompletionDays,
      averageBookDwellDays,
      fastestPageCompletion: toPageCompletion(fastest),
      slowestPageCompletion: toPageCompletion(slowest),
      mostProductiveMonth: productive
        ? {
            year: Number(productive.year),
            month: Number(productive.month),
            label: `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(productive.month) - 1]} ${productive.year}`,
            count: Number(productive.total) || 0,
          }
        : null,
    });
  },
  $apis.requireAuth()
);

routerAdd(
  'GET',
  '/api/stats/coloring/collection',
  e => {
    if (!e.auth.getBool('verified')) {
      throw new ForbiddenError('Email verification is required.');
    }

    const userId = e.auth.getString('id');
    const bookStatusBreakdown = {
      wishlist: 0,
      purchased: 0,
      in_stash: 0,
      in_progress: 0,
      completed: 0,
      archived: 0,
      destashed: 0,
    };
    const pageStatusBreakdown = {
      not_started: 0,
      palette_chosen: 0,
      in_progress: 0,
      on_hold: 0,
      completed: 0,
    };
    const bookStatusLabels = {
      wishlist: 'Wishlist',
      purchased: 'Purchased',
      in_stash: 'On Bookshelf (Not Started)',
      in_progress: 'In progress',
      completed: 'Completed',
      archived: 'Archived',
      destashed: 'Destashed',
    };
    const pageStatusLabels = {
      not_started: 'Not started',
      palette_chosen: 'Palette chosen',
      in_progress: 'In progress',
      on_hold: 'On hold',
      completed: 'Completed',
    };
    const topPublishers = arrayOf(new DynamicModel({ id: '', label: '', total: 0 }));
    const topIllustrators = arrayOf(new DynamicModel({ id: '', label: '', total: 0 }));
    const topTags = arrayOf(new DynamicModel({ id: '', label: '', total: 0 }));
    const topMediums = arrayOf(new DynamicModel({ id: '', label: '', total: 0 }));
    const topPublisherTotal = new DynamicModel({ total: 0 });
    const topIllustratorTotal = new DynamicModel({ total: 0 });
    const topTagTotal = new DynamicModel({ total: 0 });
    const topMediumTotal = new DynamicModel({ total: 0 });
    const bookRows = arrayOf(new DynamicModel({ status: '', total: 0 }));
    const pageRows = arrayOf(new DynamicModel({ status: '', total: 0 }));
    const completionRows = arrayOf(new DynamicModel({ completionPercentage: 0 }));

    $app
      .db()
      .newQuery(
        `
      SELECT p.id AS id, p.name AS label, COUNT(*) AS total
      FROM coloring_books cb
      JOIN book_publishers p ON p.id = cb.publisher
      WHERE cb.user = {:userId}
        AND cb.publisher IS NOT NULL
        AND cb.publisher != ''
      GROUP BY p.id, p.name
      ORDER BY total DESC, p.name ASC
      LIMIT 10
    `
      )
      .bind({ userId })
      .all(topPublishers);

    $app
      .db()
      .newQuery(
        `
      SELECT COUNT(*) AS total
      FROM coloring_books
      WHERE user = {:userId}
        AND publisher IS NOT NULL
        AND publisher != ''
    `
      )
      .bind({ userId })
      .one(topPublisherTotal);

    $app
      .db()
      .newQuery(
        `
      SELECT i.id AS id, i.name AS label, COUNT(*) AS total
      FROM coloring_books cb
      JOIN book_illustrators i ON i.id = cb.illustrator
      WHERE cb.user = {:userId}
        AND cb.illustrator IS NOT NULL
        AND cb.illustrator != ''
      GROUP BY i.id, i.name
      ORDER BY total DESC, i.name ASC
      LIMIT 10
    `
      )
      .bind({ userId })
      .all(topIllustrators);

    $app
      .db()
      .newQuery(
        `
      SELECT COUNT(*) AS total
      FROM coloring_books
      WHERE user = {:userId}
        AND illustrator IS NOT NULL
        AND illustrator != ''
    `
      )
      .bind({ userId })
      .one(topIllustratorTotal);

    $app
      .db()
      .newQuery(
        `
      SELECT t.id AS id, t.name AS label, COUNT(*) AS total
      FROM coloring_books cb
      JOIN coloring_book_tags cbt ON cbt.book = cb.id
      JOIN coloring_tags t ON t.id = cbt.tag
      WHERE cb.user = {:userId}
      GROUP BY t.id, t.name
      ORDER BY total DESC, t.name ASC
      LIMIT 10
    `
      )
      .bind({ userId })
      .all(topTags);

    $app
      .db()
      .newQuery(
        `
      SELECT COUNT(*) AS total
      FROM coloring_books cb
      JOIN coloring_book_tags cbt ON cbt.book = cb.id
      WHERE cb.user = {:userId}
    `
      )
      .bind({ userId })
      .one(topTagTotal);

    $app
      .db()
      .newQuery(
        `
      SELECT m.id AS id, m.name AS label, COUNT(*) AS total
      FROM coloring_pages cp
      JOIN coloring_books cb ON cb.id = cp.book
      JOIN json_each(cp.mediums) medium_ids
      JOIN coloring_mediums m ON m.id = medium_ids.value
      WHERE cb.user = {:userId}
        AND m.user = {:userId}
      GROUP BY m.id, m.name
      ORDER BY total DESC, m.name ASC
      LIMIT 10
    `
      )
      .bind({ userId })
      .all(topMediums);

    $app
      .db()
      .newQuery(
        `
      SELECT COUNT(*) AS total
      FROM coloring_pages cp
      JOIN coloring_books cb ON cb.id = cp.book
      JOIN json_each(cp.mediums) medium_ids
      JOIN coloring_mediums m ON m.id = medium_ids.value
      WHERE cb.user = {:userId}
        AND m.user = {:userId}
    `
      )
      .bind({ userId })
      .one(topMediumTotal);

    $app
      .db()
      .newQuery(
        `
      SELECT status, COUNT(*) AS total
      FROM coloring_books
      WHERE user = {:userId}
      GROUP BY status
    `
      )
      .bind({ userId })
      .all(bookRows);

    for (const row of bookRows) {
      if (Object.prototype.hasOwnProperty.call(bookStatusBreakdown, row.status)) {
        bookStatusBreakdown[row.status] = Number(row.total) || 0;
      }
    }

    $app
      .db()
      .newQuery(
        `
      SELECT cp.status AS status, COUNT(*) AS total
      FROM coloring_pages cp
      JOIN coloring_books cb ON cb.id = cp.book
      WHERE cb.user = {:userId}
      GROUP BY cp.status
    `
      )
      .bind({ userId })
      .all(pageRows);

    for (const row of pageRows) {
      if (Object.prototype.hasOwnProperty.call(pageStatusBreakdown, row.status)) {
        pageStatusBreakdown[row.status] = Number(row.total) || 0;
      }
    }

    $app
      .db()
      .newQuery(
        `
      SELECT COALESCE(completion_percentage, 0) AS completionPercentage
      FROM coloring_books
      WHERE user = {:userId}
    `
      )
      .bind({ userId })
      .all(completionRows);

    const completionBuckets = [
      { key: 'not_started', label: 'Not started', count: 0 },
      { key: 'started', label: '1-49%', count: 0 },
      { key: 'halfway', label: '50-99%', count: 0 },
      { key: 'completed', label: 'Completed', count: 0 },
    ];
    for (const row of completionRows) {
      const percent = Number(row.completionPercentage) || 0;
      let key = 'not_started';
      if (percent >= 100) key = 'completed';
      else if (percent >= 50) key = 'halfway';
      else if (percent > 0) key = 'started';
      const bucket = completionBuckets.find(item => item.key === key);
      if (bucket) bucket.count++;
    }

    const toTopListGroup = (items, total) => {
      const normalizedTotal = Number(total) || 0;
      const visibleTotal = items.reduce((sum, item) => sum + item.count, 0);
      return {
        total: normalizedTotal,
        items,
        otherCount: Math.max(0, normalizedTotal - visibleTotal),
      };
    };
    const topPublisherItems = Array.from(topPublishers).map(row => ({
      id: row.id,
      label: row.label,
      count: Number(row.total) || 0,
    }));
    const topIllustratorItems = Array.from(topIllustrators).map(row => ({
      id: row.id,
      label: row.label,
      count: Number(row.total) || 0,
    }));
    const topTagItems = Array.from(topTags).map(row => ({
      id: row.id,
      label: row.label,
      count: Number(row.total) || 0,
    }));
    const topMediumItems = Array.from(topMediums).map(row => ({
      id: row.id,
      label: row.label,
      count: Number(row.total) || 0,
    }));

    return e.json(200, {
      generatedAt: new Date().toISOString(),
      topPublishers: topPublisherItems,
      topPublishersGroup: toTopListGroup(topPublisherItems, topPublisherTotal.total),
      topIllustrators: topIllustratorItems,
      topIllustratorsGroup: toTopListGroup(topIllustratorItems, topIllustratorTotal.total),
      topTags: topTagItems,
      topTagsGroup: toTopListGroup(topTagItems, topTagTotal.total),
      topMediums: topMediumItems,
      topMediumsGroup: toTopListGroup(topMediumItems, topMediumTotal.total),
      bookStatusSplit: Object.keys(bookStatusBreakdown).map(status => ({
        key: status,
        label: bookStatusLabels[status] || status,
        count: Number(bookStatusBreakdown[status]) || 0,
      })),
      pageStatusSplit: Object.keys(pageStatusBreakdown).map(status => ({
        key: status,
        label: pageStatusLabels[status] || status,
        count: Number(pageStatusBreakdown[status]) || 0,
      })),
      completionBuckets,
    });
  },
  $apis.requireAuth()
);
