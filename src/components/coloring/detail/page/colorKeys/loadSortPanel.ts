// Its own module so tests can fail the load without depending on the module cache.
export const loadSortPanel = () => import('./ColorKeySortPanel');
