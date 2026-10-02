export const WHEEL_COLORS = [
  '#b99ae8',
  '#fff4df',
  '#8054b3',
  '#e4d5f5',
  '#f5ead8',
  '#a47bd4',
  '#d1b8ee',
  '#fff9ee',
  '#69428f',
  '#ece2f7',
  '#c4a5e5',
  '#f0e4d2',
];

export const WHEEL_DARK_LABEL = '#211827';
export const WHEEL_LIGHT_LABEL = '#ffffff';

function getRelativeLuminance(hexColor: string): number {
  const color = hexColor.replace('#', '');
  const red = parseInt(color.slice(0, 2), 16) / 255;
  const green = parseInt(color.slice(2, 4), 16) / 255;
  const blue = parseInt(color.slice(4, 6), 16) / 255;
  const toLinear = (channel: number) =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;

  return 0.2126 * toLinear(red) + 0.7152 * toLinear(green) + 0.0722 * toLinear(blue);
}

export function getContrastRatio(foregroundHex: string, backgroundHex: string): number {
  const foregroundLuminance = getRelativeLuminance(foregroundHex);
  const backgroundLuminance = getRelativeLuminance(backgroundHex);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);

  return (lighter + 0.05) / (darker + 0.05);
}

export function getWheelTextColor(backgroundHex: string): string {
  return getContrastRatio(WHEEL_DARK_LABEL, backgroundHex) >= 4.5
    ? WHEEL_DARK_LABEL
    : WHEEL_LIGHT_LABEL;
}

export function getWheelTextOutlineColor(textColor: string): string {
  return textColor === WHEEL_DARK_LABEL ? WHEEL_LIGHT_LABEL : WHEEL_DARK_LABEL;
}

export function getWheelTextOutlineOpacity(textColor: string): number {
  return textColor === WHEEL_DARK_LABEL ? 0.45 : 1;
}
