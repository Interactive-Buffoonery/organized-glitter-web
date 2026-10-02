interface ErrorLogger {
  error: (...args: unknown[]) => void;
}

export function runPostWriteEffect(logger: ErrorLogger, label: string, effect: () => void): void {
  try {
    effect();
  } catch (error) {
    logger.error(label, error);
  }
}
