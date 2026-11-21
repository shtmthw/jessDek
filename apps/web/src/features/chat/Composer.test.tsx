import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetPrefsCache } from '@/features/media/prefs';
import { clearTrays } from '@/features/media/trayStore';
import { Composer } from './Composer';

// Resizing and hashing need a real browser; here a file simply "prepares" instantly.
vi.mock('@/features/media/prepare', async (orig) => {
  const real = await orig<typeof import('@/features/media/prepare')>();
  return {
    ...real,
    prepare: (file: File) => {
      const prepared = {
        kind: 'IMAGE' as const,
        file,
        mimeType: 'image/webp',
        name: file.name,
        size: file.size,
        width: 100,
        height: 80,
        sha256: 'a'.repeat(64),
        thumbhash: null,
        previewUrl: 'blob:preview',
      };
      return {
        localId: `local-${file.name}`,
        kind: 'IMAGE' as const,
        previewUrl: 'blob:preview',
        done: Promise.resolve(prepared),
      };
    },
  };
});
vi.stubGlobal(
  'URL',
  Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => undefined }),
);

beforeEach(() => {
  resetPrefsCache();
});
afterEach(() => clearTrays());

const photo = (name = 'beach.jpg') => new File(['x'], name, { type: 'image/jpeg' });
const attachInput = () => document.querySelector<HTMLInputElement>('input[data-media-input]')!;

describe('Composer', () => {
  it('disables sending while empty or whitespace', async () => {
    render(<Composer onSend={() => undefined} />);
    const send = screen.getByRole('button', { name: /send message/i });
    expect(send).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Message'), '   ');
    expect(send).toBeDisabled();
  });

  it('sends trimmed text on Enter and clears the box', async () => {
    const onSend = vi.fn();
    render(<Composer onSend={onSend} />);
    const box = screen.getByLabelText('Message');
    await userEvent.type(box, '  hello there {Enter}');
    expect(onSend).toHaveBeenCalledExactlyOnceWith('hello there');
    expect(box).toHaveValue('');
  });

  it('keeps Shift+Enter for new lines', async () => {
    const onSend = vi.fn();
    render(<Composer onSend={onSend} />);
    const box = screen.getByLabelText('Message');
    await userEvent.type(box, 'one{Shift>}{Enter}{/Shift}two');
    expect(onSend).not.toHaveBeenCalled();
    expect(box).toHaveValue('one\ntwo');
  });

  it('sends with the button and reports typing', async () => {
    const onSend = vi.fn();
    const onTyping = vi.fn();
    render(<Composer onSend={onSend} onTyping={onTyping} />);
    await userEvent.type(screen.getByLabelText('Message'), 'hi');
    expect(onTyping).toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: /send message/i }));
    expect(onSend).toHaveBeenCalledWith('hi');
  });

  describe('photos and videos', () => {
    it('shows a tray tile for a chosen file, and removing it clears the tray', async () => {
      render(<Composer onSend={() => undefined} draftKey="c1" />);
      expect(screen.getByRole('button', { name: 'Add photos or videos' })).toBeInTheDocument();
      await userEvent.upload(attachInput(), photo());

      const tray = await screen.findByRole('list', { name: 'Attachments' });
      expect(tray.querySelectorAll('[role=listitem]')).toHaveLength(1);
      expect(screen.getByPlaceholderText('Add a caption…')).toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: 'Remove photo 1' }));
      await waitFor(() => expect(screen.queryByRole('list', { name: 'Attachments' })).toBeNull());
      expect(screen.getByPlaceholderText('Message')).toBeInTheDocument();
    });

    it('can send with only an attachment, and hands the items over', async () => {
      const onSend = vi.fn();
      render(<Composer onSend={onSend} draftKey="c2" />);
      const send = screen.getByRole('button', { name: /send message/i });
      expect(send).toBeDisabled();

      await userEvent.upload(attachInput(), photo());
      await screen.findByRole('list', { name: 'Attachments' });
      expect(send).toBeEnabled();
      await userEvent.click(send);

      expect(onSend).toHaveBeenCalledOnce();
      const [body, items] = onSend.mock.calls[0]!;
      expect(body).toBe('');
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({ kind: 'IMAGE', source: { name: 'beach.jpg' } });
      // The tray empties once the files belong to the message.
      await waitFor(() => expect(screen.queryByRole('list', { name: 'Attachments' })).toBeNull());
    });

    it('sends a caption together with the photos', async () => {
      const onSend = vi.fn();
      render(<Composer onSend={onSend} draftKey="c3" />);
      await userEvent.upload(attachInput(), [photo('a.jpg'), photo('b.jpg')]);
      await userEvent.type(screen.getByLabelText('Message'), 'Trip {Enter}');
      expect(onSend).toHaveBeenCalledOnce();
      expect(onSend.mock.calls[0]![0]).toBe('Trip');
      expect(onSend.mock.calls[0]![1]).toHaveLength(2);
    });

    it('attaches a pasted image, but pastes text when text comes along', async () => {
      render(<Composer onSend={() => undefined} draftKey="c4" />);
      const box = screen.getByLabelText('Message');

      fireEvent.paste(box, { clipboardData: { files: [photo('shot.png')], getData: () => '' } });
      await screen.findByRole('list', { name: 'Attachments' });

      clearTrays();
      await waitFor(() => expect(screen.queryByRole('list', { name: 'Attachments' })).toBeNull());
      const event = fireEvent.paste(box, {
        clipboardData: { files: [photo('shot.png')], getData: () => 'some text' },
      });
      expect(event).toBe(true); // not prevented: the browser pastes the text
      expect(screen.queryByRole('list', { name: 'Attachments' })).toBeNull();
    });

    it('turns the attach button off when the server has photos and videos disabled', async () => {
      const { setMediaConfig } = await import('@/features/media/config');
      setMediaConfig({
        enabled: false,
        relay: true,
        maxAttachments: 10,
        maxImageBytes: 1,
        maxVideoBytes: 1,
        iceServers: [],
      });
      render(<Composer onSend={() => undefined} draftKey="c5" />);
      expect(screen.queryByRole('button', { name: 'Add photos or videos' })).toBeNull();
      setMediaConfig(null);
    });
  });
});
