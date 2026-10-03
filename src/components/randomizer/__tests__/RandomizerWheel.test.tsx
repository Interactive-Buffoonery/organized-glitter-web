import '@testing-library/jest-dom/vitest';
import { within } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, screen, fireEvent, act } from '@/test-utils';
import { RandomizerWheel } from '../RandomizerWheel';
import {
  getContrastRatio,
  getWheelTextColor,
  WHEEL_COLORS,
  WHEEL_DARK_LABEL,
  WHEEL_LIGHT_LABEL,
} from '../randomizerWheelColors';

const announceSpinStartMock = vi.fn();
const announceSpinResultMock = vi.fn();
const announceKeyboardInstructionsMock = vi.fn();
const announceTouchInstructionsMock = vi.fn();
const announceMock = vi.fn();
const removeFocusMock = vi.fn();
let mobileDeviceMock = {
  width: 1024,
  height: 768,
  isMobile: false,
  isTouchDevice: false,
};

vi.mock('@/hooks/useAccessibilityAnnouncements', () => ({
  useAccessibilityAnnouncements: () => ({
    announce: announceMock,
    announceSpinStart: announceSpinStartMock,
    announceSpinResult: announceSpinResultMock,
    announceKeyboardInstructions: announceKeyboardInstructionsMock,
    announceTouchInstructions: announceTouchInstructionsMock,
    liveRegionRef: { current: null },
    statusRef: { current: null },
  }),
  useFocusManagement: () => ({
    removeFocus: removeFocusMock,
  }),
}));

vi.mock('@/hooks/use-mobile', () => ({
  useMobileDevice: () => mobileDeviceMock,
}));

vi.mock('@/components/ui/ripple-effect', () => ({
  RippleEffect: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
}));

describe('RandomizerWheel', () => {
  const targets = [
    {
      id: 'project-111111',
      mode: 'diamond' as const,
      targetType: 'diamond_project' as const,
      title: 'Alpha Project',
      subtitle: 'Diamond painting',
      href: '/projects/project-111111',
      statusLabel: 'In progress',
      selectedMetadata: {},
    },
    {
      id: 'project-222222',
      mode: 'diamond' as const,
      targetType: 'diamond_project' as const,
      title: 'Beta Project',
      subtitle: 'Diamond painting',
      href: '/projects/project-222222',
      statusLabel: 'In progress',
      selectedMetadata: {},
    },
    {
      id: 'project-333333',
      mode: 'diamond' as const,
      targetType: 'diamond_project' as const,
      title: 'Gamma Project',
      subtitle: 'Diamond painting',
      href: '/projects/project-333333',
      statusLabel: 'In progress',
      selectedMetadata: {},
    },
  ];

  const denseTargets = Array.from({ length: 12 }, (_, index) => ({
    id: `project-dense-${index + 1}`,
    mode: 'diamond' as const,
    targetType: 'diamond_project' as const,
    title: `Long Readable Project ${index + 1}`,
    subtitle: 'Diamond painting',
    href: `/projects/project-dense-${index + 1}`,
    statusLabel: index % 2 === 0 ? 'In progress' : 'Not started',
    selectedMetadata: {},
  }));

  beforeEach(() => {
    vi.clearAllMocks();
    mobileDeviceMock = {
      width: 1024,
      height: 768,
      isMobile: false,
      isTouchDevice: false,
    };
    vi.useFakeTimers();
    vi.spyOn(window, 'matchMedia').mockImplementation(query => ({
      matches: query === '(prefers-reduced-motion: reduce)' ? false : false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  });

  it.each(['click', 'Enter', ' '] as const)(
    'activates the wheel itself with %s exactly once',
    activation => {
      const onSpinComplete = vi.fn();
      renderWithProviders(<RandomizerWheel targets={targets} onSpinComplete={onSpinComplete} />);
      const wheel = screen.getByRole('button', { name: /randomizer wheel with 3 items/i });
      if (activation === 'click') fireEvent.click(wheel);
      else fireEvent.keyDown(wheel, { key: activation });
      fireEvent.click(wheel);
      const event = new Event('transitionend', { bubbles: true });
      Object.defineProperty(event, 'propertyName', { value: 'transform' });
      act(() => screen.getByTestId('randomizer-wheel-disc').dispatchEvent(event));
      expect(onSpinComplete).toHaveBeenCalledTimes(1);
    }
  );

  it('cancels a pending spin when selection changes and permits a fresh spin', () => {
    const onSpinComplete = vi.fn();
    const { rerender } = renderWithProviders(
      <RandomizerWheel targets={targets} onSpinComplete={onSpinComplete} />
    );
    fireEvent.keyDown(screen.getByRole('button', { name: /randomizer wheel with 3 items/i }), {
      key: 'Enter',
    });
    const oldDisc = screen.getByTestId('randomizer-wheel-disc');
    rerender(<RandomizerWheel targets={targets.slice(1)} onSpinComplete={onSpinComplete} />);
    const event = new Event('transitionend', { bubbles: true });
    Object.defineProperty(event, 'propertyName', { value: 'transform' });
    act(() => oldDisc.dispatchEvent(event));
    expect(onSpinComplete).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole('button', { name: /randomizer wheel with 2 items/i }), {
      key: 'Enter',
    });
    act(() => screen.getByTestId('randomizer-wheel-disc').dispatchEvent(event));
    expect(onSpinComplete).toHaveBeenCalledTimes(1);
  });

  it('ignores click and keyboard activation while disabled', () => {
    renderWithProviders(<RandomizerWheel targets={targets} disabled onSpinComplete={vi.fn()} />);
    const wheel = screen.getByRole('button', { name: /randomizer wheel with 3 items/i });
    fireEvent.click(wheel);
    fireEvent.keyDown(wheel, { key: 'Enter' });
    expect(announceSpinStartMock).not.toHaveBeenCalled();
  });

  it('renders kit names directly on small wheels', () => {
    renderWithProviders(<RandomizerWheel targets={targets} onSpinComplete={vi.fn()} />);

    const wheel = screen.getByRole('button', { name: /randomizer wheel with 3 items/i });
    expect(within(wheel).getAllByText('Alpha', { exact: false })).not.toHaveLength(0);
    expect(within(wheel).queryByText('1')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /open wheel key/i })).not.toBeInTheDocument();
  });

  it('keeps small wheels readable with an explicit numbered key', () => {
    renderWithProviders(
      <RandomizerWheel targets={targets} onSpinComplete={vi.fn()} labelMode="number" />
    );
    const wheel = screen.getByRole('button', { name: /randomizer wheel with 3 items/i });
    expect(within(wheel).getAllByText('1')).not.toHaveLength(0);
    expect(screen.getByRole('button', { name: /open wheel key/i })).toBeInTheDocument();
  });

  it('draws a complete circle when only one target is selected', () => {
    renderWithProviders(
      <RandomizerWheel targets={targets.slice(0, 1)} onSpinComplete={vi.fn()} labelMode="number" />
    );
    const disc = screen.getByTestId('randomizer-wheel-disc');
    const segment = disc.querySelector('path');
    expect(segment?.getAttribute('d')?.match(/ A /g)).toHaveLength(2);
    expect(segment).not.toHaveAttribute('fill', 'none');
  });

  it('renders wedge numbers and a key trigger for dense desktop wheels', () => {
    renderWithProviders(<RandomizerWheel targets={denseTargets} onSpinComplete={vi.fn()} />);

    const wheel = screen.getByRole('button', { name: /randomizer wheel with 12 items/i });
    expect(within(wheel).getAllByText('1')).not.toHaveLength(0);
    expect(within(wheel).getAllByText('12')).not.toHaveLength(0);
    expect(within(wheel).queryByText(/long readable project/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /open wheel key/i })).toBeInTheDocument();
  });

  it('opens the desktop key with numbered full-name mappings', () => {
    renderWithProviders(<RandomizerWheel targets={denseTargets} onSpinComplete={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /open wheel key/i }));

    const key = screen.getByText('Wheel key').closest('div');
    expect(screen.getByText('Long Readable Project 1')).toBeInTheDocument();
    expect(screen.getByText('Long Readable Project 12')).toBeInTheDocument();
    expect(key).toBeInTheDocument();
  });

  it('uses drawer behavior for dense mobile wheel keys', () => {
    mobileDeviceMock = {
      width: 390,
      height: 844,
      isMobile: true,
      isTouchDevice: true,
    };

    renderWithProviders(
      <RandomizerWheel targets={denseTargets.slice(0, 7)} onSpinComplete={vi.fn()} />
    );

    fireEvent.click(screen.getByRole('button', { name: /open wheel key/i }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Wheel key')).toBeInTheDocument();
    expect(screen.getByText('Long Readable Project 7')).toBeInTheDocument();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('does not fire spin completion after unmount', async () => {
    const onSpinComplete = vi.fn();
    const { unmount } = renderWithProviders(
      <RandomizerWheel targets={targets} onSpinComplete={onSpinComplete} />
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: /spin the wheel to randomly select from 3 items/i,
      })
    );

    unmount();

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(onSpinComplete).not.toHaveBeenCalled();
    expect(announceSpinResultMock).not.toHaveBeenCalled();
  });

  it('uses stable vibrant segment colors when selections change', () => {
    const { container, rerender } = renderWithProviders(
      <RandomizerWheel targets={targets} onSpinComplete={vi.fn()} />
    );

    const firstRenderSegments = Array.from(
      container.querySelectorAll<SVGPathElement>('path[opacity="0.9"]')
    );
    const betaColor = firstRenderSegments[1].getAttribute('fill');

    expect(betaColor).toMatch(/^#[0-9a-f]{6}$/i);
    expect(betaColor).not.toMatch(/^hsl/);

    rerender(<RandomizerWheel targets={targets.slice(1)} onSpinComplete={vi.fn()} />);

    const secondRenderSegments = Array.from(
      container.querySelectorAll<SVGPathElement>('path[opacity="0.9"]')
    );
    expect(secondRenderSegments[0].getAttribute('fill')).toBe(betaColor);
  });

  it('uses accessible text colors for every wheel segment color', () => {
    WHEEL_COLORS.forEach(color => {
      const textColor = getWheelTextColor(color);

      expect(getContrastRatio(textColor, color)).toBeGreaterThanOrEqual(4.5);
    });

    expect(getWheelTextColor('#7c4fb2')).toBe(WHEEL_LIGHT_LABEL);
    expect(getWheelTextColor('#f4c2d7')).toBe(WHEEL_DARK_LABEL);
    expect(getWheelTextColor('#f6d365')).toBe(WHEEL_DARK_LABEL);
  });

  it('completes a spin with the selected target', () => {
    const onSpinComplete = vi.fn();
    vi.spyOn(Math, 'random').mockReturnValue(0);

    renderWithProviders(<RandomizerWheel targets={targets} onSpinComplete={onSpinComplete} />);

    fireEvent.click(
      screen.getByRole('button', {
        name: /spin the wheel to randomly select from 3 items/i,
      })
    );

    expect(onSpinComplete).not.toHaveBeenCalled();

    act(() => {
      const transitionEnd = new Event('transitionend', { bubbles: true });
      Object.defineProperty(transitionEnd, 'propertyName', { value: 'transform' });
      screen.getByTestId('randomizer-wheel-disc').dispatchEvent(transitionEnd);
    });

    expect(onSpinComplete).toHaveBeenCalledWith(targets[2]);
    expect(announceSpinResultMock).toHaveBeenCalledWith('Gamma Project', 'Diamond painting');
  });
});
