const MARKDOWN_BLOCK_MARKER_PATTERN = /(^|\n)\s{0,3}(#{1,6}\s|>\s|[-*+]\s|\d+\.\s|```)/;

export function toEditorInitial(raw: string): string {
  if (!raw) {
    return raw;
  }

  const normalized = raw.replace(/\r\n?/g, '\n');

  if (MARKDOWN_BLOCK_MARKER_PATTERN.test(normalized)) {
    return normalized;
  }

  return normalized
    .split(/\n{2,}/)
    .map(paragraph => paragraph.replace(/(?<! {2})\n/g, '  \n'))
    .join('\n\n');
}
