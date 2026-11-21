import { useMemo, type ReactNode } from 'react';
import { rgbaToThumbHash } from 'thumbhash';
import { base64 } from '@/features/media/ops';
import { cn } from '@/lib/cn';
import type { MediaItem } from '@/lib/messages';
import { MediaBubble } from './MediaBubble';
import { MediaPill, MediaTile } from './MediaTile';
import { pillText, type TileView } from './tileState';

/**
 * DEV ONLY (route /dev/media): every tile state, single and album layouts, extreme aspect ratios,
 * mine and theirs. For visual QA with the Playwright MCP; production builds drop it.
 */
function picture(w: number, h: number, hue: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, `hsl(${hue} 70% 55%)`);
  grad.addColorStop(1, `hsl(${(hue + 70) % 360} 70% 45%)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(255,255,255,.35)';
  g.beginPath();
  g.arc(w * 0.3, h * 0.35, Math.min(w, h) * 0.18, 0, Math.PI * 2);
  g.fill();
  const small = document.createElement('canvas');
  small.width = 24;
  small.height = Math.max(1, Math.round((24 * h) / w));
  small.getContext('2d')!.drawImage(c, 0, 0, small.width, small.height);
  const { data } = small.getContext('2d')!.getImageData(0, 0, small.width, small.height);
  return {
    url: c.toDataURL('image/jpeg', 0.8),
    thumbhash: base64(rgbaToThumbHash(small.width, small.height, data)),
  };
}

const make = (
  key: string,
  kind: MediaItem['kind'],
  w: number,
  h: number,
  hue: number,
  over: Partial<MediaItem> = {},
  withPicture = true,
): MediaItem => {
  const p = picture(Math.min(w, 800), Math.min(h, 800), hue);
  return {
    key,
    kind,
    width: w,
    height: h,
    durationMs: kind === 'VIDEO' ? 42_000 : null,
    mimeType: kind === 'VIDEO' ? 'video/mp4' : 'image/webp',
    name: key,
    size: kind === 'VIDEO' ? 18_400_000 : 1_240_000,
    thumbhash: p.thumbhash,
    local: withPicture ? { previewUrl: p.url, preparing: false } : undefined,
    ...over,
  };
};

const view = (over: Partial<TileView>): TileView => ({
  phase: 'idle',
  imageReady: false,
  cancellable: false,
  ...over,
});

const noop = () => undefined;

function Frame({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <figure className={cn('space-y-1.5', wide && 'col-span-full')}>
      <div className="relative aspect-[4/3] w-52 overflow-hidden rounded-2xl ring-1 ring-border">
        {children}
      </div>
      <figcaption className="text-xs text-muted-foreground">{label}</figcaption>
    </figure>
  );
}

export default function DevGallery() {
  const photo = useMemo(() => make('photo', 'IMAGE', 1200, 800, 250), []);
  const video = useMemo(() => make('video', 'VIDEO', 1280, 720, 20), []);
  const who = { dm: true, mine: false, firstName: 'Alice' };

  const tiles: Array<[string, MediaItem, TileView]> = [
    [
      'photo · preparing',
      { ...photo, local: { ...photo.local!, preparing: true } },
      view({ phase: 'preparing', imageReady: true }),
    ],
    ['photo · idle (download)', make('p-idle', 'IMAGE', 1200, 800, 250, {}, false), view({})],
    [
      'photo · locating',
      make('p-loc', 'IMAGE', 1200, 800, 140, {}, false),
      view({ phase: 'busy' }),
    ],
    [
      'photo · 45%',
      make('p-prog', 'IMAGE', 1200, 800, 90, {}, false),
      view({ phase: 'busy', progress: 0.45 }),
    ],
    ['photo · ready', photo, view({ phase: 'ready', imageReady: true })],
    [
      'photo · waiting',
      make('p-wait', 'IMAGE', 1200, 800, 300, {}, false),
      view({ phase: 'unavailable' }),
    ],
    [
      'photo · failed',
      make('p-fail', 'IMAGE', 1200, 800, 10, {}, false),
      view({ phase: 'failed' }),
    ],
    ['video · idle', video, view({ phase: 'idle', imageReady: true })],
    [
      'video · downloading',
      video,
      view({ phase: 'busy', imageReady: true, progress: 0.22, cancellable: true }),
    ],
    ['video · ready', video, view({ phase: 'ready', imageReady: true })],
    [
      'video · waiting',
      make('v-wait', 'VIDEO', 1280, 720, 200, {}, false),
      view({ phase: 'unavailable' }),
    ],
  ];

  const album = (n: number, hue = 200) =>
    Array.from({ length: n }, (_, i) =>
      make(`a${n}-${i}`, i === 1 && n > 2 ? 'VIDEO' : 'IMAGE', 900 + i * 40, 700, hue + i * 30),
    );
  const bubbles: Array<[string, MediaItem[], string, boolean]> = [
    ['single · theirs · caption', [photo], 'Look at this sunset 🌅 https://example.com', false],
    ['single · mine · no caption', [make('mine', 'IMAGE', 1600, 900, 160)], '', true],
    ['portrait 0.3 (clamped)', [make('tall', 'IMAGE', 300, 1000, 330)], '', false],
    ['panorama 4.0 (clamped)', [make('wide', 'IMAGE', 4000, 1000, 50)], '', true],
    ['album 2', album(2), '', false],
    ['album 3 · caption', album(3, 20), 'Weekend', true],
    ['album 4', album(4, 100), '', false],
    ['album 7 (+3)', album(7, 260), '', true],
    [
      'waiting (pill, DM)',
      [
        make('w1', 'IMAGE', 1200, 800, 280, {}, false),
        make('w2', 'IMAGE', 1200, 800, 310, {}, false),
      ],
      '',
      false,
    ],
  ];

  return (
    <div className="h-full overflow-y-auto overscroll-contain" data-testid="media-gallery">
      <div className="mx-auto max-w-4xl space-y-10 px-5 py-8">
        <h1 className="text-xl font-semibold tracking-tight">Media states (dev)</h1>

        <section>
          <h2 className="mb-3 text-sm font-semibold">Tiles</h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-5">
            {tiles.map(([label, item, v]) => (
              <Frame key={label} label={label}>
                <MediaTile
                  item={item}
                  view={v}
                  waiting="Waiting for Alice to come online"
                  name="Alice"
                  alt="Gallery photo"
                  onActivate={noop}
                  onCancel={noop}
                />
                {v.phase === 'unavailable' || v.phase === 'failed' ? (
                  <MediaPill phase={v.phase} text={pillText(v.phase, who)} onRetry={noop} />
                ) : null}
              </Frame>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold">Bubbles</h2>
          <div className="space-y-6">
            {bubbles.map(([label, items, caption, mine]) => (
              <div
                key={label}
                className={cn('flex flex-col gap-1', mine ? 'items-end' : 'items-start')}
              >
                <span className="text-xs text-muted-foreground">{label}</span>
                <MediaBubble
                  items={items}
                  caption={caption}
                  mine={mine}
                  first
                  last
                  conversationId="dev"
                  who={{ dm: true, mine, firstName: 'Alice' }}
                  senderName="Alice"
                  onToggleTime={noop}
                  onOpen={noop}
                />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
