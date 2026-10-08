import type React from 'react';
import { Button } from '@/components/ui/button';
import { RippleEffect } from '@/components/ui/ripple-effect';
import type { RandomizerTarget } from '@/types/randomizer';

import { RandomizerWheelKey } from './RandomizerWheelKey';
import {
  formatWedgeNumber,
  getUprightLabelRotation,
  splitRandomizerWheelLabel,
} from './randomizerWheelGeometry';
import {
  getWheelTextColor,
  getWheelTextOutlineColor,
  getWheelTextOutlineOpacity,
  WHEEL_COLORS,
} from './randomizerWheelColors';
import type { WheelLabelMode, WheelState, WheelTextProps } from './randomizerWheelSizing';

function getWheelColor(targetId: string): string {
  const hash = Array.from(targetId).reduce(
    (value, character) => (value * 31 + character.charCodeAt(0)) >>> 0,
    0
  );
  return WHEEL_COLORS[hash % WHEEL_COLORS.length];
}

export function RandomizerWheelLiveRegions({
  liveRegionRef,
  statusRef,
}: {
  liveRegionRef: React.RefObject<HTMLDivElement | null>;
  statusRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <>
      <div ref={liveRegionRef} aria-live="polite" aria-atomic="true" className="sr-only" />
      <div ref={statusRef} aria-live="assertive" aria-atomic="true" className="sr-only" />
    </>
  );
}

function PointerLine() {
  return (
    <div
      className="absolute top-0 left-1/2 z-10 -translate-x-1/2 -translate-y-2 transform"
      aria-hidden="true"
    >
      <div className="border-foreground h-4 w-4 rotate-45 border-r-[3px] border-b-[3px]"></div>
    </div>
  );
}

export function EmptyWheelState({
  liveRegionRef,
  statusRef,
  spinLabel,
}: {
  liveRegionRef: React.RefObject<HTMLDivElement | null>;
  statusRef: React.RefObject<HTMLDivElement | null>;
  spinLabel: string;
}) {
  return (
    <div className="flex w-full min-w-0 flex-col items-center gap-5">
      <RandomizerWheelLiveRegions liveRegionRef={liveRegionRef} statusRef={statusRef} />

      <div className="sr-only" id="wheel-instructions">
        Randomizer wheel. Select some items from the list below to start spinning. Press F1 or
        question mark for help.
      </div>

      <div
        className="relative w-full max-w-80"
        role="img"
        aria-label="Empty randomizer wheel"
        aria-describedby="wheel-instructions"
      >
        <PointerLine />

        <div className="border-border bg-muted relative aspect-square w-full overflow-hidden rounded-full border">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-muted-foreground text-center">
              <p className="text-lg font-semibold">Select items</p>
              <p className="text-sm opacity-90">to get started</p>
            </div>
          </div>
        </div>
      </div>

      <Button
        type="button"
        disabled={true}
        size="lg"
        className="bg-primary text-primary-foreground cursor-not-allowed px-8 py-3 text-base font-semibold opacity-50"
        aria-label={`${spinLabel} (disabled, no targets selected)`}
        aria-describedby="wheel-instructions"
      >
        {spinLabel}
      </Button>
    </div>
  );
}

export function WheelScreenReaderContent({
  itemCount,
  targetList,
  targets,
  isTouchDevice,
}: {
  itemCount: number;
  targetList: string;
  targets: RandomizerTarget[];
  isTouchDevice: boolean;
}) {
  return (
    <div className="sr-only">
      <div id="wheel-description">
        Randomizer wheel with {itemCount} items: {targetList}
      </div>
      <div id="wheel-instructions">
        Press Enter or Space to spin the wheel. Use Escape to exit focus. Use Tab to navigate.
        {isTouchDevice && ' On touch devices, tap the spin button to start the wheel.'}
        Press F1 or question mark for help.
      </div>

      <div id="project-alternatives">
        <h3>Available items:</h3>
        <ul>
          {targets.map((target, index) => (
            <li key={target.id}>
              {index + 1}. {target.title}
              {target.subtitle && <span>, {target.subtitle}</span>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function WheelSegment({
  target,
  index,
  segmentAngle,
  radius,
  labelMode,
  textProps,
}: {
  target: RandomizerTarget;
  index: number;
  segmentAngle: number;
  radius: number;
  labelMode: WheelLabelMode;
  textProps: WheelTextProps;
}) {
  const startAngle = index * segmentAngle;
  const colorHex = getWheelColor(target.id);
  const textColor = getWheelTextColor(colorHex);
  const outlineColor = getWheelTextOutlineColor(textColor);
  const outlineOpacity = getWheelTextOutlineOpacity(textColor);
  const startAngleRad = (startAngle * Math.PI) / 180;
  const endAngleRad = ((startAngle + segmentAngle) * Math.PI) / 180;
  const x1 = radius + radius * Math.cos(startAngleRad);
  const y1 = radius + radius * Math.sin(startAngleRad);
  const x2 = radius + radius * Math.cos(endAngleRad);
  const y2 = radius + radius * Math.sin(endAngleRad);
  const largeArcFlag = segmentAngle > 180 ? 1 : 0;
  const pathData =
    segmentAngle === 360
      ? `M ${radius * 2} ${radius} A ${radius} ${radius} 0 1 0 0 ${radius} A ${radius} ${radius} 0 1 0 ${radius * 2} ${radius} Z`
      : [
          `M ${radius} ${radius}`,
          `L ${x1} ${y1}`,
          `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}`,
          'Z',
        ].join(' ');
  const textAngle = startAngle + segmentAngle / 2;
  const textAngleRad = (textAngle * Math.PI) / 180;
  const textRadius = radius * 0.7;
  const textX = radius + textRadius * Math.cos(textAngleRad);
  const textY = radius + textRadius * Math.sin(textAngleRad);
  const textRotation = labelMode === 'number' ? 0 : getUprightLabelRotation(textAngle);
  const labelLines =
    labelMode === 'number'
      ? [formatWedgeNumber(index)]
      : splitRandomizerWheelLabel(target.title, textProps);
  const lineHeight = textProps.fontSize * 1.05;
  const firstLineOffset = labelLines.length > 1 ? -lineHeight / 2 : 0;

  return (
    <g>
      <path
        d={pathData}
        fill={colorHex}
        stroke="hsl(var(--border))"
        strokeWidth="3"
        opacity="0.9"
      />
      <path
        d={pathData}
        fill="none"
        stroke={outlineColor}
        strokeWidth="1"
        strokeDasharray={index % 2 === 0 ? '5,5' : 'none'}
        opacity="0.18"
      />
      {segmentAngle !== 360 && (
        <WheelSegmentLabel
          labelLines={labelLines}
          textColor={textColor}
          outlineColor={outlineColor}
          outlineOpacity={outlineOpacity}
          textProps={textProps}
          textX={textX}
          textY={textY}
          textRotation={textRotation}
          lineHeight={lineHeight}
          firstLineOffset={firstLineOffset}
        />
      )}
    </g>
  );
}

function WheelSegmentLabel({
  labelLines,
  textColor,
  outlineColor,
  outlineOpacity,
  textProps,
  textX,
  textY,
  textRotation,
  lineHeight,
  firstLineOffset,
}: {
  labelLines: string[];
  textColor: string;
  outlineColor: string;
  outlineOpacity: number;
  textProps: WheelTextProps;
  textX: number;
  textY: number;
  textRotation: number;
  lineHeight: number;
  firstLineOffset: number;
}) {
  const textStyle = {
    transform: `rotate(${textRotation}deg)`,
    transformOrigin: `${textX}px ${textY}px`,
  };

  return (
    <>
      <text
        x={textX}
        y={textY}
        fill="none"
        stroke={outlineColor}
        strokeWidth={textProps.strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity={outlineOpacity}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={textProps.fontSize}
        fontWeight="500"
        style={textStyle}
      >
        {labelLines.map((line, lineIndex) => (
          <tspan
            key={`outline-${lineIndex}-${line}`}
            x={textX}
            dy={lineIndex === 0 ? firstLineOffset : lineHeight}
          >
            {line}
          </tspan>
        ))}
      </text>
      <text
        x={textX}
        y={textY}
        fill={textColor}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={textProps.fontSize}
        fontWeight="500"
        className="drop-shadow-sm"
        style={textStyle}
      >
        {labelLines.map((line, lineIndex) => (
          <tspan
            key={`fill-${lineIndex}-${line}`}
            x={textX}
            dy={lineIndex === 0 ? firstLineOffset : lineHeight}
          >
            {line}
          </tspan>
        ))}
      </text>
    </>
  );
}

export function WheelGraphic({
  targets,
  wheelRef,
  wheelSize,
  rotation,
  segmentAngle,
  labelMode,
  textProps,
}: {
  targets: RandomizerTarget[];
  wheelRef: React.RefObject<HTMLDivElement | null>;
  wheelSize: number;
  rotation: number;
  segmentAngle: number;
  labelMode: WheelLabelMode;
  textProps: WheelTextProps;
}) {
  const radius = wheelSize / 2;

  return (
    <>
      <PointerLine />
      <div
        ref={wheelRef}
        data-testid="randomizer-wheel-disc"
        className="border-border relative aspect-square w-full overflow-hidden rounded-full border transition-transform duration-3000 ease-out"
        style={
          {
            transform: `rotate(${rotation}deg)`,
            transformOrigin: 'center',
          } as React.CSSProperties
        }
        aria-hidden="true"
      >
        <svg className="absolute inset-0 size-full" viewBox={`0 0 ${wheelSize} ${wheelSize}`}>
          {targets.map((target, index) => (
            <WheelSegment
              key={target.id}
              target={target}
              index={index}
              segmentAngle={segmentAngle}
              radius={radius}
              labelMode={labelMode}
              textProps={textProps}
            />
          ))}
        </svg>
      </div>
      {targets.length === 1 && (
        <div
          data-testid="randomizer-single-target"
          aria-hidden="true"
          className="border-border bg-card pointer-events-none absolute inset-[12.5%] flex flex-col items-center justify-center gap-2 rounded-full border px-5 text-center"
        >
          <p className="text-accent text-6xl leading-none font-semibold tabular-nums">1</p>
          <p className="text-muted-foreground text-sm">1 item selected</p>
        </div>
      )}
    </>
  );
}

export function WheelActionRow({
  targets,
  labelMode,
  spinLabel,
  actionAriaLabel,
  state,
  onSpin,
}: {
  targets: RandomizerTarget[];
  labelMode: WheelLabelMode;
  spinLabel: string;
  actionAriaLabel: string;
  state: WheelState;
  onSpin: () => void;
}) {
  return (
    <div
      className={`flex items-center justify-center gap-2 ${
        state.isMobile && state.usesNumberLabels ? 'w-full max-w-[320px]' : ''
      }`}
    >
      <RippleEffect
        duration={400}
        color="hsl(var(--primary-foreground) / 0.4)"
        disabled={state.isDisabled || state.isSpinning || targets.length === 0}
        className={state.isMobile && state.usesNumberLabels ? 'min-w-0 flex-1' : ''}
      >
        <Button
          type="button"
          onClick={onSpin}
          disabled={state.isDisabled || state.isSpinning || targets.length === 0}
          size="lg"
          className={`bg-primary text-primary-foreground hover:bg-primary/90 px-8 py-3 text-base font-semibold ${
            state.isTouchDevice ? 'min-h-[48px] touch-manipulation active:scale-95' : ''
          } ${state.isMobile ? 'w-full' : ''} transition-transform duration-150`}
          aria-label={
            state.isSpinning
              ? `Spinning wheel to select from ${targets.length} items`
              : actionAriaLabel
          }
          aria-describedby="wheel-description wheel-instructions"
        >
          {state.isSpinning ? (
            <>
              <span className="mr-2 inline-block size-4 animate-spin rounded-full border-2 border-transparent border-t-current" />
              Spinning
            </>
          ) : (
            <>{spinLabel}</>
          )}
        </Button>
      </RippleEffect>
      <RandomizerWheelKey
        targets={targets}
        getColor={getWheelColor}
        isMobile={state.isMobile}
        labelMode={labelMode}
      />
    </div>
  );
}
