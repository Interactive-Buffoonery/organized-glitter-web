import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SymbolPicker } from '../SymbolPicker';

const renderPicker = (props: Partial<Parameters<typeof SymbolPicker>[0]> = {}) => {
  const onPick = vi.fn();
  render(<SymbolPicker open onOpenChange={() => {}} onPick={onPick} userId="owner" {...props} />);
  return { onPick };
};

describe('SymbolPicker', () => {
  beforeEach(() => window.localStorage.clear());

  it('finds symbols by lookalike keyword', async () => {
    const user = userEvent.setup();
    const { onPick } = renderPicker();
    await user.type(screen.getByRole('searchbox', { name: 'Search symbols' }), 'trident');
    const listbox = screen.getByRole('listbox', { name: 'Symbols' });
    await user.click(within(listbox).getByRole('option', { name: 'Psi' }));
    expect(onPick).toHaveBeenCalledWith('u:03C8');
  });

  it('shows groups in catalog order', () => {
    renderPicker();
    const groups = within(screen.getByRole('listbox', { name: 'Symbols' }))
      .getAllByRole('group')
      .map(group => group.getAttribute('aria-label'));
    expect(groups.slice(0, 4)).toEqual(['Numbers', 'Lowercase', 'Uppercase', 'Greek']);
    expect(groups.at(-1)).toBe('Shapes');
  });

  it('moves through symbols with arrow keys and picks with Enter', async () => {
    const user = userEvent.setup();
    const { onPick } = renderPicker();
    const search = screen.getByRole('searchbox', { name: 'Search symbols' });
    await user.type(search, 'circle');
    await user.keyboard('{ArrowDown}');
    const listbox = screen.getByRole('listbox', { name: 'Symbols' });
    expect(listbox).toHaveFocus();
    const options = within(listbox).getAllByRole('option');
    expect(listbox).toHaveAttribute('aria-activedescendant', options[0].id);
    await user.keyboard('{ArrowRight}');
    expect(listbox).toHaveAttribute('aria-activedescendant', options[1].id);
    expect(options[1]).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{End}');
    expect(listbox).toHaveAttribute('aria-activedescendant', options.at(-1)!.id);
    await user.keyboard('{Home}{ArrowRight}{Enter}');
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0][0]).toBe(options[1].getAttribute('data-symbol'));
  });

  it('moves down a row with ArrowDown inside a group', async () => {
    const user = userEvent.setup();
    renderPicker();
    const listbox = screen.getByRole('listbox', { name: 'Symbols' });
    listbox.focus();
    await user.keyboard('{ArrowDown}');
    const lowercase = within(listbox).getByRole('group', { name: 'Lowercase' });
    const numbers = within(listbox).getByRole('group', { name: 'Numbers' });
    const numberOptions = within(numbers).getAllByRole('option');
    const columns = Number(listbox.getAttribute('data-columns'));
    expect(listbox).toHaveAttribute('aria-activedescendant', numberOptions[columns].id);
    await user.keyboard('{ArrowDown}');
    expect(listbox.getAttribute('aria-activedescendant')).toBe(
      within(lowercase).getAllByRole('option')[0].id
    );
  });

  it('remembers recently used symbols per user', async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <SymbolPicker open onOpenChange={() => {}} onPick={() => {}} userId="owner" />
    );
    await user.type(screen.getByRole('searchbox', { name: 'Search symbols' }), 'yen');
    await user.click(screen.getByRole('option', { name: 'Yen sign' }));
    unmount();
    renderPicker();
    const recent = screen.getByRole('group', { name: 'Recently used' });
    expect(within(recent).getByRole('option', { name: 'Yen sign' })).toBeInTheDocument();
  });

  it('keeps recent symbols separate between accounts', async () => {
    window.localStorage.setItem('organized-glitter:color-key-recent:owner', '["u:00A5"]');
    renderPicker({ userId: 'other' });
    expect(screen.queryByRole('group', { name: 'Recently used' })).toBeNull();
  });

  it('hides the send-a-photo row until a handler is provided', async () => {
    renderPicker();
    expect(screen.queryByText("Can't find your symbol?")).toBeNull();
  });

  it('offers the send-a-photo row when a handler is provided', async () => {
    const user = userEvent.setup();
    const onRequestSymbol = vi.fn();
    renderPicker({ onRequestSymbol });
    await user.click(screen.getByRole('button', { name: /Can't find your symbol\?/ }));
    expect(onRequestSymbol).toHaveBeenCalled();
  });

  it('says when nothing matches', async () => {
    const user = userEvent.setup();
    renderPicker();
    await user.type(screen.getByRole('searchbox', { name: 'Search symbols' }), 'zzzzzz');
    expect(screen.getByText('No symbols match.')).toBeInTheDocument();
  });
});
