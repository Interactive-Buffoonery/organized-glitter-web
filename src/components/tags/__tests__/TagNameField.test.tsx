import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TagNameField } from '../TagNameField';

describe('TagNameField', () => {
  it('preserves descriptions and the live region while errors change', () => {
    const field = (error?: string) => (
      <>
        <p id="name-hint">Choose a memorable name</p>
        <TagNameField
          value="forest"
          onChange={() => {}}
          error={error}
          aria-describedby="name-hint"
        />
      </>
    );
    const { rerender } = render(field());
    const input = screen.getByRole('textbox', { name: /tag name/i });
    const id = input.id;
    const liveRegion = document.getElementById(`${id}-error`);
    expect(liveRegion).toHaveAttribute('aria-live', 'polite');
    expect(liveRegion).toBeEmptyDOMElement();
    expect(input).toHaveAccessibleDescription('Choose a memorable name');
    rerender(field('Tag name cannot be empty'));
    expect(input).toHaveAttribute('aria-describedby', `name-hint ${id}-error`);
    expect(input).toHaveAccessibleDescription('Choose a memorable name Tag name cannot be empty');
    rerender(field());
    expect(input).toHaveAttribute('aria-describedby', 'name-hint');
    expect(document.getElementById(`${id}-error`)).toBe(liveRegion);
    expect(liveRegion).toBeEmptyDOMElement();
  });

  it('generates unique ids for simultaneous fields', () => {
    render(
      <>
        <TagNameField value="one" onChange={() => {}} />
        <TagNameField value="two" onChange={() => {}} />
      </>
    );
    const inputs = screen.getAllByRole('textbox', { name: /tag name/i });
    expect(inputs[0].id).not.toBe(inputs[1].id);
    for (const input of inputs)
      expect(document.getElementById(`${input.id}-error`)).toBeInTheDocument();
  });
});
