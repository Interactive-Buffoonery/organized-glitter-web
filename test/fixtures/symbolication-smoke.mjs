// Test-only source. Never import this fixture into the app or call a telemetry SDK.
export function createSymbolicationSmokeError({ environment }) {
  if (environment !== 'local' || Boolean(process.env.CI)) {
    throw new Error('Smoke fixture requires local manual execution');
  }
  return new Error('OG offline symbolication smoke');
}
