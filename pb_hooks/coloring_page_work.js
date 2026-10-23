const workedPageSql = `
                cp.status != 'not_started'
                OR COALESCE(cp.started_at, '') != ''
                OR COALESCE(cp.completed_at, '') != ''
                OR COALESCE(cp.revealed_subject, '') != ''
                OR COALESCE(cp.revealed_at, '') != ''
                OR COALESCE(cp.mediums, '') NOT IN ('', '[]', 'null')
                OR COALESCE(cp.photos, '') NOT IN ('', '[]', 'null')
                OR EXISTS (
                  SELECT 1 FROM coloring_page_color_keys ck WHERE ck.page = cp.id
                )
                OR EXISTS (
                  SELECT 1 FROM coloring_page_color_references cr
                  WHERE cr.page = cp.id
                    AND (trim(cr.notes, char(9) || char(10) || char(13) || ' ') != ''
                      OR COALESCE(cr.photos, '') NOT IN ('', '[]', 'null'))
                )
                OR EXISTS (
                  SELECT 1
                  FROM coloring_page_progress_notes cpn
                  WHERE cpn.page = cp.id
                )
`;

module.exports = { workedPageSql };
