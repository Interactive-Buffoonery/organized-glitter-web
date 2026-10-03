/**
 * @fileoverview Interactive Randomizer Wheel Component
 *
 * An accessible spinning wheel component that randomly selects from a list of items.
 * Features smooth animations, comprehensive accessibility support, responsive design, and
 * integration with the Organized Glitter brand color palette.
 *
 * @author @serabi
 * @version 1.0.0
 * @since 2025-06-28
 */

import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { createLogger } from '@/utils/logger';
import {
  useAccessibilityAnnouncements,
  useFocusManagement,
} from '@/hooks/useAccessibilityAnnouncements';
import { useMobileDevice } from '@/hooks/use-mobile';
import { RippleEffect } from '@/components/ui/ripple-effect';
import type { RandomizerTarget } from '@/types/randomizer';

import {
  EmptyWheelState,
  RandomizerWheelLiveRegions,
  WheelActionRow,
  WheelGraphic,
  WheelScreenReaderContent,
} from '@/components/randomizer/RandomizerWheelDisplay';
import { getRandomizerWheelLabelMode } from '@/components/randomizer/randomizerWheelGeometry';
import {
  getResponsiveWheelSize,
  getResponsiveWheelTextProps,
  type WheelLabelMode,
} from '@/components/randomizer/randomizerWheelSizing';

const logger = createLogger('RandomizerWheel');

/**
 * Props interface for the RandomizerWheel component
 * @interface RandomizerWheelProps
 */
interface RandomizerWheelProps {
  /** Array of targets to display on the wheel */
  targets: RandomizerTarget[];
  /** Callback function called when a spin completes with the selected target */
  onSpinComplete: (selectedTarget: RandomizerTarget) => void;
  /** Whether the wheel should be disabled (optional) */
  disabled?: boolean;
  /** Label for the primary wheel action */
  spinLabel?: string;
  labelMode?: WheelLabelMode;
  sessionKey?: string;
}

/**
 * Interactive randomizer wheel component with accessibility and animations
 *
 * Creates a spinning wheel that displays targets as colored segments and randomly
 * selects one when spun. Includes comprehensive accessibility features, responsive
 * design, reduced motion support, and smooth animations.
 *
 * @param {RandomizerWheelProps} props - Component props
 * @param {RandomizerTarget[]} props.targets - Targets to display on the wheel
 * @param {function} props.onSpinComplete - Callback for when spin completes
 * @param {boolean} [props.disabled=false] - Whether the wheel is disabled
 *
 * @returns {JSX.Element} The rendered randomizer wheel component
 *
 * @accessibility
 * - WCAG 2.1 AA compliant
 * - Keyboard navigation (Enter/Space to spin, Escape to exit, H/F1 for help, R to read state)
 * - Screen reader announcements for spin state and results
 * - Alternative content listing all targets
 * - Proper ARIA labels and descriptions
 * - Focus management and visual focus indicators
 * - Color accessibility with patterns for colorblind users
 *
 * @mathematics
 * The wheel selection uses precise angle calculations:
 * - Each segment spans 360 degrees / targetCount
 * - Arrow fixed at top, 270 degrees from 0-degree reference
 * - Selection = Math.floor((270 - finalRotation + 360) % 360 / segmentAngle)
 * - Ensures fair distribution across all segments
 */
export const RandomizerWheel: React.FC<RandomizerWheelProps> = props => (
  <RandomizerWheelSession
    key={JSON.stringify([props.sessionKey, props.targets.map(target => [target.mode, target.id])])}
    {...props}
  />
);

const RandomizerWheelSession: React.FC<RandomizerWheelProps> = ({
  targets,
  onSpinComplete,
  disabled = false,
  spinLabel = 'Spin',
  labelMode: preferredLabelMode,
}) => {
  const itemCount = targets.length;

  const actionAriaLabel =
    spinLabel === 'Spin'
      ? `Spin the wheel to randomly select from ${itemCount} items`
      : `${spinLabel} from ${itemCount} items`;
  /** Whether the wheel is currently spinning */
  const [isSpinning, setIsSpinning] = useState(false);
  /** Current rotation angle in degrees */
  const [rotation, setRotation] = useState(0);
  /** Reference to the wheel DOM element for focus management */
  const wheelRef = useRef<HTMLDivElement>(null);
  /** Active spin completion listener cleanup so it can be cleared on unmount */
  const spinCompletionCleanupRef = useRef<(() => void) | null>(null);

  // Single source of truth for device/viewport info. Replaces useIsMobile() +
  // useIsTouchDevice() + manual windowSize state, collapsing 3 resize listeners to 1.
  const { width, height, isMobile, isTouchDevice } = useMobileDevice();

  // Accessibility and focus support
  const {
    announce,
    announceSpinStart,
    announceSpinResult,
    announceKeyboardInstructions,
    announceTouchInstructions,
    liveRegionRef,
    statusRef,
  } = useAccessibilityAnnouncements();

  const { removeFocus } = useFocusManagement();

  const handleSpin = useCallback(() => {
    if (disabled || isSpinning || spinCompletionCleanupRef.current || itemCount === 0) return;

    logger.debug('Starting wheel spin', { targetCount: itemCount });
    setIsSpinning(true);
    // Announce spin start with accessibility support
    announceSpinStart(itemCount);

    // Check for reduced motion preference
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Calculate random rotation (multiple full rotations + random angle)
    const baseRotation = prefersReducedMotion ? 0 : 1800; // No spin if reduced motion
    const randomRotation = Math.random() * 360;
    const totalRotation = rotation + baseRotation + randomRotation;

    // Calculate which target was selected
    const segAngle = 360 / itemCount;
    // The wheel rotates clockwise, and the arrow points down (at 270 degrees from 0)
    // We need to find which segment the arrow (fixed at top) points to after rotation
    const finalRotation = totalRotation % 360;
    // Since the wheel rotates and the arrow is fixed, we need to find where
    // the original 0-degree position ended up, then add 270 for the arrow
    const arrowPointsAt = (270 - finalRotation + 360) % 360;
    const selectedIndex = Math.floor(arrowPointsAt / segAngle);
    const selectedTarget = targets[selectedIndex];

    logger.debug('Wheel spin calculation', {
      totalRotation,
      finalRotation,
      arrowPointsAt,
      segAngle,
      selectedIndex,
      selectedTargetId: selectedTarget?.id,
      selectedTargetTitle: selectedTarget?.title,
    });

    const completeSpin = () => {
      setIsSpinning(false);
      if (selectedTarget) {
        onSpinComplete(selectedTarget);
        logger.info('Wheel spin completed', {
          selectedTargetId: selectedTarget.id,
          selectedTargetTitle: selectedTarget.title,
        });

        announceSpinResult(selectedTarget.title, selectedTarget.subtitle);
      }
      spinCompletionCleanupRef.current = null;
    };

    const wheelElement = wheelRef.current;
    if (wheelElement) {
      const handleTransitionEnd = (event: TransitionEvent) => {
        if (event.target !== wheelElement || event.propertyName !== 'transform') return;
        wheelElement.removeEventListener('transitionend', handleTransitionEnd);
        completeSpin();
      };

      wheelElement.addEventListener('transitionend', handleTransitionEnd);
      spinCompletionCleanupRef.current = () => {
        wheelElement.removeEventListener('transitionend', handleTransitionEnd);
      };
    } else {
      completeSpin();
    }

    setRotation(totalRotation);
  }, [
    disabled,
    isSpinning,
    itemCount,
    targets,
    rotation,
    onSpinComplete,
    announceSpinStart,
    announceSpinResult,
  ]);

  useEffect(() => {
    return () => {
      spinCompletionCleanupRef.current?.();
      spinCompletionCleanupRef.current = null;
    };
  }, []);

  // Keyboard navigation handler
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (isSpinning) return;

      switch (event.key) {
        case 'Enter':
        case ' ':
          event.preventDefault();
          if (!disabled && itemCount > 0) {
            handleSpin();
          } else if (itemCount === 0) {
            announceSpinStart(0);
          } else if (disabled) {
            announce('Wheel is currently disabled. Please wait or check your selection.');
          }
          break;
        case 'Escape':
          event.preventDefault();
          removeFocus();
          announce('Focus removed from randomizer wheel.');
          break;
        case 'F1':
        case '?':
          event.preventDefault();
          if (isTouchDevice) {
            announceTouchInstructions();
          } else {
            announceKeyboardInstructions();
          }
          break;
        case 'h':
        case 'H':
          event.preventDefault();
          announce(
            `Randomizer wheel help: ${itemCount} items available. Use Enter or Space to spin. Use F1 for detailed instructions.`
          );
          break;
        case 'r':
        case 'R':
          event.preventDefault();
          if (itemCount > 0) {
            const projectListPreview = targets
              .slice(0, 5)
              .map(p => p.title)
              .join(', ');
            const moreText = itemCount > 5 ? ` and ${itemCount - 5} more` : '';
            announce(
              `${itemCount} items selected: ${projectListPreview}${moreText}. Press Enter to spin.`
            );
          } else {
            announce('No items selected for randomizer. Please select items from the list below.');
          }
          break;
      }
    },
    [
      isSpinning,
      disabled,
      itemCount,
      targets,
      handleSpin,
      removeFocus,
      announceKeyboardInstructions,
      announceTouchInstructions,
      announceSpinStart,
      announce,
      isTouchDevice,
    ]
  );

  const segmentAngle = 360 / itemCount;
  const wheelSize = useMemo(
    () => Math.min(320, getResponsiveWheelSize(width, height)),
    [width, height]
  );
  const textProps = useMemo(
    () =>
      preferredLabelMode === 'number'
        ? { fontSize: 22, strokeWidth: 3, maxChars: 3 }
        : getResponsiveWheelTextProps({ projectCount: itemCount, width, height, isMobile }),
    [width, height, itemCount, isMobile, preferredLabelMode]
  );

  const labelMode = useMemo(
    () => preferredLabelMode ?? getRandomizerWheelLabelMode(itemCount, isMobile),
    [itemCount, isMobile, preferredLabelMode]
  );

  const targetList = useMemo(() => targets.map(p => p.title).join(', '), [targets]);

  if (itemCount === 0) {
    return (
      <EmptyWheelState liveRegionRef={liveRegionRef} statusRef={statusRef} spinLabel={spinLabel} />
    );
  }

  const wheelState = {
    isMobile,
    isTouchDevice,
    isSpinning,
    isDisabled: disabled,
    usesNumberLabels: labelMode === 'number',
  };

  return (
    <div className="flex w-full min-w-0 flex-col items-center gap-5">
      <RandomizerWheelLiveRegions liveRegionRef={liveRegionRef} statusRef={statusRef} />
      <WheelScreenReaderContent
        itemCount={itemCount}
        targetList={targetList}
        targets={targets}
        isTouchDevice={isTouchDevice}
      />

      <RippleEffect
        duration={600}
        color="hsl(var(--primary) / 0.15)"
        disabled={disabled || isSpinning}
        className="relative w-full max-w-80 rounded-full"
      >
        <div
          className="focus-visible:ring-ring/50 rounded-full focus-visible:ring-[3px] focus-visible:outline-none"
          role="button"
          aria-label={`Randomizer wheel with ${itemCount} items`}
          aria-describedby="wheel-description wheel-instructions project-alternatives"
          aria-disabled={disabled || isSpinning}
          tabIndex={0}
          onKeyDown={handleKeyDown}
          onClick={handleSpin}
          onFocus={() => {
            if (isTouchDevice) {
              announceTouchInstructions();
            } else {
              announceKeyboardInstructions();
            }
          }}
        >
          <WheelGraphic
            targets={targets}
            wheelRef={wheelRef}
            wheelSize={wheelSize}
            rotation={rotation}
            segmentAngle={segmentAngle}
            labelMode={labelMode}
            textProps={textProps}
          />
        </div>
      </RippleEffect>

      <WheelActionRow
        targets={targets}
        labelMode={labelMode}
        spinLabel={spinLabel}
        actionAriaLabel={actionAriaLabel}
        state={wheelState}
        onSpin={handleSpin}
      />
    </div>
  );
};
