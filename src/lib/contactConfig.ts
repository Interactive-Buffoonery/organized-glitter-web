const trim = (value: string | undefined) => (value ?? '').trim();

export function getContactEmail(): string {
  return trim(import.meta.env.VITE_CONTACT_EMAIL);
}

export function getSupportUrl(): string {
  return trim(import.meta.env.VITE_SUPPORT_URL);
}

export function formatLimitSupportMessage(maxItems: number, recordLabel: string): string {
  const limit = maxItems.toLocaleString('en-US');
  const contactEmail = getContactEmail();
  if (contactEmail) {
    return `You've hit the current limit of ${limit} ${recordLabel}. Contact your administrator at ${contactEmail} to request a higher limit.`;
  }
  return `You've hit the current limit of ${limit} ${recordLabel}. Contact your administrator to request a higher limit.`;
}

export function getSupportMailto(subject?: string): string | null {
  const contactEmail = getContactEmail();
  if (!contactEmail) return null;
  const query = subject ? `?subject=${encodeURIComponent(subject)}` : '';
  return `mailto:${contactEmail}${query}`;
}

export function getMailtoFallbackMessage(): string {
  const contactEmail = getContactEmail();
  if (contactEmail) {
    return `We couldn't send your feedback here. If your email app opened, send the prepared message from there. If it didn't open, email us directly at ${contactEmail}.`;
  }
  return "We couldn't send your feedback here. If your email app opened, send the prepared message from there. Otherwise contact your administrator through your usual support channel.";
}
