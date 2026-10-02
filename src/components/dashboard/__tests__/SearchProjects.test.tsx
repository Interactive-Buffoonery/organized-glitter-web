import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import SearchProjects from '../SearchProjects';

describe('SearchProjects', () => {
  afterEach(() => vi.useRealTimers());

  it('keeps a one-character draft local until the search is usable', () => {
    vi.useFakeTimers();
    const onSearchChange = vi.fn();
    const { rerender } = render(
      <SearchProjects searchTerm="" resetVersion={0} onSearchChange={onSearchChange} />
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'Search project titles' }), {
      target: { value: 'a' },
    });
    act(() => vi.advanceTimersByTime(400));
    expect(onSearchChange).not.toHaveBeenCalledWith('a');
    expect(
      screen.getByRole('textbox', { name: 'Search project titles' })
    ).toHaveAccessibleDescription();

    fireEvent.change(screen.getByRole('textbox', { name: 'Search project titles' }), {
      target: { value: 'ab' },
    });
    act(() => vi.advanceTimersByTime(400));
    expect(onSearchChange).toHaveBeenCalledWith('ab');
    rerender(<SearchProjects searchTerm="ab" resetVersion={0} onSearchChange={onSearchChange} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Search project titles' }), {
      target: { value: 'a' },
    });
    act(() => vi.advanceTimersByTime(400));
    expect(onSearchChange).toHaveBeenCalledWith('');
    rerender(<SearchProjects searchTerm="" resetVersion={0} onSearchChange={onSearchChange} />);
    expect(screen.getByRole('textbox', { name: 'Search project titles' })).toHaveValue('a');

    fireEvent.change(screen.getByRole('textbox', { name: 'Search project titles' }), {
      target: { value: '' },
    });
    act(() => vi.advanceTimersByTime(400));
    expect(onSearchChange).toHaveBeenCalledWith('');
  });

  it('does not recommit a pending search after an external reset', () => {
    vi.useFakeTimers();
    const onSearchChange = vi.fn();
    const { rerender } = render(
      <SearchProjects searchTerm="" resetVersion={0} onSearchChange={onSearchChange} />
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'Search project titles' }), {
      target: { value: 'moon' },
    });
    rerender(<SearchProjects searchTerm="" resetVersion={1} onSearchChange={onSearchChange} />);
    act(() => vi.advanceTimersByTime(400));

    expect(screen.getByRole('textbox', { name: 'Search project titles' })).toHaveValue('');
    expect(onSearchChange).not.toHaveBeenCalled();
  });
});
