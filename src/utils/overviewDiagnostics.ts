/**
 * Overview Performance Diagnostics
 *
 * This utility helps diagnose why the Overview page startedQuery is taking 4648ms
 * despite optimizations and database indexes.
 */

import { getCurrentUserId } from '@/services/auth';
import { OverviewDiagnosticsService } from '@/services/pocketbase/overviewDiagnostics.service';
import { logger } from '@/utils/logger';

export interface DiagnosticResult {
  totalProjects: number;
  projectsWithDates: number;
  dateDataQuality: {
    emptyStrings: number;
    nullValues: number;
    invalidDates: number;
    validDates: number;
  };
  sampleDates: string[];
  queryTiming: {
    basicUserQuery: number;
    dateFilteredQuery: number;
    optimizedQuery: number;
  };
  recommendations: string[];
}

/**
 * Run comprehensive diagnostics on the user's project data
 * to identify the root cause of slow Overview queries
 */
async function runOverviewDiagnostics(userId: string): Promise<DiagnosticResult> {
  const currentYear = new Date().getFullYear();
  const diagnostics: DiagnosticResult = {
    totalProjects: 0,
    projectsWithDates: 0,
    dateDataQuality: {
      emptyStrings: 0,
      nullValues: 0,
      invalidDates: 0,
      validDates: 0,
    },
    sampleDates: [],
    queryTiming: {
      basicUserQuery: 0,
      dateFilteredQuery: 0,
      optimizedQuery: 0,
    },
    recommendations: [],
  };

  logger.log('[Diagnostics] Starting comprehensive Overview performance analysis...');

  let allProjects: Array<{
    id: string;
    date_started: string | null;
    created: string;
    updated: string;
  }> = [];
  const actualProjectCount = () => allProjects.length;

  try {
    // Test 1: Basic user query timing with full pagination
    logger.log('[Diagnostics] Test 1: Basic user query with pagination...');
    const basicStart = performance.now();

    // First, get the total count and first batch
    const projectList = await OverviewDiagnosticsService.listProjectsForUser(userId);

    diagnostics.totalProjects = projectList.totalItems;
    allProjects = projectList.items;

    diagnostics.queryTiming.basicUserQuery = performance.now() - basicStart;

    logger.log(
      `[Diagnostics] Found ${diagnostics.totalProjects} total projects (retrieved ${allProjects.length}) in ${diagnostics.queryTiming.basicUserQuery.toFixed(0)}ms`
    );

    // Verify data integrity
    if (allProjects.length !== diagnostics.totalProjects) {
      logger.warn(
        `[Diagnostics] Warning: Retrieved ${allProjects.length} projects but totalItems was ${diagnostics.totalProjects}`
      );
      diagnostics.recommendations.push(
        `⚠️ Data retrieval mismatch: Retrieved ${allProjects.length} projects but expected ${diagnostics.totalProjects}`
      );
    }

    // Test 2: Analyze date data quality
    logger.log('[Diagnostics] Test 2: Analyzing date data quality...');
    const projects = allProjects;

    projects.forEach(project => {
      const dateStarted = project.date_started;

      if (dateStarted === null || dateStarted === undefined) {
        diagnostics.dateDataQuality.nullValues++;
      } else if (dateStarted === '' || dateStarted.trim() === '') {
        diagnostics.dateDataQuality.emptyStrings++;
      } else {
        // Try to parse the date
        try {
          const parsed = new Date(dateStarted);
          if (isNaN(parsed.getTime())) {
            diagnostics.dateDataQuality.invalidDates++;
          } else {
            diagnostics.dateDataQuality.validDates++;
            if (diagnostics.sampleDates.length < 10) {
              diagnostics.sampleDates.push(dateStarted);
            }
          }
        } catch {
          diagnostics.dateDataQuality.invalidDates++;
        }
      }
    });

    diagnostics.projectsWithDates = diagnostics.dateDataQuality.validDates;

    // Test 3: Date-filtered query timing (the problematic one)
    logger.log('[Diagnostics] Test 3: Date-filtered query timing...');
    const dateStart = performance.now();
    const dateFilteredCount = await OverviewDiagnosticsService.countProjectsStartedAfter(
      userId,
      `${currentYear}-01-01`
    );
    diagnostics.queryTiming.dateFilteredQuery = performance.now() - dateStart;

    logger.log(
      `[Diagnostics] Date-filtered query found ${dateFilteredCount} projects in ${diagnostics.queryTiming.dateFilteredQuery.toFixed(0)}ms`
    );

    // Test 4: Optimized query timing
    logger.log('[Diagnostics] Test 4: Optimized query timing...');
    const optStart = performance.now();
    const optimizedCount = await OverviewDiagnosticsService.countProjectsStartedAfterOptimized(
      userId,
      `${currentYear}-01-01`
    );
    diagnostics.queryTiming.optimizedQuery = performance.now() - optStart;

    logger.log(
      `[Diagnostics] Optimized query found ${optimizedCount} projects in ${diagnostics.queryTiming.optimizedQuery.toFixed(0)}ms`
    );

    // Generate recommendations
    logger.log('[Diagnostics] Generating recommendations...');

    if (diagnostics.totalProjects === 0) {
      diagnostics.recommendations.push('✅ User has no projects - Overview should be instant');
    }

    if (diagnostics.dateDataQuality.emptyStrings > 0) {
      diagnostics.recommendations.push(
        `⚠️ Found ${diagnostics.dateDataQuality.emptyStrings} projects with empty string dates - database cleanup recommended`
      );
    }

    if (diagnostics.dateDataQuality.nullValues > diagnostics.dateDataQuality.emptyStrings) {
      diagnostics.recommendations.push(
        '✅ Good: Most unset dates are properly null, not empty strings'
      );
    }

    if (diagnostics.queryTiming.dateFilteredQuery > 1000) {
      diagnostics.recommendations.push(
        `❌ Date-filtered query is slow (${diagnostics.queryTiming.dateFilteredQuery.toFixed(0)}ms) - database indexes may not be working`
      );
    }

    if (diagnostics.queryTiming.optimizedQuery > 1000) {
      diagnostics.recommendations.push(
        `❌ Even optimized query is slow (${diagnostics.queryTiming.optimizedQuery.toFixed(0)}ms) - deeper database issue suspected`
      );
    }

    if (diagnostics.queryTiming.basicUserQuery > 500) {
      diagnostics.recommendations.push(
        `⚠️ Basic user query is slow (${diagnostics.queryTiming.basicUserQuery.toFixed(0)}ms) - user index may be missing`
      );
    }

    // Use actual retrieved count for accurate data quality analysis
    const retrievedCount = actualProjectCount();
    const dataQualityRatio = diagnostics.dateDataQuality.validDates / Math.max(1, retrievedCount);
    if (dataQualityRatio < 0.1 && retrievedCount > 10) {
      diagnostics.recommendations.push(
        '💡 Most projects have no start dates - consider skipping date queries for this user'
      );
    }

    logger.log('[Diagnostics] Analysis complete!');
    logger.log({
      'Total Projects (Reported)': diagnostics.totalProjects,
      'Total Projects (Retrieved)': retrievedCount,
      'Projects with Valid Dates': diagnostics.dateDataQuality.validDates,
      'Empty String Dates': diagnostics.dateDataQuality.emptyStrings,
      'Null Dates': diagnostics.dateDataQuality.nullValues,
      'Data Quality Ratio': `${(dataQualityRatio * 100).toFixed(1)}%`,
      'Basic Query Time': `${diagnostics.queryTiming.basicUserQuery.toFixed(0)}ms`,
      'Date Query Time': `${diagnostics.queryTiming.dateFilteredQuery.toFixed(0)}ms`,
      'Optimized Query Time': `${diagnostics.queryTiming.optimizedQuery.toFixed(0)}ms`,
    });

    logger.log('[Diagnostics] Recommendations:', diagnostics.recommendations);
  } catch (error) {
    logger.error('[Diagnostics] Error during analysis:', error);
    diagnostics.recommendations.push('❌ Diagnostic analysis failed - check console for errors');
  }

  return diagnostics;
}

/**
 * Quick diagnostic that can be called from browser console
 * Usage: window.runOverviewDiagnostics()
 */
export function enableDiagnosticConsoleAccess() {
  if (typeof window !== 'undefined') {
    (
      window as {
        runOverviewDiagnostics?: (userId?: string) => Promise<DiagnosticResult | undefined>;
      }
    ).runOverviewDiagnostics = async (userId?: string) => {
      const currentUserId = userId || getCurrentUserId();
      if (!currentUserId) {
        logger.error('No user ID provided and no authenticated user found');
        return;
      }
      return await runOverviewDiagnostics(currentUserId);
    };
    logger.log('🔍 Diagnostics enabled! Run: window.runOverviewDiagnostics()');
  }
}
