export type RandomizerWheelLabelMode = 'name' | 'number';

export interface WheelLabelTextProps {
  fontSize: number;
  strokeWidth: number;
  maxChars: number;
}

const DESKTOP_DENSE_THRESHOLD = 8;
const MOBILE_DENSE_THRESHOLD = 6;

export function getRandomizerWheelLabelMode(
  itemCount: number,
  isMobile: boolean
): RandomizerWheelLabelMode {
  const denseThreshold = isMobile ? MOBILE_DENSE_THRESHOLD : DESKTOP_DENSE_THRESHOLD;

  return itemCount > denseThreshold ? 'number' : 'name';
}

export function getUprightLabelRotation(textAngle: number): number {
  const normalizedAngle = ((textAngle % 360) + 360) % 360;

  if (normalizedAngle > 90 && normalizedAngle < 270) {
    return textAngle + 180;
  }

  return textAngle;
}

export function formatWedgeNumber(index: number): string {
  return String(index + 1);
}

export function splitRandomizerWheelLabel(
  label: string,
  { maxChars }: Pick<WheelLabelTextProps, 'maxChars'>
): string[] {
  const normalizedLabel = label.trim().replace(/\s+/g, ' ');

  if (normalizedLabel.length <= maxChars) {
    return [normalizedLabel];
  }

  const lineMaxChars = Math.max(4, Math.floor(maxChars / 2));
  const words = normalizedLabel.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const nextLine = currentLine ? `${currentLine} ${word}` : word;

    if (nextLine.length <= lineMaxChars) {
      currentLine = nextLine;
      continue;
    }

    if (currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      lines.push(word);
      currentLine = '';
    }

    if (lines.length === 2) {
      break;
    }
  }

  if (lines.length < 2 && currentLine) {
    lines.push(currentLine);
  }

  const joinedLines = lines.join(' ');
  if (joinedLines.length < normalizedLabel.length) {
    const lastLineIndex = Math.max(0, lines.length - 1);
    lines[lastLineIndex] = truncateWheelLabelLine(lines[lastLineIndex], lineMaxChars);
  }

  return lines.slice(0, 2).map(line => truncateWheelLabelLine(line, lineMaxChars));
}

function truncateWheelLabelLine(line: string, maxChars: number): string {
  if (line.length <= maxChars) {
    return line;
  }

  return `${line.slice(0, Math.max(1, maxChars - 3))}...`;
}
