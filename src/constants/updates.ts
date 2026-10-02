export const UPDATES_URL =
  import.meta.env.VITE_BLOG_ENABLED === 'true'
    ? '/updates/'
    : 'https://updates.organizedglitter.app/';
export const SUBSCRIBE_TO_UPDATES_URL = `${UPDATES_URL}#subscribe`;
