/**
 * @fileoverview Accessibility Announcements Hook
 *
 * Provides utilities for making screen reader announcements and managing
 * accessibility features for the randomizer components. Ensures WCAG 2.1 AA
 * compliance with proper ARIA live regions and announcement management.
 *
 * @author serabi
 * @version 1.0.0
 * @since 2025-07-19
 */

import { useRef, useCallback, useEffect } from 'react';
import { createLogger } from '@/utils/logger';

const logger = createLogger('AccessibilityAnnouncements');

/**
 * Priority levels for screen reader announcements
 */
type AnnouncementPriority = 'polite' | 'assertive';

/**
 * Configuration for accessibility announcements
 */
interface AnnouncementConfig {
  /** Priority level for the announcement */
  priority?: AnnouncementPriority;
  /** Whether to clear previous announcements */
  clearPrevious?: boolean;
  /** Delay before making the announcement (ms) */
  delay?: number;
}

/**
 * Hook for managing accessibility announcements and screen reader support
 *
 * Provides utilities for making announcements to screen readers, managing
 * ARIA live regions, and ensuring proper accessibility feedback for user actions.
 *
 * @returns Object with announcement utilities and refs
 *
 * @example
 * ```tsx
 * const { announce, liveRegionRef, statusRef } = useAccessibilityAnnouncements();
 *
 * // Make an announcement
 * announce('Wheel spinning started', { priority: 'assertive' });
 *
 * // Include live regions in JSX
 * <div ref={liveRegionRef} aria-live="polite" aria-atomic="true" className="sr-only" />
 * <div ref={statusRef} aria-live="assertive" aria-atomic="true" className="sr-only" />
 * ```
 */
export const useAccessibilityAnnouncements = () => {
  /** Reference to the polite live region */
  const liveRegionRef = useRef<HTMLDivElement>(null);
  /** Reference to the assertive live region */
  const statusRef = useRef<HTMLDivElement>(null);
  /** Reference to track announcement timeouts */
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Make an announcement to screen readers
   *
   * @param message - The message to announce
   * @param config - Configuration options for the announcement
   */
  const announce = useCallback((message: string, config: AnnouncementConfig = {}) => {
    const { priority = 'polite', clearPrevious = false, delay = 0 } = config;

    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    const makeAnnouncement = () => {
      const targetRef = priority === 'assertive' ? statusRef : liveRegionRef;

      if (targetRef.current) {
        // Clear previous announcement if requested
        if (clearPrevious) {
          targetRef.current.textContent = '';
          // Small delay to ensure screen readers notice the change
          setTimeout(() => {
            if (targetRef.current) {
              targetRef.current.textContent = message;
            }
          }, 50);
        } else {
          targetRef.current.textContent = message;
        }

        logger.debug('Accessibility announcement made', {
          message,
          priority,
          clearPrevious,
          delay,
        });
      } else {
        logger.warn('Live region not available for announcement', {
          message,
          priority,
          targetRefExists: !!targetRef.current,
        });
      }
    };

    if (delay > 0) {
      timeoutRef.current = setTimeout(makeAnnouncement, delay);
    } else {
      makeAnnouncement();
    }
  }, []);

  /**
   * Announce spin start with appropriate messaging
   */
  const announceSpinStart = useCallback(
    (projectCount: number) => {
      if (projectCount === 0) {
        announce('Cannot spin wheel: No targets are currently in the spin pool.', {
          priority: 'assertive',
          clearPrevious: true,
        });
      } else {
        announce(
          `Spinning wheel to select from ${projectCount} ${
            projectCount === 1 ? 'target' : 'targets'
          }. Please wait for the result.`,
          { priority: 'assertive', clearPrevious: true }
        );
      }
    },
    [announce]
  );

  /**
   * Announce spin result with project details
   */
  const announceSpinResult = useCallback(
    (projectTitle: string, projectDetails?: string) => {
      const message = projectDetails
        ? `Spin complete! Selected project: ${projectTitle} by ${projectDetails}`
        : `Spin complete! Selected project: ${projectTitle}`;

      announce(message, { priority: 'assertive', clearPrevious: true, delay: 100 });
    },
    [announce]
  );

  /**
   * Announce keyboard navigation instructions
   */
  const announceKeyboardInstructions = useCallback(() => {
    announce(
      'Keyboard navigation: Enter or Space to spin wheel. Arrow keys for information. Home and End for navigation. H for help shortcuts. R to read current state. Escape to exit focus. Tab to navigate between elements.',
      { priority: 'polite' }
    );
  }, [announce]);

  /**
   * Announce touch gesture instructions
   */
  const announceTouchInstructions = useCallback(() => {
    announce('Touch navigation: Tap the spin button to start spinning.', {
      priority: 'polite',
    });
  }, [announce]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return {
    announce,
    announceSpinStart,
    announceSpinResult,
    announceKeyboardInstructions,
    announceTouchInstructions,
    liveRegionRef,
    statusRef,
  };
};

/**
 * Hook for managing focus and keyboard navigation
 *
 * Provides utilities for managing focus states, keyboard navigation,
 * and ensuring proper focus management for accessibility.
 *
 * @returns Object with focus management utilities
 */
export const useFocusManagement = () => {
  /**
   * Remove focus from current element
   */
  const removeFocus = useCallback(() => {
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement && typeof activeElement.blur === 'function') {
      try {
        activeElement.blur();
        logger.debug('Focus removed successfully');
      } catch (error) {
        logger.warn('Failed to remove focus', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }, []);

  return {
    removeFocus,
  };
};
