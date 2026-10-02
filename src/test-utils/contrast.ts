import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const stylesheet = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');

type Theme = 'light' | 'dark';
type ColorToken = 'foreground' | 'card' | 'background' | 'link' | 'muted';

function hsl(hue: number, saturation: number, lightness: number): number[] {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const secondary = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const offset = lightness - chroma / 2;
  const segment = Math.floor(hue / 60);
  const channels = [
    [chroma, secondary, 0],
    [secondary, chroma, 0],
    [0, chroma, secondary],
    [0, secondary, chroma],
    [secondary, 0, chroma],
    [chroma, 0, secondary],
  ][segment];
  return channels.map(channel => channel + offset);
}

export function themeColorFromCss(css: string, theme: Theme, token: ColorToken): number[] {
  const styles = css.match(new RegExp(`\\[data-theme=['"]${theme}['"]\\]\\s*\\{([^}]*)\\}`))?.[1];
  if (!styles) throw new Error(`Missing ${theme} theme selector`);
  const match = styles.match(new RegExp(`--${token}:\\s*([\\d.]+)\\s+([\\d.]+)%\\s+([\\d.]+)%`));
  if (!match) throw new Error(`Missing ${theme} --${token}`);
  return hsl(Number(match[1]), Number(match[2]) / 100, Number(match[3]) / 100);
}

export function themeColor(theme: Theme, token: ColorToken): number[] {
  return themeColorFromCss(stylesheet, theme, token);
}

function luminance(channels: number[]): number {
  return channels
    .map(channel => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
}

export function contrast(first: number[], second: number[]): number {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

export function blend(foreground: number[], background: number[], opacity: number): number[] {
  return foreground.map((channel, index) => channel * opacity + background[index] * (1 - opacity));
}
