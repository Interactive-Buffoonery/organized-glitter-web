const SENSITIVE_AUTH_PATHS = [
  /^\/auth\/confirm-password-reset\/[^/]+$/,
  /^\/auth\/verify-email\/[^/]+$/,
  /^\/auth\/confirm-email-change\/[^/]+$/,
];

export function sanitizeSensitivePath(pathname: string): string {
  const cleanPath = pathname.split(/[?#]/, 1)[0] || '/';

  for (const pattern of SENSITIVE_AUTH_PATHS) {
    if (pattern.test(cleanPath)) {
      return cleanPath.replace(/\/[^/]+$/, '/[redacted]');
    }
  }

  return cleanPath;
}
