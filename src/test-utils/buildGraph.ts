export const BUILD_GRAPH_ID = 'app-bootstrap-resources';

export const DEFAULT_BUILD_GRAPH = {
  '/assets/main-AbCd1234.js': [],
  '/assets/ProjectDetail-LongerBuildHash123.js': [],
};

export function installBuildGraph(graphs: Record<string, unknown> = DEFAULT_BUILD_GRAPH) {
  const manifest = document.createElement('script');
  manifest.id = BUILD_GRAPH_ID;
  manifest.type = 'application/json';
  manifest.textContent = JSON.stringify({ graphs });
  document.head.appendChild(manifest);
  return manifest;
}

export function removeBuildGraph() {
  document.getElementById(BUILD_GRAPH_ID)?.remove();
}
