import { MockedProvider } from '@apollo/client/testing';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearDrafts } from '@/lib/drafts';
import type { Viewer } from '@/lib/gql';
import { ViewerProvider } from '../session/ViewerProvider';
import { AvatarStudio } from './AvatarStudio';

const viewer: Viewer = {
  id: 'u1',
  username: 'alice',
  displayName: 'Alice Moreno',
  email: 'alice@example.com',
  avatarColor: '#6366f1',
  avatar: null,
  welcomed: true,
};

function renderStudio(state?: unknown) {
  return render(
    <MockedProvider mocks={[]}>
      <MemoryRouter initialEntries={[{ pathname: '/settings/avatar', state }]}>
        <ViewerProvider viewer={viewer}>
          {/* Stands in for the chat search box that sits beside the studio on desktop. */}
          <input aria-label="Search chats" />
          <AvatarStudio />
        </ViewerProvider>
      </MemoryRouter>
    </MockedProvider>,
  );
}

const ctrlZ = (target: Element) => fireEvent.keyDown(target, { key: 'z', ctrlKey: true });

beforeAll(() => {
  // jsdom doesn't lay anything out, so it has no scrollIntoView.
  Element.prototype.scrollIntoView = () => undefined;
});
beforeEach(() => clearDrafts());

describe('AvatarStudio', () => {
  it('opens on Skin, or on the tab the link asks for', () => {
    const first = renderStudio();
    expect(screen.getByRole('tab', { name: 'Skin' })).toHaveAttribute('aria-selected', 'true');
    first.unmount();

    // The welcome's "Make my character" opens the ready-made looks.
    const asked = renderStudio({ tab: 'specials' });
    expect(screen.getByRole('tab', { name: 'Specials' })).toHaveAttribute('aria-selected', 'true');
    asked.unmount();

    renderStudio({ tab: 'nonsense' });
    expect(screen.getByRole('tab', { name: 'Skin' })).toHaveAttribute('aria-selected', 'true');
  });

  it('marks a picked item as unsaved and undoes it with Ctrl+Z', () => {
    renderStudio();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

    fireEvent.click(screen.getByRole('tab', { name: 'Hats' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Cat ears' }));
    expect(screen.getByRole('radio', { name: 'Cat ears' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();

    ctrlZ(document.body);
    expect(screen.getByRole('radio', { name: 'None' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('leaves Ctrl+Z alone while you type in a text field', () => {
    renderStudio();
    fireEvent.click(screen.getByRole('tab', { name: 'Hats' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Cat ears' }));

    ctrlZ(screen.getByRole('textbox', { name: 'Search chats' }));
    expect(screen.getByRole('radio', { name: 'Cat ears' })).toHaveAttribute('aria-checked', 'true');
  });

  it('offers a colour only for items that use one', () => {
    renderStudio();
    fireEvent.click(screen.getByRole('tab', { name: 'Hats' }));
    expect(screen.queryByRole('radiogroup', { name: 'Headwear color' })).toBeNull();

    fireEvent.click(screen.getByRole('radio', { name: 'Beanie' }));
    expect(screen.getByRole('radiogroup', { name: 'Headwear color' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: 'Halo' }));
    expect(screen.queryByRole('radiogroup', { name: 'Headwear color' })).toBeNull();
  });
});
