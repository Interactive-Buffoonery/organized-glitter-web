import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { OverviewActivityList } from '../../../src/components/overview/OverviewActivityList';
import type { OverviewFeedItem } from '../../../src/services/pocketbase/overview.service';
import '../../../src/index.css';
import '@fontsource-variable/karla/index.css';

const items: OverviewFeedItem[] = [
  'Page 1 / NASA: The Universe in Color and Beyond',
  'Page 1 / Smithsonian: A Very Long Natural History Coloring Book',
  'Summer Garden Blooms',
].map((title, index) => ({
  id: String(index),
  key: String(index),
  kind: 'diamond-project',
  craft: 'diamond',
  title,
  subtitle: 'Layout test project',
  thumbnailUrl: null,
  statusLabel: 'In progress',
  statusTone: 'progress',
  activityLabel: 'Updated today',
  href: `#project-${index}`,
  sortAt: '',
  sortTitle: title,
}));

createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <main className="container mx-auto px-4 py-8">
      <h1>Overview layout fixture</h1>
      <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-14">
        <section aria-label="In progress">
          <OverviewActivityList
            items={items}
            activeCraftFilter="all"
            isLoading={false}
            isError={false}
            onRetry={() => {}}
          />
        </section>
        <aside>Overview sidebar</aside>
      </div>
    </main>
  </BrowserRouter>
);
