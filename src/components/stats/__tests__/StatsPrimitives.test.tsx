import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, vi } from 'vitest';
import { axe } from 'vitest-axe';
import {
  LeadCompletionChart,
  MostRepresentedList,
  StatsScopeControl,
} from '@/components/stats/StatsPrimitives';

function mockResizeObserverWidth(width: number) {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      private readonly callback: ResizeObserverCallback;

      constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
      }

      observe() {
        this.callback(
          [{ contentRect: { width } } as ResizeObserverEntry],
          this as unknown as ResizeObserver
        );
      }

      disconnect() {}
      unobserve() {}
    }
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('LeadCompletionChart', () => {
  const points = [
    {
      key: 'jan',
      label: 'January',
      count: 2,
      comparisonDelta: 1,
      averageDays: 4,
      cumulativeCount: 2,
    },
    {
      key: 'feb',
      label: 'February',
      count: 3,
      comparisonDelta: 0,
      averageDays: 5,
      cumulativeCount: 5,
    },
  ];

  it('exposes interactive chart points without nesting them in an image', async () => {
    const { container } = render(
      <LeadCompletionChart
        title="Diamond paintings completion chart"
        summary="Five diamond paintings completed this year."
        points={points}
        scope={{ kind: 'year', year: 2026 }}
        emptyDescription="Complete a project to see chart data."
      />
    );

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(
      screen.getByRole('group', { name: /Diamond paintings completion chart/ })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /January: 2 completed/ })).toBeInTheDocument();
    await expect(
      await axe(container, { rules: { 'color-contrast': { enabled: false } } })
    ).toHaveNoViolations();
  });

  it('uses completion labels as row headers in the accessible data table', () => {
    render(
      <LeadCompletionChart
        title="Diamond paintings completion chart"
        summary="Five diamond paintings completed this year."
        points={points}
        scope={{ kind: 'year', year: 2026 }}
        emptyDescription="Complete a project to see chart data."
      />
    );

    const table = screen.getByRole('table', { name: 'Diamond paintings completion chart' });
    const rowHeaders = within(table).getAllByRole('rowheader');

    expect(rowHeaders).toHaveLength(2);
    expect(rowHeaders[0]).toHaveTextContent('January');
    expect(rowHeaders[0]).toHaveAttribute('scope', 'row');
    expect(rowHeaders[1]).toHaveTextContent('February');
    expect(rowHeaders[1]).toHaveAttribute('scope', 'row');
  });

  it('keeps focus visible when Escape dismisses a keyboard tooltip', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <LeadCompletionChart
        title="Diamond paintings completion chart"
        summary="Five diamond paintings completed this year."
        points={points}
        scope={{ kind: 'year', year: 2026 }}
        emptyDescription="Complete a project to see chart data."
      />
    );

    const january = screen.getByRole('button', { name: /January: 2 completed/ });
    act(() => january.focus());
    await user.keyboard('{Enter}');

    expect(january).toHaveFocus();
    expect(january).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('tooltip')).toHaveTextContent('January');
    expect(container.querySelector('[data-chart-focus-ring]')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(january).toHaveFocus();
    expect(january).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    expect(container.querySelector('[data-chart-focus-ring]')).toBeInTheDocument();

    await user.keyboard('{Enter}');
    expect(screen.getByRole('tooltip')).toHaveTextContent('January');

    await user.keyboard('{ArrowRight}');
    const february = screen.getByRole('button', { name: /February: 3 completed/ });
    expect(february).toHaveFocus();
    expect(january).toHaveAttribute('aria-expanded', 'false');
    expect(february).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('tooltip')).toHaveTextContent('February');

    await user.tab();
    expect(february).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    expect(container.querySelector('[data-chart-focus-ring]')).not.toBeInTheDocument();
  });

  it('activates a point with a pointer and dismisses it outside the chart', async () => {
    const user = userEvent.setup();
    render(
      <>
        <LeadCompletionChart
          title="Diamond paintings completion chart"
          summary="Five diamond paintings completed this year."
          points={points}
          scope={{ kind: 'year', year: 2026 }}
          emptyDescription="Complete a project to see chart data."
        />
        <button type="button">Outside chart</button>
      </>
    );

    const january = screen.getByRole('button', { name: /January: 2 completed/ });
    await user.click(january);
    expect(january).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('tooltip')).toHaveTextContent('January');

    await user.click(screen.getByRole('button', { name: 'Outside chart' }));
    expect(january).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('keeps 44px edge targets inside the chart without moving the visual points', () => {
    const { container } = render(
      <LeadCompletionChart
        title="Diamond paintings completion chart"
        summary="Five diamond paintings completed this year."
        points={points}
        scope={{ kind: 'year', year: 2026 }}
        emptyDescription="Complete a project to see chart data."
      />
    );

    const januaryTarget = screen.getByRole('button', { name: /January: 2 completed/ });
    const februaryTarget = screen.getByRole('button', { name: /February: 3 completed/ });
    const visualPoints = container.querySelectorAll('[data-chart-point-dot]');

    expect(januaryTarget).toHaveAttribute('r', '22');
    expect(januaryTarget).toHaveAttribute('cx', '22');
    expect(februaryTarget).toHaveAttribute('r', '22');
    expect(februaryTarget).toHaveAttribute('cx', '698');
    expect(visualPoints[0]).toHaveAttribute('r', '3.5');
    expect(visualPoints[0]).toHaveAttribute('cx', '0');
    expect(visualPoints[1]).toHaveAttribute('r', '3.5');
    expect(visualPoints[1]).toHaveAttribute('cx', '720');
  });

  it('measures a 320px chart and edge-aligns both tooltips inside its bounds', async () => {
    const user = userEvent.setup();
    mockResizeObserverWidth(320);
    render(
      <div style={{ width: 320 }}>
        <LeadCompletionChart
          title="Diamond paintings completion chart"
          summary="Five diamond paintings completed this year."
          points={points}
          scope={{ kind: 'year', year: 2026 }}
          emptyDescription="Complete a project to see chart data."
        />
      </div>
    );

    await waitFor(() =>
      expect(
        screen.getByRole('group', { name: /Diamond paintings completion chart/ })
      ).toHaveAttribute('viewBox', '0 0 320 260')
    );

    await user.click(screen.getByRole('button', { name: /January: 2 completed/ }));
    expect(screen.getByRole('tooltip')).toHaveStyle({
      left: '0%',
      transform: 'translate(0%, calc(-100% - 12px))',
    });

    await user.click(screen.getByRole('button', { name: /February: 3 completed/ }));
    expect(screen.getByRole('tooltip')).toHaveStyle({
      left: '100%',
      transform: 'translate(-100%, calc(-100% - 12px))',
    });
  });
});

describe('MostRepresentedList', () => {
  it('uses ranks as row headers in the accessible data table', () => {
    render(
      <MostRepresentedList
        title="Most represented"
        groups={[
          {
            key: 'companies',
            label: 'Companies',
            group: {
              total: 5,
              items: [{ id: 'diamond-art-club', label: 'Diamond Art Club', count: 3 }],
              otherCount: 2,
            },
          },
        ]}
        onRetry={vi.fn()}
      />
    );

    const table = screen.getByRole('table', { name: 'Most represented Companies' });
    const rowHeaders = within(table).getAllByRole('rowheader');

    expect(rowHeaders).toHaveLength(2);
    expect(rowHeaders[0]).toHaveTextContent('1');
    expect(rowHeaders[0]).toHaveAttribute('scope', 'row');
    expect(rowHeaders[1]).toHaveTextContent('2');
    expect(rowHeaders[1]).toHaveAttribute('scope', 'row');
    expect(within(table).getByRole('cell', { name: 'Diamond Art Club' })).toBeInTheDocument();
    expect(within(table).getByRole('cell', { name: 'Other' })).toBeInTheDocument();
  });
});

describe('StatsScopeControl', () => {
  it('keeps full craft labels in flexible wrapping controls', () => {
    render(<StatsScopeControl value="all" onValueChange={vi.fn()} canUseDiamond canUseColoring />);
    const group = screen.getByRole('group', { name: 'Craft scope' });
    expect(group).toHaveClass('flex-wrap');
    const diamond = within(group).getByRole('button', { name: 'Diamond paintings' });
    expect(diamond).toHaveClass('flex-auto', 'whitespace-normal');
    expect(diamond).not.toHaveClass('truncate');
  });
});
