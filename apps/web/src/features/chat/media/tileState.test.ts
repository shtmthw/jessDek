import type { Download } from '@/features/media/downloads';
import type { MediaItem } from '@/lib/messages';
import { deriveView, pillText } from './tileState';

const photo: MediaItem = {
  key: 'a',
  kind: 'IMAGE',
  width: 10,
  height: 10,
  mimeType: 'image/webp',
  name: 'p',
  size: 5,
  sha256: 'p-sha',
};
const video: MediaItem = { ...photo, kind: 'VIDEO', sha256: 'v-sha', posterSha256: 'poster-sha' };
const dl = (status: Download['status'], progress = 0): Download => ({
  key: 'k',
  attachmentId: 'a',
  part: 'FILE',
  conversationId: 'c',
  status,
  progress,
});
const none = () => false;

describe('deriveView: photos', () => {
  it('walks through the download states', () => {
    expect(deriveView(photo, {}, none)).toMatchObject({ phase: 'idle', imageReady: false });
    expect(deriveView(photo, { image: dl('locating') }, none)).toMatchObject({
      phase: 'busy',
      progress: undefined,
    });
    expect(deriveView(photo, { image: dl('downloading', 0.4) }, none)).toMatchObject({
      phase: 'busy',
      progress: 0.4,
    });
    expect(deriveView(photo, { image: dl('ready') }, none)).toMatchObject({
      phase: 'ready',
      imageReady: true,
    });
    expect(deriveView(photo, { image: dl('unavailable') }, none).phase).toBe('unavailable');
    expect(deriveView(photo, { image: dl('failed') }, none).phase).toBe('failed');
  });
  it('is ready when the file is already on this device or is your own send', () => {
    expect(deriveView(photo, {}, (s) => s === 'p-sha').phase).toBe('ready');
    expect(
      deriveView({ ...photo, local: { previewUrl: 'blob:x', preparing: false } }, {}, none).phase,
    ).toBe('ready');
  });
  it('shows your own photo while it is being prepared', () => {
    expect(
      deriveView({ ...photo, local: { previewUrl: 'blob:x', preparing: true } }, {}, none),
    ).toMatchObject({
      phase: 'preparing',
      imageReady: true,
    });
  });
});

describe('deriveView: videos', () => {
  it('shows the poster, with play available before the file is here', () => {
    expect(deriveView(video, { image: dl('ready') }, none)).toMatchObject({
      phase: 'idle',
      imageReady: true,
    });
    expect(deriveView(video, {}, (s) => s === 'poster-sha')).toMatchObject({
      phase: 'idle',
      imageReady: true,
    });
  });
  it('waits on the poster first, then the file', () => {
    expect(deriveView(video, { image: dl('unavailable') }, none)).toMatchObject({
      phase: 'unavailable',
      imageReady: false,
    });
    expect(
      deriveView(video, { image: dl('ready'), file: dl('downloading', 0.5) }, none),
    ).toMatchObject({
      phase: 'busy',
      progress: 0.5,
      cancellable: true,
    });
    expect(deriveView(video, { image: dl('ready'), file: dl('locating') }, none).cancellable).toBe(
      true,
    );
    expect(deriveView(video, { image: dl('ready'), file: dl('unavailable') }, none).phase).toBe(
      'unavailable',
    );
    expect(deriveView(video, { image: dl('ready'), file: dl('ready') }, none).phase).toBe('ready');
  });
  it('carries the transport of the file download', () => {
    expect(
      deriveView(video, { image: dl('ready'), file: { ...dl('ready'), transport: 'relay' } }, none)
        .transport,
    ).toBe('relay');
  });
});

describe('pillText', () => {
  it('names the sender in a DM, and nobody in a group or for your own messages', () => {
    expect(pillText('unavailable', { dm: true, mine: false, firstName: 'Alice' })).toBe(
      'Waiting for Alice to come online',
    );
    expect(pillText('unavailable', { dm: false, mine: false, firstName: 'Alice' })).toBe(
      'Waiting for someone who has it',
    );
    expect(pillText('unavailable', { dm: true, mine: true, firstName: 'Bob' })).toBe(
      'Waiting for someone who has it',
    );
    expect(pillText('failed', { dm: true, mine: false, firstName: 'Alice' })).toBe(
      'Couldn’t load · Retry',
    );
  });
});
