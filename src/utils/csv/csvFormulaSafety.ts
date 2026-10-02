const FORMULA_INJECTION_TRIGGERS = new Set([
  '=',
  '+',
  '-',
  '@',
  '\t',
  '\r',
  '\n',
  '＝',
  '＋',
  '－',
  '＠',
]);

function startsWithCsvFormulaTrigger(value: string): boolean {
  return FORMULA_INJECTION_TRIGGERS.has(value.charAt(0));
}

export function neutralizeCsvFormulaField(value: string): string {
  return value.startsWith("'") || startsWithCsvFormulaTrigger(value) ? `'${value}` : value;
}

export function restoreCsvFormulaTextField(value: string): string {
  if (value.startsWith("''")) {
    return value.slice(1);
  }

  return value.startsWith("'") && FORMULA_INJECTION_TRIGGERS.has(value.charAt(1))
    ? value.slice(1)
    : value;
}
