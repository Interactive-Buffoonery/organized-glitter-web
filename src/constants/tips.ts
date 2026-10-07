export interface TipLink {
  amount: number;
  href: string;
}

function paymentLink(value: string | undefined): string | null {
  try {
    const url = new URL(value?.trim() ?? '');
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

export function getTipLinks(): { fixed: TipLink[]; custom: string | null } {
  const env = import.meta.env;
  const fixed = [
    { amount: 2, href: paymentLink(env.VITE_STRIPE_TIP_2_URL) },
    { amount: 3, href: paymentLink(env.VITE_STRIPE_TIP_3_URL) },
    { amount: 5, href: paymentLink(env.VITE_STRIPE_TIP_5_URL) },
    { amount: 10, href: paymentLink(env.VITE_STRIPE_TIP_10_URL) },
  ].filter((tip): tip is TipLink => tip.href !== null);
  return { fixed, custom: paymentLink(env.VITE_STRIPE_TIP_CUSTOM_URL) };
}

export function tipsEnabled(): boolean {
  const { fixed, custom } = getTipLinks();
  return fixed.length > 0 || custom !== null;
}
