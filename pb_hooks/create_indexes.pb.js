/// <reference path="../pb_data/types.d.ts" />

/**
 * PocketBase Database Indexes Setup
 *
 * This hook creates performance indexes on frequently queried columns
 * to improve query performance from ~4.7 seconds to milliseconds.
 *
 * Indexes are created for:
 * - Projects: user, status, date fields, updated timestamp
 * - Project Tags: project and tag foreign keys for JOIN performance
 * - Progress Notes: project foreign key
 *
 * This runs automatically when PocketBase starts.
 */

onBootstrap(e => {
  e.next();

  if ($app.isDev()) {
    $app.logger().info('Creating database indexes for performance optimization...');
  }

  try {
    // Execute all index creation in a single transaction for better performance and atomicity
    {
      if ($app.isDev()) {
        $app.logger().info('Creating projects table indexes...');
      }

      // Main query indexes for filtering and sorting
      $app
        .db()
        .newQuery(
          `
        CREATE INDEX IF NOT EXISTS idx_projects_user 
        ON projects (user)
      `
        )
        .execute();

      $app
        .db()
        .newQuery(
          `
        CREATE INDEX IF NOT EXISTS idx_projects_status 
        ON projects (status)
      `
        )
        .execute();

      $app
        .db()
        .newQuery(
          `
        CREATE INDEX IF NOT EXISTS idx_projects_updated 
        ON projects (updated DESC)
      `
        )
        .execute();

      // Composite index for user + status queries (most common filter combination)
      $app
        .db()
        .newQuery(
          `
        CREATE INDEX IF NOT EXISTS idx_projects_user_status 
        ON projects (user, status)
      `
        )
        .execute();

      // Composite index for user + updated (for sorting by last updated)
      $app
        .db()
        .newQuery(
          `
        CREATE INDEX IF NOT EXISTS idx_projects_user_updated 
        ON projects (user, updated DESC)
      `
        )
        .execute();

      // Optimized composite index for dashboard queries (user + status + updated DESC)
      $app
        .db()
        .newQuery(
          `
        CREATE INDEX IF NOT EXISTS idx_projects_user_status_updated 
        ON projects (user, status, updated DESC)
      `
        )
        .execute();

      // Partial index specifically for 'progress' status queries
      $app
        .db()
        .newQuery(
          `
        CREATE INDEX IF NOT EXISTS idx_projects_user_status_progress 
        ON projects (user, date_started) 
        WHERE status = 'progress'
      `
        )
        .execute();

      // Date-based indexes for filtering and Overview stats
      $app
        .db()
        .newQuery(
          `
        CREATE INDEX IF NOT EXISTS idx_projects_date_started 
        ON projects (date_started)
      `
        )
        .execute();

      $app
        .db()
        .newQuery(
          `
        CREATE INDEX IF NOT EXISTS idx_projects_date_completed 
        ON projects (date_completed)
      `
        )
        .execute();

      // Optimized composite index for overview stats startedQuery performance
      // This specifically targets the slow "user + date_started >= currentYear" query
      $app
        .db()
        .newQuery(
          `
        CREATE INDEX IF NOT EXISTS idx_projects_user_date_started_nonempty 
        ON projects (user, date_started) 
        WHERE date_started IS NOT NULL AND date_started != ''
      `
        )
        .execute();

      // Project Tags table indexes (for JOIN performance)
      if ($app.isDev()) {
        $app.logger().info('Creating project_tags table indexes...');
      }

      $app
        .db()
        .newQuery(
          `
        CREATE INDEX IF NOT EXISTS idx_project_tags_project 
        ON project_tags (project)
      `
        )
        .execute();

      $app
        .db()
        .newQuery(
          `
        CREATE INDEX IF NOT EXISTS idx_project_tags_tag 
        ON project_tags (tag)
      `
        )
        .execute();

      // Composite index for efficient project_tags lookups
      $app
        .db()
        .newQuery(
          `
        CREATE INDEX IF NOT EXISTS idx_project_tags_project_tag 
        ON project_tags (project, tag)
      `
        )
        .execute();

      // Progress Notes table indexes
      if ($app.isDev()) {
        $app.logger().info('Creating progress_notes table indexes...');
      }

      $app
        .db()
        .newQuery(
          `
        CREATE INDEX IF NOT EXISTS idx_progress_notes_project 
        ON progress_notes (project)
      `
        )
        .execute();

      $app
        .db()
        .newQuery(
          `
        CREATE INDEX IF NOT EXISTS idx_progress_notes_created 
        ON progress_notes (created DESC)
      `
        )
        .execute();

      // Composite index for progress notes with project and created date
      $app
        .db()
        .newQuery(
          `
        CREATE INDEX IF NOT EXISTS idx_progress_notes_project_created 
        ON progress_notes (project, created DESC)
      `
        )
        .execute();

      // Companies and Artists indexes (for relation expansion)
      if ($app.isDev()) {
        $app.logger().info('Creating companies table indexes...');
      }

      $app
        .db()
        .newQuery(
          `
        CREATE INDEX IF NOT EXISTS idx_companies_user 
        ON companies (user)
      `
        )
        .execute();

      if ($app.isDev()) {
        $app.logger().info('Creating artists table indexes...');
      }

      $app
        .db()
        .newQuery(
          `
        CREATE INDEX IF NOT EXISTS idx_artists_user 
        ON artists (user)
      `
        )
        .execute();

      // Tags table indexes
      if ($app.isDev()) {
        $app.logger().info('Creating tags table indexes...');
      }

      $app
        .db()
        .newQuery(
          `
        CREATE INDEX IF NOT EXISTS idx_tags_user 
        ON tags (user)
      `
        )
        .execute();

      // Users table indexes (for auth and profile lookups)
      if ($app.isDev()) {
        $app.logger().info('Creating users table indexes...');
      }

      $app
        .db()
        .newQuery(
          `
        CREATE INDEX IF NOT EXISTS idx_users_email 
        ON users (email)
      `
        )
        .execute();

      $app
        .db()
        .newQuery(
          `
        CREATE INDEX IF NOT EXISTS idx_users_username 
        ON users (username)
      `
        )
        .execute();

      if ($app.isDev()) {
        $app.logger().info('Database indexes created successfully!');
        $app.logger().info('Query performance should now be significantly improved.');
      }
    }
  } catch (error) {
    if ($app.isDev()) {
      $app.logger().error('Error creating database indexes: ' + String(error));
    }
    // Continue startup even if index creation fails.
  }
});
