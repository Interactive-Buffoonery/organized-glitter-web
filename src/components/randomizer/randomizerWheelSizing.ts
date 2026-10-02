import { getRandomizerWheelLabelMode } from './randomizerWheelGeometry';

export type WheelTextProps = {
  fontSize: number;
  strokeWidth: number;
  maxChars: number;
};

export type WheelLabelMode = ReturnType<typeof getRandomizerWheelLabelMode>;

export type WheelState = {
  isMobile: boolean;
  isTouchDevice: boolean;
  isSpinning: boolean;
  isDisabled: boolean;
  usesNumberLabels: boolean;
};

export function getResponsiveWheelSize(width: number, height: number) {
  const isLandscape = width > height;
  if (width >= 1024) return 560;
  if (width >= 920 && isLandscape) return 480;
  if (width >= 768 && isLandscape) return 420;
  if (width >= 640) return 384;
  if (width >= 480) return 320;
  if (width >= 360) return 288;
  return 240;
}

export function getResponsiveWheelTextProps({
  projectCount,
  width,
  height,
  isMobile,
}: {
  projectCount: number;
  width: number;
  height: number;
  isMobile: boolean;
}): WheelTextProps {
  const isLandscape = width > height;

  if (getRandomizerWheelLabelMode(projectCount, isMobile) === 'number') {
    return { fontSize: width >= 640 ? 22 : 18, strokeWidth: 3, maxChars: 3 };
  }

  if (width >= 1024) {
    if (projectCount <= 4) return { fontSize: 18, strokeWidth: 3, maxChars: 15 };
    if (projectCount <= 8) return { fontSize: 16, strokeWidth: 3, maxChars: 12 };
    if (projectCount <= 15) return { fontSize: 14, strokeWidth: 2, maxChars: 10 };
    return { fontSize: 12, strokeWidth: 2, maxChars: 8 };
  }

  if (width >= 920 && isLandscape) {
    if (projectCount <= 4) return { fontSize: 17, strokeWidth: 2, maxChars: 14 };
    if (projectCount <= 8) return { fontSize: 15, strokeWidth: 2, maxChars: 11 };
    if (projectCount <= 15) return { fontSize: 13, strokeWidth: 2, maxChars: 9 };
    return { fontSize: 11, strokeWidth: 2, maxChars: 7 };
  }

  if (width >= 768 && isLandscape) {
    if (projectCount <= 4) return { fontSize: 16, strokeWidth: 2, maxChars: 13 };
    if (projectCount <= 8) return { fontSize: 14, strokeWidth: 2, maxChars: 10 };
    if (projectCount <= 15) return { fontSize: 12, strokeWidth: 2, maxChars: 8 };
    return { fontSize: 10, strokeWidth: 1, maxChars: 6 };
  }

  if (width >= 640) {
    if (projectCount <= 4) return { fontSize: 16, strokeWidth: 2, maxChars: 12 };
    if (projectCount <= 8) return { fontSize: 14, strokeWidth: 2, maxChars: 10 };
    if (projectCount <= 15) return { fontSize: 12, strokeWidth: 2, maxChars: 8 };
    return { fontSize: 10, strokeWidth: 1, maxChars: 6 };
  }

  if (width >= 480) {
    if (projectCount <= 4) return { fontSize: 15, strokeWidth: 2, maxChars: 11 };
    if (projectCount <= 8) return { fontSize: 13, strokeWidth: 2, maxChars: 9 };
    if (projectCount <= 15) return { fontSize: 11, strokeWidth: 1, maxChars: 7 };
    return { fontSize: 9, strokeWidth: 1, maxChars: 5 };
  }

  if (width >= 360) {
    if (projectCount <= 4) return { fontSize: 14, strokeWidth: 2, maxChars: 10 };
    if (projectCount <= 8) return { fontSize: 12, strokeWidth: 2, maxChars: 8 };
    if (projectCount <= 15) return { fontSize: 10, strokeWidth: 1, maxChars: 6 };
    return { fontSize: 8, strokeWidth: 1, maxChars: 4 };
  }

  if (projectCount <= 4) return { fontSize: 12, strokeWidth: 1, maxChars: 8 };
  if (projectCount <= 8) return { fontSize: 10, strokeWidth: 1, maxChars: 6 };
  if (projectCount <= 15) return { fontSize: 8, strokeWidth: 1, maxChars: 4 };
  return { fontSize: 7, strokeWidth: 1, maxChars: 3 };
}
