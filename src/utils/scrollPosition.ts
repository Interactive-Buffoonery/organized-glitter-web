export const getPageScrollY = (): number => {
  if (typeof window === 'undefined') return 0;

  return window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
};

export const restorePageScrollY = (top: number, behavior: ScrollBehavior = 'auto'): void => {
  if (typeof window === 'undefined') return;

  window.scrollTo({ top, behavior });
};
