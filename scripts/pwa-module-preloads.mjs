export function pwaModulePreloads(filename, dependencies, { hostType }) {
  if (hostType === 'js' && /(?:^|\/)virtual_pwa-register-[\w-]+\.js$/.test(filename)) {
    // Native import reuses evaluated vendors; preload hints can refetch them.
    return dependencies.filter(file => file.endsWith('.css'));
  }
  return dependencies;
}
