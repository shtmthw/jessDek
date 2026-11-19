import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { serializeRecipe, DEFAULT_RECIPE } from '@/features/avatar/recipe';
import { Avatar } from './Avatar';

describe('Avatar', () => {
  it('draws the default character when someone has no avatar yet', () => {
    const { container } = render(<Avatar name="Alice Moreno" color="#6366f1" />);
    expect(container.querySelector('svg')).not.toBeNull();
    expect(container).not.toHaveTextContent('AM');
  });

  it('shows initials for people who chose them', () => {
    const avatar = serializeRecipe({ ...DEFAULT_RECIPE, style: 'initials' });
    const { container } = render(<Avatar name="Alice Moreno" color="#6366f1" avatar={avatar} />);
    expect(container).toHaveTextContent('AM');
    expect(container.querySelector('svg')).toBeNull();
  });

  it('falls back to the default character for a recipe it cannot read', () => {
    const { container } = render(<Avatar name="Bob" avatar="{not json" />);
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('gives each drawn avatar its own clip path ids', () => {
    const avatar = serializeRecipe({ ...DEFAULT_RECIPE, hat: 'beanie' });
    const { container } = render(
      <>
        <Avatar name="A" avatar={avatar} />
        <Avatar name="B" avatar={avatar} />
      </>,
    );
    const ids = [...container.querySelectorAll('clipPath')].map((c) => c.id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });
});
